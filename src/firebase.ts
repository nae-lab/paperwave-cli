import { getStorage } from "firebase-admin/storage";
import path from "path";
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
    const [file] = await bucket.upload(filePath, {
      destination: `radio/${path.basename(filePath)}`,
    });

    // ファイル名を取得して公開URLを生成
    const publicUrl = await file.getSignedUrl({
      action: "read",
      // 100年間有効なURLを生成
      expires: new Date().getTime() + 100 * 365 * 24 * 60 * 60 * 1000,
    });
    return publicUrl;
  } catch (error) {
    console.error("Error uploading file:", error);
    throw error; // エラーを呼び出し元に伝えるために再スロー
  }
};
