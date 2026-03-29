export async function extractTextFromBuffer(
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
