import { getStorage } from "firebase-admin/storage";
import * as admin from "firebase-admin";

// Firebaseのサービスアカウントキーのパス
const serviceAccount = require(process.env
  .FIREBASE_SERVICE_ACCOUNT_KEY as string);

// Firebaseアプリを初期化
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: "paperwave.appspot.com",
});

export const db = admin.firestore();
export const bucket = admin.storage().bucket();

export const uploadAudio = async (filePath: string) => {
  try {
    // Firebase Storageのバケットにアクセス
    const bucket = getStorage().bucket();

    // ファイルをアップロードし、アップロードされたファイルの情報を取得
    const [file] = await bucket.upload(filePath);

    // ファイル名を取得して公開URLを生成
    const publicUrl = `https://storage.googleapis.com/${bucket.name}/radio/${file.name}`;
    return publicUrl;
  } catch (error) {
    console.error("Error uploading file:", error);
    throw error; // エラーを呼び出し元に伝えるために再スロー
  }
};
