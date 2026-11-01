import React, { useState, useRef } from 'react';
import { useCourseStore } from '../store/courseContext';
import { Course, DiagnosticItem, Lecture, ScanStats } from '../types';
import { db } from '../db/indexedDB';
import {
  isFileSystemAccessSupported,
  pickNativeDirectory,
  UnifiedFileEntry
} from '../scanner/fsAdapter';
import { sessionFileStore } from '../scanner/fileStore';
import {
  scanDirectoryHandle,
  scanWebkitFileList,
  determineSupportState,
  extractFileExtension
} from '../scanner/scanner';
import {
  Folder,
  FolderSearch,
  Upload,
  AlertTriangle,
  CheckCircle2,
  X,
  Loader2,
  FileCode2,
  Layers,
  FileVideo,
  AlertCircle,
  Film
} from 'lucide-react';
import { DiagnosticsModal } from './DiagnosticsModal';

type Step = 'pick' | 'name' | 'scanning' | 'complete' | 'error';

export const AddCourseModal: React.FC = () => {
  const { isAddCourseOpen, closeAddCourseModal, refreshAllCourses, switchCourse } = useCourseStore();

  const [step, setStep] = useState<Step>('pick');
  const [folderName, setFolderName] = useState('');
  const [courseName, setCourseName] = useState('');
  const [selectedHandle, setSelectedHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [selectedFileList, setSelectedFileList] = useState<FileList | null>(null);

  const [scanStats, setScanStats] = useState<ScanStats | null>(null);
  const [scanEntries, setScanEntries] = useState<UnifiedFileEntry[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [registeredCourseId, setRegisteredCourseId] = useState<string | null>(null);

  const [isDiagnosticOpen, setIsDiagnosticOpen] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const multiFileInputRef = useRef<HTMLInputElement | null>(null);

  if (!isAddCourseOpen) return null;

  const resetState = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setStep('pick');
    setFolderName('');
    setCourseName('');
    setSelectedHandle(null);
    setSelectedFileList(null);
    setScanStats(null);
    setScanEntries([]);
    setErrorMessage(null);
    setRegisteredCourseId(null);
  };

  const handleClose = () => {
    resetState();
    closeAddCourseModal();
  };

  // Step 1: Select directory via Native File System Access API
  const handleNativeDirectoryPick = async () => {
    try {
      setErrorMessage(null);
      const handle = await pickNativeDirectory();
      setSelectedHandle(handle);
      setFolderName(handle.name);
      setCourseName(handle.name);
      setStep('name');
    } catch (err: any) {
      if (err.name === 'AbortError') {
        // User cancelled picker dialog - zero changes
        return;
      }
      if (
        err.name === 'SecurityError' ||
        err.message?.includes('Cross-origin') ||
        err.message?.includes('sub frames') ||
        err.message?.includes('allow attribute')
      ) {
        setErrorMessage(
          'Native directory picker is restricted in this browser frame. Use "Select Folder via Browser Input" or "Select Video Files Directly" below.'
        );
        return;
      }
      setErrorMessage(err.message || 'Failed to select directory');
    }
  };

  // Step 1 Fallback A: Select directory via <input webkitdirectory>
  const handleFallbackDirectoryPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    // Derive root folder name from webkitRelativePath
    const sample = files[0].webkitRelativePath || files[0].name;
    const rootName = sample.includes('/') ? sample.split('/')[0] : 'Imported Course';

    setSelectedFileList(files);
    setFolderName(rootName);
    setCourseName(rootName);
    setStep('name');
  };

  // Step 1 Fallback B: Select video files directly (single or multiple)
  const handleDirectFilesPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const first = files[0];
    const derivedName = first.name.replace(/\.[^/.]+$/, '');
    const folderDisplay = files.length === 1 ? first.name : `${files.length} Video Lectures`;

    setSelectedFileList(files);
    setFolderName(folderDisplay);
    setCourseName(files.length === 1 ? derivedName : 'My Video Lectures');
    setStep('name');
  };

  // Step 2 -> 3: Start live scan and batch persist
  const startScanAndRegistration = async () => {
    if (!courseName.trim()) {
      setErrorMessage('Please provide a course name.');
      return;
    }

    setStep('scanning');
    setErrorMessage(null);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const courseId = crypto.randomUUID();
    const isNative = !!selectedHandle;

    try {
      let resultStats: ScanStats;
      let entries: UnifiedFileEntry[];

      if (isNative && selectedHandle) {
        const scanRes = await scanDirectoryHandle(selectedHandle, {
          signal: abortController.signal,
          onProgress: (live) => setScanStats({ ...live })
        });
        resultStats = scanRes.stats;
        entries = scanRes.entries;
      } else if (selectedFileList) {
        const scanRes = scanWebkitFileList(selectedFileList, {
          signal: abortController.signal,
          onProgress: (live) => setScanStats({ ...live })
        });
        resultStats = scanRes.stats;
        entries = scanRes.entries;
      } else {
        throw new Error('No folder source selected.');
      }

      setScanStats(resultStats);
      setScanEntries(entries);

      if (resultStats.status === 'cancelled') {
        // Cancelled by user - zero changes to DB
        resetState();
        return;
      }

      // Phase 4: Register course and candidates in IndexedDB
      setStep('scanning');
      resultStats.status = 'registering';
      setScanStats({ ...resultStats });

      const newCourse: Course = {
        id: courseId,
        name: courseName.trim(),
        folderName: folderName || 'Course Folder',
        rootHandle: selectedHandle || null,
        connectionState: isNative ? 'connected' : 'unsupported_api',
        createdAt: Date.now(),
        lastActivityAt: Date.now(),
        isArchived: false
      };

      await db.saveCourse(newCourse);

      // Register raw files in session store if available
      if (selectedFileList) {
        sessionFileStore.registerFiles(courseId, selectedFileList);
      }

      // Map scanned file entries into Lecture records and link in sessionFileStore
      const lecturesToSave: Lecture[] = entries.map((entry) => {
        const ext = extractFileExtension(entry.name);
        const lectureId = crypto.randomUUID();

        // Store file object in session cache for instant playback
        if (entry.fileObj) {
          sessionFileStore.storeFile(courseId, lectureId, entry.fileObj, entry.relativePath);
        }

        return {
          id: lectureId,
          courseId,
          name: entry.name,
          relativePath: entry.relativePath,
          size: entry.size,
          lastModified: entry.lastModified,
          ext,
          supportState: determineSupportState(ext),
          fileHandle: entry.handle || null
        };
      });

      // Save lectures in batched transactions (~300 per batch)
      await db.saveLecturesBatched(lecturesToSave, 300);

      resultStats.newlyRegistered = lecturesToSave.length;
      resultStats.status = 'completed';
      setScanStats({ ...resultStats });

      // Refresh DB state
      await refreshAllCourses();

      setRegisteredCourseId(courseId);
      setStep('complete');
    } catch (err: any) {
      if (err.name === 'AbortError') {
        resetState();
        return;
      }
      console.error('Registration failed:', err);
      setErrorMessage(err.message || 'Course registration failed.');
      setStep('error');
    } finally {
      abortControllerRef.current = null;
    }
  };

  const handleCancelScan = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    resetState();
    closeAddCourseModal();
  };

  const handleOpenRegisteredCourse = async () => {
    if (registeredCourseId) {
      await switchCourse(registeredCourseId);
    }
    handleClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-150">
      <div className="bg-slate-900 border border-slate-800/90 rounded-3xl w-full max-w-xl shadow-2xl text-slate-100 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800/80 bg-slate-900/95 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <FolderSearch className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white tracking-tight">+ Add Course</h3>
              <p className="text-[11px] text-slate-400 font-mono">Scan & register local video lectures</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6">
          {errorMessage && (
            <div className="mb-4 p-3.5 bg-rose-950/60 border border-rose-800/80 rounded-xl text-xs text-rose-300 flex items-start space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
              <div>
                <p className="font-semibold">Error occurred</p>
                <p>{errorMessage}</p>
              </div>
            </div>
          )}

          {/* STEP 1: PICK FOLDER OR VIDEO FILES */}
          {step === 'pick' && (
            <div className="space-y-4">
              <p className="text-xs text-slate-300 leading-relaxed">
                Add local video lectures on your device. Everything runs 100% locally in your browser. No files or data are uploaded anywhere.
              </p>

              <div className="space-y-3">
                {isFileSystemAccessSupported() && (
                  <button
                    onClick={handleNativeDirectoryPick}
                    className="w-full p-4 border border-indigo-500/40 hover:border-indigo-400 hover:bg-indigo-950/20 rounded-2xl flex items-center space-x-3 transition-all cursor-pointer group text-left"
                  >
                    <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center shrink-0 text-indigo-400 group-hover:scale-105 transition-transform">
                      <Folder className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-semibold text-xs sm:text-sm text-white">Choose Folder (Native Access)</div>
                      <div className="text-[11px] text-slate-400">
                        Select an entire directory with full folder hierarchy and persistent access.
                      </div>
                    </div>
                  </button>
                )}

                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full p-4 border border-slate-800 hover:border-slate-700 hover:bg-slate-850/50 rounded-2xl flex items-center space-x-3 transition-all cursor-pointer group text-left"
                >
                  <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0 text-slate-300 group-hover:scale-105 transition-transform">
                    <Upload className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-semibold text-xs sm:text-sm text-white">Select Folder (Browser Input)</div>
                    <div className="text-[11px] text-slate-400">
                      Standard folder import: works in all browsers and sandboxed environments.
                    </div>
                  </div>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  // @ts-ignore
                  webkitdirectory="true"
                  directory="true"
                  multiple
                  className="hidden"
                  onChange={handleFallbackDirectoryPick}
                />

                <button
                  onClick={() => multiFileInputRef.current?.click()}
                  className="w-full p-4 border border-emerald-500/30 hover:border-emerald-400/60 hover:bg-emerald-950/20 rounded-2xl flex items-center space-x-3 transition-all cursor-pointer group text-left"
                >
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center shrink-0 text-emerald-400 group-hover:scale-105 transition-transform">
                    <Film className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-semibold text-xs sm:text-sm text-white">Select Video Files Directly</div>
                    <div className="text-[11px] text-emerald-300/80">
                      Pick individual or multiple video files (MP4, WebM, MKV, etc.) to start tracking and playing immediately.
                    </div>
                  </div>
                </button>
                <input
                  ref={multiFileInputRef}
                  type="file"
                  multiple
                  accept="video/*,.mp4,.webm,.ogg,.mov,.m4v,.mkv,.avi,.3gp"
                  className="hidden"
                  onChange={handleDirectFilesPick}
                />
              </div>
            </div>
          )}

          {/* STEP 2: NAME COURSE */}
          {step === 'name' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Folder Selected</label>
                <div className="px-3 py-2 bg-slate-950 rounded-lg border border-slate-800 text-xs font-mono text-slate-300 truncate">
                  {folderName}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Course Display Name
                </label>
                <input
                  type="text"
                  value={courseName}
                  onChange={(e) => setCourseName(e.target.value)}
                  placeholder="e.g., MIT 6.006 - Introduction to Algorithms"
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  autoFocus
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Pre-filled from folder name. You can customize it at any time without resetting progress.
                </p>
              </div>

              <div className="pt-4 flex items-center justify-end space-x-3">
                <button
                  onClick={() => setStep('pick')}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-lg transition-colors cursor-pointer"
                >
                  Back
                </button>
                <button
                  onClick={startScanAndRegistration}
                  disabled={!courseName.trim()}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors cursor-pointer"
                >
                  Start Scan & Register
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: SCANNING / REGISTERING WITH LIVE STATS */}
          {step === 'scanning' && scanStats && (
            <div className="space-y-4">
              <div className="flex items-center space-x-3 pb-2">
                <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />
                <div>
                  <h4 className="text-sm font-semibold text-white">
                    {scanStats.status === 'registering'
                      ? 'Registering lectures into IndexedDB...'
                      : 'Scanning directory tree recursively...'}
                  </h4>
                  <p className="text-[11px] text-slate-400 font-mono">
                    Descending into nested folders, checking extensions case-insensitively.
                  </p>
                </div>
              </div>

              {/* Real-time Counter Matrix */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
                <div className="p-2.5 bg-slate-950 rounded-lg border border-slate-800">
                  <div className="flex items-center space-x-1.5 text-slate-400 mb-1">
                    <Layers className="w-3.5 h-3.5" />
                    <span>Folders Visited</span>
                  </div>
                  <span className="text-base font-bold text-slate-200">{scanStats.directoriesVisited}</span>
                </div>

                <div className="p-2.5 bg-slate-950 rounded-lg border border-slate-800">
                  <div className="flex items-center space-x-1.5 text-slate-400 mb-1">
                    <FileCode2 className="w-3.5 h-3.5" />
                    <span>Files Examined</span>
                  </div>
                  <span className="text-base font-bold text-slate-200">{scanStats.filesExamined}</span>
                </div>

                <div className="p-2.5 bg-slate-950 rounded-lg border border-slate-800">
                  <div className="flex items-center space-x-1.5 text-indigo-400 mb-1">
                    <FileVideo className="w-3.5 h-3.5" />
                    <span>Candidates Found</span>
                  </div>
                  <span className="text-base font-bold text-indigo-400">{scanStats.candidatesFound}</span>
                </div>

                <div className="p-2.5 bg-slate-950 rounded-lg border border-slate-800">
                  <div className="flex items-center space-x-1.5 text-amber-400 mb-1">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>Unsupported</span>
                  </div>
                  <span className="text-base font-bold text-amber-400">{scanStats.unsupported}</span>
                </div>

                <div className="p-2.5 bg-slate-950 rounded-lg border border-slate-800">
                  <div className="flex items-center space-x-1.5 text-rose-400 mb-1">
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span>Skipped / Errors</span>
                  </div>
                  <span className="text-base font-bold text-rose-400">
                    {scanStats.skippedInaccessible + scanStats.errors}
                  </span>
                </div>

                <div className="p-2.5 bg-slate-950 rounded-lg border border-slate-800">
                  <div className="flex items-center space-x-1.5 text-emerald-400 mb-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Registered</span>
                  </div>
                  <span className="text-base font-bold text-emerald-400">
                    {scanStats.newlyRegistered || scanEntries.length}
                  </span>
                </div>
              </div>

              {/* Diagnostic Toggle */}
              {scanStats.diagnostics.length > 0 && (
                <div className="pt-2">
                  <button
                    onClick={() => setIsDiagnosticOpen(true)}
                    className="text-xs text-indigo-400 hover:text-indigo-300 underline font-medium flex items-center space-x-1 cursor-pointer"
                  >
                    <span>View Live Diagnostic Report ({scanStats.diagnostics.length} entries)</span>
                  </button>
                </div>
              )}

              {/* Cancel Button */}
              <div className="pt-3 flex justify-end">
                <button
                  onClick={handleCancelScan}
                  className="px-4 py-2 bg-rose-950/60 hover:bg-rose-900 border border-rose-800/80 text-rose-300 text-xs font-medium rounded-lg transition-colors cursor-pointer"
                >
                  Cancel Scan (Zero Changes)
                </button>
              </div>
            </div>
          )}

          {/* STEP 4: COMPLETED SUMMARY */}
          {step === 'complete' && scanStats && (
            <div className="space-y-4 text-center py-2">
              <div className="w-12 h-12 rounded-full bg-emerald-950/80 border border-emerald-700/60 flex items-center justify-center text-emerald-400 mx-auto">
                <CheckCircle2 className="w-6 h-6" />
              </div>

              <div>
                <h4 className="text-base font-bold text-white">Course Registered Successfully</h4>
                <p className="text-xs text-slate-400 mt-0.5">
                  All candidate lectures are safely persisted in your local IndexedDB database.
                </p>
              </div>

              {/* Complete metrics breakdown */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-xs text-left space-y-2">
                <div className="flex justify-between py-1 border-b border-slate-800/80">
                  <span className="text-slate-400">Course:</span>
                  <span className="font-semibold text-white">{courseName}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800/80">
                  <span className="text-slate-400">Video Candidates Found:</span>
                  <span className="font-mono text-indigo-400 font-semibold">{scanStats.candidatesFound}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800/80">
                  <span className="text-slate-400">Registered Lectures:</span>
                  <span className="font-mono text-emerald-400 font-semibold">{scanStats.newlyRegistered}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800/80">
                  <span className="text-slate-400">Browser Playable:</span>
                  <span className="font-mono text-slate-300">
                    {scanStats.candidatesFound - scanStats.unsupported}
                  </span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-400">Unsupported Formats (registered as such):</span>
                  <span className="font-mono text-amber-400">{scanStats.unsupported}</span>
                </div>
              </div>

              {scanStats.diagnostics.length > 0 && (
                <div className="text-left">
                  <button
                    onClick={() => setIsDiagnosticOpen(true)}
                    className="text-xs text-indigo-400 hover:text-indigo-300 underline font-medium cursor-pointer"
                  >
                    View Diagnostic Report for Skips & Unsupported Codecs ({scanStats.diagnostics.length})
                  </button>
                </div>
              )}

              <div className="pt-4 flex items-center justify-end space-x-3">
                <button
                  onClick={handleClose}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-lg transition-colors cursor-pointer"
                >
                  Close & Stay Here
                </button>
                <button
                  onClick={handleOpenRegisteredCourse}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-lg shadow-sm transition-colors cursor-pointer"
                >
                  Open Course Now
                </button>
              </div>
            </div>
          )}

          {/* STEP 5: ERROR STATE */}
          {step === 'error' && (
            <div className="space-y-4 py-2">
              <div className="p-4 bg-rose-950/40 border border-rose-800/60 rounded-xl text-xs text-rose-300 space-y-2">
                <p className="font-bold text-sm text-rose-200">Registration halted</p>
                <p>
                  No changes were applied to your prior courses or database state. You can safely retry or
                  select another folder.
                </p>
              </div>
              <div className="flex justify-end space-x-2">
                <button
                  onClick={handleClose}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-lg transition-colors cursor-pointer"
                >
                  Close
                </button>
                <button
                  onClick={() => setStep('pick')}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-lg transition-colors cursor-pointer"
                >
                  Try Again
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Diagnostics Modal for full skip accounting */}
      {scanStats && (
        <DiagnosticsModal
          isOpen={isDiagnosticOpen}
          onClose={() => setIsDiagnosticOpen(false)}
          title={`Diagnostics for ${courseName || folderName}`}
          diagnostics={scanStats.diagnostics}
          summaryCounts={{
            candidatesFound: scanStats.candidatesFound,
            registered: scanStats.newlyRegistered,
            unsupported: scanStats.unsupported,
            skipped: scanStats.skippedInaccessible,
            errors: scanStats.errors
          }}
        />
      )}
    </div>
  );
};
