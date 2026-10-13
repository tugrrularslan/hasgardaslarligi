import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { GeoPoint, getFirestore, Timestamp } from "firebase-admin/firestore";

const BACKUP_FORMAT = "has-gardaslarligi.firestore-backup/v1";
const BATCH_SIZE = 400;

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

function isDocumentPath(value) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.split("/").length % 2 === 0 &&
    !value.split("/").some((segment) => !segment || segment === "." || segment === "..")
  );
}

function decodeValue(value, database) {
  if (Array.isArray(value)) {
    return value.map((item) => decodeValue(item, database));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const taggedValue = value;

  switch (taggedValue.__hasGardaslarBackupType) {
    case "timestamp":
      return new Timestamp(taggedValue.seconds, taggedValue.nanoseconds);
    case "geoPoint":
      return new GeoPoint(taggedValue.latitude, taggedValue.longitude);
    case "bytes":
      return Buffer.from(taggedValue.base64, "base64");
    case "date":
      return new Date(taggedValue.value);
    case "reference":
      if (!isDocumentPath(taggedValue.path)) {
        throw new Error("Yedekte geçersiz belge başvurusu var.");
      }
      return database.doc(taggedValue.path);
    default:
      return Object.fromEntries(
        Object.entries(value).map(([key, nestedValue]) => [
          key,
          decodeValue(nestedValue, database),
        ]),
      );
  }
}

async function main() {
  const backupPath = getArgument("--file");
  const isDryRun = process.argv.includes("--dry-run");

  if (!backupPath) {
    throw new Error("Yedek dosyasını --file ile belirt.");
  }

  if (!isDryRun && !process.argv.includes("--confirm-restore")) {
    throw new Error(
      "Geri yükleme için --confirm-restore zorunlu. Önce --dry-run çalıştır.",
    );
  }

  const projectId = requiredEnvironment("FIREBASE_ADMIN_PROJECT_ID");
  const clientEmail = requiredEnvironment("FIREBASE_ADMIN_CLIENT_EMAIL");
  const privateKey = requiredEnvironment("FIREBASE_ADMIN_PRIVATE_KEY").replace(
    /\\n/g,
    "\n",
  );
  const backup = JSON.parse(
    await readFile(path.resolve(backupPath), "utf8"),
  );

  if (backup?.format !== BACKUP_FORMAT || !Array.isArray(backup.documents)) {
    throw new Error("Bu dosya geçerli bir Has Gardaşlar Ligi Firestore yedeği değil.");
  }

  if (backup.projectId !== projectId) {
    throw new Error(
      "Yedek farklı bir Firebase projesine ait; yanlış projeye yazmayı engelledim.",
    );
  }

  if (!backup.documents.every((document) => isDocumentPath(document?.path))) {
    throw new Error("Yedekte geçersiz Firestore belge yolu var.");
  }

  if (isDryRun) {
    console.log(
      `Doğrulama başarılı: ${backup.documents.length} belge ${projectId} projesine geri yüklenebilir.`,
    );
    return;
  }

  const app =
    getApps()[0] ??
    initializeApp({
      credential: cert({ projectId, clientEmail, privateKey }),
    });
  const database = getFirestore(app);

  for (let start = 0; start < backup.documents.length; start += BATCH_SIZE) {
    const batch = database.batch();
    const documents = backup.documents.slice(start, start + BATCH_SIZE);

    for (const document of documents) {
      batch.set(
        database.doc(document.path),
        decodeValue(document.data, database),
      );
    }

    await batch.commit();
  }

  console.log(`${backup.documents.length} Firestore belgesi geri yüklendi.`);
}

main().catch((error) => {
  console.error("Firestore geri yüklemesi yapılamadı:", error.message);
  process.exitCode = 1;
});
