import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import {
  getMessaging,
  isSupported,
  type Messaging,
} from "firebase/messaging";

const firebaseConfig = {
  apiKey: "AIzaSyAtx-ToJxR-e_AfnjBlrydMJsXBXaCF5U0",
  authDomain: "has-gardaslar-ligi.firebaseapp.com",
  projectId: "has-gardaslar-ligi",
  storageBucket: "has-gardaslar-ligi.firebasestorage.app",
  messagingSenderId: "833768082962",
  appId: "1:833768082962:web:139f75589ebf468f3252cb",
};

const app =
  getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);

export async function getFirebaseMessaging(): Promise<Messaging | null> {
  if (typeof window === "undefined") {
    return null;
  }

  const supported = await isSupported();

  if (!supported) {
    return null;
  }

  return getMessaging(app);
}

export { app };