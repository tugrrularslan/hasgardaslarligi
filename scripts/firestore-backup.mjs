import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { GeoPoint, getFirestore, Timestamp } from "firebase-admin/firestore";

const BACKUP_FORMAT = "has-gardaslarligi.firestore-backup/v1";

function requiredEnvironment(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} ortam değişkeni eksik.`);
  }

  return value;
}

function getArgument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

function defaultOutputPath() {
  const timestamp = new Date().toISOString().replaceAll(":", "-");
  return path.join("backups", `firestore-${timestamp}.json`);
}

function encodeValue(value) {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (value instanceof Timestamp) {
    return {
      __hasGardaslarBackupType: "timestamp",
      seconds: value.seconds,
      nanoseconds: value.nanoseconds,
    };
  }

  if (value instanceof GeoPoint) {
    return {
      __hasGardaslarBackupType: "geoPoint",
      latitude: value.latitude,
      longitude: value.longitude,
    };
  }

  if (Buffer.isBuffer(value)) {
    return {
      __hasGardaslarBackupType: "bytes",
      base64: value.toString("base64"),
    };
  }

  if (Array.isArray(value)) {
    return value.map(encodeValue);
  }

  if (value instanceof Date) {
    return {
      __hasGardaslarBackupType: "date",
      value: value.toISOString(),
    };
  }

  if (value && typeof value === "object") {
    if (typeof value.path === "string" && value.firestore) {
      return {
        __hasGardaslarBackupType: "reference",
        path: value.path,
      };
    }

    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        encodeValue(nestedValue),
      ]),
    );
  }

  throw new Error(`Desteklenmeyen Firestore değeri: ${typeof value}`);
}

async function collectCollection(collectionReference, documents) {
  const snapshot = await collectionReference.get();

  for (const document of snapshot.docs) {
    documents.push({
      path: document.ref.path,
      data: encodeValue(document.data()),
    });

    const subcollections = await document.ref.listCollections();
    for (const subcollection of subcollections) {
      await collectCollection(subcollection, documents);
    }
  }
}

async function main() {
  const projectId = requiredEnvironment("FIREBASE_ADMIN_PROJECT_ID");
  const clientEmail = requiredEnvironment("FIREBASE_ADMIN_CLIENT_EMAIL");
  const privateKey = requiredEnvironment("FIREBASE_ADMIN_PRIVATE_KEY").replace(
    /\\n/g,
    "\n",
  );
  const outputPath = path.resolve(getArgument("--output") ?? defaultOutputPath());
  const app =
    getApps()[0] ??
    initializeApp({
      credential: cert({ projectId, clientEmail, privateKey }),
    });
  const database = getFirestore(app);
  const documents = [];

  for (const collectionReference of await database.listCollections()) {
    await collectCollection(collectionReference, documents);
  }

  const backup = {
    format: BACKUP_FORMAT,
    projectId,
    createdAt: new Date().toISOString(),
    documentCount: documents.length,
    documents,
  };

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(backup, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });

  console.log(`${documents.length} Firestore belgesi yedeklendi: ${outputPath}`);
}

main().catch((error) => {
  console.error("Firestore yedeği oluşturulamadı:", error.message);
  process.exitCode = 1;
});
