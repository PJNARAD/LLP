import React from 'react';
import { useCourseStore } from '../store/courseContext';
import {
  LayoutDashboard,
  Library,
  PlaySquare,
  FolderPlus,
  ShieldCheck,
  ChevronDown,
  BarChart3,
  Terminal,
  Folder
} from 'lucide-react';

export const Navbar: React.FC = () => {
  const {
    courses,
    currentCourse,
    activeView,
    setActiveView,
    openAddCourseModal,
    openAnalyticsModal,
    switchCourse
  } = useCourseStore();

  return (
    <header className="sticky top-0 z-30 bg-slate-950/85 backdrop-blur-md border-b border-slate-800/80 text-slate-100 shadow-sm transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand / Workspace Title */}
        <div className="flex items-center space-x-6">
          <div
            onClick={() => setActiveView('dashboard')}
            className="flex items-center space-x-3 cursor-pointer group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-xl p-1"
          >
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500/20 to-violet-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400 group-hover:border-indigo-400 group-hover:shadow-[0_0_14px_rgba(99,102,241,0.3)] transition-all">
              <PlaySquare className="w-4 h-4 text-indigo-400" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-bold text-sm tracking-tight text-white group-hover:text-indigo-300 transition-colors">
                  LectureTracker
                </span>
                <span className="hidden sm:inline-flex items-center space-x-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-emerald-950/80 text-emerald-400 border border-emerald-500/30 shadow-[0_0_10px_rgba(16,185,129,0.15)]">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span>LOCAL IDB</span>
                </span>
              </div>
              <p className="text-[10px] text-slate-400 font-mono tracking-tight">Zero Cloud • On-Device</p>
            </div>
          </div>

          {/* Navigation Links (IDE Tab Style) */}
          <nav className="hidden md:flex items-center space-x-1 pl-4 border-l border-slate-800/80">
            <button
              onClick={() => setActiveView('dashboard')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center space-x-2 focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                activeView === 'dashboard'
                  ? 'bg-slate-800/90 text-white border border-slate-700/80 shadow-xs'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <LayoutDashboard className="w-3.5 h-3.5" />
              <span>Dashboard</span>
            </button>

            <button
              onClick={() => setActiveView('library')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center space-x-2 focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                activeView === 'library'
                  ? 'bg-slate-800/90 text-white border border-slate-700/80 shadow-xs'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <Library className="w-3.5 h-3.5" />
              <span>Library</span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-md bg-slate-800 text-slate-300 border border-slate-700">
                {courses.length}
              </span>
            </button>

            {currentCourse && (
              <button
                onClick={() => setActiveView('course')}
                className={`max-w-[220px] truncate px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center space-x-2 focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                  activeView === 'course' || activeView === 'player'
                    ? 'bg-indigo-950/70 text-indigo-300 border border-indigo-700/60 shadow-[0_0_12px_rgba(99,102,241,0.15)]'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
                title={currentCourse.name}
              >
                <Folder className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                <span className="truncate">{currentCourse.name}</span>
              </button>
            )}
          </nav>
        </div>

        {/* Right Actions: Analytics Modal + Course Switcher + Persistent "+ Add Course" */}
        <div className="flex items-center space-x-2.5">
          {/* Feature 4: Analytics & Export Button */}
          <button
            onClick={openAnalyticsModal}
            className="px-3 py-1.5 bg-slate-900/90 hover:bg-slate-800 text-slate-300 hover:text-white rounded-lg text-xs font-medium flex items-center space-x-1.5 border border-slate-800 hover:border-slate-700 transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-indigo-500"
            title="Open Learning Analytics & Data Backup"
          >
            <BarChart3 className="w-3.5 h-3.5 text-indigo-400" />
            <span className="hidden sm:inline">Analytics & Backup</span>
          </button>

          {courses.length > 1 && (
            <div className="relative hidden lg:block">
              <select
                value={currentCourse ? currentCourse.id : ''}
                onChange={(e) => {
                  if (e.target.value) {
                    switchCourse(e.target.value);
                  }
                }}
                className="appearance-none bg-slate-900 text-slate-200 text-xs font-medium pl-3 pr-8 py-1.5 rounded-lg border border-slate-800 hover:border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
              >
                <option value="" disabled>
                  Switch Course...
                </option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-3 h-3 text-slate-400 absolute right-2.5 top-2.5 pointer-events-none" />
            </div>
          )}

          {/* Persistent + Add Course Button */}
          <button
            onClick={openAddCourseModal}
            className="inline-flex items-center space-x-1.5 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-medium text-xs px-3.5 py-1.5 rounded-lg shadow-[0_0_14px_rgba(99,102,241,0.25)] hover:shadow-[0_0_18px_rgba(99,102,241,0.4)] transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 cursor-pointer"
          >
            <FolderPlus className="w-3.5 h-3.5" />
            <span>+ Add Course</span>
          </button>
        </div>
      </div>
    </header>
  );
};
