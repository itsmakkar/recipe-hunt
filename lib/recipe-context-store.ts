import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import admin from "firebase-admin";
import { extractTextFromBuffer } from "@/lib/document-text";
import { getFirestore, getStorage, isFirebaseConfigured } from "@/lib/firebase-admin";

export interface FileListItem {
  id: string;
  filename: string;
  charCount: number;
  uploadedAt: string | null;
}

let fileStoreLock = Promise.resolve();

function withFileLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = fileStoreLock.then(fn, fn);
  fileStoreLock = run.then(
    () => {},
    () => {}
  );
  return run;
}

function localStorePath(): string {
  if (process.env.VERCEL) {
    return path.join("/tmp", "recipe-hunter-files.json");
  }
  return path.join(process.cwd(), ".recipe-hunter-data", "files.json");
}

interface LocalRecord {
  id: string;
  filename: string;
  textContent: string;
  charCount: number;
  uploadedAt: string;
}

async function readLocalStore(): Promise<LocalRecord[]> {
  const p = localStorePath();
  try {
    const raw = await readFile(p, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as LocalRecord[]) : [];
  } catch {
    return [];
  }
}

async function writeLocalStore(records: LocalRecord[]): Promise<void> {
  const p = localStorePath();
  await mkdir(path.dirname(p), { recursive: true });
  await writeFile(p, JSON.stringify(records, null, 2), "utf-8");
}

export function usingFirebasePersistence(): boolean {
  return isFirebaseConfigured();
}

export async function loadContextTextForChat(): Promise<string> {
  if (isFirebaseConfigured()) {
    try {
      const db = getFirestore();
      const snapshot = await db
        .collection("recipe_hunter_files")
        .orderBy("uploadedAt", "desc")
        .get();

      if (snapshot.empty) return "";

      const parts: string[] = [];
      snapshot.docs.forEach((doc: { data: () => Record<string, unknown> }) => {
        const data = doc.data();
        const name = String(data.filename ?? "");
        const text = String(data.textContent ?? "");
        parts.push(`--- FILE: ${name} ---\n${text}\n--- END OF FILE ---`);
      });
      return parts.join("\n\n");
    } catch (err) {
      console.error("Error loading context files (Firebase):", err);
      return "";
    }
  }

  const records = await readLocalStore();
  if (records.length === 0) return "";

  const parts = records.map(
    (r) =>
      `--- FILE: ${r.filename} ---\n${r.textContent}\n--- END OF FILE ---`
  );
  return parts.join("\n\n");
}

export async function listFiles(): Promise<FileListItem[]> {
  if (isFirebaseConfigured()) {
    const db = getFirestore();
    const snapshot = await db
      .collection("recipe_hunter_files")
      .orderBy("uploadedAt", "desc")
      .get();

    return snapshot.docs.map((doc: { id: string; data: () => Record<string, unknown> }) => {
      const d = doc.data();
      const uploadedRaw = d.uploadedAt as { toDate?: () => Date } | undefined;
      return {
        id: doc.id,
        filename: d.filename as string,
        charCount: d.charCount as number,
        uploadedAt: uploadedRaw?.toDate?.()?.toISOString() || null,
      };
    });
  }

  const records = await readLocalStore();
  return records
    .map((r) => ({
      id: r.id,
      filename: r.filename,
      charCount: r.charCount,
      uploadedAt: r.uploadedAt,
    }))
    .sort(
      (a, b) =>
        new Date(b.uploadedAt || 0).getTime() -
        new Date(a.uploadedAt || 0).getTime()
    );
}

export interface SaveFileResult {
  id: string;
  filename: string;
  charCount: number;
  preview: string;
}

export async function saveUploadedFile(
  buffer: Buffer,
  filename: string,
  mimetype: string
): Promise<SaveFileResult> {
  const textContent = await extractTextFromBuffer(buffer, filename, mimetype);

  if (!textContent.trim()) {
    throw new Error("File appears to be empty or has no readable text.");
  }

  if (isFirebaseConfigured()) {
    const storage = getStorage();
    const timestamp = Date.now();
    const storagePath = `recipe-hunter-contexts/${timestamp}-${filename}`;
    const storageFile = storage.file(storagePath);

    await storageFile.save(buffer, {
      metadata: {
        contentType: mimetype || "application/octet-stream",
        metadata: {
          originalName: filename,
          uploadedAt: new Date().toISOString(),
        },
      },
    });

    const db = getFirestore();
    const docRef = await db.collection("recipe_hunter_files").add({
      filename,
      storagePath,
      textContent,
      charCount: textContent.length,
      uploadedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return {
      id: docRef.id,
      filename,
      charCount: textContent.length,
      preview: textContent.slice(0, 200),
    };
  }

  return withFileLock(async () => {
    const records = await readLocalStore();
    const id = randomUUID();
    const uploadedAt = new Date().toISOString();
    records.push({
      id,
      filename,
      textContent,
      charCount: textContent.length,
      uploadedAt,
    });
    await writeLocalStore(records);
    return {
      id,
      filename,
      charCount: textContent.length,
      preview: textContent.slice(0, 200),
    };
  });
}

export async function deleteFile(id: string): Promise<void> {
  if (isFirebaseConfigured()) {
    const db = getFirestore();
    const doc = await db.collection("recipe_hunter_files").doc(id).get();

    if (!doc.exists) {
      throw new Error("File not found");
    }

    const storagePath = doc.data()?.storagePath;
    if (storagePath) {
      const storage = getStorage();
      await storage.file(storagePath).delete().catch(() => {});
    }

    await db.collection("recipe_hunter_files").doc(id).delete();
    return;
  }

  await withFileLock(async () => {
    const records = await readLocalStore();
    const next = records.filter((r) => r.id !== id);
    if (next.length === records.length) {
      throw new Error("File not found");
    }
    await writeLocalStore(next);
  });
}
