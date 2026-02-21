'use client';

import { useState, useEffect, useRef, DragEvent, useCallback } from 'react';
import dynamic from 'next/dynamic';
import MarkdownRenderer from '@/components/MarkdownRenderer';
import ConfirmModal from '@/components/ConfirmModal';
import TagEditor from '@/components/TagEditor';

const PdfViewer = dynamic(() => import('@/components/PdfViewer'), { ssr: false });

interface StorageFile {
  id: string;
  name: string;
  created_at: string;
  metadata: { size: number; mimetype: string } | null;
}

type Panel = 'preview' | 'summary' | 'quiz';

interface QuizQuestion {
  id: number;
  question: string;
  options: string[];
  answer: string;
}

function formatBytes(b: number) {
  if (!b) return '—';
  const k = 1024, s = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(b) / Math.log(k));
  return `${(b / Math.pow(k, i)).toFixed(1)} ${s[i]}`;
}

function isPdf(name: string) {
  return name.toLowerCase().endsWith('.pdf');
}
function isTxt(name: string) {
  return name.toLowerCase().endsWith('.txt');
}
function isSummarisable(name: string) {
  return isPdf(name) || isTxt(name);
}
function fileIcon(name: string) {
  if (isPdf(name)) return { label: 'PDF', cls: 'bg-red-100 text-red-600' };
  if (isTxt(name)) return { label: 'TXT', cls: 'bg-green-100 text-green-700' };
  return { label: 'DOC', cls: 'bg-gray-100 text-gray-500' };
}

export default function Home() {
  const [files, setFiles] = useState<StorageFile[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Selected file state
  const [selected, setSelected] = useState<StorageFile | null>(null);
  const [activePanel, setActivePanel] = useState<Panel>('preview');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loadingUrl, setLoadingUrl] = useState(false);

  // txt raw text preview
  const [textContent, setTextContent] = useState<string | null>(null);

  // AI Summary state
  const [summary, setSummary] = useState<string | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [summaryLength, setSummaryLength] = useState<'short' | 'medium' | 'long'>('medium');

  // Quiz state
  const [quiz, setQuiz] = useState<QuizQuestion[] | null>(null);
  const [loadingQuiz, setLoadingQuiz] = useState(false);
  const [quizError, setQuizError] = useState<string | null>(null);
  const [userAnswers, setUserAnswers] = useState<Record<number, string>>({});
  const [quizSubmitted, setQuizSubmitted] = useState(false);

  // Search
  const [searchQuery, setSearchQuery] = useState('');

  // Tags
  const [fileTags, setFileTags] = useState<Record<string, string[]>>({});
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [generatingTagsFor, setGeneratingTagsFor] = useState<string | null>(null);

  // Load tags from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('ai-doc-tags');
      if (stored) setFileTags(JSON.parse(stored));
    } catch { /* ignore */ }
  }, []);

  function persistTags(updated: Record<string, string[]>) {
    setFileTags(updated);
    try { localStorage.setItem('ai-doc-tags', JSON.stringify(updated)); } catch { /* ignore */ }
  }

  async function generateTags(fileName: string) {
    if (generatingTagsFor === fileName) return;
    setGeneratingTagsFor(fileName);
    try {
      const res = await fetch('/api/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storagePath: fileName }),
      });
      const data = await res.json();
      if (res.ok && Array.isArray(data.tags) && data.tags.length > 0) {
        setFileTags(prev => {
          const updated = { ...prev, [fileName]: data.tags };
          try { localStorage.setItem('ai-doc-tags', JSON.stringify(updated)); } catch { /* ignore */ }
          return updated;
        });
      }
    } catch { /* silent */ } finally {
      setGeneratingTagsFor(null);
    }
  }

  function addTag(fileName: string, tag: string) {
    const trimmed = tag.trim();
    if (!trimmed) return;
    const prev = fileTags[fileName] ?? [];
    if (prev.includes(trimmed)) return;
    persistTags({ ...fileTags, [fileName]: [...prev, trimmed] });
  }

  function removeTag(fileName: string, tag: string) {
    const prev = fileTags[fileName] ?? [];
    persistTags({ ...fileTags, [fileName]: prev.filter(t => t !== tag) });
    setTagFilter(tf => tf.filter(t => t !== tag));
  }

  // Confirm modal state
  type ModalConfig = { title: string; message: string; confirmLabel: string; cancelLabel: string; variant: 'danger' | 'warning' | 'default'; onConfirm: () => void; };
  const [modal, setModal] = useState<ModalConfig | null>(null);

  function showConfirm(cfg: ModalConfig) { setModal(cfg); }
  function closeModal() { setModal(null); }

  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchFiles = useCallback(async () => {
    setLoadingList(true);
    setError(null);
    try {
      const res = await fetch('/api/documents');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to fetch');
      setFiles((data.files ?? []).filter((f: StorageFile) => f.name !== '.emptyFolderPlaceholder'));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => { fetchFiles(); }, [fetchFiles]);

  function downloadSummary() {
    if (!summary || !selected) return;
    const blob = new Blob([summary], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const baseName = selected.name.replace(/\.[^.]+$/, '');
    a.href = url;
    a.download = `${baseName}_summary.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleUploadRequest(file: File) {
    if (!isSummarisable(file.name)) {
      setError('Only PDF and TXT files are supported. Please upload a .pdf or .txt file.');
      return;
    }
    showConfirm({
      title: 'Upload File',
      message: `Upload "${file.name}"?\nIf a file with the same name exists, it will be overwritten.`,
      confirmLabel: 'Upload',
      cancelLabel: 'Cancel',
      variant: 'warning',
      onConfirm: () => { closeModal(); uploadFile(file); },
    });
  }

  async function uploadFile(file: File) {
    setUploadMsg(`Uploading "${file.name}"…`);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/documents', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Upload failed');
      setUploadMsg(`"${file.name}" uploaded!`);
      await fetchFiles();
      // Auto-generate tags for the newly uploaded file
      if (isSummarisable(file.name)) generateTags(file.name);
      setTimeout(() => setUploadMsg(null), 3000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Upload error');
      setUploadMsg(null);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleUploadRequest(file);
    e.target.value = '';
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleUploadRequest(file);
  }

  function handleDeleteRequest(file: StorageFile) {
    showConfirm({
      title: 'Delete File',
      message: `Delete "${file.name}"?\nThis action cannot be undone.`,
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
      variant: 'danger',
      onConfirm: () => { closeModal(); handleDelete(file); },
    });
  }

  async function handleDelete(file: StorageFile) {
    setDeletingId(file.name);
    setError(null);
    try {
      const res = await fetch(`/api/documents/${encodeURIComponent(file.name)}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Delete failed');
      if (selected?.name === file.name) { setSelected(null); setPreviewUrl(null); setSummary(null); }
      // Clean up cached tags
      const updated = { ...fileTags };
      delete updated[file.name];
      persistTags(updated);
      await fetchFiles();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Delete error');
    } finally {
      setDeletingId(null);
    }
  }

  async function handleSelect(file: StorageFile) {
    setSelected(file);
    setActivePanel('preview');
    setPreviewUrl(null);
    setTextContent(null);
    setSummary(null);
    setSummaryError(null);
    setQuiz(null);
    setQuizError(null);
    setUserAnswers({});
    setQuizSubmitted(false);
    setLoadingUrl(true);
    // Auto-generate tags in background if not yet cached
    if (isSummarisable(file.name) && !fileTags[file.name]) {
      generateTags(file.name);
    }
    try {
      const res = await fetch(`/api/documents/${encodeURIComponent(file.name)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to get URL');
      setPreviewUrl(data.url);
      // For txt files, also fetch the raw content for inline preview
      if (isTxt(file.name)) {
        const txtRes = await fetch(data.url);
        setTextContent(await txtRes.text());
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error loading preview');
    } finally {
      setLoadingUrl(false);
    }
  }

  async function handleSummarise(forceLength?: 'short' | 'medium' | 'long') {
    if (!selected) return;
    setActivePanel('summary');
    const len = forceLength ?? summaryLength;
    if (summary) return;
    setLoadingSummary(true);
    setSummaryError(null);
    try {
      const res = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storagePath: selected.name, length: len }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Summarisation failed');
      setSummary(data.summary);
    } catch (e: unknown) {
      setSummaryError(e instanceof Error ? e.message : 'Error');
    } finally {
      setLoadingSummary(false);
    }
  }

  async function handleQuiz() {
    if (!selected) return;
    setActivePanel('quiz');
    if (quiz) return;
    setLoadingQuiz(true);
    setQuizError(null);
    try {
      const res = await fetch('/api/quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storagePath: selected.name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Quiz generation failed');
      setQuiz(data.questions);
    } catch (e: unknown) {
      setQuizError(e instanceof Error ? e.message : 'Error');
    } finally {
      setLoadingQuiz(false);
    }
  }

  function handleLengthChange(len: 'short' | 'medium' | 'long') {
    if (len === summaryLength) return;
    setSummaryLength(len);
    setSummary(null);  // invalidate cached summary
    setSummaryError(null);
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Confirm Modal ── */}
      {modal && (
        <ConfirmModal
          title={modal.title}
          message={modal.message}
          confirmLabel={modal.confirmLabel}
          cancelLabel={modal.cancelLabel}
          variant={modal.variant}
          onConfirm={modal.onConfirm}
          onCancel={closeModal}
        />
      )}
      {/* ── Top Nav ── */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-gray-900">AI Document Summary</h1>
            <p className="text-xs text-gray-500 hidden sm:block">Upload PDFs and get instant AI summaries</p>
          </div>
        </div>
      </header>
      <input ref={fileInputRef} type="file" accept=".pdf,.txt" className="hidden" onChange={handleFileChange} />

      <div className="max-w-6xl mx-auto px-4 py-4">
        {/* ── Error Banner ── */}
        {error && (
          <div className="mb-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <span className="font-semibold shrink-0">Error:</span>
            <span className="flex-1">{error}</span>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 font-bold shrink-0">✕</button>
          </div>
        )}

        {/* ── Upload Progress ── */}
        {uploadMsg && (
          <div className="mb-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-700">
            {uploadMsg}
          </div>
        )}

        {/* ── Main Layout ── */}
        <div className="flex flex-col lg:flex-row gap-4">

          {/* ════ Left: File List ════ */}
          <div className="w-full lg:w-72 shrink-0">
            {/* Drop Zone */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`mb-3 flex flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed cursor-pointer transition-colors py-6
                ${dragOver ? 'border-blue-500 bg-blue-50' : 'border-gray-300 bg-white hover:border-blue-400 hover:bg-gray-50'}`}
            >
              <svg className="w-7 h-7 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
              <p className="text-xs text-gray-500 text-center">Drop PDF or TXT here, or click to upload</p>
            </div>

            {/* File List Card */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <span className="text-sm font-semibold text-gray-800">
                  Documents
                  {files.length > 0 && (
                    <span className="ml-2 text-xs bg-gray-100 text-gray-500 rounded-full px-2 py-0.5">{files.length}</span>
                  )}
                </span>
                <button onClick={fetchFiles} disabled={loadingList} className="text-xs text-blue-600 hover:text-blue-800 disabled:opacity-50">
                  {loadingList ? '…' : 'Refresh'}
                </button>
              </div>
              {/* Search */}
              <div className="px-3 pt-2 pb-1 border-b border-gray-100">
                <div className="relative">
                  <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 105 11a6 6 0 0012 0z" />
                  </svg>
                  <input
                    type="text"
                    placeholder="Search documents…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-300 bg-gray-50"
                  />
                  {searchQuery && (
                    <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs">✕</button>
                  )}
                </div>
                {/* Tag filter chips */}
                {(() => {
                  const allTags = [...new Set(Object.values(fileTags).flat())].sort();
                  if (allTags.length === 0) return null;
                  return (
                    <div className="flex flex-wrap gap-1 pt-2 pb-1">
                      {allTags.map(tag => {
                        const active = tagFilter.includes(tag);
                        return (
                          <button
                            key={tag}
                            onClick={() => setTagFilter(prev => active ? prev.filter(t => t !== tag) : [...prev, tag])}
                            className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
                              active
                                ? 'bg-blue-600 text-white border-blue-600'
                                : 'bg-gray-50 text-gray-500 border-gray-200 hover:border-blue-400 hover:text-blue-600'
                            }`}
                          >
                            {tag}
                          </button>
                        );
                      })}
                      {tagFilter.length > 0 && (
                        <button
                          onClick={() => setTagFilter([])}
                          className="text-[10px] px-2 py-0.5 rounded-full border border-gray-200 text-gray-400 hover:text-gray-600"
                        >✕ Clear</button>
                      )}
                    </div>
                  );
                })()}
              </div>

              {loadingList && files.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-gray-400 animate-pulse">Loading…</div>
              ) : files.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-gray-400">No documents yet.</div>
              ) : (
                /* Scrollable on mobile, full on desktop */
                <ul className="max-h-48 lg:max-h-[calc(100vh-400px)] overflow-y-auto divide-y divide-gray-100">
                  {(() => {
                    const filtered = files.filter(f => {
                      const matchesSearch = f.name.toLowerCase().includes(searchQuery.toLowerCase());
                      const matchesTags = tagFilter.length === 0 || tagFilter.every(t => (fileTags[f.name] ?? []).includes(t));
                      return matchesSearch && matchesTags;
                    });
                    if (filtered.length === 0) return (
                      <li className="px-4 py-6 text-center text-xs text-gray-400">
                        {tagFilter.length > 0 ? 'No documents match the selected tags.' : `No results for "${searchQuery}"`}
                      </li>
                    );
                    return filtered.map((file) => {
                      const isActive = selected?.name === file.name;
                      const tags = fileTags[file.name] ?? [];
                      const isGenerating = generatingTagsFor === file.name;
                      return (
                        <li
                          key={file.id}
                          onClick={() => handleSelect(file)}
                          className={`flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors
                            ${isActive ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                        >
                          {/* File type icon */}
                          <div className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${fileIcon(file.name).cls}`}>
                            {fileIcon(file.name).label}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-gray-900 truncate">{file.name}</p>
                            <p className="text-xs text-gray-400">{formatBytes(file.metadata?.size ?? 0)}</p>
                            {/* Tag chips */}
                            {isGenerating ? (
                              <p className="text-[10px] text-gray-400 animate-pulse mt-1">Generating tags…</p>
                            ) : tags.length > 0 ? (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {tags.map(tag => (
                                  <span
                                    key={tag}
                                    onClick={(e) => { e.stopPropagation(); setTagFilter(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]); }}
                                    className={`text-[10px] px-1.5 py-0.5 rounded-full border cursor-pointer transition-colors ${
                                      tagFilter.includes(tag)
                                        ? 'bg-blue-600 text-white border-blue-600'
                                        : 'bg-gray-100 text-gray-500 border-gray-200 hover:border-blue-400 hover:text-blue-600'
                                    }`}
                                  >
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            ) : null}
                          </div>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeleteRequest(file); }}
                            disabled={deletingId === file.name}
                            className="shrink-0 p-1 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40"
                            title="Delete"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </li>
                      );
                    });
                  })()}
                </ul>
              )}
            </div>
          </div>

          {/* ════ Right: Preview / Summary ════ */}
          <div className="flex-1 min-w-0">
            {!selected ? (
              <div className="h-64 lg:h-full flex flex-col items-center justify-center bg-white rounded-xl border-2 border-dashed border-gray-200 text-gray-400">
                <svg className="w-12 h-12 mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p className="text-sm">Select a document to preview</p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
                {/* File header + Tab bar */}
                <div className="px-4 pt-3 pb-0 border-b border-gray-200">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-gray-900 truncate">{selected.name}</p>
                      <p className="text-xs text-gray-400 mb-1">{formatBytes(selected.metadata?.size ?? 0)}</p>
                      {/* Tags on selected file */}
                      <TagEditor
                        tags={fileTags[selected.name] ?? []}
                        isGenerating={generatingTagsFor === selected.name}
                        onAdd={(tag) => addTag(selected.name, tag)}
                        onRemove={(tag) => removeTag(selected.name, tag)}
                        onRegenerate={() => { persistTags({ ...fileTags, [selected.name]: [] }); generateTags(selected.name); }}
                        activeFilter={tagFilter}
                        onFilterToggle={(tag) => setTagFilter(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])}
                      />
                    </div>
                    {isSummarisable(selected.name) && (
                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => handleSummarise()}
                            disabled={loadingSummary}
                            className="flex items-center gap-1.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
                          >
                            {loadingSummary ? (
                              <>
                                <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                                </svg>
                                Analysing…
                              </>
                            ) : (
                              <>✦ Summary</>
                            )}
                          </button>
                          <button
                            onClick={handleQuiz}
                            disabled={loadingQuiz}
                            className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
                          >
                            {loadingQuiz ? (
                              <>
                                <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                                </svg>
                                Generating…
                              </>
                            ) : (
                              <>✎ Quiz</>
                            )}
                          </button>
                        </div>
                        {/* Summary length selector */}
                        <div className="flex rounded-md border border-gray-200 overflow-hidden text-xs">
                          {(['short', 'medium', 'long'] as const).map((len) => (
                            <button
                              key={len}
                              onClick={() => handleLengthChange(len)}
                              className={`px-2.5 py-1 capitalize transition-colors ${
                                summaryLength === len
                                  ? 'bg-purple-600 text-white font-medium'
                                  : 'bg-white text-gray-500 hover:bg-gray-50'
                              }`}
                            >
                              {len}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Tabs */}
                  <div className="flex gap-1">
                    {(['preview', 'summary', 'quiz'] as Panel[]).map((tab) => (
                      <button
                        key={tab}
                        onClick={() => {
                          if (tab === 'summary') { setActivePanel('summary'); if (!summary && !loadingSummary) handleSummarise(); }
                          else if (tab === 'quiz') { setActivePanel('quiz'); if (!quiz && !loadingQuiz) handleQuiz(); }
                          else setActivePanel('preview');
                        }}
                        className={`px-4 py-2 text-xs font-medium rounded-t-md transition-colors capitalize
                          ${activePanel === tab
                            ? 'bg-gray-50 border border-b-white border-gray-200 -mb-px text-blue-600'
                            : 'text-gray-500 hover:text-gray-700'}`}
                        style={{ display: tab !== 'preview' && !isSummarisable(selected.name) ? 'none' : undefined }}
                      >
                        {tab === 'summary' ? '✦ Summary' : tab === 'quiz' ? '✎ Quiz' : '⊞ Preview'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Panel Content */}
                <div className="p-4 flex-1 min-h-[400px] lg:min-h-[500px]">
                  {activePanel === 'preview' && (
                    <>
                      {loadingUrl ? (
                        <div className="h-full flex items-center justify-center text-gray-400 text-sm animate-pulse">
                          Loading preview…
                        </div>
                      ) : previewUrl && isPdf(selected.name) ? (
                        <div className="h-[400px] lg:h-[560px]">
                          <PdfViewer url={previewUrl} fileName={selected.name} />
                        </div>
                      ) : isTxt(selected.name) && textContent !== null ? (
                        <div className="h-[400px] lg:h-[560px] flex flex-col">
                          <div className="flex items-center justify-between mb-2 shrink-0">
                            <span className="text-xs text-gray-500">{textContent.length.toLocaleString()} characters</span>
                            <a href={previewUrl ?? '#'} target="_blank" rel="noopener noreferrer"
                              className="text-xs text-blue-600 hover:text-blue-800">Open in new tab ↗</a>
                          </div>
                          <pre className="flex-1 overflow-auto rounded-lg bg-gray-50 border border-gray-200 p-4 text-xs text-gray-800 font-mono whitespace-pre-wrap break-words leading-relaxed">
                            {textContent}
                          </pre>
                        </div>
                      ) : previewUrl ? (
                        <div className="flex flex-col items-center justify-center gap-3 h-full text-gray-500">
                          <svg className="w-10 h-10 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                              d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                          </svg>
                          <p className="text-sm">Preview not available for this file type.</p>
                          <a href={previewUrl} target="_blank" rel="noopener noreferrer"
                            className="text-sm text-blue-600 hover:underline">
                            Download file ↗
                          </a>
                        </div>
                      ) : null}
                    </>
                  )}

                  {activePanel === 'quiz' && (
                    <div className="h-full overflow-y-auto">
                      {loadingQuiz ? (
                        <div className="flex flex-col items-center justify-center gap-3 py-16 text-gray-500">
                          <svg className="w-8 h-8 animate-spin text-emerald-500" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                          </svg>
                          <p className="text-sm">Generating quiz questions…</p>
                        </div>
                      ) : quizError ? (
                        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                          <p className="font-semibold mb-1">Quiz generation failed</p>
                          <p>{quizError}</p>
                          <button onClick={() => { setQuiz(null); handleQuiz(); }} className="mt-3 text-xs text-red-600 hover:text-red-800 underline">Try again</button>
                        </div>
                      ) : quiz ? (
                        <div className="space-y-5">
                          <div className="flex items-center justify-between">
                            <span className="text-emerald-700 text-sm font-semibold">✎ Quiz — {quiz.length} Questions</span>
                            {quizSubmitted && (
                              <button
                                onClick={() => { setUserAnswers({}); setQuizSubmitted(false); setQuiz(null); handleQuiz(); }}
                                className="text-xs text-emerald-600 hover:text-emerald-800 border border-emerald-200 rounded-md px-2 py-1"
                              >Retake Quiz</button>
                            )}
                          </div>
                          {quiz.map((q, qi) => {
                            const chosen = userAnswers[q.id];
                            const correct = q.answer;
                            return (
                              <div key={q.id} className={`rounded-xl border p-4 ${
                                quizSubmitted
                                  ? chosen === correct ? 'border-emerald-300 bg-emerald-50' : 'border-red-200 bg-red-50'
                                  : 'border-gray-200 bg-white'
                              }`}>
                                <p className="text-sm font-medium text-gray-800 mb-3">
                                  <span className="text-gray-400 mr-1">{qi + 1}.</span> {q.question}
                                </p>
                                <div className="space-y-2">
                                  {q.options.map((opt) => {
                                    const letter = opt.charAt(0);
                                    const isChosen = chosen === letter;
                                    const isCorrect = correct === letter;
                                    let cls = 'border-gray-200 bg-gray-50 text-gray-700 hover:border-emerald-400 hover:bg-emerald-50';
                                    if (quizSubmitted) {
                                      if (isCorrect) cls = 'border-emerald-400 bg-emerald-100 text-emerald-800 font-medium';
                                      else if (isChosen) cls = 'border-red-300 bg-red-100 text-red-700 line-through';
                                      else cls = 'border-gray-200 bg-gray-50 text-gray-400';
                                    } else if (isChosen) {
                                      cls = 'border-blue-400 bg-blue-50 text-blue-800 font-medium';
                                    }
                                    return (
                                      <button
                                        key={letter}
                                        disabled={quizSubmitted}
                                        onClick={() => setUserAnswers(prev => ({ ...prev, [q.id]: letter }))}
                                        className={`w-full text-left rounded-lg border px-3 py-2 text-xs transition-colors ${cls}`}
                                      >
                                        {opt}
                                      </button>
                                    );
                                  })}
                                </div>
                                {quizSubmitted && chosen !== correct && (
                                  <p className="mt-2 text-xs text-emerald-700">✓ Correct answer: {correct}</p>
                                )}
                              </div>
                            );
                          })}
                          {!quizSubmitted && (
                            <button
                              onClick={() => setQuizSubmitted(true)}
                              disabled={Object.keys(userAnswers).length < quiz.length}
                              className="w-full rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-sm font-medium py-2.5 transition-colors"
                            >
                              Submit Answers ({Object.keys(userAnswers).length}/{quiz.length} answered)
                            </button>
                          )}
                          {quizSubmitted && (
                            <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-center">
                              <p className="text-lg font-bold text-emerald-700">
                                {Object.entries(userAnswers).filter(([id, ans]) => {
                                  const q = quiz.find(q => q.id === Number(id));
                                  return q?.answer === ans;
                                }).length} / {quiz.length} Correct
                              </p>
                              <p className="text-xs text-emerald-600 mt-1">
                                {Object.entries(userAnswers).filter(([id, ans]) => quiz.find(q => q.id === Number(id))?.answer === ans).length === quiz.length
                                  ? '🎉 Perfect score!'
                                  : 'Review the highlighted answers above.'}
                              </p>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center gap-3 py-16 text-gray-400">
                          <p className="text-sm">Click <strong>✎ Quiz</strong> to generate questions from this document.</p>
                        </div>
                      )}
                    </div>
                  )}

                  {activePanel === 'summary' && (
                    <div className="h-full overflow-y-auto">
                      {loadingSummary ? (
                        <div className="flex flex-col items-center justify-center gap-3 py-16 text-gray-500">
                          <svg className="w-8 h-8 animate-spin text-purple-500" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                          </svg>
                          <p className="text-sm">AI is reading your document…</p>
                        </div>
                      ) : summaryError ? (
                        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                          <p className="font-semibold mb-1">Summarisation failed</p>
                          <p>{summaryError}</p>
                          <button onClick={() => handleSummarise()} className="mt-3 text-xs text-red-600 hover:text-red-800 underline">
                            Try again
                          </button>
                        </div>
                      ) : summary ? (
                        <div className="rounded-xl border border-purple-100 bg-purple-50 p-4">
                          <div className="flex items-center justify-between gap-2 mb-3">
                            <div className="flex items-center gap-2">
                              <span className="text-purple-600 text-sm font-semibold">✦ AI Summary</span>
                              <span className="text-xs text-purple-400">Generated by GitHub Copilot Models</span>
                            </div>
                            <button
                              onClick={downloadSummary}
                              title="Download summary as Markdown"
                              className="flex items-center gap-1 text-xs text-purple-600 hover:text-purple-800 border border-purple-200 hover:border-purple-400 rounded-md px-2 py-1 transition-colors"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                              </svg>
                              Download
                            </button>
                          </div>
                          <MarkdownRenderer content={summary} />
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center gap-3 py-16 text-gray-400">
                          <p className="text-sm">Click <strong>✦ AI Summary</strong> to analyse this document.</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
