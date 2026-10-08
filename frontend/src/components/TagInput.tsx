import React, { useState, useEffect, useRef } from 'react';
import { X, Plus, Tag as TagIcon } from 'lucide-react';
import { API_BASE_URL } from '../constants';
import { Tag } from '../types';

interface TagInputProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  label?: string;
}

export const TagInput: React.FC<TagInputProps> = ({
  tags,
  onChange,
  placeholder = '가수 / 아티스트 / 멤버 입력 후 Enter...',
  label = 'Artists / Performers / Tags'
}) => {
  const [inputValue, setInputValue] = useState('');
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [isFocused, setIsFocused] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`${API_BASE_URL}/tags`)
      .then(res => res.ok ? res.json() : [])
      .then(data => setAllTags(data))
      .catch(() => setAllTags([]));
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsFocused(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const addTag = (tagName: string) => {
    const trimmed = tagName.trim();
    if (!trimmed) return;
    if (!tags.some(t => t.toLowerCase() === trimmed.toLowerCase())) {
      onChange([...tags, trimmed]);
    }
    setInputValue('');
  };

  const removeTag = (tagToRemove: string) => {
    onChange(tags.filter(t => t !== tagToRemove));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(inputValue);
    } else if (e.key === 'Backspace' && !inputValue && tags.length > 0) {
      removeTag(tags[tags.length - 1]);
    }
  };

  const suggestions = allTags.filter(t => 
    !tags.some(current => current.toLowerCase() === t.name.toLowerCase()) &&
    (!inputValue.trim() || t.name.toLowerCase().includes(inputValue.trim().toLowerCase()))
  ).slice(0, 8);

  return (
    <div className="space-y-2" ref={containerRef}>
      {label && (
        <label className="text-[11px] font-black text-gray-500 uppercase tracking-widest ml-1 flex items-center gap-1.5">
          <TagIcon className="w-3 h-3 text-twice-magenta" />
          <span>{label}</span>
        </label>
      )}

      <div className="relative">
        <div className="flex flex-wrap items-center gap-1.5 p-2.5 bg-slate-900 border border-slate-700 rounded-xl shadow-inner focus-within:border-twice-magenta focus-within:ring-1 focus-within:ring-twice-magenta transition-all min-h-[46px]">
          {tags.map(tag => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-twice-magenta/20 text-pink-300 border border-twice-magenta/40 shadow-sm animate-fade-in"
            >
              <span>{tag}</span>
              <button
                type="button"
                onClick={() => removeTag(tag)}
                className="text-pink-400 hover:text-white p-0.5 rounded-full hover:bg-twice-magenta/30 transition-all"
                title={`${tag} 삭제`}
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}

          <div className="flex-1 min-w-[150px] flex items-center gap-1">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onFocus={() => setIsFocused(true)}
              onKeyDown={handleKeyDown}
              placeholder={tags.length === 0 ? placeholder : '추가 입력...'}
              className="w-full bg-transparent text-white text-xs outline-none placeholder:text-gray-500 py-1"
            />
            {inputValue.trim() && (
              <button
                type="button"
                onClick={() => addTag(inputValue)}
                className="px-2 py-1 bg-twice-magenta hover:bg-pink-600 text-white text-[11px] font-bold rounded-lg flex items-center gap-1 transition-all shadow-sm"
              >
                <Plus className="w-3 h-3" />
                <span>추가</span>
              </button>
            )}
          </div>
        </div>

        {/* Autocomplete Suggestions Dropdown */}
        {isFocused && suggestions.length > 0 && (
          <div className="absolute z-30 top-full left-0 mt-1.5 w-full bg-slate-900/95 border border-slate-700 rounded-xl shadow-2xl backdrop-blur-md overflow-hidden max-h-48 overflow-y-auto p-1.5">
            <div className="text-[10px] font-bold text-gray-500 uppercase px-2 py-1">
              등록된 아티스트 / 태그 추천 ({suggestions.length})
            </div>
            <div className="flex flex-wrap gap-1 p-1">
              {suggestions.map(s => (
                <button
                  key={s.id}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    addTag(s.name);
                  }}
                  className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-800 text-gray-300 hover:bg-twice-magenta hover:text-white transition-all flex items-center gap-1 border border-slate-700/60"
                >
                  <Plus className="w-2.5 h-2.5" />
                  <span>{s.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
