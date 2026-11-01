import React, { useState } from 'react';
import { useCourseStore } from '../store/courseContext';
import { Course } from '../types';
import { formatTimeAgo } from '../utils/formatters';
import {
  Folder,
  Play,
  RotateCw,
  Link,
  Edit2,
  Archive,
  Trash2,
  FolderPlus,
  AlertTriangle,
  CheckCircle2,
  X,
  FolderOpen,
  ArrowRight,
  ShieldAlert
} from 'lucide-react';

export const CourseLibrary: React.FC = () => {
  const {
    courses,
    switchCourse,
    renameCourse,
    archiveCourse,
    deleteCoursePermanently,
    reconnectCourse,
    upgradeCourseToNativeAccess,
    rescanCurrentCourse,
    openAddCourseModal,
    currentCourse
  } = useCourseStore();

  const [renameTarget, setRenameTarget] = useState<Course | null>(null);
  const [newCourseName, setNewCourseName] = useState('');

  const [archiveTarget, setArchiveTarget] = useState<Course | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Course | null>(null);
  const [typedConfirmation, setTypedConfirmation] = useState('');
  const [rescanStatusMessage, setRescanStatusMessage] = useState<string | null>(null);

  const handleOpenRename = (c: Course) => {
    setRenameTarget(c);
    setNewCourseName(c.name);
  };

  const handleSaveRename = async () => {
    if (renameTarget && newCourseName.trim()) {
      await renameCourse(renameTarget.id, newCourseName.trim());
      setRenameTarget(null);
    }
  };

  const handleArchiveConfirm = async () => {
    if (archiveTarget) {
      await archiveCourse(archiveTarget.id);
      setArchiveTarget(null);
    }
  };

  const handleDeletePermanentConfirm = async () => {
    if (deleteTarget && typedConfirmation === 'DELETE') {
      await deleteCoursePermanently(deleteTarget.id);
      setDeleteTarget(null);
      setTypedConfirmation('');
    }
  };

  const handleReconnect = async (courseId: string) => {
    const success = await reconnectCourse(courseId);
    if (success) {
      setRescanStatusMessage('Folder reconnected successfully with read access.');
    } else {
      setRescanStatusMessage('Could not reconnect folder. Please grant browser permission.');
    }
    setTimeout(() => setRescanStatusMessage(null), 4000);
  };

  const handleRescan = async (c: Course) => {
    if (!currentCourse || currentCourse.id !== c.id) {
      await switchCourse(c.id);
    }
    setRescanStatusMessage(`Rescanning folder for "${c.name}"...`);
    const stats = await rescanCurrentCourse();
    if (stats) {
      setRescanStatusMessage(
        `Rescan complete! Examined ${stats.filesExamined} files, matched ${stats.matchedExisting} existing, registered ${stats.newlyRegistered} new.`
      );
    } else {
      setRescanStatusMessage('Rescan completed or halted without changes.');
    }
    setTimeout(() => setRescanStatusMessage(null), 6000);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">Course Library</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Manage your registered courses, rescan folders, reconnect handles, or edit display names.
          </p>
        </div>
        <button
          onClick={openAddCourseModal}
          className="inline-flex items-center space-x-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs rounded-xl shadow-[0_0_12px_rgba(99,102,241,0.25)] transition-all cursor-pointer self-start sm:self-auto"
        >
          <FolderPlus className="w-4 h-4" />
          <span>+ Add Course</span>
        </button>
      </div>

      {rescanStatusMessage && (
        <div className="p-3 bg-indigo-950/70 border border-indigo-700/60 rounded-2xl text-xs text-indigo-300 flex items-center justify-between">
          <span>{rescanStatusMessage}</span>
          <button onClick={() => setRescanStatusMessage(null)}>
            <X className="w-4 h-4 text-indigo-400" />
          </button>
        </div>
      )}

      {courses.length === 0 ? (
        <div className="text-center py-20 bg-slate-900/60 border border-slate-800/80 rounded-3xl p-8 backdrop-blur-xs">
          <Folder className="w-12 h-12 text-slate-700 mx-auto mb-3" />
          <h3 className="text-sm font-semibold text-slate-200">No courses in your library</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1 mb-6">
            Import a folder of video lectures to begin tracking your study progress locally.
          </p>
          <button
            onClick={openAddCourseModal}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl shadow-[0_0_12px_rgba(99,102,241,0.3)] transition-all"
          >
            + Add First Course
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {courses.map((course) => (
            <div
              key={course.id}
              className="bg-slate-900/70 border border-slate-800/80 rounded-3xl p-5 hover:border-slate-700/80 hover:bg-slate-900/90 transition-all duration-200 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xs"
            >
              <div className="space-y-2 max-w-xl">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h3 className="text-base font-bold text-white">{course.name}</h3>
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

                {/* Structured Metadata Tag Chips */}
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="px-2 py-0.5 rounded-md bg-slate-950 border border-slate-800 font-mono text-[11px] text-cyan-300">
                    📁 {course.folderName}
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-slate-950 border border-slate-800 font-mono text-[11px] text-slate-400">
                    Active {formatTimeAgo(course.lastActivityAt)}
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-slate-950 border border-slate-800 font-mono text-[11px] text-slate-500">
                    ID: {course.id.slice(0, 8)}...
                  </span>
                </div>
              </div>

              {/* Course Action Buttons */}
              <div className="flex flex-wrap items-center gap-2 pt-2 md:pt-0">
                <button
                  onClick={() => switchCourse(course.id)}
                  className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition-colors cursor-pointer shadow-[0_0_12px_rgba(99,102,241,0.2)]"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Open Course</span>
                </button>

                {course.rootHandle && (
                  <button
                    onClick={() => handleRescan(course)}
                    className="px-3 py-1.5 bg-slate-950 hover:bg-slate-800 text-slate-200 rounded-xl text-xs font-medium flex items-center space-x-1.5 border border-slate-800 transition-colors cursor-pointer"
                    title="Rescan folder to find newly added or moved lectures without resetting progress"
                  >
                    <RotateCw className="w-3.5 h-3.5 text-slate-400" />
                    <span>Rescan</span>
                  </button>
                )}

                {course.rootHandle && course.connectionState !== 'connected' ? (
                  <button
                    onClick={() => handleReconnect(course.id)}
                    className="px-3 py-1.5 bg-amber-950/80 hover:bg-amber-900 border border-amber-800/80 text-amber-300 rounded-xl text-xs font-medium flex items-center space-x-1.5 transition-colors cursor-pointer"
                  >
                    <Link className="w-3.5 h-3.5" />
                    <span>Reconnect</span>
                  </button>
                ) : !course.rootHandle ? (
                  <button
                    onClick={async () => {
                      const ok = await upgradeCourseToNativeAccess(course.id);
                      if (ok) setRescanStatusMessage(`Connected native folder access for ${course.name}!`);
                    }}
                    className="px-3 py-1.5 bg-indigo-950/80 hover:bg-indigo-900 border border-indigo-800/80 text-indigo-300 rounded-xl text-xs font-medium flex items-center space-x-1.5 transition-colors cursor-pointer"
                    title="Switch or upgrade to Native Folder Access"
                  >
                    <FolderOpen className="w-3.5 h-3.5" />
                    <span>Native Access</span>
                  </button>
                ) : null}

                <button
                  onClick={() => handleOpenRename(course)}
                  className="p-2 bg-slate-950 hover:bg-slate-800 text-slate-300 rounded-xl border border-slate-800 transition-colors cursor-pointer"
                  title="Rename course display name"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>

                <button
                  onClick={() => setArchiveTarget(course)}
                  className="p-2 bg-slate-950 hover:bg-slate-800 text-slate-300 rounded-xl border border-slate-800 transition-colors cursor-pointer"
                  title="Remove from library (keeps learning history)"
                >
                  <Archive className="w-3.5 h-3.5" />
                </button>

                <button
                  onClick={() => {
                    setDeleteTarget(course);
                    setTypedConfirmation('');
                  }}
                  className="p-2 bg-slate-950 hover:bg-rose-950/60 hover:text-rose-400 text-slate-400 rounded-xl border border-slate-800 transition-colors cursor-pointer"
                  title="Delete permanently from app"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* RENAME MODAL */}
      {renameTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md p-6 text-slate-100 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-white">Rename Course</h3>
            <p className="text-xs text-slate-400">
              Updates display name only. Stable ID and all progress records remain untouched.
            </p>
            <input
              type="text"
              value={newCourseName}
              onChange={(e) => setNewCourseName(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              autoFocus
            />
            <div className="flex justify-end space-x-2 pt-2">
              <button
                onClick={() => setRenameTarget(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveRename}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl shadow-xs"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ARCHIVE CONFIRMATION MODAL */}
      {archiveTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md p-6 text-slate-100 shadow-2xl space-y-4">
            <div className="flex items-center space-x-2 text-indigo-400">
              <Archive className="w-5 h-5" />
              <h3 className="text-base font-bold text-white">Remove from Library</h3>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              This removes <strong className="text-white">"{archiveTarget.name}"</strong> from your active
              course library.
            </p>
            <div className="p-3 bg-indigo-950/40 border border-indigo-800/50 rounded-2xl text-xs text-indigo-200">
              <strong>Learning History Retained:</strong> All watch positions, completion statuses, and notes
              are preserved in IndexedDB. Original video files on disk are completely untouched.
            </div>
            <div className="flex justify-end space-x-2 pt-2">
              <button
                onClick={() => setArchiveTarget(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={handleArchiveConfirm}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl"
              >
                Remove from Library
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PERMANENT DELETION MODAL WITH TYPED CONFIRMATION */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-rose-800/80 rounded-3xl w-full max-w-md p-6 text-slate-100 shadow-2xl space-y-4">
            <div className="flex items-center space-x-2 text-rose-400">
              <AlertTriangle className="w-5 h-5" />
              <h3 className="text-base font-bold text-white">Delete Course Permanently?</h3>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              This will permanently purge the registered lecture records, progress, and notes for{' '}
              <strong className="text-white">"{deleteTarget.name}"</strong> from this app.
            </p>
            <div className="p-3 bg-slate-950 border border-slate-800 rounded-2xl text-xs text-slate-400">
              <strong className="text-emerald-400 block mb-1">
                <CheckCircle2 className="w-3.5 h-3.5 inline mr-1" />
                Local Videos Are Safe
              </strong>
              This action deletes database records inside the browser only. Your downloaded video files on
              disk will never be touched or deleted.
            </div>

            <div className="space-y-1">
              <label className="text-xs text-slate-300 block font-mono">
                Type <strong className="text-rose-400 font-mono">DELETE</strong> to confirm:
              </label>
              <input
                type="text"
                value={typedConfirmation}
                onChange={(e) => setTypedConfirmation(e.target.value)}
                placeholder="DELETE"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-rose-500 font-mono"
              />
            </div>

            <div className="flex justify-end space-x-2 pt-2">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={handleDeletePermanentConfirm}
                disabled={typedConfirmation !== 'DELETE'}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white text-xs font-semibold rounded-xl transition-colors"
              >
                Delete Permanently
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
