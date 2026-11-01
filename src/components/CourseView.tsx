import React, { useState, useMemo } from 'react';
import { useCourseStore } from '../store/courseContext';
import { Lecture, LectureSortOption } from '../types';
import { formatBytes, formatDuration } from '../utils/formatters';
import {
  Play,
  RotateCw,
  Link,
  Search,
  CheckCircle2,
  Clock,
  AlertTriangle,
  AlertCircle,
  FileVideo,
  Layers,
  List,
  Sparkles,
  Info,
  ArrowUpDown,
  Filter,
  Bookmark,
  FolderOpen,
  X,
  FileCode,
  Folder
} from 'lucide-react';
import { DiagnosticsModal } from './DiagnosticsModal';
import { sessionFileStore } from '../scanner/fileStore';

export const CourseView: React.FC = () => {
  const {
    currentCourse,
    lectures,
    progressMap,
    courseStats,
    selectLecture,
    rescanCurrentCourse,
    reconnectCourse,
    upgradeCourseToNativeAccess,
    openNotesDrawer,
    isScanning,
    lastDiagnosticReport
  } = useCourseStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<
    'all' | 'in_progress' | 'completed' | 'not_started' | 'unsupported' | 'missing'
  >('all');
  const [formatFilter, setFormatFilter] = useState<string>('all');
  const [sortOption, setSortOption] = useState<LectureSortOption>('default');
  const [viewGrouping, setViewGrouping] = useState<'module' | 'flat'>('module');
  const [isDiagnosticOpen, setIsDiagnosticOpen] = useState(false);
  const [statusFeedback, setStatusFeedback] = useState<string | null>(null);
  const [isUpgrading, setIsUpgrading] = useState(false);
  const folderInputRef = React.useRef<HTMLInputElement | null>(null);

  if (!currentCourse) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-16 text-center text-slate-400">
        <p>No active course selected. Select a course from the Library or Dashboard.</p>
      </div>
    );
  }

  // Extract all distinct video formats present in current course
  const formatCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const lec of lectures) {
      const ext = (lec.ext || 'unknown').toLowerCase();
      counts[ext] = (counts[ext] || 0) + 1;
    }
    return counts;
  }, [lectures]);

  // Filter and sort lectures
  const filteredAndSortedLectures = useMemo(() => {
    let result = [...lectures];

    // 1. Text Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (l) => l.name.toLowerCase().includes(q) || l.relativePath.toLowerCase().includes(q)
      );
    }

    // 2. Format Filter
    if (formatFilter !== 'all') {
      result = result.filter((l) => (l.ext || '').toLowerCase() === formatFilter.toLowerCase());
    }

    // 3. Status Filter
    if (filterMode === 'in_progress') {
      result = result.filter((l) => {
        const p = progressMap.get(l.id);
        return p && !p.completed && p.positionSec > 5;
      });
    } else if (filterMode === 'completed') {
      result = result.filter((l) => {
        const p = progressMap.get(l.id);
        return p && p.completed;
      });
    } else if (filterMode === 'not_started') {
      result = result.filter((l) => {
        const p = progressMap.get(l.id);
        return !p || (!p.completed && p.positionSec <= 5);
      });
    } else if (filterMode === 'unsupported') {
      result = result.filter((l) => l.supportState === 'unsupported_format');
    } else if (filterMode === 'missing') {
      result = result.filter((l) => l.supportState === 'missing_source');
    }

    // 4. Sorting
    result.sort((a, b) => {
      switch (sortOption) {
        case 'name_asc':
          return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
        case 'name_desc':
          return b.name.localeCompare(a.name, undefined, { numeric: true, sensitivity: 'base' });
        case 'size_desc':
          return b.size - a.size;
        case 'size_asc':
          return a.size - b.size;
        case 'duration_desc':
          return (b.durationSec || 0) - (a.durationSec || 0);
        case 'duration_asc':
          return (a.durationSec || 0) - (b.durationSec || 0);
        case 'recent_active': {
          const progA = progressMap.get(a.id)?.updatedAt || 0;
          const progB = progressMap.get(b.id)?.updatedAt || 0;
          return progB - progA;
        }
        case 'default':
        default:
          return a.relativePath.localeCompare(b.relativePath, undefined, {
            numeric: true,
            sensitivity: 'base'
          });
      }
    });

    return result;
  }, [lectures, progressMap, searchQuery, formatFilter, filterMode, sortOption]);

  // Group by Module / Subfolder
  const groupedModules = useMemo(() => {
    if (viewGrouping === 'flat') return null;

    const groups: Record<string, Lecture[]> = {};
    for (const lec of filteredAndSortedLectures) {
      const parts = lec.relativePath.split('/');
      const moduleName = parts.length > 1 ? parts.slice(0, -1).join(' / ') : 'Root Directory';
      if (!groups[moduleName]) {
        groups[moduleName] = [];
      }
      groups[moduleName].push(lec);
    }

    return Object.entries(groups).sort(([a], [b]) =>
      a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
    );
  }, [filteredAndSortedLectures, viewGrouping]);

  const handleRescan = async () => {
    setStatusFeedback('Rescanning directory...');
    const stats = await rescanCurrentCourse();
    if (stats) {
      setStatusFeedback(
        `Rescan complete. Examined ${stats.filesExamined} files: ${stats.matchedExisting} matched, ${stats.newlyRegistered} registered.`
      );
    } else {
      setStatusFeedback('Rescan cancelled or no changes.');
    }
    setTimeout(() => setStatusFeedback(null), 5000);
  };

  const handleReconnect = async () => {
    const success = await reconnectCourse(currentCourse.id);
    if (success) {
      setStatusFeedback('Folder reconnected with read permissions.');
    } else {
      setStatusFeedback('Permission denied or handle unavailable.');
    }
    setTimeout(() => setStatusFeedback(null), 5000);
  };

  const handleUpgradeToNative = async () => {
    setIsUpgrading(true);
    setStatusFeedback(null);
    try {
      const success = await upgradeCourseToNativeAccess(currentCourse.id);
      if (success) {
        setStatusFeedback('Native folder access connected! Direct inline streaming enabled.');
      } else {
        setStatusFeedback('Selection cancelled.');
      }
    } catch (err: any) {
      setStatusFeedback('Failed to switch to native access: ' + err.message);
    } finally {
      setIsUpgrading(false);
      setTimeout(() => setStatusFeedback(null), 5000);
    }
  };

  const handleLinkFolderFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !currentCourse) return;
    sessionFileStore.registerFiles(currentCourse.id, files);
    setStatusFeedback(`Successfully linked ${files.length} video files in session! You can now watch lectures instantly.`);
    setTimeout(() => setStatusFeedback(null), 5000);
  };

  const hasNativeAccess = currentCourse.connectionState === 'connected' && !!currentCourse.rootHandle;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <input
        ref={folderInputRef}
        type="file"
        // @ts-ignore
        webkitdirectory="true"
        directory="true"
        multiple
        className="hidden"
        onChange={handleLinkFolderFiles}
      />

      {/* Course Header Banner */}
      <div className="bg-slate-900/80 border border-slate-800/80 rounded-3xl p-6 shadow-sm backdrop-blur-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
                {currentCourse.name}
              </h1>
              <span
                className={`text-[10px] px-2.5 py-0.5 rounded-full font-mono font-medium ${
                  currentCourse.connectionState === 'connected'
                    ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-500/30 shadow-[0_0_8px_rgba(16,185,129,0.2)]'
                    : currentCourse.connectionState === 'needs_permission'
                    ? 'bg-amber-950/80 text-amber-400 border border-amber-500/30'
                    : 'bg-slate-800/80 text-slate-400 border border-slate-700'
                }`}
              >
                {currentCourse.connectionState === 'connected'
                  ? 'NATIVE STREAMING'
                  : currentCourse.connectionState === 'needs_permission'
                  ? 'PERMISSION REQUIRED'
                  : 'FALLBACK MODE'}
              </span>
            </div>

            {/* Structured Path chip */}
            <div className="mt-2 flex items-center space-x-2">
              <span className="px-2 py-0.5 rounded-md bg-slate-950 border border-slate-800 text-[11px] font-mono text-cyan-300">
                📁 {currentCourse.folderName}
              </span>
              <span className="text-[11px] font-mono text-slate-400">
                {courseStats.totalLectures} lectures registered
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => folderInputRef.current?.click()}
              className="px-3.5 py-1.5 bg-slate-850 hover:bg-slate-800 text-slate-200 border border-slate-700/80 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition-colors cursor-pointer"
              title="Link or reload local video folder for this session"
            >
              <FolderOpen className="w-3.5 h-3.5 text-indigo-400" />
              <span>Link Folder Files</span>
            </button>

            {!hasNativeAccess && (
              <button
                onClick={handleUpgradeToNative}
                disabled={isUpgrading}
                className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition-colors cursor-pointer shadow-[0_0_12px_rgba(99,102,241,0.25)]"
                title="Authenticate directory with showDirectoryPicker() for inline playback"
              >
                <FolderOpen className="w-3.5 h-3.5" />
                <span>{isUpgrading ? 'Selecting...' : 'Switch to Native Access'}</span>
              </button>
            )}

            {currentCourse.rootHandle && (
              <button
                onClick={handleRescan}
                disabled={isScanning}
                className="px-3 py-1.5 bg-slate-800/90 hover:bg-slate-750 disabled:opacity-50 text-slate-200 rounded-xl text-xs font-medium flex items-center space-x-1.5 border border-slate-700 transition-colors cursor-pointer"
              >
                <RotateCw className={`w-3.5 h-3.5 text-slate-400 ${isScanning ? 'animate-spin' : ''}`} />
                <span>{isScanning ? 'Scanning...' : 'Rescan'}</span>
              </button>
            )}

            {currentCourse.connectionState !== 'connected' && currentCourse.rootHandle && (
              <button
                onClick={handleReconnect}
                className="px-3 py-1.5 bg-amber-950/80 hover:bg-amber-900 border border-amber-800/80 text-amber-300 rounded-xl text-xs font-medium flex items-center space-x-1.5 transition-colors cursor-pointer"
              >
                <Link className="w-3.5 h-3.5" />
                <span>Reconnect</span>
              </button>
            )}

            {lastDiagnosticReport && lastDiagnosticReport.length > 0 && (
              <button
                onClick={() => setIsDiagnosticOpen(true)}
                className="px-3 py-1.5 bg-slate-800/80 hover:bg-slate-700 text-indigo-300 rounded-xl text-xs font-medium flex items-center space-x-1.5 border border-indigo-900/40 transition-colors cursor-pointer"
              >
                <Info className="w-3.5 h-3.5 text-indigo-400" />
                <span>Diagnostics ({lastDiagnosticReport.length})</span>
              </button>
            )}
          </div>
        </div>

        {statusFeedback && (
          <div className="mt-3 p-2.5 bg-indigo-950/70 border border-indigo-800/70 rounded-xl text-xs text-indigo-300 flex items-center justify-between">
            <span>{statusFeedback}</span>
            <button onClick={() => setStatusFeedback(null)}>
              <X className="w-3.5 h-3.5 text-indigo-400" />
            </button>
          </div>
        )}

        {/* Metric Chips Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 pt-5">
          <div className="bg-slate-950/60 p-3 rounded-2xl border border-slate-800/70">
            <span className="text-[10px] uppercase font-mono text-slate-400 block tracking-wider">Total Lectures</span>
            <span className="text-xl font-bold font-mono text-white">{courseStats.totalLectures}</span>
          </div>
          <div className="bg-slate-950/60 p-3 rounded-2xl border border-slate-800/70">
            <span className="text-[10px] uppercase font-mono text-slate-400 block tracking-wider">Completion</span>
            <div className="flex items-center space-x-2">
              <span className="text-xl font-bold font-mono text-emerald-400">
                {courseStats.completionPercentage}%
              </span>
              <span className="text-[11px] font-mono text-slate-400">
                ({courseStats.completedLectures} done)
              </span>
            </div>
          </div>
          <div className="bg-slate-950/60 p-3 rounded-2xl border border-slate-800/70">
            <span className="text-[10px] uppercase font-mono text-slate-400 block tracking-wider">In Progress</span>
            <span className="text-xl font-bold font-mono text-amber-400">{courseStats.inProgressLectures}</span>
          </div>
          <div className="bg-slate-950/60 p-3 rounded-2xl border border-slate-800/70">
            <span className="text-[10px] uppercase font-mono text-slate-400 block tracking-wider">Remaining Est.</span>
            <span className="text-sm font-semibold font-mono text-slate-200">
              {courseStats.hasUnknownDuration
                ? formatDuration(courseStats.remainingDurationSec || undefined)
                : formatDuration(courseStats.remainingDurationSec)}
            </span>
          </div>
        </div>

        {/* Polished Course Progress Bar with Gradient */}
        <div className="mt-4 pt-1">
          <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-800">
            <div
              className="bg-gradient-to-r from-indigo-500 via-teal-400 to-emerald-400 h-full rounded-full transition-all duration-300 shadow-[0_0_8px_rgba(52,211,153,0.3)]"
              style={{ width: `${courseStats.completionPercentage}%` }}
            />
          </div>
        </div>
      </div>

      {/* Feature 2: Advanced Search, Filter & Sort Toolbar */}
      <div className="bg-slate-900/80 border border-slate-800/80 p-4 rounded-3xl space-y-3.5 shadow-sm backdrop-blur-xs">
        {/* Row 1: Search + Sort + Grouping */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-lg">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search lectures, topics, or subfolders..."
              className="w-full pl-9 pr-8 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-white text-xs p-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center space-x-2 shrink-0">
            {/* Sort Selector */}
            <div className="flex items-center space-x-1.5 bg-slate-950 border border-slate-800 px-2.5 py-1.5 rounded-xl text-xs text-slate-300">
              <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={sortOption}
                onChange={(e) => setSortOption(e.target.value as LectureSortOption)}
                className="bg-transparent text-slate-200 text-xs focus:outline-none cursor-pointer"
              >
                <option value="default" className="bg-slate-900">Sort: Default Order</option>
                <option value="name_asc" className="bg-slate-900">Name (A-Z)</option>
                <option value="name_desc" className="bg-slate-900">Name (Z-A)</option>
                <option value="size_desc" className="bg-slate-900">Size (Largest first)</option>
                <option value="size_asc" className="bg-slate-900">Size (Smallest first)</option>
                <option value="duration_desc" className="bg-slate-900">Duration (Longest first)</option>
                <option value="duration_asc" className="bg-slate-900">Duration (Shortest first)</option>
                <option value="recent_active" className="bg-slate-900">Recently Watched</option>
              </select>
            </div>

            {/* Grouping Toggle */}
            <div className="flex items-center space-x-1 bg-slate-950 border border-slate-800 p-1 rounded-xl">
              <button
                onClick={() => setViewGrouping('module')}
                className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                  viewGrouping === 'module'
                    ? 'bg-slate-800 text-white shadow-xs'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Group by subfolder / module"
              >
                <Layers className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setViewGrouping('flat')}
                className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                  viewGrouping === 'flat'
                    ? 'bg-slate-800 text-white shadow-xs'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Flat listing"
              >
                <List className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Row 2: Status & Format Filter Pills */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-2 border-t border-slate-800/80 text-xs">
          {/* Status Filters */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => setFilterMode('all')}
              className={`px-2.5 py-1 rounded-lg font-medium transition-colors cursor-pointer ${
                filterMode === 'all'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-950 text-slate-300 hover:bg-slate-850'
              }`}
            >
              All ({lectures.length})
            </button>
            <button
              onClick={() => setFilterMode('in_progress')}
              className={`px-2.5 py-1 rounded-lg font-medium transition-colors cursor-pointer ${
                filterMode === 'in_progress'
                  ? 'bg-amber-600 text-white'
                  : 'bg-slate-950 text-slate-300 hover:bg-slate-850'
              }`}
            >
              In Progress ({courseStats.inProgressLectures})
            </button>
            <button
              onClick={() => setFilterMode('completed')}
              className={`px-2.5 py-1 rounded-lg font-medium transition-colors cursor-pointer ${
                filterMode === 'completed'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-950 text-slate-300 hover:bg-slate-850'
              }`}
            >
              Completed ({courseStats.completedLectures})
            </button>
            <button
              onClick={() => setFilterMode('not_started')}
              className={`px-2.5 py-1 rounded-lg font-medium transition-colors cursor-pointer ${
                filterMode === 'not_started'
                  ? 'bg-slate-800 text-white'
                  : 'bg-slate-950 text-slate-400 hover:bg-slate-850'
              }`}
            >
              Not Started ({courseStats.notStartedLectures})
            </button>
            {courseStats.unsupportedLectures > 0 && (
              <button
                onClick={() => setFilterMode('unsupported')}
                className={`px-2.5 py-1 rounded-lg font-medium transition-colors cursor-pointer ${
                  filterMode === 'unsupported'
                    ? 'bg-rose-700 text-white'
                    : 'bg-slate-950 text-amber-300 hover:bg-slate-850'
                }`}
              >
                Unsupported ({courseStats.unsupportedLectures})
              </button>
            )}
            {courseStats.missingLectures > 0 && (
              <button
                onClick={() => setFilterMode('missing')}
                className={`px-2.5 py-1 rounded-lg font-medium transition-colors cursor-pointer ${
                  filterMode === 'missing'
                    ? 'bg-orange-700 text-white'
                    : 'bg-slate-950 text-orange-300 hover:bg-slate-850'
                }`}
              >
                Missing ({courseStats.missingLectures})
              </button>
            )}
          </div>

          {/* Format Codec Pills */}
          <div className="flex flex-wrap items-center gap-1 border-t sm:border-t-0 sm:border-l border-slate-800 pt-2 sm:pt-0 sm:pl-3">
            <span className="text-slate-400 text-[11px] mr-1 font-mono">Format:</span>
            <button
              onClick={() => setFormatFilter('all')}
              className={`px-2 py-0.5 rounded text-[11px] font-mono uppercase transition-colors cursor-pointer ${
                formatFilter === 'all'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-950 text-slate-400 hover:text-slate-200'
              }`}
            >
              All
            </button>
            {Object.entries(formatCounts).map(([fmt, cnt]) => (
              <button
                key={fmt}
                onClick={() => setFormatFilter(fmt)}
                className={`px-2 py-0.5 rounded text-[11px] font-mono uppercase transition-colors cursor-pointer ${
                  formatFilter === fmt
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-950 text-slate-300 hover:text-white'
                }`}
              >
                {fmt} ({cnt})
              </button>
            ))}
          </div>
        </div>

        {/* Result Counter readout */}
        <div className="text-[11px] text-slate-400 flex items-center justify-between pt-1 font-mono">
          <span>
            Showing <strong className="text-white">{filteredAndSortedLectures.length}</strong> of{' '}
            <strong className="text-white">{lectures.length}</strong> lectures
          </span>
          {(searchQuery || formatFilter !== 'all' || filterMode !== 'all' || sortOption !== 'default') && (
            <button
              onClick={() => {
                setSearchQuery('');
                setFormatFilter('all');
                setFilterMode('all');
                setSortOption('default');
              }}
              className="text-indigo-400 hover:text-indigo-300 underline cursor-pointer"
            >
              Reset filters
            </button>
          )}
        </div>
      </div>

      {/* Lectures Listing (The 56/19 Invariant: All candidates listed, none silently dropped) */}
      <div className="space-y-4">
        {filteredAndSortedLectures.length === 0 ? (
          <div className="text-center py-16 bg-slate-900/60 border border-slate-800/80 rounded-3xl p-6 text-slate-400">
            <FileVideo className="w-10 h-10 text-slate-600 mx-auto mb-2" />
            <p className="font-semibold text-slate-200">No matching lectures found</p>
            <p className="text-xs text-slate-500 mt-1">Try adjusting your search query, sort, or format filters.</p>
          </div>
        ) : groupedModules ? (
          // Grouped by Module
          groupedModules.map(([moduleName, moduleLectures]) => (
            <div key={moduleName} className="bg-slate-900/70 border border-slate-800/80 rounded-3xl overflow-hidden shadow-xs">
              <div className="px-5 py-3.5 bg-slate-950/80 border-b border-slate-800/80 flex items-center justify-between text-xs">
                <div className="flex items-center space-x-2 font-semibold text-slate-200">
                  <Folder className="w-3.5 h-3.5 text-indigo-400" />
                  <span className="font-mono text-xs">{moduleName}</span>
                </div>
                <span className="text-slate-400 font-mono text-[11px]">
                  {moduleLectures.length} lecture{moduleLectures.length === 1 ? '' : 's'}
                </span>
              </div>

              <div className="divide-y divide-slate-800/60">
                {moduleLectures.map((lec) => renderLectureRow(lec))}
              </div>
            </div>
          ))
        ) : (
          // Flat list
          <div className="bg-slate-900/70 border border-slate-800/80 rounded-3xl overflow-hidden shadow-xs divide-y divide-slate-800/60">
            {filteredAndSortedLectures.map((lec) => renderLectureRow(lec))}
          </div>
        )}
      </div>

      {/* Diagnostics Modal */}
      {lastDiagnosticReport && (
        <DiagnosticsModal
          isOpen={isDiagnosticOpen}
          onClose={() => setIsDiagnosticOpen(false)}
          title={`Diagnostics for ${currentCourse.name}`}
          diagnostics={lastDiagnosticReport}
        />
      )}
    </div>
  );

  function renderLectureRow(lec: Lecture) {
    const prog = progressMap.get(lec.id);
    const isDone = prog?.completed || false;
    const isProgress = !isDone && (prog?.positionSec || 0) > 5;
    const isUnsupported = lec.supportState === 'unsupported_format';
    const isMissing = lec.supportState === 'missing_source';

    return (
      <div
        key={lec.id}
        className="px-5 py-3.5 hover:bg-slate-850/40 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 group"
      >
        <div
          onClick={() => selectLecture(lec)}
          className="flex items-start space-x-3 min-w-0 flex-1 cursor-pointer"
        >
          {/* Status Icon */}
          <div className="mt-1 shrink-0">
            {isDone ? (
              <div className="w-6 h-6 rounded-full bg-emerald-950/80 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.2)]">
                <CheckCircle2 className="w-3.5 h-3.5" />
              </div>
            ) : isProgress ? (
              <div className="w-6 h-6 rounded-full bg-amber-950/80 border border-amber-500/40 flex items-center justify-center text-amber-400">
                <Clock className="w-3.5 h-3.5" />
              </div>
            ) : (
              <div className="w-6 h-6 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-400 group-hover:text-indigo-400 group-hover:border-indigo-500/50 transition-colors">
                <Play className="w-3 h-3 fill-current ml-0.5" />
              </div>
            )}
          </div>

          {/* Details */}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5 mb-1">
              <span className="font-semibold text-xs sm:text-sm text-slate-100 group-hover:text-indigo-300 transition-colors truncate">
                {lec.name}
              </span>

              {/* Status Badges */}
              <span className="text-[10px] px-1.5 py-0.2 rounded font-mono uppercase bg-slate-950 text-slate-300 border border-slate-800">
                {lec.ext}
              </span>

              {isUnsupported && (
                <span className="text-[10px] px-2 py-0.5 rounded font-medium bg-amber-950/80 text-amber-400 border border-amber-800/60 flex items-center space-x-1">
                  <AlertTriangle className="w-3 h-3 mr-0.5" />
                  Unsupported Codec
                </span>
              )}

              {isMissing && (
                <span className="text-[10px] px-2 py-0.5 rounded font-medium bg-orange-950/80 text-orange-400 border border-orange-800/60 flex items-center space-x-1">
                  <AlertCircle className="w-3 h-3 mr-0.5" />
                  Missing Source
                </span>
              )}
            </div>

            <div className="text-[11px] text-slate-400 font-mono truncate">
              {lec.relativePath}
            </div>

            {/* Progress sub-bar if in progress */}
            {isProgress && prog?.durationSec && (
              <div className="mt-2 w-48 bg-slate-950 h-1.5 rounded-full overflow-hidden border border-slate-800">
                <div
                  className="bg-gradient-to-r from-indigo-500 to-emerald-400 h-full rounded-full"
                  style={{
                    width: `${Math.min(100, (prog.positionSec / prog.durationSec) * 100)}%`
                  }}
                />
              </div>
            )}
          </div>
        </div>

        {/* Metadata & Actions Column */}
        <div className="flex items-center space-x-3 shrink-0 text-xs text-slate-400 pl-9 sm:pl-0 font-mono">
          <span>{formatBytes(lec.size)}</span>
          {prog && prog.positionSec > 0 ? (
            <span className="text-cyan-300">
              {formatDuration(prog.positionSec)}
              {prog.durationSec ? ` / ${formatDuration(prog.durationSec)}` : ''}
            </span>
          ) : (
            <span>{formatDuration(lec.durationSec)}</span>
          )}

          {/* Feature 3: Timestamped Bookmarks & Notes Button */}
          <button
            onClick={() => openNotesDrawer(lec)}
            className="p-1.5 bg-slate-950 hover:bg-slate-800 text-slate-300 hover:text-indigo-300 rounded-lg border border-slate-800 hover:border-slate-700 transition-colors cursor-pointer"
            title="Open Notes & Timestamped Bookmarks"
          >
            <Bookmark className="w-3.5 h-3.5" />
          </button>

          {/* Watch Button */}
          <button
            onClick={() => selectLecture(lec)}
            className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold flex items-center space-x-1 transition-colors cursor-pointer shadow-xs shadow-indigo-950"
          >
            <Play className="w-3 h-3 fill-current" />
            <span>Watch</span>
          </button>
        </div>
      </div>
    );
  }
};
