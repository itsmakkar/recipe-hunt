import { NextRequest, NextResponse } from "next/server";
import {
  deleteFile,
  listFiles,
  saveUploadedFile,
  usingFirebasePersistence,
} from "@/lib/recipe-context-store";

export const runtime = "nodejs";
export const maxDuration = 30;

function isAllowedName(name: string): boolean {
  const lowerName = name.toLowerCase();
  return (
    lowerName.endsWith(".txt") ||
    lowerName.endsWith(".docx") ||
    lowerName.endsWith(".md")
  );
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();

    const fromFiles = formData.getAll("files").filter(
      (v): v is File => v instanceof File && v.size > 0
    );
    const legacy = formData.get("file");
    const singleLegacy =
      legacy instanceof File && legacy.size > 0 ? [legacy] : [];

    const fileList = fromFiles.length > 0 ? fromFiles : singleLegacy;

    if (fileList.length === 0) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      );
    }

    const results: Array<{
      id: string;
      filename: string;
      charCount: number;
      preview: string;
    }> = [];
    const errors: Array<{ filename: string; error: string }> = [];

    for (const file of fileList) {
      if (!isAllowedName(file.name)) {
        errors.push({
          filename: file.name,
          error: "Only TXT, MD, and DOCX files are supported.",
        });
        continue;
      }

      try {
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const saved = await saveUploadedFile(buffer, file.name, file.type);
        results.push(saved);
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Upload failed for this file.";
        errors.push({ filename: file.name, error: msg });
      }
    }

    if (results.length === 0 && errors.length > 0) {
      return NextResponse.json(
        {
          error: errors.map((e) => `${e.filename}: ${e.error}`).join(" "),
          errors,
        },
        { status: 400 }
      );
    }

    const persistence = usingFirebasePersistence()
      ? "firebase"
      : "local";

    return NextResponse.json({
      uploaded: results,
      count: results.length,
      errors: errors.length > 0 ? errors : undefined,
      message:
        results.length === 1
          ? "File uploaded and indexed successfully."
          : `${results.length} files uploaded and indexed successfully.`,
      persistence,
      persistenceNote:
        persistence === "local"
          ? "Using local storage (no Firebase env). Data may reset on server restart; set FIREBASE_SERVICE_ACCOUNT on Vercel for durable storage."
          : undefined,
    });
  } catch (err) {
    console.error("Upload error:", err);
    const msg = err instanceof Error ? err.message : "Upload failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET() {
  try {
    const files = await listFiles();
    return NextResponse.json({
      files,
      persistence: usingFirebasePersistence() ? "firebase" : "local",
    });
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

    await deleteFile(id);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Delete error:", err);
    const msg = err instanceof Error ? err.message : "Failed to delete file";
    const status = msg === "File not found" ? 404 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
