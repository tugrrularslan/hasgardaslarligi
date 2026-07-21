import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAtx-ToJxR-e_AfnjBlrydMJsXBXaCF5U0",
  authDomain: "has-gardaslar-ligi.firebaseapp.com",
  projectId: "has-gardaslar-ligi",
  storageBucket: "has-gardaslar-ligi.firebasestorage.app",
  messagingSenderId: "833768082962",
  appId: "1:833768082962:web:139f75589ebf468f3252cb",
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);