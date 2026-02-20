'use client';

interface PdfViewerProps {
  url: string;
  fileName: string;
}

export default function PdfViewer({ url, fileName }: PdfViewerProps) {
  return (
    <div className="flex flex-col h-full w-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 bg-gray-100 border-b border-gray-200 rounded-t-lg shrink-0">
        <span className="text-xs text-gray-600 font-medium truncate max-w-[70%]">{fileName}</span>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-blue-600 hover:text-blue-800 font-medium whitespace-nowrap"
        >
          Open in new tab ↗
        </a>
      </div>

      {/* PDF iframe */}
      <iframe
        src={`${url}#toolbar=1&navpanes=0`}
        className="w-full flex-1 rounded-b-lg border-0 min-h-[400px] md:min-h-[500px]"
        title={fileName}
      />
    </div>
  );
}
