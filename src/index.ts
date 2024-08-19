import { main } from "./main"; // main.tsからインポート
import path, { basename } from "path";
import appRootPath from "app-root-path";
import * as admin from "firebase-admin";
import * as fs from "fs";
import { db, bucket } from "./firebase";
import { uploadLog } from "./logging";

const COLLECTION_ID = "episode-test-yahagi";

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
  const filePath = url.pathname.split("/o/")[1]; // '/o/'の後ろの部分を取得
  return decodeURIComponent(filePath); // '%2F'などをデコードして元のパスに戻す
}

async function downloadFile(firebaseUrl: string): Promise<string> {
  const filePath = extractFilePath(firebaseUrl);
  const filename = basename(filePath); // ファイル名を取得
  const destFilename = path.join(appRootPath + `/downloads/${filename}`); // 保存先のファイル名

  // ファイルをダウンロード
  await bucket.file(filePath).download({ destination: destFilename });

  console.log(`File downloaded to ${destFilename}`);
  return destFilename; // 保存したファイルのパスを返す
}

// プログラムが追加されたときにトリガーされる処理
const handleNewProgram = async (
  snapshot: admin.firestore.QueryDocumentSnapshot
) => {
  const data = snapshot.data();
  console.log("New program added:", data);
  // recordingOptionsの読み取りと処理
  const recordingOptions = data.recordingOptions;
  if (recordingOptions) {
    try {
      console.log("Processing recordingOptions:", recordingOptions);
      await snapshot.ref.update({ status: "processing" });
      const processedURL = await processRecordingOptions(recordingOptions);
      // 結果をドキュメントに更新
      await snapshot.ref.update({
        isRecordingCompleted: true,
        contentURL: processedURL,
      });
      await uploadLog(snapshot);
    } catch (error) {
      console.error("Error processing recordingOptions:", error);
      await snapshot.ref.update({ isRecordingFailed: true });
    }
  } else {
    console.log("No recordingOptions found.");
    await snapshot.ref.update({ isRecordingFailed: true });
  }
};

// プログラムの処理関数（例）
async function processRecordingOptions(options: any) {
  try {
    const params: RecordingOptions = options;

    // papersのURLからファイルをダウンロードしてローカルパスに変換
    const downloadedPaper = await Promise.all(
      params.paperUrls.map((url: string) => downloadFile(url))
    );
    //   const downloadedBGM = await downloadFile(params.bgm);
    const downloadedBGM = "assets/podcast-jazz-music.mp3";

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

// episodeコレクションの監視
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
