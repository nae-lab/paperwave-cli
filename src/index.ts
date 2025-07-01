/*
 * Copyright 2025 Naemura Laboratory, the University of Tokyo
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
import { PromisePool } from "@supercharge/promise-pool";

import { main } from "./main"; // main.tsからインポート
import { db, bucket } from "./firebase";
import { consola, getLogs } from "./logging";
import { Episode, RecordingOptions, episodeDataConverter } from "./episodes";
import { backOff } from "exponential-backoff";

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

    // Download files with retry logic
    const downloadedPaper = await backOff(
      async () => {
        return await Promise.all(
          params.paperUrls.map((url: string) => downloadFile(url))
        );
      },
      {
        numOfAttempts: params.retryCount,
        maxDelay: params.retryMaxDelay,
        retry: (e, attempt) => {
          consola.warn(
            `Failed to download papers after ${attempt} attempts: ${e}`
          );
          // Only retry on network errors or Firebase Storage errors
          return (
            e.code === "ECONNRESET" ||
            e.code === "ETIMEDOUT" ||
            e.code?.startsWith("storage/")
          );
        },
      }
    );

    const downloadedBGM = await backOff(
      async () => {
        return await downloadFile(params.bgm);
      },
      {
        numOfAttempts: params.retryCount,
        maxDelay: params.retryMaxDelay,
        retry: (e, attempt) => {
          consola.warn(
            `Failed to download BGM after ${attempt} attempts: ${e}`
          );
          // Only retry on network errors or Firebase Storage errors
          return (
            e.code === "ECONNRESET" ||
            e.code === "ETIMEDOUT" ||
            e.code?.startsWith("storage/")
          );
        },
      }
    );

    // ダウンロードしたファイルパスをmain関数に渡す
    const updatedParams = {
      ...params,
      papers: downloadedPaper,
      bgm: downloadedBGM,
    };
    console.log(updatedParams);

    const processedURL = await backOff(
      async () => {
        return await main(updatedParams);
      },
      {
        numOfAttempts: updatedParams.retryCount,
        maxDelay: updatedParams.retryMaxDelay,
        retry: (e, attempt) => {
          consola.warn(
            `Failed to process recording after ${attempt} attempts: ${e}`
          );
          // Retry on network errors, OpenAI API errors, and program generation failures
          return (
            e.code === "ECONNRESET" ||
            e.code === "ETIMEDOUT" ||
            e.message?.includes("socket hang up") ||
            e.message?.includes(
              "The server had an error processing your request"
            ) ||
            e.message?.includes(
              "Program writer did not return a valid program"
            ) ||
            e.message?.includes(
              "Script writer did not return a valid script"
            ) ||
            e.message?.includes("500") || // OpenAI API 500 errors
            e.message?.includes("502") || // Bad Gateway
            e.message?.includes("503") || // Service Unavailable
            e.message?.includes("504") // Gateway Timeout
          );
        },
      }
    );

    if (!processedURL) {
      throw new Error("Processing completed but no URL was returned");
    }

    return processedURL;
  } catch (error) {
    consola.error("Fatal error in processRecordingOptions:", error);
    throw error; // Re-throw the error to be handled by handleNewProgram
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

// グローバルなタスクキューを管理するためのクラス
class TaskQueue {
  private static instance: TaskQueue;
  private tasks: Array<{
    task: () => Promise<void>;
    resolve: () => void;
    reject: (error: unknown) => void;
  }> = [];

  private constructor() {
    this.startProcessing();
  }

  public static getInstance(): TaskQueue {
    if (!TaskQueue.instance) {
      TaskQueue.instance = new TaskQueue();
    }
    return TaskQueue.instance;
  }

  public async addTask(task: () => Promise<void>): Promise<void> {
    consola.debug("addTask");
    consola.verbose(task);
    return new Promise((resolve, reject) => {
      this.tasks.push({ task, resolve, reject });
    });
  }

  private async startProcessing(): Promise<void> {
    while (true) {
      // 新しいタスクを待機
      await new Promise((resolve) => setTimeout(resolve, 100));

      if (this.tasks.length > 0) {
        const currentTasks = this.tasks.splice(0, this.tasks.length);

        try {
          const { results, errors } = await PromisePool.withConcurrency(1)
            .for(currentTasks)
            .process(async (item) => {
              try {
                await item.task();
                item.resolve();
              } catch (error) {
                item.reject(error);
                throw error; // エラーをプールに伝播させる
              }
            });

          // エラーのログ出力
          if (errors.length > 0) {
            console.error(`${errors.length} tasks failed:`, errors);
          }
        } catch (error) {
          console.error("Error in promise pool:", error);
        }
      }
    }
  }
}

// グローバルなタスクキューのインスタンスを取得
const taskQueue = TaskQueue.getInstance();

// episodeコレクションの監視
console.log("Listening for new episodes on", COLLECTION_ID);
db.collection(COLLECTION_ID).onSnapshot((snapshot) => {
  const changes = snapshot
    .docChanges()
    .filter(
      (change) =>
        change.type === "added" &&
        !change.doc.data().isRecordingCompleted &&
        !change.doc.data().isRecordingFailed
    );

  // 各変更をタスクキューに追加
  changes.forEach((change) => {
    taskQueue
      .addTask(async () => {
        await handleNewProgram(change.doc);
      })
      .catch((error) => {
        console.error("Error processing episode:", error);
      });
  });
});
