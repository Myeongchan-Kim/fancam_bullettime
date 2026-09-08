import React from 'react';
import { Calendar, ChevronDown, RefreshCw, Compass, ShieldCheck, Search, X, AlertTriangle, Sparkles, CheckCircle2, Split } from 'lucide-react';
import { Concert } from '../../types';

interface ActionToolbarProps {
  concerts: Concert[];
  selectedConcertId: number;
  loading: boolean;
  isAdminMode: boolean;
  onConcertChange: (id: number) => void;
  onRefresh: () => void;
  onOpenAuditModal: () => void;
  onAdminToggle: () => void;
}

export const ActionToolbar: React.FC<ActionToolbarProps> = ({
  concerts,
  selectedConcertId,
  loading,
  isAdminMode,
  onConcertChange,
  onRefresh,
  onOpenAuditModal,
  onAdminToggle
}) => {
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      {/* Concert Selector */}
      <div className="relative min-w-[200px]">
        <Calendar className="w-4 h-4 text-twice-apricot absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <select
          value={selectedConcertId}
          onChange={(e) => onConcertChange(parseInt(e.target.value, 10))}
          className="w-full bg-slate-800 text-white pl-9 pr-8 py-2 rounded-xl border border-slate-700 text-xs font-bold focus:outline-none focus:border-twice-magenta appearance-none cursor-pointer hover:bg-slate-750 transition-all shadow-inner"
        >
          {concerts.map(c => (
            <option key={c.id} value={c.id}>
              {c.date ? new Date(c.date).toISOString().split('T')[0] : ''} {c.city} ({c.venue})
            </option>
          ))}
        </select>
        <ChevronDown className="w-4 h-4 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
      </div>

      <button 
        onClick={onRefresh}
        className="p-2 bg-slate-800 hover:bg-slate-750 text-gray-300 hover:text-white rounded-xl border border-slate-700 transition-all shadow-sm"
        title="새로고침"
      >
        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-twice-magenta' : ''}`} />
      </button>

      <button
        onClick={onOpenAuditModal}
        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all border shadow-sm bg-gradient-to-r from-amber-600/90 to-orange-600/90 hover:from-amber-500 hover:to-orange-500 border-amber-500/40 text-white hover:scale-[1.02] active:scale-95"
        title="세트리스트 대조 어긋난 영상 검사 및 일괄 재정렬"
      >
        <Compass className="w-3.5 h-3.5" />
        <span>정합성 진단</span>
      </button>

      <button 
        onClick={onAdminToggle}
        className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all border shadow-sm ${
          isAdminMode 
            ? 'bg-indigo-600/90 hover:bg-indigo-500 border-indigo-400 text-white' 
            : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-gray-400 hover:text-white'
        }`}
        title={isAdminMode ? 'Admin 로그인 됨 (클릭하여 로그아웃)' : 'Admin Key 입력'}
      >
        <ShieldCheck className="w-3.5 h-3.5" />
        <span>{isAdminMode ? 'Admin' : 'Login'}</span>
      </button>
    </div>
  );
};

interface StatusFilterTabsProps {
  statusFilter: 'all' | 'uncalibrated' | 'ai' | 'verified' | 'segmented' | 'solos';
  stats: {
    total: number;
    uncalibrated: number;
    ai: number;
    verified: number;
    segmented: number;
    solos: number;
  };
  onStatusFilterChange: (status: 'all' | 'uncalibrated' | 'ai' | 'verified' | 'segmented' | 'solos') => void;
}

export const StatusFilterTabs: React.FC<StatusFilterTabsProps> = ({
  statusFilter,
  stats,
  onStatusFilterChange
}) => {
  return (
    <div className="w-full pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2 overflow-x-auto text-xs">
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[11px] text-gray-400 font-bold mr-1 hidden sm:inline">필터:</span>
        <button
          onClick={() => onStatusFilterChange('all')}
          className={`px-3 py-1.5 rounded-xl border font-bold transition-all ${
            statusFilter === 'all' 
              ? 'bg-slate-800 text-white border-slate-600 shadow-sm' 
              : 'bg-slate-900/60 text-gray-400 border-slate-800 hover:text-white'
          }`}
        >
          전체 ({stats.total})
        </button>
        <button
          onClick={() => onStatusFilterChange('uncalibrated')}
          className={`px-3 py-1.5 rounded-xl border font-bold flex items-center gap-1.5 transition-all ${
            statusFilter === 'uncalibrated' 
              ? 'bg-amber-950/70 text-amber-300 border-amber-500/60 shadow-sm' 
              : 'bg-slate-900/60 text-gray-400 border-slate-800 hover:text-amber-400'
          }`}
        >
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400" /> ⚠️ 미보정 ({stats.uncalibrated})
        </button>
        <button
          onClick={() => onStatusFilterChange('ai')}
          className={`px-3 py-1.5 rounded-xl border font-bold flex items-center gap-1.5 transition-all ${
            statusFilter === 'ai' 
              ? 'bg-emerald-950/70 text-emerald-300 border-emerald-500/60 shadow-sm' 
              : 'bg-slate-900/60 text-gray-400 border-slate-800 hover:text-emerald-400'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5 text-emerald-400" /> 🤖 AI 보정 ({stats.ai})
        </button>
        <button
          onClick={() => onStatusFilterChange('verified')}
          className={`px-3 py-1.5 rounded-xl border font-bold flex items-center gap-1.5 transition-all ${
            statusFilter === 'verified' 
              ? 'bg-purple-950/70 text-purple-300 border-purple-500/60 shadow-sm' 
              : 'bg-slate-900/60 text-gray-400 border-slate-800 hover:text-purple-400'
          }`}
        >
          <CheckCircle2 className="w-3.5 h-3.5 text-purple-400" /> ✅ 검증 완료 ({stats.verified})
        </button>
        <button
          onClick={() => onStatusFilterChange('segmented')}
          className={`px-3 py-1.5 rounded-xl border font-bold flex items-center gap-1.5 transition-all ${
            statusFilter === 'segmented' 
              ? 'bg-sky-950/70 text-sky-300 border-sky-500/60 shadow-sm' 
              : 'bg-slate-900/60 text-gray-400 border-slate-800 hover:text-sky-400'
          }`}
        >
          <Split className="w-3.5 h-3.5 text-sky-400" /> 분할 Split ({stats.segmented})
        </button>
        <button
          onClick={() => onStatusFilterChange('solos')}
          className={`px-3 py-1.5 rounded-xl border font-bold flex items-center gap-1.5 transition-all ${
            statusFilter === 'solos' 
              ? 'bg-pink-950/70 text-pink-300 border-pink-500/60 shadow-sm' 
              : 'bg-slate-900/60 text-gray-400 border-slate-800 hover:text-pink-400'
          }`}
        >
          솔로곡 ({stats.solos})
        </button>
      </div>
    </div>
  );
};

interface SearchFilterBarProps {
  searchQuery: string;
  memberFilter: string;
  allMembers: string[];
  scaleFactor: number;
  onSearchChange: (query: string) => void;
  onMemberFilterChange: (member: string) => void;
  onScaleChange: (scale: number) => void;
}

export const SearchFilterBar: React.FC<SearchFilterBarProps> = ({
  searchQuery,
  memberFilter,
  allMembers,
  scaleFactor,
  onSearchChange,
  onMemberFilterChange,
  onScaleChange
}) => {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/60 border border-slate-800 p-3.5 rounded-xl backdrop-blur-sm">
      <div className="relative flex-1 min-w-[180px] max-w-xs">
        <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          placeholder="영상 제목, 곡명 검색..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full bg-slate-800 text-white pl-8 pr-3 py-1.5 rounded-lg text-xs border border-slate-700 focus:outline-none focus:border-twice-magenta placeholder-gray-500"
        />
        {searchQuery && (
          <button 
            onClick={() => onSearchChange('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Member Filter Pills */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1 max-w-full">
        <button
          onClick={() => onMemberFilterChange('all')}
          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all whitespace-nowrap ${
            memberFilter === 'all'
              ? 'bg-twice-magenta text-white shadow-md'
              : 'bg-slate-800 text-gray-400 hover:text-white'
          }`}
        >
          전체 멤버
        </button>
        {allMembers.map(member => (
          <button
            key={member}
            onClick={() => onMemberFilterChange(member)}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all whitespace-nowrap ${
              memberFilter === member
                ? 'bg-twice-apricot text-slate-950 font-black shadow-md'
                : 'bg-slate-800 text-gray-400 hover:text-white'
            }`}
          >
            {member}
          </button>
        ))}
      </div>

      {/* Zoom Scale Controller */}
      <div className="flex items-center gap-2 bg-slate-800 px-3 py-1 rounded-xl border border-slate-700 text-xs text-gray-300 font-mono">
        <span className="text-[10px]">Scale:</span>
        <input 
          type="range" 
          min="5" 
          max="40" 
          value={scaleFactor} 
          onChange={(e) => onScaleChange(parseInt(e.target.value, 10))}
          className="w-16 accent-twice-magenta cursor-pointer"
        />
        <span className="w-6 text-right text-twice-apricot font-bold text-[10px]">{scaleFactor}</span>
      </div>
    </div>
  );
};
