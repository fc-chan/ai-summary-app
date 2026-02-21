'use client';

import { useState } from 'react';

interface Props {
  tags: string[];
  isGenerating: boolean;
  activeFilter: string[];
  onAdd: (tag: string) => void;
  onRemove: (tag: string) => void;
  onRegenerate: () => void;
  onFilterToggle: (tag: string) => void;
}

export default function TagEditor({
  tags,
  isGenerating,
  activeFilter,
  onAdd,
  onRemove,
  onRegenerate,
  onFilterToggle,
}: Props) {
  const [inputVisible, setInputVisible] = useState(false);
  const [inputVal, setInputVal] = useState('');

  function commitTag() {
    const trimmed = inputVal.trim();
    if (trimmed) onAdd(trimmed);
    setInputVal('');
    setInputVisible(false);
  }

  return (
    <div className="flex flex-wrap items-center gap-1 min-h-[22px]">
      {isGenerating ? (
        <span className="text-[10px] text-purple-500 animate-pulse flex items-center gap-1">
          <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          Generating tags…
        </span>
      ) : (
        <>
          {tags.map(tag => (
            <span
              key={tag}
              className={`group inline-flex items-center gap-0.5 text-[10px] px-2 py-0.5 rounded-full border transition-colors cursor-pointer ${
                activeFilter.includes(tag)
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-purple-50 text-purple-700 border-purple-200 hover:border-purple-400'
              }`}
              onClick={() => onFilterToggle(tag)}
              title="Click to filter by this tag"
            >
              {tag}
              <button
                onClick={(e) => { e.stopPropagation(); onRemove(tag); }}
                className="opacity-40 group-hover:opacity-100 hover:text-red-500 transition-opacity ml-0.5 leading-none"
                title="Remove tag"
              >×</button>
            </span>
          ))}

          {/* Add tag button */}
          {inputVisible ? (
            <input
              autoFocus
              type="text"
              value={inputVal}
              onChange={e => setInputVal(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') commitTag();
                if (e.key === 'Escape') { setInputVisible(false); setInputVal(''); }
              }}
              onBlur={commitTag}
              placeholder="Tag name…"
              className="text-[10px] w-20 px-2 py-0.5 rounded-full border border-purple-300 focus:outline-none focus:ring-1 focus:ring-purple-400 bg-white"
            />
          ) : (
            <button
              onClick={() => setInputVisible(true)}
              className="text-[10px] px-1.5 py-0.5 rounded-full border border-dashed border-gray-300 text-gray-400 hover:border-purple-400 hover:text-purple-600 transition-colors"
              title="Add tag"
            >+ tag</button>
          )}

          {/* Re-generate button (shown when tags exist or no tags) */}
          <button
            onClick={onRegenerate}
            className="text-[10px] px-1.5 py-0.5 rounded-full border border-dashed border-gray-300 text-gray-400 hover:border-purple-400 hover:text-purple-600 transition-colors"
            title="Re-generate AI tags"
          >⟳ AI</button>
        </>
      )}
    </div>
  );
}
