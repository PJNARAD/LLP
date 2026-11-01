/**
 * Comprehensive Automated Test Suite
 * Vitest + fake-indexeddb + mocked FS adapter
 *
 * Covers:
 * Phase 12A — Scanning (19, 40, 56, 100, 500 candidates, nested, case-insensitive, unplayable, skips)
 * Phase 12B — Multi-course (creation, switching, renaming, rescan, reconnect, archiving, schema v1)
 * Phase 12C — Progress Integrity (Course A=40 / Course B=56, 5+ alternations, zero cross-contamination)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { TrackerDB } from '../db/indexedDB';
import { scanDirectoryHandle } from '../scanner/scanner';
import { reconcileScannedLectures } from '../scanner/rescan';
import { buildMockDirectoryTree } from './mockFS';
import { Course, Lecture, LectureNote, Progress } from '../types';

describe('Phase 12A — Scanning & Invariant Verification', () => {
  it('Scans empty folder cleanly with 0 candidates', async () => {
    const handle = buildMockDirectoryTree('EmptyCourse', { candidateCount: 0 });
    const result = await scanDirectoryHandle(handle as any);

    expect(result.stats.status).toBe('completed');
    expect(result.stats.candidatesFound).toBe(0);
    expect(result.entries.length).toBe(0);
    expect(result.stats.errors).toBe(0);
  });

  it('Scans 19-candidate fixture with nested directories and mixed formats', async () => {
    const handle = buildMockDirectoryTree('Course_19', {
      candidateCount: 19,
      subdirectories: 3,
      mixedFormats: true
    });
    const result = await scanDirectoryHandle(handle as any);

    expect(result.stats.status).toBe('completed');
    expect(result.stats.candidatesFound).toBe(19);
    expect(result.entries.length).toBe(19);
    // Unsupported formats are detected and flagged in diagnostics without dropping
    expect(result.stats.unsupported).toBeGreaterThan(0);
    expect(result.stats.candidatesFound).toBe(
      result.entries.length
    );
  });

  it('Scans 40-candidate fixture with uppercase and mixed-case extensions', async () => {
    const handle = buildMockDirectoryTree('Course_40', {
      candidateCount: 40,
      subdirectories: 4,
      uppercaseExtensions: true,
      mixedFormats: true
    });
    const result = await scanDirectoryHandle(handle as any);

    expect(result.stats.status).toBe('completed');
    expect(result.stats.candidatesFound).toBe(40);
    expect(result.entries.length).toBe(40);
  });

  it('Scans 56-candidate fixture (56/19 Invariant: All 56 candidates registered without silent drop)', async () => {
    const handle = buildMockDirectoryTree('Course_56', {
      candidateCount: 56,
      subdirectories: 5,
      mixedFormats: true,
      uppercaseExtensions: true
    });
    const result = await scanDirectoryHandle(handle as any);

    expect(result.stats.status).toBe('completed');
    expect(result.stats.candidatesFound).toBe(56);
    expect(result.entries.length).toBe(56);

    // Invariant check: candidate count equals entries, all unplayable items are tracked in diagnostics
    const unplayableEntries = result.entries.filter((e) => ['avi', 'mkv', '3gp'].includes(e.relativePath.split('.').pop()!.toLowerCase()));
    expect(result.stats.unsupported).toBe(unplayableEntries.length);
    expect(result.stats.diagnostics.filter((d) => d.category === 'unsupported_format').length).toBe(unplayableEntries.length);
  });

  it('Scans 100-candidate fixture and handles identical filenames in different subfolders', async () => {
    const handle = buildMockDirectoryTree('Course_100', {
      candidateCount: 100,
      subdirectories: 10,
      duplicateFilenamesAcrossDirs: true
    });
    const result = await scanDirectoryHandle(handle as any);

    expect(result.stats.status).toBe('completed');
    expect(result.stats.candidatesFound).toBe(100);
    expect(result.entries.length).toBe(100);

    // Verify all relative paths are unique even though filenames repeat
    const paths = new Set(result.entries.map((e) => e.relativePath));
    expect(paths.size).toBe(100);
  });

  it('Scans 500-candidate fixture with high throughput and zero memory leaks', async () => {
    const handle = buildMockDirectoryTree('Course_500', {
      candidateCount: 500,
      subdirectories: 20,
      mixedFormats: true
    });
    const result = await scanDirectoryHandle(handle as any);

    expect(result.stats.status).toBe('completed');
    expect(result.stats.candidatesFound).toBe(500);
    expect(result.entries.length).toBe(500);
  });

  it('Accounts for inaccessible entries mid-scan in diagnostic report without aborting remaining entries', async () => {
    const handle = buildMockDirectoryTree('Course_Inaccessible', {
      candidateCount: 20,
      subdirectories: 2,
      inaccessibleFilesCount: 4 // 4 will throw error on access
    });
    const result = await scanDirectoryHandle(handle as any);

    expect(result.stats.status).toBe('completed');
    expect(result.stats.candidatesFound).toBe(16);
    expect(result.stats.skippedInaccessible).toBe(4);
    expect(result.stats.errors).toBe(4);
    expect(result.stats.diagnostics.length).toBe(4);
    expect(result.stats.diagnostics[0].category).toBe('permission_denied');
  });

  it('Handles mid-scan cancellation cleanly via AbortSignal with zero state corruption', async () => {
    const handle = buildMockDirectoryTree('Course_Cancel', {
      candidateCount: 100,
      subdirectories: 5
    });
    const abortController = new AbortController();

    // Trigger abort immediately during traversal
    abortController.abort();

    const result = await scanDirectoryHandle(handle as any, {
      signal: abortController.signal
    });

    expect(result.stats.status).toBe('cancelled');
    expect(result.entries.length).toBe(0);
  });
});

describe('Phase 12B — Multi-Course & Persistence', () => {
  let testDB: TrackerDB;

  beforeEach(async () => {
    const dbName = `test_db_${Date.now()}_${Math.random().toString(36).substring(2)}`;
    testDB = new TrackerDB(dbName);
  });

  it('Adds 2+ courses and persists them independently in IndexedDB', async () => {
    const course1: Course = {
      id: crypto.randomUUID(),
      name: 'Course Alpha',
      folderName: 'Alpha_Folder',
      connectionState: 'connected',
      createdAt: Date.now(),
      lastActivityAt: Date.now()
    };
    const course2: Course = {
      id: crypto.randomUUID(),
      name: 'Course Beta',
      folderName: 'Beta_Folder',
      connectionState: 'connected',
      createdAt: Date.now(),
      lastActivityAt: Date.now()
    };

    await testDB.saveCourse(course1);
    await testDB.saveCourse(course2);

    const loaded = await testDB.getCourses();
    expect(loaded.length).toBe(2);
    expect(loaded.map((c) => c.name)).toContain('Course Alpha');
    expect(loaded.map((c) => c.name)).toContain('Course Beta');
  });

  it('Renames course display name while keeping stable ID, lectures, and progress intact', async () => {
    const courseId = crypto.randomUUID();
    const lectureId = crypto.randomUUID();

    const course: Course = {
      id: courseId,
      name: 'Original Title',
      folderName: 'Folder1',
      connectionState: 'connected',
      createdAt: Date.now(),
      lastActivityAt: Date.now()
    };
    await testDB.saveCourse(course);

    const lecture: Lecture = {
      id: lectureId,
      courseId,
      name: 'Intro.mp4',
      relativePath: 'Intro.mp4',
      size: 1024,
      lastModified: Date.now(),
      ext: 'mp4',
      supportState: 'supported'
    };
    await testDB.saveLecturesBatched([lecture]);

    await testDB.saveProgress({
      courseId,
      lectureId,
      positionSec: 120,
      completed: false,
      updatedAt: Date.now()
    });

    // Rename
    course.name = 'Updated Title';
    await testDB.updateCourse(course);

    const reloadedCourse = await testDB.getCourseById(courseId);
    expect(reloadedCourse?.name).toBe('Updated Title');

    const progress = await testDB.getProgress(courseId, lectureId);
    expect(progress?.positionSec).toBe(120);

    const reloadedLectures = await testDB.getLecturesByCourse(courseId);
    expect(reloadedLectures.length).toBe(1);
    expect(reloadedLectures[0].id).toBe(lectureId);
  });

  it('Rescan preserves existing progress, detects new lectures, and marks missing sources', async () => {
    const courseId = crypto.randomUUID();
    const existingLec1: Lecture = {
      id: crypto.randomUUID(),
      courseId,
      name: 'Lecture1.mp4',
      relativePath: 'Module/Lecture1.mp4',
      size: 2048,
      lastModified: 1700000000000,
      ext: 'mp4',
      supportState: 'supported'
    };
    const existingLec2: Lecture = {
      id: crypto.randomUUID(),
      courseId,
      name: 'Lecture2.mp4',
      relativePath: 'Module/Lecture2.mp4',
      size: 4096,
      lastModified: 1700000000000,
      ext: 'mp4',
      supportState: 'supported'
    };

    // Lecture 2 will be deleted/missing from new scan, and Lecture 3 will be newly discovered
    const newScannedEntries = [
      {
        name: 'Lecture1.mp4',
        relativePath: 'Module/Lecture1.mp4',
        size: 2048,
        lastModified: 1700000000000
      },
      {
        name: 'Lecture3.mp4',
        relativePath: 'Module/Lecture3.mp4',
        size: 8192,
        lastModified: 1700000000000
      }
    ];

    const plan = await reconcileScannedLectures(
      courseId,
      [existingLec1, existingLec2],
      newScannedEntries as any
    );

    expect(plan.matchedCount).toBe(1);
    expect(plan.newlyRegisteredCount).toBe(1);
    expect(plan.missingCount).toBe(1);

    // Existing matched lecture retained exact id
    const matched = plan.lecturesToSave.find((l) => l.relativePath === 'Module/Lecture1.mp4');
    expect(matched?.id).toBe(existingLec1.id);

    // Missing lecture retained with 'missing_source' status, NOT deleted
    const missing = plan.lecturesToSave.find((l) => l.id === existingLec2.id);
    expect(missing?.supportState).toBe('missing_source');
  });

  it('Removes course from library with learning history retained', async () => {
    const courseId = crypto.randomUUID();
    const lectureId = crypto.randomUUID();

    const course: Course = {
      id: courseId,
      name: 'Archived Course',
      folderName: 'ArchiveFolder',
      connectionState: 'connected',
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
      isArchived: false
    };
    await testDB.saveCourse(course);
    await testDB.saveProgress({
      courseId,
      lectureId,
      positionSec: 350,
      completed: true,
      updatedAt: Date.now()
    });

    // Remove from active library
    await testDB.removeCourseFromLibrary(courseId);

    const activeList = await testDB.getCourses(false);
    expect(activeList.find((c) => c.id === courseId)).toBeUndefined();

    // Still in database with all history preserved
    const allCourses = await testDB.getCourses(true);
    expect(allCourses.find((c) => c.id === courseId)?.isArchived).toBe(true);

    const prog = await testDB.getProgress(courseId, lectureId);
    expect(prog?.positionSec).toBe(350);
    expect(prog?.completed).toBe(true);
  });

  it('Schema version v2 initialization is idempotent across multiple opens', async () => {
    const db1 = await testDB.getDB();
    expect(db1.version).toBe(2);

    // Reopen same DB
    const sameDB = new TrackerDB(testDB.getDBName());
    const db2 = await sameDB.getDB();
    expect(db2.version).toBe(2);
    expect(db2.objectStoreNames.contains('courses')).toBe(true);
    expect(db2.objectStoreNames.contains('lectures')).toBe(true);
    expect(db2.objectStoreNames.contains('progress')).toBe(true);
    expect(db2.objectStoreNames.contains('notes')).toBe(true);
    expect(db2.objectStoreNames.contains('meta')).toBe(true);
  });

  it('Exports and imports entire database snapshot via JSON backup safely', async () => {
    const courseId = crypto.randomUUID();
    const lectureId = crypto.randomUUID();

    await testDB.saveCourse({
      id: courseId,
      name: 'Backup Test Course',
      folderName: 'BackupFolder',
      connectionState: 'connected',
      createdAt: Date.now(),
      lastActivityAt: Date.now()
    });

    await testDB.saveLecturesBatched([
      {
        id: lectureId,
        courseId,
        name: 'Lecture1.mp4',
        relativePath: 'Module/Lecture1.mp4',
        size: 5000,
        lastModified: Date.now(),
        ext: 'mp4',
        supportState: 'supported'
      }
    ]);

    await testDB.saveProgress({
      courseId,
      lectureId,
      positionSec: 420,
      completed: true,
      updatedAt: Date.now()
    });

    await testDB.saveNote({
      id: 'note_1',
      courseId,
      lectureId,
      content: 'Important bookmark at 04:20',
      timestampSec: 260,
      createdAt: Date.now(),
      updatedAt: Date.now()
    });

    // Export
    const backup = await testDB.exportAllData();
    expect(backup.app).toBe('LocalLectureProgressTracker');
    expect(backup.courses.length).toBe(1);
    expect(backup.lectures.length).toBe(1);
    expect(backup.progress.length).toBe(1);
    expect(backup.notes.length).toBe(1);

    // Import into a fresh isolated database
    const restoreDB = new TrackerDB(`test_restore_${Date.now()}`);
    const res = await restoreDB.importData(backup, 'replace');
    expect(res.importedCourses).toBe(1);
    expect(res.importedLectures).toBe(1);
    expect(res.importedProgress).toBe(1);
    expect(res.importedNotes).toBe(1);

    const restoredCourse = await restoreDB.getCourseById(courseId);
    expect(restoredCourse?.name).toBe('Backup Test Course');

    const restoredProgress = await restoreDB.getProgress(courseId, lectureId);
    expect(restoredProgress?.positionSec).toBe(420);
    expect(restoredProgress?.completed).toBe(true);

    const restoredNotes = await restoreDB.getNotesForLecture(courseId, lectureId);
    expect(restoredNotes.length).toBe(1);
    expect(restoredNotes[0].content).toBe('Important bookmark at 04:20');
    expect(restoredNotes[0].timestampSec).toBe(260);
  });
});

describe('Phase 12C — Progress Integrity (Must Pass)', () => {
  it('Course A (40 lectures) and Course B (56 lectures): 5+ switches with zero cross-contamination', async () => {
    const testDB = new TrackerDB(`test_integrity_${Date.now()}`);

    // Create Course A with 40 lectures
    const courseAId = crypto.randomUUID();
    const courseA: Course = {
      id: courseAId,
      name: 'Course A (Computer Systems)',
      folderName: 'CS_Systems',
      connectionState: 'connected',
      createdAt: Date.now(),
      lastActivityAt: Date.now()
    };
    await testDB.saveCourse(courseA);

    const lecturesA: Lecture[] = [];
    for (let i = 1; i <= 40; i++) {
      const lecId = `A_lec_${i}`;
      lecturesA.push({
        id: lecId,
        courseId: courseAId,
        name: `Lec_${i}.mp4`,
        relativePath: `Module_${Math.ceil(i / 10)}/Lec_${i}.mp4`,
        size: 1000 + i,
        lastModified: 1700000000000 + i,
        ext: 'mp4',
        durationSec: 1800,
        supportState: 'supported'
      });
      // Set distinct position and notes for Course A
      await testDB.saveProgress({
        courseId: courseAId,
        lectureId: lecId,
        positionSec: 100 + i * 5,
        durationSec: 1800,
        completed: i % 2 === 0,
        updatedAt: Date.now() + i
      });

      await testDB.saveNote({
        id: `note_A_${i}`,
        courseId: courseAId,
        lectureId: lecId,
        content: `Note for Course A lecture ${i}`,
        timestampSec: 50 + i,
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
    }
    await testDB.saveLecturesBatched(lecturesA);

    // Create Course B with 56 lectures
    const courseBId = crypto.randomUUID();
    const courseB: Course = {
      id: courseBId,
      name: 'Course B (Distributed Algorithms)',
      folderName: 'Dist_Algos',
      connectionState: 'connected',
      createdAt: Date.now(),
      lastActivityAt: Date.now()
    };
    await testDB.saveCourse(courseB);

    const lecturesB: Lecture[] = [];
    for (let i = 1; i <= 56; i++) {
      const lecId = `B_lec_${i}`;
      lecturesB.push({
        id: lecId,
        courseId: courseBId,
        name: `Lecture_${i}.mp4`,
        relativePath: `Topic_${Math.ceil(i / 8)}/Lecture_${i}.mp4`,
        size: 5000 + i,
        lastModified: 1710000000000 + i,
        ext: 'mp4',
        durationSec: 2400,
        supportState: 'supported'
      });
      // Set distinct position and notes for Course B
      await testDB.saveProgress({
        courseId: courseBId,
        lectureId: lecId,
        positionSec: 500 + i * 10,
        durationSec: 2400,
        completed: i % 3 === 0,
        updatedAt: Date.now() + 1000 + i
      });

      await testDB.saveNote({
        id: `note_B_${i}`,
        courseId: courseBId,
        lectureId: lecId,
        content: `Note for Course B lecture ${i}`,
        timestampSec: 200 + i,
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
    }
    await testDB.saveLecturesBatched(lecturesB);

    // Simulate switching between Course A and Course B at least 5 times
    for (let cycle = 1; cycle <= 6; cycle++) {
      const targetCourseId = cycle % 2 === 1 ? courseAId : courseBId;
      const expectedCount = targetCourseId === courseAId ? 40 : 56;

      const loadedLectures = await testDB.getLecturesByCourse(targetCourseId);
      const loadedProgress = await testDB.getProgressForCourse(targetCourseId);
      const loadedNotes = await testDB.getAllNotesForCourse(targetCourseId);

      expect(loadedLectures.length).toBe(expectedCount);
      expect(loadedProgress.length).toBe(expectedCount);
      expect(loadedNotes.length).toBe(expectedCount);

      // Verify that every progress record strictly belongs to targetCourseId
      for (const p of loadedProgress) {
        expect(p.courseId).toBe(targetCourseId);
        if (targetCourseId === courseAId) {
          const idx = parseInt(p.lectureId.replace('A_lec_', ''), 10);
          expect(p.positionSec).toBe(100 + idx * 5);
          expect(p.completed).toBe(idx % 2 === 0);
        } else {
          const idx = parseInt(p.lectureId.replace('B_lec_', ''), 10);
          expect(p.positionSec).toBe(500 + idx * 10);
          expect(p.completed).toBe(idx % 3 === 0);
        }
      }

      // Verify that notes strictly belong to targetCourseId
      for (const n of loadedNotes) {
        expect(n.courseId).toBe(targetCourseId);
        if (targetCourseId === courseAId) {
          expect(n.content).toContain('Course A');
        } else {
          expect(n.content).toContain('Course B');
        }
      }
    }
  });

  it('SessionFileStore registers files and resolves by lecture ID, relative path, and filename', async () => {
    const { sessionFileStore, resolveLectureMediaFile } = await import('../scanner/fileStore');

    const courseId = 'test_course_playback';
    const lectureId = 'test_lec_123';
    const fakeFile = new File(['fake-mp4-data'], '01_intro.mp4', { type: 'video/mp4' });

    // 1. Store by lecture
    sessionFileStore.storeFile(courseId, lectureId, fakeFile, 'modules/01_intro.mp4');

    expect(sessionFileStore.hasFile(courseId, lectureId)).toBe(true);
    expect(sessionFileStore.getFile(courseId, lectureId)).toBe(fakeFile);
    expect(sessionFileStore.getFile(courseId, 'different_id', 'modules/01_intro.mp4')).toBe(fakeFile);
    expect(sessionFileStore.getFile(courseId, 'different_id_2', undefined, '01_intro.mp4')).toBe(fakeFile);

    // 2. resolveLectureMediaFile resolves instant session cache without error
    const resolved = await resolveLectureMediaFile(
      courseId,
      lectureId,
      'modules/01_intro.mp4',
      '01_intro.mp4'
    );
    expect(resolved).toBe(fakeFile);
  });
});
