import React from 'react';
import { useCourseStore } from '../store/courseContext';
import { formatBytes, formatDuration, formatTimeAgo } from '../utils/formatters';
import {
  FolderPlus,
  Play,
  CheckCircle2,
  Clock,
  BookOpen,
  Folder,
  Shield,
  Layers,
  HardDrive,
  BarChart3,
  Terminal,
  Sparkles,
  ArrowRight,
  Sliders,
  FolderSearch
} from 'lucide-react';

export const Dashboard: React.FC = () => {
  const {
    courses,
    crossCourseStats,
    continueWatching,
    switchCourse,
    openAddCourseModal,
    openAnalyticsModal,
    setActiveView
  } = useCourseStore();

  // First run empty state
  if (courses.length === 0) {
    return (
      <div className="max-w-4xl mx-auto py-16 px-4 sm:px-6">
        <div className="text-center bg-slate-900/60 border border-slate-800/90 rounded-3xl p-8 sm:p-14 shadow-2xl relative overflow-hidden backdrop-blur-sm">
          {/* Ambient subtle glow */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-36 bg-gradient-to-b from-indigo-500/15 via-purple-500/10 to-transparent rounded-full blur-3xl pointer-events-none" />

          {/* Developer Tool Visual Placeholder */}
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-950 to-slate-900 border border-indigo-500/40 flex items-center justify-center text-indigo-400 mx-auto mb-6 shadow-[0_0_20px_rgba(99,102,241,0.2)]">
            <Terminal className="w-8 h-8 text-indigo-400" />
          </div>

          <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Local Developer Lecture Workspace
          </h2>
          <p className="mt-3 text-sm text-slate-300 max-w-lg mx-auto leading-relaxed">
            Organize downloaded courses, inspect multi-folder hierarchies, and persist learning progress on-device.
            Zero cloud uploads, zero telemetry, and 100% offline IndexedDB storage.
          </p>

          {/* Privacy & Architecture Highlights */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 my-8 max-w-2xl mx-auto text-left">
            <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800/80 hover:border-slate-700/80 transition-colors">
              <div className="flex items-center space-x-2 text-indigo-400 font-semibold text-xs mb-1">
                <Shield className="w-4 h-4 text-indigo-400" />
                <span>Zero Cloud & Uploads</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-normal">
                Videos never leave your disk. Native handle streaming without external upload.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800/80 hover:border-slate-700/80 transition-colors">
              <div className="flex items-center space-x-2 text-emerald-400 font-semibold text-xs mb-1">
                <Layers className="w-4 h-4 text-emerald-400" />
                <span>Recursive Scanner</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-normal">
                Discovers nested folders, case-insensitive codecs, and adheres to 56/19 invariant.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800/80 hover:border-slate-700/80 transition-colors">
              <div className="flex items-center space-x-2 text-cyan-400 font-semibold text-xs mb-1">
                <HardDrive className="w-4 h-4 text-cyan-400" />
                <span>Durable Progress</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-normal">
                Per-lecture timestamps, notes, and completions safely synced to IndexedDB v2.
              </p>
            </div>
          </div>

          {/* Primary Action Button */}
          <div className="flex justify-center">
            <button
              onClick={openAddCourseModal}
              className="inline-flex items-center space-x-2.5 px-6 py-3 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-semibold text-sm rounded-xl shadow-[0_0_20px_rgba(99,102,241,0.3)] hover:shadow-[0_0_25px_rgba(99,102,241,0.45)] transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-indigo-400"
            >
              <FolderPlus className="w-4 h-4" />
              <span>+ Add Course Folder</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Overview Stats Bar */}
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">Workspace Overview</h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Local study metrics across your active lecture libraries
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={openAnalyticsModal}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-200 text-xs font-medium rounded-xl transition-all cursor-pointer"
            >
              <BarChart3 className="w-3.5 h-3.5 text-indigo-400" />
              <span>Analytics & Backup</span>
            </button>
            <button
              onClick={openAddCourseModal}
              className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl shadow-[0_0_12px_rgba(99,102,241,0.25)] transition-all cursor-pointer"
            >
              <FolderPlus className="w-3.5 h-3.5" />
              <span>+ Add Course</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
          <div className="bg-slate-900/70 border border-slate-800/80 hover:border-slate-700/80 rounded-2xl p-4 shadow-xs transition-colors">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-medium">Registered Courses</span>
              <BookOpen className="w-4 h-4 text-indigo-400" />
            </div>
            <div className="text-2xl font-extrabold text-white font-mono">{crossCourseStats.totalCourses}</div>
            <p className="text-[11px] text-slate-400 mt-1">Multi-course local library</p>
          </div>

          <div className="bg-slate-900/70 border border-slate-800/80 hover:border-slate-700/80 rounded-2xl p-4 shadow-xs transition-colors">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-medium">Tracked Lectures</span>
              <Play className="w-4 h-4 text-cyan-400" />
            </div>
            <div className="text-2xl font-extrabold text-white font-mono">{crossCourseStats.totalLectures}</div>
            <p className="text-[11px] text-slate-400 mt-1">Total registered videos</p>
          </div>

          <div className="bg-slate-900/70 border border-slate-800/80 hover:border-slate-700/80 rounded-2xl p-4 shadow-xs transition-colors">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-medium">Completed</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-2xl font-extrabold text-emerald-400 font-mono">
              {crossCourseStats.completedLectures}
            </div>
            <p className="text-[11px] text-slate-400 mt-1 font-mono">
              {crossCourseStats.overallCompletionPct}% overall completion
            </p>
          </div>

          <div className="bg-slate-900/70 border border-slate-800/80 hover:border-slate-700/80 rounded-2xl p-4 shadow-xs transition-colors">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-medium">In Progress</span>
              <Clock className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-2xl font-extrabold text-amber-400 font-mono">
              {crossCourseStats.inProgressLectures}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">Partially watched</p>
          </div>
        </div>
      </div>

      {/* Continue Watching Hero Card (Polished Gradient Fill & Metadata Tags) */}
      {continueWatching && (
        <div className="bg-gradient-to-r from-indigo-950/40 via-slate-900 to-slate-900/90 border border-indigo-500/30 rounded-3xl p-5 sm:p-6 shadow-xl relative overflow-hidden backdrop-blur-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-2 max-w-2xl">
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 shadow-[0_0_10px_rgba(99,102,241,0.2)]">
                  CONTINUE WATCHING
                </span>
                <span className="text-xs text-slate-300 font-medium">
                  {continueWatching.course.name}
                </span>
              </div>

              <h3 className="text-base sm:text-lg font-bold text-white truncate">
                {continueWatching.lecture.name}
              </h3>

              {/* Monospace Path chip */}
              <div className="inline-block px-2 py-0.5 rounded-md bg-slate-950/80 border border-slate-800 text-[11px] font-mono text-cyan-300/90 truncate max-w-full">
                📁 {continueWatching.lecture.relativePath}
              </div>

              {/* Progress bar with smooth gradient */}
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                  <span>
                    Position: <strong className="text-white">{formatDuration(continueWatching.progress.positionSec)}</strong>
                    {continueWatching.progress.durationSec ? ` / ${formatDuration(continueWatching.progress.durationSec)}` : ''}
                  </span>
                  <span>Active {formatTimeAgo(continueWatching.progress.updatedAt)}</span>
                </div>
                <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-800">
                  <div
                    className="bg-gradient-to-r from-indigo-500 via-teal-400 to-emerald-400 h-full rounded-full transition-all duration-300 shadow-[0_0_8px_rgba(52,211,153,0.3)]"
                    style={{
                      width: `${
                        continueWatching.progress.durationSec
                          ? Math.min(100, (continueWatching.progress.positionSec / continueWatching.progress.durationSec) * 100)
                          : 35
                      }%`
                    }}
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-3 shrink-0 sm:self-center">
              <button
                onClick={() => switchCourse(continueWatching.course.id, continueWatching.lecture.id)}
                className="inline-flex items-center space-x-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-semibold text-xs rounded-xl shadow-[0_0_16px_rgba(99,102,241,0.3)] hover:shadow-[0_0_20px_rgba(99,102,241,0.5)] transition-all cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Resume Stream</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Course Cards Grid */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-white uppercase tracking-wider">
            Your Courses ({courses.length})
          </h2>
          <button
            onClick={() => setActiveView('library')}
            className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 flex items-center space-x-1 transition-colors cursor-pointer"
          >
            <span>Manage Library</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {courses.map((course) => (
            <div
              key={course.id}
              onClick={() => switchCourse(course.id)}
              className="bg-slate-900/70 hover:bg-slate-900 border border-slate-800/80 hover:border-slate-700 rounded-2xl p-5 shadow-xs hover:shadow-md transition-all duration-200 cursor-pointer group flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between mb-3">
                  <div className="w-9 h-9 rounded-xl bg-slate-800/90 border border-slate-700/80 flex items-center justify-center text-slate-300 group-hover:text-indigo-400 group-hover:border-indigo-500/40 transition-colors">
                    <Folder className="w-4 h-4" />
                  </div>
                  <span
                    className={`text-[10px] px-2.5 py-0.5 rounded-full font-mono font-medium ${
                      course.connectionState === 'connected'
                        ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-500/30'
                        : course.connectionState === 'needs_permission'
                        ? 'bg-amber-950/80 text-amber-400 border border-amber-500/30'
                        : 'bg-slate-800/80 text-slate-400 border border-slate-700'
                    }`}
                  >
                    {course.connectionState === 'connected'
                      ? 'Connected'
                      : course.connectionState === 'needs_permission'
                      ? 'Needs Reconnect'
                      : 'Fallback Mode'}
                  </span>
                </div>

                <h3 className="font-bold text-sm text-white group-hover:text-indigo-300 transition-colors line-clamp-1">
                  {course.name}
                </h3>

                {/* Structured Metadata Tag Chips */}
                <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                  <span className="px-2 py-0.5 rounded-md bg-slate-950 border border-slate-800/80 text-[10px] font-mono text-slate-300">
                    📁 {course.folderName}
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-slate-950 border border-slate-800/80 text-[10px] font-mono text-slate-400">
                    Active {formatTimeAgo(course.lastActivityAt)}
                  </span>
                </div>
              </div>

              <div className="mt-5 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs">
                <span className="text-slate-400 text-[11px] font-mono">
                  ID: {course.id.slice(0, 8)}...
                </span>
                <span className="font-semibold text-xs text-indigo-400 group-hover:translate-x-1 transition-transform flex items-center space-x-1">
                  <span>Open Course</span>
                  <ArrowRight className="w-3 h-3" />
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
