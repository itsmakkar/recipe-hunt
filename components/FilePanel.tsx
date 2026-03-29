"use client";

import { useState, useRef, useEffect } from "react";

interface UploadedFile {
  id: string;
  filename: string;
  charCount: number;
  uploadedAt: string | null;
}

export default function FilePanel() {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load existing files on mount
  useEffect(() => {
    fetchFiles();
  }, []);

  async function fetchFiles() {
    setLoading(true);
    try {
      const res = await fetch("/api/upload");
      const data = await res.json();
      setFiles(data.files || []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadMsg(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (res.ok) {
        setUploadMsg({ text: `✓ "${file.name}" uploaded (${data.charCount.toLocaleString()} chars)`, ok: true });
        fetchFiles();
      } else {
        setUploadMsg({ text: `✗ ${data.error}`, ok: false });
      }
    } catch {
      setUploadMsg({ text: "✗ Upload failed. Check your connection.", ok: false });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleDelete(id: string, filename: string) {
    if (!confirm(`Delete "${filename}"?`)) return;
    try {
      const res = await fetch("/api/upload", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        setFiles((prev) => prev.filter((f) => f.id !== id));
        setUploadMsg({ text: `✓ "${filename}" deleted.`, ok: true });
      }
    } catch {
      setUploadMsg({ text: "✗ Delete failed.", ok: false });
    }
  }

  function formatSize(chars: number) {
    if (chars < 1000) return `${chars} chars`;
    return `${(chars / 1000).toFixed(1)}k chars`;
  }

  function formatDate(iso: string | null) {
    if (!iso) return "";
    return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-amber-200 bg-amber-50">
        <h2 className="font-bold text-amber-900 text-sm">📁 Context Files</h2>
        <p className="text-xs text-amber-700 mt-0.5">Bot answers only from these files</p>
      </div>

      {/* Upload button */}
      <div className="px-4 py-3 border-b border-amber-100">
        <label className={`flex items-center justify-center gap-2 w-full py-2 rounded-lg text-sm font-medium cursor-pointer transition-all
          ${uploading
            ? "bg-amber-100 text-amber-400 cursor-not-allowed"
            : "bg-amber-500 hover:bg-amber-600 text-white"
          }`}>
          {uploading ? (
            <>
              <span className="animate-spin">⟳</span> Uploading…
            </>
          ) : (
            <>
              ↑ Upload File
            </>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.docx,.md"
            className="hidden"
            onChange={handleUpload}
            disabled={uploading}
          />
        </label>
        <p className="text-xs text-gray-400 mt-1 text-center">TXT or DOCX only</p>

        {uploadMsg && (
          <div className={`mt-2 text-xs px-3 py-2 rounded-lg ${uploadMsg.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>
            {uploadMsg.text}
          </div>
        )}
      </div>

      {/* File list */}
      <div className="flex-1 overflow-y-auto px-3 py-2">
        {loading ? (
          <p className="text-xs text-gray-400 text-center mt-6">Loading files…</p>
        ) : files.length === 0 ? (
          <div className="text-center mt-8 px-2">
            <div className="text-3xl mb-2">📄</div>
            <p className="text-xs text-gray-400">No files uploaded yet.</p>
            <p className="text-xs text-gray-400 mt-1">Upload a TXT or DOCX file to get started.</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {files.map((f) => (
              <li
                key={f.id}
                className="bg-white border border-amber-100 rounded-lg px-3 py-2 flex items-start justify-between gap-2 shadow-sm"
              >
                <div className="min-w-0">
                  <p className="text-xs font-medium text-gray-800 truncate">{f.filename}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {formatSize(f.charCount)}
                    {f.uploadedAt ? ` · ${formatDate(f.uploadedAt)}` : ""}
                  </p>
                </div>
                <button
                  onClick={() => handleDelete(f.id, f.filename)}
                  className="text-gray-300 hover:text-red-400 transition-colors flex-shrink-0 text-base mt-0.5"
                  title="Delete file"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Footer count */}
      {files.length > 0 && (
        <div className="px-4 py-2 border-t border-amber-100 bg-amber-50">
          <p className="text-xs text-amber-700">{files.length} file{files.length !== 1 ? "s" : ""} active as context</p>
        </div>
      )}
    </div>
  );
}
