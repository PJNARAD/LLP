/**
 * Course Management Context & Safe Course Switching
 *
 * Implements:
 * - Order-of-operations course switching with generation tokens
 * - Idempotent progress persistence
 * - Cross-course overview statistics & full analytics
 * - Native directory upgrade & reconnect
 * - Timestamped notes drawer state
 * - Full JSON backup export/import
 */

import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import {
  AppBackupPayload,
  Course,
  CourseStats,
  DiagnosticItem,
  Lecture,
  OverallAnalytics,
  Progress,
  ScanStats
} from '../types';
import { db } from '../db/indexedDB';
import { lockCourseScan, unlockCourseScan, reconcileScannedLectures } from '../scanner/rescan';
import { scanDirectoryHandle } from '../scanner/scanner';
import { pickNativeDirectory, verifyHandlePermission } from '../scanner/fsAdapter';
import { computeStudyStreakAndActivity } from '../utils/streakCalculator';

export type AppView = 'dashboard' | 'library' | 'course' | 'player';

interface PendingProgressSave {
  courseId: string;
  lectureId: string;
  positionSec: number;
  durationSec?: number;
  completed: boolean;
  updatedAt: number;
}

interface CourseContextValue {
  courses: Course[];
  currentCourse: Course | null;
  lectures: Lecture[];
  progressMap: Map<string, Progress>;
  activeLecture: Lecture | null;
  activeView: AppView;
  courseStats: CourseStats;
  crossCourseStats: {
    totalCourses: number;
    totalLectures: number;
    completedLectures: number;
    inProgressLectures: number;
    overallCompletionPct: number;
  };
  overallAnalytics: OverallAnalytics;
  continueWatching: { course: Course; lecture: Lecture; progress: Progress } | null;
  isScanning: boolean;
  activeScanStats: ScanStats | null;
  isAddCourseOpen: boolean;
  lastDiagnosticReport: DiagnosticItem[] | null;

  // Notes Drawer State (Feature 3)
  isNotesDrawerOpen: boolean;
  notesDrawerLecture: Lecture | null;
  openNotesDrawer: (lecture: Lecture) => void;
  closeNotesDrawer: () => void;

  // Analytics Modal State (Feature 4)
  isAnalyticsModalOpen: boolean;
  openAnalyticsModal: () => void;
  closeAnalyticsModal: () => void;

  // Video Player Seek Request
  targetSeekTime: number | null;
  seekTo: (seconds: number) => void;
  clearSeekTarget: () => void;

  // Actions
  setActiveView: (view: AppView) => void;
  openAddCourseModal: () => void;
  closeAddCourseModal: () => void;
  switchCourse: (courseId: string, targetLectureId?: string) => Promise<boolean>;
  selectLecture: (lecture: Lecture, seekSec?: number) => Promise<void>;
  updateLectureProgress: (
    lectureId: string,
    positionSec: number,
    durationSec?: number,
    completed?: boolean,
    forceImmediateFlush?: boolean
  ) => Promise<void>;
  flushPendingProgress: () => Promise<void>;
  renameCourse: (courseId: string, newName: string) => Promise<void>;
  archiveCourse: (courseId: string) => Promise<void>;
  deleteCoursePermanently: (courseId: string) => Promise<void>;
  reconnectCourse: (courseId: string) => Promise<boolean>;
  upgradeCourseToNativeAccess: (courseId: string) => Promise<boolean>;
  rescanCurrentCourse: () => Promise<ScanStats | null>;
  cancelActiveScan: () => void;
  refreshAllCourses: () => Promise<void>;
  setLastDiagnosticReport: (items: DiagnosticItem[] | null) => void;
  exportDatabaseBackup: () => Promise<AppBackupPayload>;
  importDatabaseBackup: (
    payload: AppBackupPayload,
    mode?: 'merge' | 'replace'
  ) => Promise<{ importedCourses: number; importedLectures: number; importedProgress: number; importedNotes: number }>;
}

const CourseContext = createContext<CourseContextValue | null>(null);

export const CourseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [courses, setCourses] = useState<Course[]>([]);
  const [currentCourse, setCurrentCourse] = useState<Course | null>(null);
  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [progressMap, setProgressMap] = useState<Map<string, Progress>>(new Map());
  const [activeLecture, setActiveLecture] = useState<Lecture | null>(null);
  const [activeView, setActiveView] = useState<AppView>('dashboard');
  const [allProgress, setAllProgress] = useState<Progress[]>([]);
  const [allLecturesGlobal, setAllLecturesGlobal] = useState<Lecture[]>([]);

  const [isScanning, setIsScanning] = useState(false);
  const [activeScanStats, setActiveScanStats] = useState<ScanStats | null>(null);
  const [isAddCourseOpen, setIsAddCourseOpen] = useState(false);
  const [lastDiagnosticReport, setLastDiagnosticReport] = useState<DiagnosticItem[] | null>(null);

  // Notes drawer state
  const [isNotesDrawerOpen, setIsNotesDrawerOpen] = useState(false);
  const [notesDrawerLecture, setNotesDrawerLecture] = useState<Lecture | null>(null);

  // Analytics modal state
  const [isAnalyticsModalOpen, setIsAnalyticsModalOpen] = useState(false);

  // Video player seek request
  const [targetSeekTime, setTargetSeekTime] = useState<number | null>(null);

  // References for concurrency control & safety
  const currentCourseIdRef = useRef<string | null>(null);
  const activeLectureIdRef = useRef<string | null>(null);
  const switchGenerationRef = useRef<number>(0);
  const pendingProgressRef = useRef<PendingProgressSave | null>(null);
  const scanAbortControllerRef = useRef<AbortController | null>(null);
  const flushTimerRef = useRef<any>(null);

  currentCourseIdRef.current = currentCourse ? currentCourse.id : null;
  activeLectureIdRef.current = activeLecture ? activeLecture.id : null;

  /**
   * Safe progress flush - ensures pending writes are committed to IndexedDB
   */
  const flushPendingProgress = useCallback(async (): Promise<void> => {
    if (flushTimerRef.current) {
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }

    const pending = pendingProgressRef.current;
    if (!pending) return;

    // Clear ref before awaiting write to avoid duplicate flushes
    pendingProgressRef.current = null;

    try {
      await db.saveProgress({
        courseId: pending.courseId,
        lectureId: pending.lectureId,
        positionSec: pending.positionSec,
        durationSec: pending.durationSec,
        completed: pending.completed,
        updatedAt: pending.updatedAt
      });

      // Update in-memory state cleanly
      setProgressMap((prev) => {
        const next = new Map(prev);
        next.set(pending.lectureId, {
          courseId: pending.courseId,
          lectureId: pending.lectureId,
          positionSec: pending.positionSec,
          durationSec: pending.durationSec,
          completed: pending.completed,
          updatedAt: pending.updatedAt
        });
        return next;
      });

      // Refresh cross-course progress
      const allProg = await db.getAllProgress();
      setAllProgress(allProg);
    } catch (err) {
      console.error('Failed to flush pending progress:', err);
    }
  }, []);

  /**
   * Update progress for a lecture. Batches/debounces periodic saves (~5s) or flushes immediately.
   */
  const updateLectureProgress = useCallback(
    async (
      lectureId: string,
      positionSec: number,
      durationSec?: number,
      completed?: boolean,
      forceImmediateFlush = false
    ): Promise<void> => {
      const courseId = currentCourseIdRef.current;
      if (!courseId) return;

      const existingProgress = progressMap.get(lectureId);
      const isCompleted = completed !== undefined ? completed : existingProgress?.completed || false;
      const effectiveDuration = durationSec || existingProgress?.durationSec;

      const record: PendingProgressSave = {
        courseId,
        lectureId,
        positionSec,
        durationSec: effectiveDuration,
        completed: isCompleted,
        updatedAt: Date.now()
      };

      pendingProgressRef.current = record;

      // Optimistically reflect in local progress map immediately for UI responsiveness
      setProgressMap((prev) => {
        const next = new Map(prev);
        next.set(lectureId, {
          courseId,
          lectureId,
          positionSec,
          durationSec: effectiveDuration,
          completed: isCompleted,
          updatedAt: record.updatedAt
        });
        return next;
      });

      if (forceImmediateFlush) {
        await flushPendingProgress();
      } else {
        if (!flushTimerRef.current) {
          flushTimerRef.current = setTimeout(() => {
            flushPendingProgress();
          }, 4000);
        }
      }
    },
    [flushPendingProgress, progressMap]
  );

  /**
   * Load courses from IndexedDB
   */
  const refreshAllCourses = useCallback(async () => {
    try {
      const loadedCourses = await db.getCourses(false);
      setCourses(loadedCourses);
      const loadedProgress = await db.getAllProgress();
      setAllProgress(loadedProgress);
      const allLectures = await db.getAllLectures();
      setAllLecturesGlobal(allLectures);
    } catch (err) {
      console.error('Error refreshing courses:', err);
    }
  }, []);

  useEffect(() => {
    refreshAllCourses();
  }, [refreshAllCourses]);

  // Visibility and page unload handlers for data safety
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flushPendingProgress();
      }
    };

    const handleBeforeUnload = () => {
      flushPendingProgress();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [flushPendingProgress]);

  /**
   * Safe Course Switching
   */
  const switchCourse = useCallback(
    async (targetCourseId: string, targetLectureId?: string): Promise<boolean> => {
      // Step 1: Flush pending progress
      await flushPendingProgress();

      // Step 2: Cancel running scan if any
      if (scanAbortControllerRef.current) {
        scanAbortControllerRef.current.abort();
        scanAbortControllerRef.current = null;
        setIsScanning(false);
      }

      // Increment switch generation token
      const currentGen = ++switchGenerationRef.current;

      try {
        // Step 3 & 4: Load target course from IndexedDB
        const targetCourse = await db.getCourseById(targetCourseId);
        if (!targetCourse || targetCourse.isArchived) {
          console.warn('Course not found or archived:', targetCourseId);
          return false;
        }

        const [loadedLectures, loadedProgress] = await Promise.all([
          db.getLecturesByCourse(targetCourseId),
          db.getProgressForCourse(targetCourseId)
        ]);

        // Generation check: if another switch happened while loading, discard stale result!
        if (switchGenerationRef.current !== currentGen) {
          return false;
        }

        const newProgressMap = new Map<string, Progress>();
        for (const p of loadedProgress) {
          newProgressMap.set(p.lectureId, p);
        }

        setCurrentCourse(targetCourse);
        setLectures(loadedLectures);
        setProgressMap(newProgressMap);

        if (targetLectureId) {
          const match = loadedLectures.find((l) => l.id === targetLectureId) || null;
          setActiveLecture(match);
          setActiveView(match ? 'player' : 'course');
        } else {
          setActiveLecture(null);
          setActiveView('course');
        }

        return true;
      } catch (err) {
        console.error('Error switching course:', err);
        return false;
      }
    },
    [flushPendingProgress]
  );

  const selectLecture = useCallback(
    async (lecture: Lecture, seekSec?: number): Promise<void> => {
      await flushPendingProgress();
      setActiveLecture(lecture);
      if (seekSec !== undefined) {
        setTargetSeekTime(seekSec);
      }
      setActiveView('player');
    },
    [flushPendingProgress]
  );

  const seekTo = useCallback((seconds: number) => {
    setTargetSeekTime(seconds);
  }, []);

  const clearSeekTarget = useCallback(() => {
    setTargetSeekTime(null);
  }, []);

  const openNotesDrawer = useCallback((lecture: Lecture) => {
    setNotesDrawerLecture(lecture);
    setIsNotesDrawerOpen(true);
  }, []);

  const closeNotesDrawer = useCallback(() => {
    setIsNotesDrawerOpen(false);
  }, []);

  const renameCourse = useCallback(
    async (courseId: string, newName: string): Promise<void> => {
      const course = await db.getCourseById(courseId);
      if (!course) return;
      course.name = newName.trim();
      await db.updateCourse(course);
      await refreshAllCourses();
      if (currentCourse && currentCourse.id === courseId) {
        setCurrentCourse({ ...course });
      }
    },
    [currentCourse, refreshAllCourses]
  );

  const archiveCourse = useCallback(
    async (courseId: string): Promise<void> => {
      await flushPendingProgress();
      await db.removeCourseFromLibrary(courseId);
      await refreshAllCourses();

      if (currentCourse && currentCourse.id === courseId) {
        setCurrentCourse(null);
        setActiveLecture(null);
        setLectures([]);
        setProgressMap(new Map());
        setActiveView('dashboard');
      }
    },
    [currentCourse, flushPendingProgress, refreshAllCourses]
  );

  const deleteCoursePermanently = useCallback(
    async (courseId: string): Promise<void> => {
      await flushPendingProgress();
      await db.deleteCoursePermanently(courseId);
      await refreshAllCourses();

      if (currentCourse && currentCourse.id === courseId) {
        setCurrentCourse(null);
        setActiveLecture(null);
        setLectures([]);
        setProgressMap(new Map());
        setActiveView('dashboard');
      }
    },
    [currentCourse, flushPendingProgress, refreshAllCourses]
  );

  const reconnectCourse = useCallback(
    async (courseId: string): Promise<boolean> => {
      const course = await db.getCourseById(courseId);
      if (!course) return false;

      if (!course.rootHandle) {
        return false;
      }

      const granted = await verifyHandlePermission(course.rootHandle, false);
      if (granted) {
        course.connectionState = 'connected';
        await db.updateCourse(course);
        await refreshAllCourses();
        if (currentCourse && currentCourse.id === courseId) {
          setCurrentCourse({ ...course });
        }
        return true;
      } else {
        course.connectionState = 'needs_permission';
        await db.updateCourse(course);
        await refreshAllCourses();
        return false;
      }
    },
    [currentCourse, refreshAllCourses]
  );

  /**
   * Feature 1: Upgrade / Switch Course to Native File System Access
   * Lets user pick the local folder with showDirectoryPicker(), links rootHandle & all lecture handles,
   * enabling seamless inline HTML5 video streaming without external players!
   */
  const upgradeCourseToNativeAccess = useCallback(
    async (courseId: string): Promise<boolean> => {
      try {
        const course = await db.getCourseById(courseId);
        if (!course) return false;

        const handle = await pickNativeDirectory();
        course.rootHandle = handle;
        course.connectionState = 'connected';

        // Scan folder using native directory handle
        const scanRes = await scanDirectoryHandle(handle);
        const existing = await db.getLecturesByCourse(courseId);

        // Reconcile handles with existing lectures
        const plan = await reconcileScannedLectures(courseId, existing, scanRes.entries);
        await db.saveLecturesBatched(plan.lecturesToSave);
        await db.updateCourse(course);

        await refreshAllCourses();

        if (currentCourse && currentCourse.id === courseId) {
          setCurrentCourse({ ...course });
          const refreshed = await db.getLecturesByCourse(courseId);
          setLectures(refreshed);
          if (activeLecture) {
            const updatedActive = refreshed.find((l) => l.id === activeLecture.id);
            if (updatedActive) setActiveLecture(updatedActive);
          }
        }
        return true;
      } catch (err: any) {
        if (err.name === 'AbortError') return false;
        console.error('Failed to upgrade course to native access:', err);
        return false;
      }
    },
    [currentCourse, activeLecture, refreshAllCourses]
  );

  const cancelActiveScan = useCallback(() => {
    if (scanAbortControllerRef.current) {
      scanAbortControllerRef.current.abort();
      scanAbortControllerRef.current = null;
    }
    setIsScanning(false);
  }, []);

  const rescanCurrentCourse = useCallback(async (): Promise<ScanStats | null> => {
    if (!currentCourse) return null;
    const courseId = currentCourse.id;

    if (!lockCourseScan(courseId)) {
      console.warn('Scan already in progress for course:', courseId);
      return null;
    }

    await flushPendingProgress();

    const abortController = new AbortController();
    scanAbortControllerRef.current = abortController;
    setIsScanning(true);

    try {
      let scanResult;
      if (currentCourse.rootHandle) {
        const hasPermission = await verifyHandlePermission(currentCourse.rootHandle);
        if (!hasPermission) {
          currentCourse.connectionState = 'needs_permission';
          await db.updateCourse(currentCourse);
          unlockCourseScan(courseId);
          setIsScanning(false);
          return null;
        }

        scanResult = await scanDirectoryHandle(currentCourse.rootHandle, {
          signal: abortController.signal,
          onProgress: (stats) => setActiveScanStats(stats)
        });
      } else {
        unlockCourseScan(courseId);
        setIsScanning(false);
        return null;
      }

      // Reconcile
      const existing = await db.getLecturesByCourse(courseId);
      const plan = await reconcileScannedLectures(courseId, existing, scanResult.entries);

      await db.saveLecturesBatched(plan.lecturesToSave);

      scanResult.stats.matchedExisting = plan.matchedCount;
      scanResult.stats.newlyRegistered = plan.newlyRegisteredCount;

      setLastDiagnosticReport(scanResult.stats.diagnostics);

      const refreshedLectures = await db.getLecturesByCourse(courseId);
      setLectures(refreshedLectures);
      await refreshAllCourses();

      return scanResult.stats;
    } catch (err: any) {
      console.error('Rescan failed:', err);
      return null;
    } finally {
      unlockCourseScan(courseId);
      setIsScanning(false);
      scanAbortControllerRef.current = null;
    }
  }, [currentCourse, flushPendingProgress, refreshAllCourses]);

  // Compute CourseStats for currentCourse
  const courseStats: CourseStats = React.useMemo(() => {
    let completedLectures = 0;
    let inProgressLectures = 0;
    let notStartedLectures = 0;
    let unsupportedLectures = 0;
    let missingLectures = 0;
    let totalDurationSec = 0;
    let remainingDurationSec = 0;
    let hasUnknownDuration = false;

    for (const lec of lectures) {
      if (lec.supportState === 'unsupported_format') {
        unsupportedLectures++;
      } else if (lec.supportState === 'missing_source') {
        missingLectures++;
      }

      const p = progressMap.get(lec.id);
      if (p && p.completed) {
        completedLectures++;
      } else if (p && p.positionSec > 5) {
        inProgressLectures++;
      } else {
        notStartedLectures++;
      }

      if (lec.durationSec) {
        totalDurationSec += lec.durationSec;
        const pos = p ? p.positionSec : 0;
        const rem = Math.max(0, lec.durationSec - pos);
        remainingDurationSec += rem;
      } else {
        hasUnknownDuration = true;
      }
    }

    const totalLectures = lectures.length;
    const completionPercentage = totalLectures > 0 ? Math.round((completedLectures / totalLectures) * 100) : 0;

    return {
      totalLectures,
      completedLectures,
      inProgressLectures,
      notStartedLectures,
      unsupportedLectures,
      missingLectures,
      completionPercentage,
      totalDurationSec,
      remainingDurationSec,
      hasUnknownDuration
    };
  }, [lectures, progressMap]);

  // Cross-course overview
  const crossCourseStats = React.useMemo(() => {
    const totalCourses = courses.length;
    let completedLectures = 0;
    let inProgressLectures = 0;

    for (const p of allProgress) {
      if (p.completed) {
        completedLectures++;
      } else if (p.positionSec > 5) {
        inProgressLectures++;
      }
    }

    const totalLectures = Math.max(allLecturesGlobal.length, allProgress.length);
    const overallCompletionPct = totalLectures > 0 ? Math.round((completedLectures / totalLectures) * 100) : 0;

    return {
      totalCourses,
      totalLectures,
      completedLectures,
      inProgressLectures,
      overallCompletionPct
    };
  }, [courses, allProgress, allLecturesGlobal]);

  // Overall Analytics (Feature 4)
  const overallAnalytics: OverallAnalytics = React.useMemo(() => {
    let totalWatchTimeSec = 0;
    let completedLectures = 0;
    let inProgressLectures = 0;
    let notStartedLectures = 0;
    let unsupportedLectures = 0;
    let totalSizeBytes = 0;
    const formatBreakdown: Record<string, number> = {};

    const now = Date.now();
    const sevenDaysAgo = now - 7 * 86400 * 1000;
    let recentActivityCount7d = 0;
    let completionsLast7d = 0;

    for (const p of allProgress) {
      if (p.positionSec > 0) {
        totalWatchTimeSec += p.positionSec;
      }
      if (p.updatedAt >= sevenDaysAgo) {
        recentActivityCount7d++;
        if (p.completed) {
          completionsLast7d++;
        }
      }
    }

    let totalDurationSec = 0;
    let totalRemainingSec = 0;

    for (const lec of allLecturesGlobal) {
      totalSizeBytes += lec.size || 0;
      const fmt = (lec.ext || 'unknown').toLowerCase();
      formatBreakdown[fmt] = (formatBreakdown[fmt] || 0) + 1;

      if (lec.supportState === 'unsupported_format') {
        unsupportedLectures++;
      }

      const p = allProgress.find((prog) => prog.lectureId === lec.id && prog.courseId === lec.courseId);
      if (p?.completed) {
        completedLectures++;
      } else if (p && p.positionSec > 5) {
        inProgressLectures++;
      } else {
        notStartedLectures++;
      }

      if (lec.durationSec) {
        totalDurationSec += lec.durationSec;
        const pos = p ? p.positionSec : 0;
        totalRemainingSec += Math.max(0, lec.durationSec - pos);
      }
    }

    const totalLectures = allLecturesGlobal.length;
    const remaining = totalLectures - completedLectures;
    const velocityLecturesPerWeek = completionsLast7d > 0 ? completionsLast7d : Math.max(1, Math.round(recentActivityCount7d * 0.4));
    const projectedCompletionDays =
      velocityLecturesPerWeek > 0 && remaining > 0
        ? Math.ceil((remaining / velocityLecturesPerWeek) * 7)
        : null;

    const overallCompletionPct = totalLectures > 0 ? Math.round((completedLectures / totalLectures) * 100) : 0;

    const { streakInfo, activityHistory } = computeStudyStreakAndActivity(allProgress, now);

    return {
      totalWatchTimeSec,
      totalSizeBytes,
      totalCourses: courses.length,
      totalLectures,
      completedLectures,
      inProgressLectures,
      notStartedLectures,
      unsupportedLectures,
      overallCompletionPct,
      recentActivityCount7d,
      velocityLecturesPerWeek,
      projectedCompletionDays,
      formatBreakdown,
      totalDurationSec,
      totalRemainingSec,
      streakInfo,
      activityHistory
    };
  }, [allProgress, allLecturesGlobal, courses]);

  // Continue Watching candidate
  const [continueWatching, setContinueWatching] = useState<{
    course: Course;
    lecture: Lecture;
    progress: Progress;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function findContinueWatching() {
      if (courses.length === 0 || allProgress.length === 0) {
        setContinueWatching(null);
        return;
      }

      const inProgressList = allProgress
        .filter((p) => !p.completed && p.positionSec > 0)
        .sort((a, b) => b.updatedAt - a.updatedAt);

      if (inProgressList.length === 0) {
        setContinueWatching(null);
        return;
      }

      for (const candidate of inProgressList) {
        const course = courses.find((c) => c.id === candidate.courseId);
        if (!course) continue;

        const courseLectures = await db.getLecturesByCourse(course.id);
        const lecture = courseLectures.find((l) => l.id === candidate.lectureId);
        if (lecture && !cancelled) {
          setContinueWatching({ course, lecture, progress: candidate });
          return;
        }
      }

      if (!cancelled) setContinueWatching(null);
    }

    findContinueWatching();

    return () => {
      cancelled = true;
    };
  }, [courses, allProgress]);

  // Feature 4: Backup Export and Import
  const exportDatabaseBackup = useCallback(async (): Promise<AppBackupPayload> => {
    await flushPendingProgress();
    return await db.exportAllData();
  }, [flushPendingProgress]);

  const importDatabaseBackup = useCallback(
    async (
      payload: AppBackupPayload,
      mode: 'merge' | 'replace' = 'merge'
    ): Promise<{ importedCourses: number; importedLectures: number; importedProgress: number; importedNotes: number }> => {
      await flushPendingProgress();
      const result = await db.importData(payload, mode);
      await refreshAllCourses();

      // If active course was replaced or modified, reload
      if (currentCourse) {
        const reloaded = await db.getCourseById(currentCourse.id);
        if (reloaded) {
          await switchCourse(reloaded.id);
        } else {
          setCurrentCourse(null);
          setActiveLecture(null);
          setLectures([]);
          setActiveView('dashboard');
        }
      }
      return result;
    },
    [flushPendingProgress, refreshAllCourses, currentCourse, switchCourse]
  );

  return (
    <CourseContext.Provider
      value={{
        courses,
        currentCourse,
        lectures,
        progressMap,
        activeLecture,
        activeView,
        courseStats,
        crossCourseStats,
        overallAnalytics,
        continueWatching,
        isScanning,
        activeScanStats,
        isAddCourseOpen,
        lastDiagnosticReport,
        isNotesDrawerOpen,
        notesDrawerLecture,
        openNotesDrawer,
        closeNotesDrawer,
        isAnalyticsModalOpen,
        openAnalyticsModal: () => setIsAnalyticsModalOpen(true),
        closeAnalyticsModal: () => setIsAnalyticsModalOpen(false),
        targetSeekTime,
        seekTo,
        clearSeekTarget,
        setActiveView,
        openAddCourseModal: () => setIsAddCourseOpen(true),
        closeAddCourseModal: () => setIsAddCourseOpen(false),
        switchCourse,
        selectLecture,
        updateLectureProgress,
        flushPendingProgress,
        renameCourse,
        archiveCourse,
        deleteCoursePermanently,
        reconnectCourse,
        upgradeCourseToNativeAccess,
        rescanCurrentCourse,
        cancelActiveScan,
        refreshAllCourses,
        setLastDiagnosticReport,
        exportDatabaseBackup,
        importDatabaseBackup
      }}
    >
      {children}
    </CourseContext.Provider>
  );
};

export const useCourseStore = () => {
  const ctx = useContext(CourseContext);
  if (!ctx) throw new Error('useCourseStore must be used within CourseProvider');
  return ctx;
};
