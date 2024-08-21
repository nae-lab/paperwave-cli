import appRootPath from "app-root-path";
import * as admin from "firebase-admin";
import { getStorage } from "firebase-admin/storage";
import path from "path";
import { Timestamp } from "firebase-admin/firestore";

export interface DocumentSnapshotType extends Object {
  [key: string]: any | Timestamp | Date;
}

// Firebaseのサービスアカウントキーのパス
let serviceAccount: admin.ServiceAccount | string;
if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
  const keyPath = path.resolve(
    appRootPath.path,
    process.env.FIREBASE_SERVICE_ACCOUNT_KEY
  );
  serviceAccount = require(keyPath);
} else {
  console.log(
    "Using environment variables for Firebase service account",
    process.env.FIREBASE_PROJECT_ID,
    process.env.FIREBASE_ADMIN_PRIVATE_KEY,
    process.env.FIREBASE_CLIENT_EMAIL
  );
  serviceAccount = {
    projectId: process.env.FIREBASE_PROJECT_ID,
    privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  };
}

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
