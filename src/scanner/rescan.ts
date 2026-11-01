/**
 * Rescan & Deduplication Engine
 *
 * Implements Phase 7:
 * - Match hierarchy: FileSystemFileHandle equality (isSameEntry) -> normalized relativePath -> (name + size + lastModified)
 * - Matched: Preserves UUID, progress, completion, notes; updates file metadata/handle
 * - Genuinely new: Assigns new UUID, registers
 * - Registered but absent now: Preserves record, marks 'missing_source', NEVER deletes
 * - Concurrent scan prevention per courseId
 */

import { Lecture, SupportState } from '../types';
import { UnifiedFileEntry } from './fsAdapter';
import { determineSupportState, extractFileExtension } from './scanner';

export interface RescanPlan {
  lecturesToSave: Lecture[];
  matchedCount: number;
  newlyRegisteredCount: number;
  missingCount: number;
}

// Track active scans to prevent concurrent scans of the same course
const activeCourseScans = new Set<string>();

export function isCourseScanActive(courseId: string): boolean {
  return activeCourseScans.has(courseId);
}

export function lockCourseScan(courseId: string): boolean {
  if (activeCourseScans.has(courseId)) {
    return false;
  }
  activeCourseScans.add(courseId);
  return true;
}

export function unlockCourseScan(courseId: string): void {
  activeCourseScans.delete(courseId);
}

/**
 * Reconcile scanned entries against previously registered lectures for a course
 */
export async function reconcileScannedLectures(
  courseId: string,
  existingLectures: Lecture[],
  scannedEntries: UnifiedFileEntry[]
): Promise<RescanPlan> {
  const matchedExistingIds = new Set<string>();
  const unmatchedScannedEntries: UnifiedFileEntry[] = [];
  const updatedLectures: Lecture[] = [];

  let matchedCount = 0;
  let newlyRegisteredCount = 0;
  let missingCount = 0;

  // Build lookup maps for fast matching
  const byRelativePath = new Map<string, Lecture>();
  for (const existing of existingLectures) {
    byRelativePath.set(existing.relativePath, existing);
  }

  // Pass 1: Try handle identity (isSameEntry) if handles exist, or exact relativePath match
  for (const entry of scannedEntries) {
    let matchedLecture: Lecture | null = null;

    // First try exact normalized relativePath
    if (byRelativePath.has(entry.relativePath)) {
      matchedLecture = byRelativePath.get(entry.relativePath)!;
    } else if (entry.handle) {
      // If relative path changed, check handle identity
      for (const existing of existingLectures) {
        if (matchedExistingIds.has(existing.id)) continue;
        if (existing.fileHandle && typeof existing.fileHandle.isSameEntry === 'function') {
          try {
            const isSame = await existing.fileHandle.isSameEntry(entry.handle);
            if (isSame) {
              matchedLecture = existing;
              break;
            }
          } catch {
            // Ignore comparison errors
          }
        }
      }
    }

    // Heuristic fallback: same filename + exact size + lastModified
    if (!matchedLecture) {
      for (const existing of existingLectures) {
        if (matchedExistingIds.has(existing.id)) continue;
        if (
          existing.name === entry.name &&
          existing.size === entry.size &&
          Math.abs(existing.lastModified - entry.lastModified) < 2000
        ) {
          matchedLecture = existing;
          break;
        }
      }
    }

    if (matchedLecture) {
      matchedExistingIds.add(matchedLecture.id);
      matchedCount++;

      const ext = extractFileExtension(entry.name);
      const support: SupportState = determineSupportState(ext);

      // Preserve lecture ID, duration, and relations; update metadata
      updatedLectures.push({
        ...matchedLecture,
        name: entry.name,
        relativePath: entry.relativePath,
        size: entry.size,
        lastModified: entry.lastModified,
        ext,
        supportState: support,
        fileHandle: entry.handle || matchedLecture.fileHandle
      });
    } else {
      unmatchedScannedEntries.push(entry);
    }
  }

  // Pass 2: Genuinely new entries
  for (const entry of unmatchedScannedEntries) {
    newlyRegisteredCount++;
    const ext = extractFileExtension(entry.name);
    const support: SupportState = determineSupportState(ext);

    updatedLectures.push({
      id: crypto.randomUUID(),
      courseId,
      name: entry.name,
      relativePath: entry.relativePath,
      size: entry.size,
      lastModified: entry.lastModified,
      ext,
      supportState: support,
      fileHandle: entry.handle || null
    });
  }

  // Pass 3: Existing registered lectures that were absent in this scan -> mark missing_source, NEVER delete!
  for (const existing of existingLectures) {
    if (!matchedExistingIds.has(existing.id)) {
      missingCount++;
      updatedLectures.push({
        ...existing,
        supportState: 'missing_source'
      });
    }
  }

  return {
    lecturesToSave: updatedLectures,
    matchedCount,
    newlyRegisteredCount,
    missingCount
  };
}
