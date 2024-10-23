/*
 * Copyright 2024 Naemura Laboratory, the University of Tokyo
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 *
 * Description: Server script for processing podcast episodes. Used as a backend for web app.
 */

import path from "path";
import process from "process";
import appRootPath from "app-root-path";
import * as admin from "firebase-admin";
import * as fs from "fs";

import { main } from "./main"; // main.tsからインポート
import { db, bucket } from "./firebase";
import { consola, getLogs } from "./logging";
import { Episode, RecordingOptions, episodeDataConverter } from "./episodes";

console.log("EPISODES_COLLECTION_ID:", process.env.EPISODES_COLLECTION_ID);
const COLLECTION_ID = process.env.EPISODES_COLLECTION_ID || "episodes";

export interface DocumentSnapshotType extends Object {
  [key: string]: any | Date;
}

function extractFilePath(firebaseUrl: string): string {
  const url = new URL(firebaseUrl);

  if (url.hostname === "firebasestorage.googleapis.com") {
    const filePath = url.pathname.split("/o/")[1]; // '/o/'の後ろの部分を取得
    return decodeURIComponent(filePath); // '%2F'などをデコードして元のパスに戻す
  } else if (url.hostname === "storage.googleapis.com") {
    const filePath = url.pathname.split("/paperwave.appspot.com/")[1]; // '/paperwave.appspot.com/'の後ろの部分を取得
    return decodeURIComponent(filePath); // '%2F'などをデコードして元のパスに戻す
  } else {
    throw new Error("Invalid Firebase Storage URL");
  }
}

async function downloadFile(firebaseUrl: string): Promise<string> {
  const filePath = extractFilePath(firebaseUrl);
  const filename = path.basename(filePath); // ファイル名を取得
  const destFilename = path.join(appRootPath + `/downloads/${filename}`); // 保存先のファイル名

  // ファイルをダウンロード
  consola.debug(`Downloading file from ${firebaseUrl} to ${destFilename}`);
  await bucket.file(filePath).download({ destination: destFilename });

  console.log(`File downloaded to ${destFilename}`);
  return destFilename; // 保存したファイルのパスを返す
}

// プログラムの処理関数（例）
async function processRecordingOptions(options: any) {
  try {
    const params: RecordingOptions = options;

    // papersのURLからファイルをダウンロードしてローカルパスに変換
    const downloadedPaper = await Promise.all(
      params.paperUrls.map((url: string) => downloadFile(url))
    );
    const downloadedBGM = await downloadFile(params.bgm);

    // ダウンロードしたファイルパスをmain関数に渡す
    const updatedParams = {
      ...params,
      papers: downloadedPaper,
      bgm: downloadedBGM,
    };
    console.log(updatedParams);
    const processedURL = await main(updatedParams);
    return processedURL;
  } catch (error) {
    console.error(error);
  }
}

// プログラムが追加されたときにトリガーされる処理
const handleNewProgram = async (
  snapshot: admin.firestore.QueryDocumentSnapshot
) => {
  const data = snapshot.data();
  console.log("New program added:", data);
  // recordingOptionsの読み取りと処理
  const recordingOptions = data.recordingOptions;
  const docRef = snapshot.ref.withConverter(episodeDataConverter());
  if (recordingOptions) {
    try {
      console.log("Processing recordingOptions:", recordingOptions);
      await docRef.update({ status: "processing" });
      const processedURL = await processRecordingOptions(recordingOptions);
      // const logLines = getLogs();

      if (processedURL) {
        const updatedData: Partial<Episode> = {
          isRecordingCompleted: true,
          isRecordingFailed: false,
          contentUrl: processedURL.toString(),
          // recordingLogs: logLines,
        };
        // 結果をドキュメントに更新
        await docRef.update(updatedData);
      } else {
        console.error("Processing failed. No valid URL returned.");
        await docRef.update({ isRecordingFailed: true });
      }
    } catch (error) {
      consola.error("Error processing recordingOptions:", error);
      await docRef.update({ isRecordingFailed: true });
    }
  } else {
    consola.log("No recordingOptions found.");
    await docRef.update({ isRecordingFailed: true });
  }
};

// episodeコレクションの監視
console.log("Listening for new episodes on", COLLECTION_ID);
db.collection(COLLECTION_ID).onSnapshot((snapshot) => {
  const promises = snapshot.docChanges().map((change) => {
    if (change.type === "added") {
      if (
        change.doc.data().isRecordingCompleted === false &&
        change.doc.data().isRecordingFailed === false
      ) {
        return handleNewProgram(change.doc);
      }
    }
  });

  // 全ての追加ドキュメントを並列に処理
  Promise.all(promises)
    .then(() => {
      console.log("All new episodes processed");
    })
    .catch((error) => {
      console.error("Error processing episodes:", error);
    });
});
