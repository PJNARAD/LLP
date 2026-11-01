import React, { useState, useRef, useMemo } from 'react';
import { useCourseStore } from '../store/courseContext';
import { AppBackupPayload, StudyDayActivity } from '../types';
import { formatBytes, formatDuration, formatTimeAgo } from '../utils/formatters';
import { db } from '../db/indexedDB';
import {
  X,
  BarChart3,
  Download,
  Upload,
  CheckCircle2,
  Clock,
  HardDrive,
  Calendar,
  AlertTriangle,
  FileVideo,
  FileJson,
  Sparkles,
  TrendingUp,
  Flame,
  Target,
  Calculator,
  CalendarCheck,
  FileText,
  Check,
  Zap,
  Info
} from 'lucide-react';

export const AnalyticsModal: React.FC = () => {
  const {
    isAnalyticsModalOpen,
    closeAnalyticsModal,
    overallAnalytics,
    currentCourse,
    courseStats,
    exportDatabaseBackup,
    importDatabaseBackup
  } = useCourseStore();

  const [activeTab, setActiveTab] = useState<'habits' | 'estimator' | 'backup'>('habits');
  const [importPreview, setImportPreview] = useState<AppBackupPayload | null>(null);
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge');
  const [importFeedback, setImportFeedback] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [hoveredDay, setHoveredDay] = useState<StudyDayActivity | null>(null);

  // Estimator State
  const [estimatorScope, setEstimatorScope] = useState<'current' | 'all'>(currentCourse ? 'current' : 'all');
  const [dailyGoalMinutes, setDailyGoalMinutes] = useState<number>(45);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.25);

  // Markdown export feedback
  const [exportNotesFeedback, setExportNotesFeedback] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!isAnalyticsModalOpen) return null;

  const streakInfo = overallAnalytics.streakInfo || {
    currentStreakDays: 0,
    longestStreakDays: 0,
    totalActiveDays: 0,
    lastActiveDateStr: null,
    peakDayOfWeek: 'Flexible',
    peakHourRange: 'Anytime'
  };

  const activityHistory = overallAnalytics.activityHistory || [];

  // Group activity into 13 weeks of 7 days
  const weeksGrid = useMemo(() => {
    const weeks: StudyDayActivity[][] = [];
    for (let i = 0; i < activityHistory.length; i += 7) {
      weeks.push(activityHistory.slice(i, i + 7));
    }
    return weeks;
  }, [activityHistory]);

  // Estimator Calculations
  const targetRemainingSec = useMemo(() => {
    if (estimatorScope === 'current' && currentCourse) {
      return courseStats.remainingDurationSec || 0;
    }
    return overallAnalytics.totalRemainingSec || 0;
  }, [estimatorScope, currentCourse, courseStats, overallAnalytics]);

  const targetLecturesRemaining = useMemo(() => {
    if (estimatorScope === 'current' && currentCourse) {
      return Math.max(0, courseStats.totalLectures - courseStats.completedLectures);
    }
    return Math.max(0, overallAnalytics.totalLectures - overallAnalytics.completedLectures);
  }, [estimatorScope, currentCourse, courseStats, overallAnalytics]);

  const adjustedRemainingSec = targetRemainingSec / playbackSpeed;
  const dailyGoalSec = Math.max(300, dailyGoalMinutes * 60);
  const daysNeeded = adjustedRemainingSec > 0 ? Math.ceil(adjustedRemainingSec / dailyGoalSec) : 0;

  // Projected completion date
  const projectedFinishDate = useMemo(() => {
    if (daysNeeded === 0) return 'Already Finished!';
    const d = new Date();
    d.setDate(d.getDate() + daysNeeded);
    return d.toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }, [daysNeeded]);

  // Daily lecture pace
  const lecturesPerDay = daysNeeded > 0 ? (targetLecturesRemaining / daysNeeded).toFixed(1) : '0';

  // Milestone projections
  const milestones = useMemo(() => {
    if (daysNeeded === 0) return [];
    const now = Date.now();
    const result = [];
    const checkpoints = [
      { pct: 25, label: '25% Milestone' },
      { pct: 50, label: '50% Halfway Checkpoint' },
      { pct: 75, label: '75% Final Stretch' },
      { pct: 100, label: '100% Course Completion' }
    ];

    for (const cp of checkpoints) {
      const stepDays = Math.ceil(daysNeeded * (cp.pct / 100));
      const targetDate = new Date(now + stepDays * 86400 * 1000);
      result.push({
        label: cp.label,
        pct: cp.pct,
        days: stepDays,
        dateStr: targetDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
      });
    }
    return result;
  }, [daysNeeded]);

  const handleExport = async () => {
    try {
      const backup = await exportDatabaseBackup();
      const jsonStr = JSON.stringify(backup, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const dateStr = new Date().toISOString().split('T')[0];
      a.href = url;
      a.download = `lecture-tracker-backup-${dateStr}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error('Export error:', err);
    }
  };

  const handleExportAllNotesMarkdown = async () => {
    try {
      const allNotes = await db.getAllNotes();
      const allLectures = await db.getAllLectures();
      const allCourses = await db.getCourses(true);

      const courseMap = new Map(allCourses.map((c) => [c.id, c.name]));
      const lectureMap = new Map(allLectures.map((l) => [l.id, l]));

      if (allNotes.length === 0) {
        setExportNotesFeedback('No notes found in local database to export.');
        setTimeout(() => setExportNotesFeedback(null), 4000);
        return;
      }

      const lines: string[] = [
        '# Local Lecture Progress Tracker — Notes & Bookmarks Export',
        `*Exported on ${new Date().toLocaleString()}*`,
        '',
        `Total notes: ${allNotes.length}`,
        '---',
        ''
      ];

      // Group notes by course
      const byCourse: Record<string, typeof allNotes> = {};
      for (const n of allNotes) {
        if (!byCourse[n.courseId]) byCourse[n.courseId] = [];
        byCourse[n.courseId].push(n);
      }

      for (const [courseId, notes] of Object.entries(byCourse)) {
        const cName = courseMap.get(courseId) || 'Unknown Course';
        lines.push(`## 📁 Course: ${cName}`, '');

        // Group notes by lecture
        const byLecture: Record<string, typeof notes> = {};
        for (const n of notes) {
          if (!byLecture[n.lectureId]) byLecture[n.lectureId] = [];
          byLecture[n.lectureId].push(n);
        }

        for (const [lectureId, lecsNotes] of Object.entries(byLecture)) {
          const lec = lectureMap.get(lectureId);
          lines.push(`### 🎥 ${lec ? lec.name : 'Lecture ' + lectureId}`);
          if (lec) lines.push(`*Path: \`${lec.relativePath}\`*`);
          lines.push('');

          lecsNotes.sort((a, b) => a.timestampSec - b.timestampSec);
          for (const n of lecsNotes) {
            lines.push(`- **[${formatDuration(n.timestampSec)}]**: ${n.content}`);
          }
          lines.push('');
        }
        lines.push('---', '');
      }

      const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const dateStr = new Date().toISOString().split('T')[0];
      a.href = url;
      a.download = `lecture-notes-export-${dateStr}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setExportNotesFeedback(`Successfully exported ${allNotes.length} notes to Markdown!`);
      setTimeout(() => setExportNotesFeedback(null), 4000);
    } catch (err: any) {
      setExportNotesFeedback('Failed to export notes: ' + err.message);
      setTimeout(() => setExportNotesFeedback(null), 4000);
    }
  };

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportError(null);
    setImportFeedback(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (!parsed.app || !Array.isArray(parsed.courses) || !Array.isArray(parsed.lectures)) {
          throw new Error('Unrecognized backup format. Please select a valid JSON backup file.');
        }
        setImportPreview(parsed as AppBackupPayload);
      } catch (err: any) {
        setImportError(err.message || 'Failed to parse JSON file.');
        setImportPreview(null);
      }
    };
    reader.readAsText(file);
  };

  const handleRunImport = async () => {
    if (!importPreview) return;
    setIsProcessing(true);
    setImportError(null);
    setImportFeedback(null);

    try {
      const res = await importDatabaseBackup(importPreview, importMode);
      setImportFeedback(
        `Import successful! Restored ${res.importedCourses} courses, ${res.importedLectures} lectures, ${res.importedProgress} progress records, and ${res.importedNotes} notes.`
      );
      setImportPreview(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err: any) {
      setImportError(err.message || 'Import failed.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150">
      <div className="bg-slate-900 border border-slate-800/90 rounded-3xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl text-slate-100 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800/80 bg-slate-900/95 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <BarChart3 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight">
                Study Habits, Estimator & Data Hub
              </h3>
              <p className="text-[11px] text-slate-400 font-mono">
                100% On-Device IndexedDB analytics • Zero Cloud
              </p>
            </div>
          </div>
          <button
            onClick={closeAnalyticsModal}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Toggle (IDE Segmented Control) */}
        <div className="px-6 pt-3 border-b border-slate-800/80 flex items-center space-x-6 bg-slate-950/60 overflow-x-auto">
          <button
            onClick={() => setActiveTab('habits')}
            className={`pb-3 text-xs font-semibold flex items-center space-x-2 border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'habits'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Flame className="w-4 h-4 text-amber-400" />
            <span>Habits & Activity Heatmap</span>
          </button>

          <button
            onClick={() => setActiveTab('estimator')}
            className={`pb-3 text-xs font-semibold flex items-center space-x-2 border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'estimator'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Target className="w-4 h-4 text-cyan-400" />
            <span>Target Completion Estimator</span>
          </button>

          <button
            onClick={() => setActiveTab('backup')}
            className={`pb-3 text-xs font-semibold flex items-center space-x-2 border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'backup'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileJson className="w-4 h-4 text-indigo-400" />
            <span>Backup, Restore & Notes</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {activeTab === 'habits' && (
            <div className="space-y-6">
              {/* Streak and Study Habit KPIs */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {/* Current Streak */}
                <div className="p-4 bg-slate-950/80 border border-slate-800/90 rounded-2xl shadow-xs relative overflow-hidden">
                  <div className="flex items-center space-x-1.5 text-amber-400 text-xs font-medium mb-1">
                    <Flame className="w-4 h-4 fill-amber-500/20" />
                    <span>Current Streak</span>
                  </div>
                  <div className="flex items-baseline space-x-1">
                    <span className="text-2xl sm:text-3xl font-extrabold text-amber-400 font-mono tracking-tight">
                      {streakInfo.currentStreakDays}
                    </span>
                    <span className="text-xs text-slate-400 font-mono">
                      {streakInfo.currentStreakDays === 1 ? 'day' : 'days'}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1 font-mono">
                    {streakInfo.currentStreakDays > 0 ? 'Consistency unlocked!' : 'Watch a lecture today'}
                  </p>
                </div>

                {/* Longest Streak */}
                <div className="p-4 bg-slate-950/80 border border-slate-800/90 rounded-2xl shadow-xs">
                  <div className="flex items-center space-x-1.5 text-indigo-400 text-xs font-medium mb-1">
                    <Zap className="w-4 h-4" />
                    <span>Longest Streak</span>
                  </div>
                  <div className="flex items-baseline space-x-1">
                    <span className="text-2xl sm:text-3xl font-extrabold text-white font-mono tracking-tight">
                      {streakInfo.longestStreakDays}
                    </span>
                    <span className="text-xs text-slate-400 font-mono">days</span>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1 font-mono">Personal record</p>
                </div>

                {/* Total Active Days */}
                <div className="p-4 bg-slate-950/80 border border-slate-800/90 rounded-2xl shadow-xs">
                  <div className="flex items-center space-x-1.5 text-emerald-400 text-xs font-medium mb-1">
                    <CalendarCheck className="w-4 h-4" />
                    <span>Active Study Days</span>
                  </div>
                  <div className="flex items-baseline space-x-1">
                    <span className="text-2xl sm:text-3xl font-extrabold text-emerald-400 font-mono tracking-tight">
                      {streakInfo.totalActiveDays}
                    </span>
                    <span className="text-xs text-slate-400 font-mono">days</span>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1 font-mono">Distinct days recorded</p>
                </div>

                {/* Peak Study Time */}
                <div className="p-4 bg-slate-950/80 border border-slate-800/90 rounded-2xl shadow-xs">
                  <div className="flex items-center space-x-1.5 text-cyan-400 text-xs font-medium mb-1">
                    <Clock className="w-4 h-4" />
                    <span>Peak Time</span>
                  </div>
                  <div className="text-sm font-bold text-cyan-300 font-mono truncate">
                    {streakInfo.peakDayOfWeek}
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1 font-mono truncate">
                    {streakInfo.peakHourRange}
                  </p>
                </div>
              </div>

              {/* GitHub-style Daily Study Activity Heatmap */}
              <div className="p-5 bg-slate-950/80 border border-slate-800/90 rounded-2xl space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center space-x-2">
                    <Calendar className="w-4 h-4 text-emerald-400" />
                    <h4 className="text-xs font-bold uppercase tracking-wider text-white font-mono">
                      Daily Study Activity Matrix (Past 13 Weeks)
                    </h4>
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono">
                    {hoveredDay ? (
                      <span className="text-emerald-300">
                        <strong>{hoveredDay.dateStr}</strong>: {hoveredDay.count} interactions •{' '}
                        {formatDuration(hoveredDay.watchTimeSec)} watched
                      </span>
                    ) : (
                      <span>Hover cells for daily breakdown</span>
                    )}
                  </div>
                </div>

                {/* Heatmap Grid */}
                <div className="overflow-x-auto pt-2 pb-1">
                  <div className="inline-flex flex-col gap-1 min-w-[500px]">
                    {/* 7 rows for Sun..Sat */}
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((dayName, rowIdx) => (
                      <div key={dayName} className="flex items-center gap-1.5">
                        <span className="w-7 text-[9px] font-mono text-slate-500 uppercase select-none text-right pr-1">
                          {rowIdx % 2 === 1 ? dayName : ''}
                        </span>

                        <div className="flex items-center gap-1">
                          {weeksGrid.map((week, colIdx) => {
                            const cell = week[rowIdx];
                            if (!cell) {
                              return <div key={colIdx} className="w-3.5 h-3.5 rounded-xs bg-slate-950" />;
                            }

                            // Color map
                            let bgClass = 'bg-slate-950 border border-slate-900';
                            if (cell.level === 1) {
                              bgClass = 'bg-emerald-950 border border-emerald-900/60';
                            } else if (cell.level === 2) {
                              bgClass = 'bg-emerald-800 border border-emerald-700/80';
                            } else if (cell.level === 3) {
                              bgClass = 'bg-emerald-600 border border-emerald-500';
                            } else if (cell.level === 4) {
                              bgClass = 'bg-emerald-400 border border-emerald-300 shadow-[0_0_6px_rgba(52,211,153,0.4)]';
                            }

                            return (
                              <div
                                key={cell.dateStr}
                                onMouseEnter={() => setHoveredDay(cell)}
                                onMouseLeave={() => setHoveredDay(null)}
                                className={`w-3.5 h-3.5 rounded-xs transition-all duration-150 cursor-pointer ${bgClass} hover:ring-2 hover:ring-white/80`}
                                title={`${cell.dateStr}: ${cell.count} interactions, ${formatDuration(cell.watchTimeSec)}`}
                              />
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Heatmap Legend */}
                <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono pt-2 border-t border-slate-800/60">
                  <span>Showing last 91 days of local watch sessions</span>
                  <div className="flex items-center space-x-1.5">
                    <span>Less</span>
                    <span className="w-2.5 h-2.5 rounded-xs bg-slate-950 border border-slate-800" />
                    <span className="w-2.5 h-2.5 rounded-xs bg-emerald-950 border border-emerald-900/60" />
                    <span className="w-2.5 h-2.5 rounded-xs bg-emerald-800" />
                    <span className="w-2.5 h-2.5 rounded-xs bg-emerald-600" />
                    <span className="w-2.5 h-2.5 rounded-xs bg-emerald-400" />
                    <span>More</span>
                  </div>
                </div>
              </div>

              {/* Learning Statistics Matrix */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-2xl shadow-2xs">
                  <div className="flex items-center space-x-1.5 text-indigo-400 text-xs font-medium mb-1">
                    <Clock className="w-4 h-4" />
                    <span>Watch Time</span>
                  </div>
                  <span className="text-lg sm:text-xl font-bold text-white font-mono">
                    {formatDuration(overallAnalytics.totalWatchTimeSec)}
                  </span>
                  <p className="text-[10px] text-slate-400 mt-1 font-mono">Accumulated session time</p>
                </div>

                <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-2xl shadow-2xs">
                  <div className="flex items-center space-x-1.5 text-emerald-400 text-xs font-medium mb-1">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Completed</span>
                  </div>
                  <span className="text-lg sm:text-xl font-bold text-emerald-400 font-mono">
                    {overallAnalytics.completedLectures}
                    <span className="text-xs text-slate-400 font-normal ml-1">
                      / {overallAnalytics.totalLectures}
                    </span>
                  </span>
                  <p className="text-[10px] text-slate-400 mt-1 font-mono">
                    {overallAnalytics.overallCompletionPct}% completion rate
                  </p>
                </div>

                <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-2xl shadow-2xs">
                  <div className="flex items-center space-x-1.5 text-cyan-400 text-xs font-medium mb-1">
                    <TrendingUp className="w-4 h-4" />
                    <span>Velocity</span>
                  </div>
                  <span className="text-lg sm:text-xl font-bold text-cyan-400 font-mono">
                    ~{overallAnalytics.velocityLecturesPerWeek} / wk
                  </span>
                  <p className="text-[10px] text-slate-400 mt-1 font-mono">
                    {overallAnalytics.recentActivityCount7d} activities last 7d
                  </p>
                </div>

                <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-2xl shadow-2xs">
                  <div className="flex items-center space-x-1.5 text-purple-400 text-xs font-medium mb-1">
                    <HardDrive className="w-4 h-4" />
                    <span>Disk Tracked</span>
                  </div>
                  <span className="text-lg sm:text-xl font-bold text-purple-300 font-mono">
                    {formatBytes(overallAnalytics.totalSizeBytes)}
                  </span>
                  <p className="text-[10px] text-slate-400 mt-1 font-mono">Offline local media</p>
                </div>
              </div>

              {/* Overall Progress Bar */}
              <div className="p-5 bg-slate-950/70 border border-slate-800 rounded-2xl space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-white">Overall Learning Progress</span>
                  <span className="font-mono text-emerald-400 font-bold">
                    {overallAnalytics.overallCompletionPct}%
                  </span>
                </div>
                <div className="w-full bg-slate-950 h-2.5 rounded-full overflow-hidden flex border border-slate-800">
                  <div
                    className="bg-emerald-500 h-full"
                    style={{ width: `${overallAnalytics.overallCompletionPct}%` }}
                    title={`Completed: ${overallAnalytics.completedLectures}`}
                  />
                  <div
                    className="bg-amber-500 h-full"
                    style={{
                      width: `${
                        overallAnalytics.totalLectures > 0
                          ? (overallAnalytics.inProgressLectures / overallAnalytics.totalLectures) * 100
                          : 0
                      }%`
                    }}
                    title={`In Progress: ${overallAnalytics.inProgressLectures}`}
                  />
                </div>
                <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-400 pt-1 font-mono">
                  <div className="flex items-center space-x-4">
                    <span className="flex items-center space-x-1">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      <span>Completed: {overallAnalytics.completedLectures}</span>
                    </span>
                    <span className="flex items-center space-x-1">
                      <span className="w-2 h-2 rounded-full bg-amber-500" />
                      <span>In Progress: {overallAnalytics.inProgressLectures}</span>
                    </span>
                    <span className="flex items-center space-x-1">
                      <span className="w-2 h-2 rounded-full bg-slate-700" />
                      <span>Not Started: {overallAnalytics.notStartedLectures}</span>
                    </span>
                  </div>
                  {overallAnalytics.projectedCompletionDays !== null && (
                    <span className="text-cyan-300 font-medium">
                      Est. {overallAnalytics.projectedCompletionDays} days remaining
                    </span>
                  )}
                </div>
              </div>

              {/* Codecs breakdown */}
              {Object.keys(overallAnalytics.formatBreakdown).length > 0 && (
                <div className="p-5 bg-slate-950/70 border border-slate-800 rounded-2xl space-y-3">
                  <h4 className="text-xs font-semibold text-white uppercase tracking-wider font-mono">
                    Video Format Codecs
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {Object.entries(overallAnalytics.formatBreakdown).map(([fmt, count]) => (
                      <div
                        key={fmt}
                        className="p-2.5 bg-slate-900 border border-slate-800 rounded-xl flex items-center justify-between text-xs"
                      >
                        <span className="font-mono uppercase font-bold text-cyan-300">{fmt}</span>
                        <span className="text-slate-300 font-mono text-[11px]">{count} videos</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'estimator' && (
            <div className="space-y-6">
              {/* Estimator Intro Header */}
              <div className="p-4 bg-indigo-950/30 border border-indigo-800/40 rounded-2xl text-xs text-indigo-300 flex items-start space-x-3">
                <Target className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-white mb-0.5">Target Completion Estimator</h4>
                  <p className="text-slate-400 leading-relaxed">
                    Set your daily study target and chosen playback speed to calculate exactly when you will
                    graduate and how many lectures you need to complete each day.
                  </p>
                </div>
              </div>

              {/* Planner Configuration Form */}
              <div className="p-5 bg-slate-950/80 border border-slate-800 rounded-2xl space-y-5">
                {/* 1. Scope Selector */}
                <div>
                  <label className="text-xs font-bold text-white uppercase tracking-wider font-mono block mb-2">
                    Calculation Scope
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {currentCourse && (
                      <button
                        onClick={() => setEstimatorScope('current')}
                        className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer border ${
                          estimatorScope === 'current'
                            ? 'bg-indigo-600 text-white border-indigo-500 shadow-xs'
                            : 'bg-slate-900 text-slate-300 border-slate-800 hover:bg-slate-850'
                        }`}
                      >
                        Current Course ({currentCourse.name})
                      </button>
                    )}
                    <button
                      onClick={() => setEstimatorScope('all')}
                      className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer border ${
                        estimatorScope === 'all'
                          ? 'bg-indigo-600 text-white border-indigo-500 shadow-xs'
                          : 'bg-slate-900 text-slate-300 border-slate-800 hover:bg-slate-850'
                      }`}
                    >
                      Entire Library ({overallAnalytics.totalLectures} lectures across {overallAnalytics.totalCourses} courses)
                    </button>
                  </div>
                </div>

                {/* 2. Daily Study Goal */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                      Daily Study Target
                    </label>
                    <span className="text-xs font-mono font-bold text-cyan-400">
                      {dailyGoalMinutes} minutes / day
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {[15, 30, 45, 60, 90, 120].map((mins) => (
                      <button
                        key={mins}
                        onClick={() => setDailyGoalMinutes(mins)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-mono font-medium transition-colors cursor-pointer border ${
                          dailyGoalMinutes === mins
                            ? 'bg-emerald-600 text-white border-emerald-500 shadow-xs'
                            : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white hover:bg-slate-850'
                        }`}
                      >
                        {mins}m / day
                      </button>
                    ))}
                  </div>
                </div>

                {/* 3. Playback Speed Multiplier */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                      Playback Speed Multiplier
                    </label>
                    <span className="text-xs font-mono font-bold text-indigo-400">
                      {playbackSpeed}x speed
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {[1.0, 1.25, 1.5, 1.75, 2.0].map((rate) => (
                      <button
                        key={rate}
                        onClick={() => setPlaybackSpeed(rate)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-mono font-medium transition-colors cursor-pointer border ${
                          playbackSpeed === rate
                            ? 'bg-indigo-600 text-white border-indigo-500 shadow-xs'
                            : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white hover:bg-slate-850'
                        }`}
                      >
                        {rate}x
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Dynamic Projection Results Card */}
              <div className="p-6 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950/40 border border-slate-800 rounded-3xl shadow-lg space-y-6">
                <div>
                  <span className="text-[10px] text-cyan-400 font-mono uppercase tracking-wider font-bold">
                    Projected Graduation Date
                  </span>
                  <div className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight mt-1">
                    {projectedFinishDate}
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    At <strong>{dailyGoalMinutes} min/day</strong> watched at <strong>{playbackSpeed}x speed</strong>
                  </p>
                </div>

                {/* Key Estimates Matrix */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-800/80">
                  <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-xl">
                    <span className="text-[10px] text-slate-500 font-mono block">Days Needed</span>
                    <span className="text-lg font-bold text-cyan-300 font-mono">{daysNeeded} days</span>
                  </div>

                  <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-xl">
                    <span className="text-[10px] text-slate-500 font-mono block">Daily Target</span>
                    <span className="text-lg font-bold text-emerald-400 font-mono">~{lecturesPerDay} lec/day</span>
                  </div>

                  <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-xl">
                    <span className="text-[10px] text-slate-500 font-mono block">Content Left</span>
                    <span className="text-lg font-bold text-white font-mono">{formatDuration(targetRemainingSec)}</span>
                  </div>

                  <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-xl">
                    <span className="text-[10px] text-slate-500 font-mono block">Speed Adjusted</span>
                    <span className="text-lg font-bold text-indigo-300 font-mono">{formatDuration(adjustedRemainingSec)}</span>
                  </div>
                </div>

                {/* Milestone Roadmaps */}
                {milestones.length > 0 && (
                  <div className="space-y-3 pt-2 border-t border-slate-800/80">
                    <h5 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                      Milestone Forecast Roadmap
                    </h5>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {milestones.map((ms) => (
                        <div
                          key={ms.pct}
                          className="p-3 bg-slate-900/70 border border-slate-800 rounded-xl space-y-1"
                        >
                          <div className="flex items-center justify-between text-[11px] font-mono">
                            <span className="text-slate-400">{ms.label}</span>
                            <span className="text-emerald-400 font-bold">{ms.pct}%</span>
                          </div>
                          <div className="text-sm font-bold text-white font-mono">{ms.dateStr}</div>
                          <div className="text-[10px] text-slate-500 font-mono">In {ms.days} days</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'backup' && (
            <div className="space-y-6">
              {importFeedback && (
                <div className="p-3.5 bg-emerald-950/60 border border-emerald-800/80 rounded-2xl text-xs text-emerald-300 flex items-start space-x-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
                  <span>{importFeedback}</span>
                </div>
              )}

              {exportNotesFeedback && (
                <div className="p-3.5 bg-indigo-950/60 border border-indigo-800/80 rounded-2xl text-xs text-indigo-300 flex items-start space-x-2">
                  <FileText className="w-4 h-4 shrink-0 text-indigo-400 mt-0.5" />
                  <span>{exportNotesFeedback}</span>
                </div>
              )}

              {importError && (
                <div className="p-3.5 bg-rose-950/60 border border-rose-800/80 rounded-2xl text-xs text-rose-300 flex items-start space-x-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
                  <span>{importError}</span>
                </div>
              )}

              {/* Export Section */}
              <div className="p-5 bg-slate-950/70 border border-slate-800 rounded-2xl space-y-3">
                <div className="flex items-center space-x-2 text-white">
                  <Download className="w-4 h-4 text-indigo-400" />
                  <h4 className="text-sm font-semibold">Export JSON Backup</h4>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Download a complete snapshot of all course registrations, watched timestamps,
                  completion checkboxes, and notes. Does not duplicate original video files on disk.
                </p>
                <div className="pt-2">
                  <button
                    onClick={handleExport}
                    className="inline-flex items-center space-x-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold transition-colors cursor-pointer shadow-[0_0_12px_rgba(99,102,241,0.25)]"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download JSON Backup</span>
                  </button>
                </div>
              </div>

              {/* Export All Notes to Markdown (.md) */}
              <div className="p-5 bg-slate-950/70 border border-slate-800 rounded-2xl space-y-3">
                <div className="flex items-center space-x-2 text-white">
                  <FileText className="w-4 h-4 text-emerald-400" />
                  <h4 className="text-sm font-semibold">Export Notes to Markdown (.md)</h4>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Export all your timestamped bookmarks and study notes across courses into a structured Markdown document compatible with Obsidian, Notion, Logseq, or VS Code.
                </p>
                <div className="pt-2">
                  <button
                    onClick={handleExportAllNotesMarkdown}
                    className="inline-flex items-center space-x-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold transition-colors cursor-pointer shadow-[0_0_12px_rgba(16,185,129,0.25)]"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download Notes Markdown (.md)</span>
                  </button>
                </div>
              </div>

              {/* Import Section */}
              <div className="p-5 bg-slate-950/70 border border-slate-800 rounded-2xl space-y-4">
                <div className="flex items-center space-x-2 text-white">
                  <Upload className="w-4 h-4 text-emerald-400" />
                  <h4 className="text-sm font-semibold">Restore / Import Backup</h4>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Restore previously exported progress and notes. Choose merge mode to blend records with
                  your current database or replace mode to restore from scratch.
                </p>

                <div className="space-y-3">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json"
                    className="hidden"
                    onChange={handleFileSelected}
                  />

                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold flex items-center space-x-2 transition-colors cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5 text-slate-400" />
                    <span>Select Backup JSON File</span>
                  </button>

                  {importPreview && (
                    <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-3">
                      <div className="text-xs font-mono text-cyan-300">
                        Snapshot contains: {importPreview.courses.length} courses,{' '}
                        {importPreview.lectures.length} lectures, {importPreview.progress.length} progress
                        records, {importPreview.notes.length} notes.
                      </div>

                      <div className="flex items-center space-x-4 text-xs">
                        <label className="flex items-center space-x-1.5 cursor-pointer">
                          <input
                            type="radio"
                            name="importMode"
                            checked={importMode === 'merge'}
                            onChange={() => setImportMode('merge')}
                            className="text-indigo-600 focus:ring-indigo-500"
                          />
                          <span className="text-slate-300">Merge with existing</span>
                        </label>

                        <label className="flex items-center space-x-1.5 cursor-pointer">
                          <input
                            type="radio"
                            name="importMode"
                            checked={importMode === 'replace'}
                            onChange={() => setImportMode('replace')}
                            className="text-indigo-600 focus:ring-indigo-500"
                          />
                          <span className="text-rose-400">Replace entire database</span>
                        </label>
                      </div>

                      <div className="pt-1">
                        <button
                          onClick={handleRunImport}
                          disabled={isProcessing}
                          className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-xs disabled:opacity-50"
                        >
                          {isProcessing ? 'Importing...' : 'Confirm & Apply Restore'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
