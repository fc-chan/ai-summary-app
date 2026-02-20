'use client'

import { useState, useEffect, useRef, DragEvent } from "react";

interface StorageFile {
  id: string;
  name: string;
  updated_at: string;
  created_at: string;
  last_accessed_at: string;
  metadata: {
    size: number;
    mimetype: string;
  } | null;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString();
}

export default function Home() {
  const [files, setFiles] = useState<StorageFile[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function fetchFiles() {
    setLoadingList(true);
    setError(null);
    try {
      const res = await fetch('/api/documents');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to fetch files');
      setFiles(data.files ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoadingList(false);
    }
  }

  useEffect(() => { fetchFiles(); }, []);

  async function uploadFile(file: File) {
    setUploadProgress(`Uploading "${file.name}"…`);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/documents', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Upload failed');
      setUploadProgress(`"${file.name}" uploaded successfully!`);
      await fetchFiles();
      setTimeout(() => setUploadProgress(null), 3000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Upload error');
      setUploadProgress(null);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
    e.target.value = '';
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) uploadFile(file);
  }

  async function handleDelete(storagePath: string) {
    setDeletingId(storagePath);
    setError(null);
    try {
      const res = await fetch(`/api/documents/${encodeURIComponent(storagePath)}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Delete failed');
      await fetchFiles();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Delete error');
    } finally {
      setDeletingId(null);
    }
  }

  async function handleDownload(storagePath: string, originalName: string) {
    setDownloadingId(storagePath);
    setError(null);
    try {
      const res = await fetch(`/api/documents/${encodeURIComponent(storagePath)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to get URL');
      const a = document.createElement('a');
      a.href = data.url;
      a.download = originalName;
      a.target = '_blank';
      a.click();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Download error');
    } finally {
      setDownloadingId(null);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-3xl mx-auto">

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Document Manager</h1>
          <p className="text-gray-500 mt-1">Upload and manage files stored in Supabase Storage.</p>
        </div>

        {/* Error Banner */}
        {error && (
          <div className="mb-4 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700">
            <span className="font-semibold">Error:</span>
            <span>{error}</span>
            <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600 font-bold">✕</button>
          </div>
        )}

        {/* Upload Zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`mb-6 flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed cursor-pointer transition-colors py-12
            ${dragOver ? 'border-blue-500 bg-blue-50' : 'border-gray-300 bg-white hover:border-blue-400 hover:bg-gray-50'}`}
        >
          <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
          </svg>
          <p className="text-gray-600 font-medium">
            {uploadProgress ?? 'Drag & drop a file here, or click to choose'}
          </p>
          <p className="text-xs text-gray-400">Any file type supported</p>
          <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange} />
        </div>

        {/* File List */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-800">
              Uploaded Files
              {files.length > 0 && (
                <span className="ml-2 text-xs font-medium bg-gray-100 text-gray-500 rounded-full px-2 py-0.5">{files.length}</span>
              )}
            </h2>
            <button
              onClick={fetchFiles}
              disabled={loadingList}
              className="text-sm text-blue-600 hover:text-blue-800 disabled:opacity-50"
            >
              {loadingList ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>

          {loadingList && files.length === 0 ? (
            <div className="px-5 py-10 text-center text-gray-400">Loading…</div>
          ) : files.length === 0 ? (
            <div className="px-5 py-10 text-center text-gray-400">No files uploaded yet.</div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {files.map((file) => (
                <li key={file.id} className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors">
                  {/* Icon */}
                  <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center">
                    <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                        d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                    </svg>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{file.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {file.metadata?.size ? formatBytes(file.metadata.size) : '—'}
                      {' · '}
                      {formatDate(file.created_at)}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleDownload(file.name, file.name)}
                      disabled={downloadingId === file.name}
                      className="text-xs px-3 py-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
                    >
                      {downloadingId === file.name ? 'Getting URL…' : 'Download'}
                    </button>
                    <button
                      onClick={() => handleDelete(file.name)}
                      disabled={deletingId === file.name}
                      className="text-xs px-3 py-1.5 rounded-md bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-50 transition-colors"
                    >
                      {deletingId === file.name ? 'Deleting…' : 'Delete'}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}