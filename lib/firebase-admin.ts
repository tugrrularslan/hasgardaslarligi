import "server-only";

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";

function getFirebaseAdminApp() {
  if (getApps().length > 0) {
    return getApps()[0];
  }

  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(
    /\\n/g,
    "\n"
  );

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Firebase Admin ortam değişkenleri eksik. " +
        "FIREBASE_ADMIN_PROJECT_ID, " +
        "FIREBASE_ADMIN_CLIENT_EMAIL ve " +
        "FIREBASE_ADMIN_PRIVATE_KEY değerlerini kontrol et."
    );
  }

  return initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey,
    }),
  });
}

function lazyService<T extends object>(factory: () => T): T {
  return new Proxy({} as T, {
    get(_target, property) {
      const service = factory();
      const value = Reflect.get(service, property, service);

      return typeof value === "function" ? value.bind(service) : value;
    },
  });
}

// Route handlers are evaluated while `next build` collects route metadata.
// Firebase Admin credentials belong only to the deployed runtime, so defer
// initialization until a handler actually uses a Firebase service.
export const adminAuth = lazyService(() => getAuth(getFirebaseAdminApp()));
export const adminDb = lazyService(() => getFirestore(getFirebaseAdminApp()));
export const adminMessaging = lazyService(() =>
  getMessaging(getFirebaseAdminApp()),
);
