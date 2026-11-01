/**
 * Type definitions for Local Lecture Progress Tracker
 * Built from zero with strictly versioned schema (v1 -> v2).
 */

export type ConnectionState = 'connected' | 'needs_permission' | 'unsupported_api' | 'missing';

export type SupportState = 'supported' | 'unsupported_format' | 'missing_source';

export interface Course {
  id: string; // UUID v4
  name: string; // User-editable display name
  folderName: string; // Root folder name
  rootHandle?: FileSystemDirectoryHandle | null; // Stored if File System Access API supported
  connectionState: ConnectionState;
  createdAt: number; // Unix timestamp ms
  lastActivityAt: number; // Unix timestamp ms
  isArchived?: boolean; // For "remove from library without deleting history"
}

export interface Lecture {
  id: string; // UUID v4
  courseId: string; // Foreign key to Course.id
  name: string; // Display filename (display-only, NOT identity)
  relativePath: string; // Normalized path relative to root folder (e.g. "Module 1/01-intro.mp4")
  size: number; // File size in bytes
  lastModified: number; // File last modified timestamp ms
  ext: string; // Lowercase extension without dot (e.g. "mp4", "mkv")
  durationSec?: number; // Detected duration if played or metadata available
  supportState: SupportState;
  fileHandle?: FileSystemFileHandle | null; // Stored file handle if supported
}

export interface Progress {
  courseId: string;
  lectureId: string;
  positionSec: number;
  durationSec?: number;
  completed: boolean;
  updatedAt: number; // Unix timestamp ms
}

export interface LectureNote {
  id: string; // UUID v4
  courseId: string;
  lectureId: string;
  content: string;
  timestampSec: number;
  createdAt: number;
  updatedAt: number;
}

export interface DiagnosticItem {
  id: string;
  timestamp: number;
  category: 'unsupported_format' | 'unreadable_entry' | 'permission_denied' | 'db_write_error' | 'filter_exclusion' | 'missing_source' | 'duplicate_skipped';
  path: string;
  reason: string;
}

export interface ScanStats {
  status: 'idle' | 'scanning' | 'registering' | 'completed' | 'cancelled' | 'error';
  directoriesVisited: number;
  filesExamined: number;
  candidatesFound: number;
  newlyRegistered: number;
  matchedExisting: number;
  unsupported: number;
  skippedInaccessible: number;
  errors: number;
  diagnostics: DiagnosticItem[];
  errorMessage?: string;
}

export interface CourseStats {
  totalLectures: number;
  completedLectures: number;
  inProgressLectures: number;
  notStartedLectures: number;
  unsupportedLectures: number;
  missingLectures: number;
  completionPercentage: number;
  totalDurationSec: number;
  remainingDurationSec: number;
  hasUnknownDuration: boolean;
}

export type LectureSortOption =
  | 'default'
  | 'name_asc'
  | 'name_desc'
  | 'size_desc'
  | 'size_asc'
  | 'duration_desc'
  | 'duration_asc'
  | 'recent_active';

export interface AppBackupPayload {
  schemaVersion: number;
  app: string;
  exportedAt: number;
  courses: Omit<Course, 'rootHandle'>[];
  lectures: Omit<Lecture, 'fileHandle'>[];
  progress: Progress[];
  notes: LectureNote[];
}

export interface StudyDayActivity {
  dateStr: string; // YYYY-MM-DD
  count: number; // Number of interaction records
  watchTimeSec: number; // Estimated watch time
  level: 0 | 1 | 2 | 3 | 4; // 0 = empty, 1-4 intensity for heatmap
}

export interface StudyStreakInfo {
  currentStreakDays: number;
  longestStreakDays: number;
  totalActiveDays: number;
  lastActiveDateStr: string | null;
  peakDayOfWeek: string;
  peakHourRange: string;
}

export interface FolderNodeStats {
  totalLectures: number;
  completedLectures: number;
  inProgressLectures: number;
  notStartedLectures: number;
  totalDurationSec: number;
  remainingDurationSec: number;
  completionPercentage: number;
}

export interface FolderTreeNode {
  id: string; // Relative directory path, e.g. "Chapter 1/Part A" or "root"
  name: string; // Folder name, e.g. "Part A"
  fullPath: string;
  depth: number;
  lectures: Lecture[]; // Direct lectures in this folder
  children: FolderTreeNode[]; // Nested subfolders
  stats: FolderNodeStats;
}

export interface OverallAnalytics {
  totalWatchTimeSec: number;
  totalSizeBytes: number;
  totalCourses: number;
  totalLectures: number;
  completedLectures: number;
  inProgressLectures: number;
  notStartedLectures: number;
  unsupportedLectures: number;
  overallCompletionPct: number;
  recentActivityCount7d: number;
  velocityLecturesPerWeek: number;
  projectedCompletionDays: number | null;
  formatBreakdown: Record<string, number>;
  totalDurationSec: number;
  totalRemainingSec: number;
  streakInfo?: StudyStreakInfo;
  activityHistory?: StudyDayActivity[];
}

export const SUPPORTED_VIDEO_EXTENSIONS = [
  'mp4',
  'webm',
  'ogg',
  'mov',
  'm4v',
  'avi',
  'mkv',
  '3gp'
] as const;

export const BROWSER_NATIVE_VIDEO_EXTENSIONS = [
  'mp4',
  'webm',
  'ogg',
  'mov',
  'm4v'
] as const;
