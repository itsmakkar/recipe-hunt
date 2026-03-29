import { NextRequest, NextResponse } from "next/server";
import { getStorage, getFirestore } from "@/lib/firebase-admin";
import admin from "firebase-admin";

export const runtime = "nodejs";
export const maxDuration = 30;

async function extractText(
  buffer: Buffer,
  filename: string,
  mimetype: string
): Promise<string> {
  const lowerName = filename.toLowerCase();

  if (
    mimetype === "text/plain" ||
    lowerName.endsWith(".txt") ||
    lowerName.endsWith(".md")
  ) {
    return buffer.toString("utf-8");
  }

  if (
    mimetype ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    lowerName.endsWith(".docx")
  ) {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  throw new Error(
    `Unsupported file type. Only TXT and DOCX are supported.`
  );
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const lowerName = file.name.toLowerCase();
    const isAllowed =
      lowerName.endsWith(".txt") ||
      lowerName.endsWith(".docx") ||
      lowerName.endsWith(".md");

    if (!isAllowed) {
      return NextResponse.json(
        { error: "Only TXT and DOCX files are supported." },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const textContent = await extractText(buffer, file.name, file.type);

    if (!textContent.trim()) {
      return NextResponse.json(
        { error: "File appears to be empty or has no readable text." },
        { status: 400 }
      );
    }

    // Save original file to Firebase Storage
    const storage = getStorage();
    const timestamp = Date.now();
    const storagePath = `recipe-hunter-contexts/${timestamp}-${file.name}`;
    const storageFile = storage.file(storagePath);

    await storageFile.save(buffer, {
      metadata: {
        contentType: file.type || "application/octet-stream",
        metadata: {
          originalName: file.name,
          uploadedAt: new Date().toISOString(),
        },
      },
    });

    // Save metadata + extracted text to Firestore
    const db = getFirestore();
    const docRef = await db.collection("recipe_hunter_files").add({
      filename: file.name,
      storagePath,
      textContent,
      charCount: textContent.length,
      uploadedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return NextResponse.json({
      id: docRef.id,
      filename: file.name,
      charCount: textContent.length,
      preview: textContent.slice(0, 200),
      message: "File uploaded and indexed successfully.",
    });
  } catch (err) {
    console.error("Upload error:", err);
    const msg = err instanceof Error ? err.message : "Upload failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET() {
  try {
    const db = getFirestore();
    const snapshot = await db
      .collection("recipe_hunter_files")
      .orderBy("uploadedAt", "desc")
      .get();

    const files = snapshot.docs.map((doc) => ({
      id: doc.id,
      filename: doc.data().filename,
      charCount: doc.data().charCount,
      uploadedAt: doc.data().uploadedAt?.toDate?.()?.toISOString() || null,
    }));

    return NextResponse.json({ files });
  } catch (err) {
    console.error("List files error:", err);
    return NextResponse.json({ error: "Failed to list files" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { id } = await req.json();
    if (!id) {
      return NextResponse.json({ error: "No file id provided" }, { status: 400 });
    }

    const db = getFirestore();
    const doc = await db.collection("recipe_hunter_files").doc(id).get();

    if (!doc.exists) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const storagePath = doc.data()?.storagePath;
    if (storagePath) {
      const storage = getStorage();
      await storage.file(storagePath).delete().catch(() => {});
    }

    await db.collection("recipe_hunter_files").doc(id).delete();

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Delete error:", err);
    return NextResponse.json({ error: "Failed to delete file" }, { status: 500 });
  }
}
