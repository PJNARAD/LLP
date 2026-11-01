import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useCourseStore } from '../store/courseContext';
import { Lecture, LectureNote } from '../types';
import { db } from '../db/indexedDB';
import { formatBytes, formatDuration } from '../utils/formatters';
import {
  sessionFileStore,
  resolveLectureMediaFile,
  createPlayableBlobUrl
} from '../scanner/fileStore';
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Bookmark,
  Plus,
  Trash2,
  AlertTriangle,
  FileVideo,
  ExternalLink,
  Copy,
  Check,
  FolderOpen,
  Sliders,
  Sparkles,
  Terminal,
  Upload,
  Film,
  RotateCcw,
  FastForward,
  Rewind,
  Play,
  Pause,
  RefreshCw
} from 'lucide-react';

export const VideoPlayer: React.FC = () => {
  const {
    currentCourse,
    activeLecture,
    progressMap,
    setActiveView,
    updateLectureProgress,
    flushPendingProgress,
    openNotesDrawer,
    targetSeekTime,
    clearSeekTarget,
    upgradeCourseToNativeAccess
  } = useCourseStore();

  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isCompleted, setIsCompleted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  // External player helper states
  const [copiedPath, setCopiedPath] = useState(false);
  const [copiedCmd, setCopiedCmd] = useState(false);
  const [manualSyncSec, setManualSyncSec] = useState<number>(0);
  const [isUpgrading, setIsUpgrading] = useState(false);
  const [upgradeMessage, setUpgradeMessage] = useState<string | null>(null);

  // Notes state
  const [notes, setNotes] = useState<LectureNote[]>([]);
  const [newNoteText, setNewNoteText] = useState('');

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const initialSeekDoneRef = useRef(false);
  const singleFileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);

  if (!currentCourse || !activeLecture) {
    return (
      <div className="max-w-4xl mx-auto py-16 text-center text-slate-400">
        <p>No lecture selected.</p>
        <button
          onClick={() => setActiveView('course')}
          className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-semibold shadow-xs cursor-pointer"
        >
          Return to Course
        </button>
      </div>
    );
  }

  const existingProgress = progressMap.get(activeLecture.id);

  // Load notes for active lecture
  const loadNotes = useCallback(async () => {
    try {
      const items = await db.getNotesForLecture(currentCourse.id, activeLecture.id);
      setNotes(items);
    } catch (err) {
      console.error('Failed to load notes:', err);
    }
  }, [currentCourse.id, activeLecture.id]);

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  // Object URL lifecycle: resolve video from session cache, handle, or rootHandle
  useEffect(() => {
    let cancelled = false;
    initialSeekDoneRef.current = false;
    setLoadError(null);

    // Clean up previous object URL if any
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }

    async function loadFileBlob() {
      if (!activeLecture || !currentCourse) return;

      try {
        const file = await resolveLectureMediaFile(
          currentCourse.id,
          activeLecture.id,
          activeLecture.relativePath,
          activeLecture.name,
          activeLecture.fileHandle,
          currentCourse.rootHandle
        );

        if (cancelled) return;

        if (file) {
          const url = createPlayableBlobUrl(file);
          objectUrlRef.current = url;
          setVideoSrc(url);
          setLoadError(null);
          return;
        }
      } catch (err: any) {
        if (cancelled) return;
        console.warn('Error resolving lecture media file:', err);
      }

      if (cancelled) return;

      // Notice when file stream is pending user selection
      if (activeLecture.supportState === 'unsupported_format') {
        setLoadError(
          `The file format .${activeLecture.ext.toUpperCase()} may require external codecs. You can still select the file to try playing natively, or use VLC/MPV.`
        );
      } else {
        setLoadError(
          `Video file is not yet linked in this browser session. Select or drop "${activeLecture.name}" to stream immediately.`
        );
      }
    }

    loadFileBlob();

    return () => {
      cancelled = true;
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
      setVideoSrc(null);
    };
  }, [activeLecture, currentCourse]);

  // Sync completion status from existingProgress
  useEffect(() => {
    if (existingProgress) {
      setIsCompleted(existingProgress.completed);
      setManualSyncSec(existingProgress.positionSec || 0);
    } else {
      setIsCompleted(false);
      setManualSyncSec(0);
    }
  }, [existingProgress]);

  // Handle external seek requests from NotesDrawer or Bookmarks
  useEffect(() => {
    if (targetSeekTime !== null && videoRef.current) {
      videoRef.current.currentTime = targetSeekTime;
      videoRef.current.play().catch(() => {});
      clearSeekTarget();
    }
  }, [targetSeekTime, clearSeekTarget]);

  // Direct file attachment handler: single video file selected by user
  const handleSingleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentCourse || !activeLecture) return;

    // Cache in session store for lecture ID and relative path
    sessionFileStore.storeFile(currentCourse.id, activeLecture.id, file, activeLecture.relativePath);

    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
    }
    const url = createPlayableBlobUrl(file);
    objectUrlRef.current = url;
    setVideoSrc(url);
    setLoadError(null);

    // Auto-play when ready
    setTimeout(() => {
      if (videoRef.current) {
        videoRef.current.play().catch(() => {});
      }
    }, 150);
  };

  // Re-link full course folder from browser input
  const handleFolderSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !currentCourse || !activeLecture) return;

    sessionFileStore.registerFiles(currentCourse.id, files);

    // Check if active lecture is now resolved
    const matched = sessionFileStore.getFile(
      currentCourse.id,
      activeLecture.id,
      activeLecture.relativePath,
      activeLecture.name
    );

    if (matched) {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }
      const url = createPlayableBlobUrl(matched);
      objectUrlRef.current = url;
      setVideoSrc(url);
      setLoadError(null);
      setUpgradeMessage(`Linked folder with ${files.length} files. Playing "${activeLecture.name}"!`);
    } else {
      setUpgradeMessage(`Loaded ${files.length} folder files. Pick the exact file if names differ.`);
    }

    setTimeout(() => setUpgradeMessage(null), 5000);
  };

  // Drag and drop video file handler
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingOver(false);

    const file = e.dataTransfer.files?.[0];
    if (!file || !currentCourse || !activeLecture) return;

    sessionFileStore.storeFile(currentCourse.id, activeLecture.id, file, activeLecture.relativePath);

    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
    }
    const url = createPlayableBlobUrl(file);
    objectUrlRef.current = url;
    setVideoSrc(url);
    setLoadError(null);

    setTimeout(() => {
      if (videoRef.current) {
        videoRef.current.play().catch(() => {});
      }
    }, 150);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingOver(true);
  };

  const handleDragLeave = () => {
    setIsDraggingOver(false);
  };

  // Resume saved position once video metadata is loaded
  const handleLoadedMetadata = () => {
    if (!videoRef.current) return;
    const vid = videoRef.current;
    const totalDur = vid.duration || 0;
    setDuration(totalDur);

    // Save accurate duration to IndexedDB if it was unknown
    if (activeLecture && (!activeLecture.durationSec || activeLecture.durationSec <= 0)) {
      updateLectureProgress(
        activeLecture.id,
        existingProgress?.positionSec || 0,
        Math.floor(totalDur),
        isCompleted
      );
    }

    if (!initialSeekDoneRef.current && existingProgress && existingProgress.positionSec > 0) {
      if (existingProgress.positionSec < totalDur - 2) {
        vid.currentTime = existingProgress.positionSec;
      }
      initialSeekDoneRef.current = true;
    }
  };

  // Periodic progress saving ticker (~5s) & on pause
  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const vid = videoRef.current;
    const pos = vid.currentTime;
    setCurrentTime(pos);

    // Auto-complete if watched > 90%
    let completed = isCompleted;
    if (vid.duration > 0 && pos / vid.duration > 0.9 && !isCompleted) {
      completed = true;
      setIsCompleted(true);
    }

    updateLectureProgress(activeLecture.id, Math.floor(pos), Math.floor(vid.duration || 0), completed);
  };

  const handlePause = async () => {
    setIsPlaying(false);
    if (videoRef.current) {
      await updateLectureProgress(
        activeLecture.id,
        Math.floor(videoRef.current.currentTime),
        Math.floor(videoRef.current.duration || 0),
        isCompleted,
        true // force immediate flush
      );
    }
  };

  const handleVideoError = () => {
    setLoadError(
      `HTML5 video decoder error: Browser cannot decode format .${activeLecture.ext.toUpperCase()} natively. You can launch it with VLC/MPV below.`
    );
    setVideoSrc(null);
  };

  const handleToggleComplete = async () => {
    const nextVal = !isCompleted;
    setIsCompleted(nextVal);
    await updateLectureProgress(
      activeLecture.id,
      Math.floor(currentTime),
      Math.floor(duration || 0),
      nextVal,
      true
    );
  };

  const handlePlaybackRateChange = (rate: number) => {
    setPlaybackRate(rate);
    if (videoRef.current) {
      videoRef.current.playbackRate = rate;
    }
  };

  const handleSkip = (seconds: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = Math.max(0, Math.min(videoRef.current.duration || 999999, videoRef.current.currentTime + seconds));
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNoteText.trim()) return;

    const newNote: LectureNote = {
      id: crypto.randomUUID(),
      courseId: currentCourse.id,
      lectureId: activeLecture.id,
      content: newNoteText.trim(),
      timestampSec: Math.floor(currentTime),
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    await db.saveNote(newNote);
    setNewNoteText('');
    await loadNotes();
  };

  const handleDeleteNote = async (id: string) => {
    await db.deleteNote(id);
    await loadNotes();
  };

  const handleJumpToTimestamp = (sec: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = sec;
      videoRef.current.play().catch(() => {});
    }
  };

  const handleBackToCourse = async () => {
    await flushPendingProgress();
    setActiveView('course');
  };

  // Feature 1: Upgrade to Native Folder Access
  const handleUpgradeToNative = async () => {
    setIsUpgrading(true);
    setUpgradeMessage(null);
    try {
      const ok = await upgradeCourseToNativeAccess(currentCourse.id);
      if (ok) {
        setUpgradeMessage('Native folder access connected! Relinking video stream.');
      } else {
        setUpgradeMessage('Native picker cancelled or unavailable.');
      }
    } catch (err: any) {
      setUpgradeMessage('Upgrade notice: ' + (err.message || 'Restricted'));
    } finally {
      setIsUpgrading(false);
      setTimeout(() => setUpgradeMessage(null), 4000);
    }
  };

  // Feature 1: Copy path or external launcher helper
  const handleCopyPath = () => {
    navigator.clipboard.writeText(activeLecture.relativePath);
    setCopiedPath(true);
    setTimeout(() => setCopiedPath(false), 2000);
  };

  const handleCopyVlcCmd = () => {
    const cmd = `vlc "${activeLecture.name}"`;
    navigator.clipboard.writeText(cmd);
    setCopiedCmd(true);
    setTimeout(() => setCopiedCmd(false), 2000);
  };

  const handleSaveManualProgress = async () => {
    await updateLectureProgress(
      activeLecture.id,
      manualSyncSec,
      activeLecture.durationSec,
      manualSyncSec > 0 && activeLecture.durationSec ? manualSyncSec >= activeLecture.durationSec * 0.9 : isCompleted,
      true
    );
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Hidden File Inputs */}
      <input
        ref={singleFileInputRef}
        type="file"
        accept="video/*,.mp4,.webm,.ogg,.mov,.m4v,.mkv,.avi,.3gp"
        className="hidden"
        onChange={handleSingleFileSelected}
      />
      <input
        ref={folderInputRef}
        type="file"
        // @ts-ignore
        webkitdirectory="true"
        directory="true"
        multiple
        className="hidden"
        onChange={handleFolderSelected}
      />

      {/* Top Navigation Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800/80">
        <button
          onClick={handleBackToCourse}
          className="inline-flex items-center space-x-2 text-xs font-semibold text-slate-300 hover:text-white transition-colors cursor-pointer self-start"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to {currentCourse.name}</span>
        </button>

        <div className="flex flex-wrap items-center gap-2">
          {/* Quick Relink Button */}
          <button
            onClick={() => singleFileInputRef.current?.click()}
            className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700/80 rounded-xl text-xs font-medium flex items-center space-x-1.5 transition-colors cursor-pointer"
            title="Choose or change the video file for this lecture"
          >
            <Film className="w-3.5 h-3.5 text-indigo-400" />
            <span>Select Video File</span>
          </button>

          <button
            onClick={() => openNotesDrawer(activeLecture)}
            className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-indigo-300 border border-indigo-900/40 rounded-xl text-xs font-medium flex items-center space-x-1.5 transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            <Bookmark className="w-3.5 h-3.5 text-indigo-400" />
            <span>Notes Drawer ({notes.length})</span>
          </button>

          <button
            onClick={handleToggleComplete}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-emerald-400 ${
              isCompleted
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-[0_0_12px_rgba(16,185,129,0.3)]'
                : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700/80'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>{isCompleted ? 'Completed' : 'Mark Completed'}</span>
          </button>
        </div>
      </div>

      {upgradeMessage && (
        <div className="p-3 bg-indigo-950/70 border border-indigo-700/60 rounded-2xl text-xs text-indigo-300 shadow-xs flex items-center space-x-2">
          <Sparkles className="w-4 h-4 text-indigo-400 shrink-0" />
          <span>{upgradeMessage}</span>
        </div>
      )}

      {/* Main Grid: Player Area + Notes & Metadata */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Video Player Column */}
        <div className="lg:col-span-2 space-y-4">
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            className={`bg-black rounded-3xl overflow-hidden aspect-video relative flex items-center justify-center border transition-all duration-200 shadow-2xl ${
              isDraggingOver
                ? 'border-indigo-400 bg-indigo-950/30 ring-4 ring-indigo-500/20'
                : 'border-slate-800/90'
            }`}
          >
            {videoSrc ? (
              <video
                ref={videoRef}
                src={videoSrc}
                controls
                className="w-full h-full object-contain"
                onLoadedMetadata={handleLoadedMetadata}
                onTimeUpdate={handleTimeUpdate}
                onPlay={() => setIsPlaying(true)}
                onPause={handlePause}
                onError={handleVideoError}
              />
            ) : (
              /* High-end Video Linker / Dropzone */
              <div className="p-6 sm:p-8 text-center max-w-lg space-y-4">
                <div className="w-14 h-14 rounded-2xl bg-indigo-950/80 border border-indigo-500/30 flex items-center justify-center text-indigo-400 mx-auto shadow-[0_0_20px_rgba(99,102,241,0.25)]">
                  <FileVideo className="w-7 h-7" />
                </div>

                <div>
                  <h4 className="font-bold text-white text-base tracking-tight">
                    {activeLecture.name}
                  </h4>
                  <p className="text-xs text-slate-300 leading-relaxed mt-1">
                    Select the local video file on your computer to stream inline and track progress.
                  </p>
                  <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                    Expected path: {activeLecture.relativePath}
                  </p>
                </div>

                {/* Primary Action: Pick Video File */}
                <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5 pt-2">
                  <button
                    onClick={() => singleFileInputRef.current?.click()}
                    className="w-full sm:w-auto px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold flex items-center justify-center space-x-2 transition-all cursor-pointer shadow-[0_0_16px_rgba(99,102,241,0.35)] hover:scale-[1.02]"
                  >
                    <Film className="w-4 h-4" />
                    <span>Choose Video File to Play</span>
                  </button>

                  <button
                    onClick={() => folderInputRef.current?.click()}
                    className="w-full sm:w-auto px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-slate-200 rounded-xl text-xs font-medium border border-slate-700/80 flex items-center justify-center space-x-1.5 transition-colors cursor-pointer"
                  >
                    <FolderOpen className="w-4 h-4 text-slate-400" />
                    <span>Link Course Folder</span>
                  </button>
                </div>

                <div className="text-[11px] text-slate-400 font-mono pt-1">
                  💡 Tip: You can also drag and drop the video file directly into this box!
                </div>
              </div>
            )}
          </div>

          {/* Player Quick Controls (Speed & Skip) */}
          {videoSrc && (
            <div className="bg-slate-900/80 border border-slate-800/80 rounded-2xl p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => handleSkip(-10)}
                  className="px-2.5 py-1 bg-slate-950 hover:bg-slate-800 text-slate-300 rounded-lg border border-slate-800 flex items-center space-x-1 cursor-pointer"
                  title="Rewind 10 seconds"
                >
                  <Rewind className="w-3.5 h-3.5" />
                  <span>-10s</span>
                </button>
                <button
                  onClick={() => handleSkip(10)}
                  className="px-2.5 py-1 bg-slate-950 hover:bg-slate-800 text-slate-300 rounded-lg border border-slate-800 flex items-center space-x-1 cursor-pointer"
                  title="Forward 10 seconds"
                >
                  <FastForward className="w-3.5 h-3.5" />
                  <span>+10s</span>
                </button>
              </div>

              {/* Playback speed buttons */}
              <div className="flex items-center space-x-1.5">
                <span className="text-slate-400 text-[11px] font-mono mr-1">Speed:</span>
                {[0.75, 1, 1.25, 1.5, 1.75, 2].map((rate) => (
                  <button
                    key={rate}
                    onClick={() => handlePlaybackRateChange(rate)}
                    className={`px-2 py-0.5 rounded-md font-mono text-[11px] transition-colors cursor-pointer ${
                      playbackRate === rate
                        ? 'bg-indigo-600 text-white font-bold'
                        : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                    }`}
                  >
                    {rate}x
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* External Media Player Protocol Helper Card (When file is unplayable or external mode used) */}
          {loadError && (
            <div className="bg-slate-900/85 border border-slate-800/80 rounded-3xl p-5 space-y-3.5 shadow-sm backdrop-blur-xs">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
                <div className="flex items-center space-x-2 text-white">
                  <Terminal className="w-4 h-4 text-indigo-400" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200 font-mono">
                    External Player Quick-Launch (VLC / MPV)
                  </h3>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-950/80 text-emerald-400 border border-emerald-500/30">
                  IndexedDB Active
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="p-3 bg-slate-950/80 rounded-2xl border border-slate-800 space-y-1.5">
                  <span className="text-slate-400 text-[11px] font-mono block">File Relative Path:</span>
                  <div className="font-mono text-cyan-300 text-[11px] truncate">
                    {activeLecture.relativePath}
                  </div>
                  <button
                    onClick={handleCopyPath}
                    className="mt-1 px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-slate-200 rounded-lg text-[11px] font-medium flex items-center space-x-1 border border-slate-800 transition-colors cursor-pointer"
                  >
                    {copiedPath ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-slate-400" />}
                    <span>{copiedPath ? 'Copied Path!' : 'Copy Path'}</span>
                  </button>
                </div>

                <div className="p-3 bg-slate-950/80 rounded-2xl border border-slate-800 space-y-1.5">
                  <span className="text-slate-400 text-[11px] font-mono block">VLC Quick Command:</span>
                  <div className="font-mono text-slate-300 text-[11px] truncate">
                    vlc "{activeLecture.name}"
                  </div>
                  <div className="flex items-center space-x-2 pt-1">
                    <button
                      onClick={handleCopyVlcCmd}
                      className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-slate-200 rounded-lg text-[11px] font-medium flex items-center space-x-1 border border-slate-800 transition-colors cursor-pointer"
                    >
                      {copiedCmd ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-slate-400" />}
                      <span>{copiedCmd ? 'Copied Cmd!' : 'Copy Command'}</span>
                    </button>
                    <a
                      href={`vlc://${encodeURIComponent(activeLecture.relativePath)}`}
                      className="px-2.5 py-1 bg-indigo-950/80 hover:bg-indigo-900 border border-indigo-800/80 text-indigo-300 rounded-lg text-[11px] font-medium flex items-center space-x-1"
                      title="Trigger VLC URL protocol handler if registered"
                    >
                      <ExternalLink className="w-3 h-3" />
                      <span>Launch Protocol</span>
                    </a>
                  </div>
                </div>
              </div>

              {/* External Progress Sync Helper */}
              <div className="pt-2 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex items-center space-x-2">
                  <Sliders className="w-4 h-4 text-amber-400" />
                  <span className="text-slate-300 font-medium">Sync external watch position:</span>
                  <input
                    type="number"
                    min="0"
                    value={manualSyncSec}
                    onChange={(e) => setManualSyncSec(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-20 px-2 py-1 bg-slate-950 border border-slate-800 rounded-lg text-center font-mono text-white text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <span className="font-mono text-indigo-400 font-semibold">({formatDuration(manualSyncSec)})</span>
                </div>
                <button
                  onClick={handleSaveManualProgress}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold transition-colors cursor-pointer shadow-xs"
                >
                  Save Timestamp to IndexedDB
                </button>
              </div>
            </div>
          )}

          {/* Lecture Info Card */}
          <div className="bg-slate-900/80 border border-slate-800/80 rounded-3xl p-5 shadow-sm space-y-3 backdrop-blur-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <h2 className="text-lg font-bold text-white tracking-tight">{activeLecture.name}</h2>
              <div className="flex items-center space-x-2 text-xs font-mono text-slate-400">
                <span className="px-2 py-0.5 rounded-md bg-slate-950 border border-slate-800 uppercase font-semibold text-cyan-300">
                  {activeLecture.ext}
                </span>
                <span>{formatBytes(activeLecture.size)}</span>
              </div>
            </div>

            <div className="text-xs font-mono text-slate-400 truncate bg-slate-950 p-2 rounded-xl border border-slate-800 flex items-center justify-between">
              <span className="truncate">📁 {activeLecture.relativePath}</span>
              <button
                onClick={() => singleFileInputRef.current?.click()}
                className="text-[11px] text-indigo-400 hover:text-indigo-300 underline shrink-0 ml-2 cursor-pointer"
              >
                Change File
              </button>
            </div>

            <div className="pt-1 flex items-center space-x-4 text-xs text-slate-300 font-mono">
              <div className="flex items-center space-x-1.5">
                <Clock className="w-3.5 h-3.5 text-indigo-400" />
                <span>
                  Position: <strong className="text-white">{formatDuration(currentTime)}</strong> /{' '}
                  {formatDuration(duration || activeLecture.durationSec)}
                </span>
              </div>
              <span className="text-slate-600">•</span>
              <span className="text-slate-400">Auto-saved to local IndexedDB</span>
            </div>
          </div>
        </div>

        {/* Quick Notes & Bookmarks Column */}
        <div className="space-y-4">
          <div className="bg-slate-900/80 border border-slate-800/80 rounded-3xl p-5 shadow-sm flex flex-col h-[560px] backdrop-blur-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
              <div className="flex items-center space-x-2 text-slate-200">
                <Bookmark className="w-4 h-4 text-indigo-400" />
                <h3 className="font-bold text-sm">Timestamped Notes</h3>
              </div>
              <button
                onClick={() => openNotesDrawer(activeLecture)}
                className="text-xs text-indigo-400 hover:text-indigo-300 font-mono font-medium underline cursor-pointer"
              >
                Expand Drawer &rarr;
              </button>
            </div>

            {/* Note Add Form */}
            <form onSubmit={handleAddNote} className="pt-3 pb-4 border-b border-slate-800/80 space-y-2">
              <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                <span>Current playhead:</span>
                <span className="text-indigo-400 font-bold">
                  {formatDuration(currentTime)}
                </span>
              </div>
              <textarea
                value={newNoteText}
                onChange={(e) => setNewNoteText(e.target.value)}
                placeholder="Write a note or key takeaway..."
                rows={2}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <button
                type="submit"
                disabled={!newNoteText.trim()}
                className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-xl text-xs font-semibold flex items-center justify-center space-x-1.5 transition-colors cursor-pointer shadow-[0_0_10px_rgba(99,102,241,0.2)]"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Bookmark at {formatDuration(currentTime)}</span>
              </button>
            </form>

            {/* Notes List */}
            <div className="flex-1 overflow-y-auto pt-3 space-y-2.5">
              {notes.length === 0 ? (
                <div className="text-center py-12 text-slate-500 text-xs">
                  <Bookmark className="w-8 h-8 mx-auto mb-2 text-slate-700" />
                  <p>No notes or bookmarks yet.</p>
                  <p className="text-[11px] mt-1 text-slate-500 font-mono">Capture key timestamps as you study.</p>
                </div>
              ) : (
                notes.map((note) => (
                  <div
                    key={note.id}
                    className="p-3 bg-slate-950/70 hover:bg-slate-950 border border-slate-800 rounded-2xl text-xs space-y-1.5 transition-colors group shadow-2xs"
                  >
                    <div className="flex items-center justify-between">
                      <button
                        onClick={() => handleJumpToTimestamp(note.timestampSec)}
                        className="font-mono font-bold text-indigo-400 hover:text-indigo-300 underline flex items-center space-x-1 cursor-pointer"
                      >
                        <Clock className="w-3 h-3" />
                        <span>{formatDuration(note.timestampSec)}</span>
                      </button>
                      <button
                        onClick={() => handleDeleteNote(note.id)}
                        className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-rose-400 transition-opacity cursor-pointer"
                        title="Delete note"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <p className="text-slate-200 text-xs leading-relaxed">{note.content}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
