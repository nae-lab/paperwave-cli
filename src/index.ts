import path from "path";
import appRootPath from "app-root-path";
import * as admin from "firebase-admin";
import * as fs from "fs";

import { main } from "./main"; // main.tsからインポート
import { db, bucket } from "./firebase";
import { consola, getLogs } from "./logging";
import { Episode, episodeDataConverter } from "./episodes";

const COLLECTION_ID = process.env.EPISODES_COLLECTION_ID || "episodes";

export interface DocumentSnapshotType extends Object {
  [key: string]: any | Date;
}

export class RecordingOptions implements DocumentSnapshotType {
  paperUrls: string[];
  minute: number;
  bgm: string;
  bgmVolume: number;
  llmModel: string;
  chatConcurrency: number;
  assistantConcurrency: number;
  ttsModel: string;
  ttsConcurrency: number;
  retryCount: number;
  retryMaxDelay: number;

  constructor(options: { paperUrls: string[] } & Partial<RecordingOptions>) {
    if (!options.paperUrls || options.paperUrls.length === 0) {
      throw new Error("At least one paper URL is required.");
    }

    this.paperUrls = options.paperUrls ?? [];
    this.minute = options.minute ?? 15;
    this.bgm = options.bgm ?? "";
    this.bgmVolume = options.bgmVolume ?? 0.25;
    this.llmModel = options.llmModel ?? "gpt-4o-mini";
    this.chatConcurrency = options.chatConcurrency ?? 10;
    this.assistantConcurrency = options.assistantConcurrency ?? 10;
    this.ttsModel = options.ttsModel ?? "tts-1";
    this.ttsConcurrency = options.ttsConcurrency ?? 20;
    this.retryCount = options.retryCount ?? 5;
    this.retryMaxDelay = options.retryMaxDelay ?? 150000;
  }
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
      const logLines = getLogs();

      if (processedURL) {
        const updatedData: Partial<Episode> = {
          isRecordingCompleted: true,
          isRecordingFailed: false,
          contentUrl: processedURL.toString(),
          recordingLogs: logLines,
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
db.collection(COLLECTION_ID).onSnapshot((snapshot) => {
  const promises = snapshot.docChanges().map((change) => {
    console.log("change:", change.type);
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
