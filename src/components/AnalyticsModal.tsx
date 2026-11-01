import React, { useState, useRef } from 'react';
import { useCourseStore } from '../store/courseContext';
import { AppBackupPayload } from '../types';
import { formatBytes, formatDuration, formatTimeAgo } from '../utils/formatters';
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
  ShieldCheck,
  RefreshCw
} from 'lucide-react';

export const AnalyticsModal: React.FC = () => {
  const {
    isAnalyticsModalOpen,
    closeAnalyticsModal,
    overallAnalytics,
    exportDatabaseBackup,
    importDatabaseBackup
  } = useCourseStore();

  const [activeTab, setActiveTab] = useState<'analytics' | 'backup'>('analytics');
  const [importPreview, setImportPreview] = useState<AppBackupPayload | null>(null);
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge');
  const [importFeedback, setImportFeedback] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!isAnalyticsModalOpen) return null;

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-150">
      <div className="bg-slate-900 border border-slate-800/90 rounded-3xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl text-slate-100 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800/80 bg-slate-900/95 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <BarChart3 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight">Course Analytics & Data Export</h3>
              <p className="text-[11px] text-slate-400 font-mono">
                100% On-Device learning insights & JSON backup
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
        <div className="px-6 pt-3 border-b border-slate-800/80 flex items-center space-x-4 bg-slate-950/60">
          <button
            onClick={() => setActiveTab('analytics')}
            className={`pb-3 text-xs font-semibold flex items-center space-x-2 border-b-2 transition-colors cursor-pointer ${
              activeTab === 'analytics'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <TrendingUp className="w-4 h-4" />
            <span>Learning Statistics</span>
          </button>
          <button
            onClick={() => setActiveTab('backup')}
            className={`pb-3 text-xs font-semibold flex items-center space-x-2 border-b-2 transition-colors cursor-pointer ${
              activeTab === 'backup'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileJson className="w-4 h-4" />
            <span>JSON Backup & Restore</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {activeTab === 'analytics' ? (
            <div className="space-y-6">
              {/* Primary Stats Matrix */}
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

              {/* Completion Progress Bar */}
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

              {/* Format Distribution Breakdown */}
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
            </div>
          ) : (
            /* BACKUP & RESTORE TAB */
            <div className="space-y-6">
              {importFeedback && (
                <div className="p-3.5 bg-emerald-950/60 border border-emerald-800/80 rounded-2xl text-xs text-emerald-300 flex items-start space-x-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
                  <span>{importFeedback}</span>
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

              {/* Import Section */}
              <div className="p-5 bg-slate-950/70 border border-slate-800 rounded-2xl space-y-4">
                <div className="flex items-center space-x-2 text-white">
                  <Upload className="w-4 h-4 text-indigo-400" />
                  <h4 className="text-sm font-semibold">Restore / Import from Backup</h4>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Restore previously exported study records. Choose whether to merge with your current library or cleanly replace all records.
                </p>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,application/json"
                  onChange={handleFileSelected}
                  className="hidden"
                />

                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full py-4 px-4 border-2 border-dashed border-slate-800 hover:border-indigo-500 hover:bg-slate-900/60 rounded-xl flex items-center justify-center space-x-2 transition-all cursor-pointer text-xs font-medium text-slate-300"
                >
                  <FileJson className="w-4 h-4 text-indigo-400" />
                  <span>Select JSON Backup File</span>
                </button>

                {/* Import Preview */}
                {importPreview && (
                  <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl space-y-3 text-xs">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                      <span className="font-semibold text-white">Backup Contents Verified</span>
                      <span className="text-[11px] text-slate-400 font-mono">
                        Exported: {new Date(importPreview.exportedAt).toLocaleDateString()}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                      <div className="p-2 bg-slate-950 rounded-xl border border-slate-800">
                        <span className="text-slate-400 block text-[10px] font-mono">Courses</span>
                        <span className="font-bold text-white text-sm font-mono">
                          {importPreview.courses.length}
                        </span>
                      </div>
                      <div className="p-2 bg-slate-950 rounded-xl border border-slate-800">
                        <span className="text-slate-400 block text-[10px] font-mono">Lectures</span>
                        <span className="font-bold text-white text-sm font-mono">
                          {importPreview.lectures.length}
                        </span>
                      </div>
                      <div className="p-2 bg-slate-950 rounded-xl border border-slate-800">
                        <span className="text-slate-400 block text-[10px] font-mono">Progress</span>
                        <span className="font-bold text-white text-sm font-mono">
                          {importPreview.progress.length}
                        </span>
                      </div>
                      <div className="p-2 bg-slate-950 rounded-xl border border-slate-800">
                        <span className="text-slate-400 block text-[10px] font-mono">Notes</span>
                        <span className="font-bold text-white text-sm font-mono">
                          {importPreview.notes.length}
                        </span>
                      </div>
                    </div>

                    <div className="pt-2 flex items-center space-x-4">
                      <label className="flex items-center space-x-1.5 cursor-pointer">
                        <input
                          type="radio"
                          name="importMode"
                          checked={importMode === 'merge'}
                          onChange={() => setImportMode('merge')}
                          className="text-indigo-600 focus:ring-0"
                        />
                        <span>Merge with current data</span>
                      </label>
                      <label className="flex items-center space-x-1.5 cursor-pointer text-rose-300">
                        <input
                          type="radio"
                          name="importMode"
                          checked={importMode === 'replace'}
                          onChange={() => setImportMode('replace')}
                          className="text-rose-600 focus:ring-0"
                        />
                        <span>Clean replace</span>
                      </label>
                    </div>

                    <div className="pt-2 flex justify-end space-x-2">
                      <button
                        onClick={() => setImportPreview(null)}
                        className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleRunImport}
                        disabled={isProcessing}
                        className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl font-semibold flex items-center space-x-1.5 cursor-pointer shadow-xs"
                      >
                        {isProcessing && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                        <span>Confirm Restore</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
