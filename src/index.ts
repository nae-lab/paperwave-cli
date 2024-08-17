import { main } from "./main"; // main.tsからインポート
import { basename } from "path";
import * as admin from "firebase-admin";
import { db, bucket } from "./firebase";

export interface DocumentSnapshotType extends Object {
  [key: string]: any | Date;
}

export class RecordingOptions implements DocumentSnapshotType {
  public paperUrls: string[];
  public minute: number = 15;
  public bgm: string = "";
  public bgmVolume: number = 0.25;
  public llmModel: string = "gpt-4o-mini";
  public chatConcurrency: number = 10;
  public assistantConcurrency: number = 10;
  public ttsModel: string = "tts-1";
  public ttsConcurrency: number = 20;
  public retryCount: number = 5;
  public retryMaxDelay: number = 150000;

  constructor(options: { paperUrls: string[] } & Partial<RecordingOptions>) {
    const allowedOptions = {
      ...options,
    } as RecordingOptions;

    Object.assign(this, allowedOptions);
    this.paperUrls = options.paperUrls;
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
  const destFilename = `./downloads/${filename}`; // 保存先のファイル名

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
    console.log("Processing recordingOptions:", recordingOptions);
    await snapshot.ref.update({ status: "processing" });
    const processedURL = await processRecordingOptions(recordingOptions);
    // 結果をドキュメントに更新
    await snapshot.ref.update({
      status: "processed",
      contentURL: processedURL,
    });
  } else {
    console.log("No recordingOptions found.");
    await snapshot.ref.update({ status: "processFailed" });
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

// programsコレクションの監視
db.collection("programs").onSnapshot((snapshot) => {
  const promises = snapshot.docChanges().map((change) => {
    if (change.type === "added") {
      if (!change.doc.data().status) {
        return handleNewProgram(change.doc);
      }
    }
  });

  // 全ての追加ドキュメントを並列に処理
  Promise.all(promises)
    .then(() => {
      console.log("All new programs processed");
    })
    .catch((error) => {
      console.error("Error processing programs:", error);
    });
});
