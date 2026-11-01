/**
 * Versioned IndexedDB Data Layer for Local Lecture Progress Tracker
 * Schema Version: 2 (Upgraded from v1 with migration safety)
 *
 * Implements:
 * - Versioned schema migration safety (v1 -> v2)
 * - Safe transaction completion before awaiting unrelated async work
 * - Idempotent progress updates per (courseId, lectureId)
 * - Retained history when archived from library
 * - Full JSON Export and Import backup functionality
 * - Parameterized DB name for testing isolation
 */

import { Course, Lecture, Progress, LectureNote, AppBackupPayload } from '../types';

export const CURRENT_SCHEMA_VERSION = 2;
export const DEFAULT_DB_NAME = 'lecture_tracker_v1';

export interface DBMetadata {
  key: string;
  value: any;
  updatedAt: number;
}

export class TrackerDB {
  private dbName: string;
  private dbPromise: Promise<IDBDatabase> | null = null;

  constructor(dbName = DEFAULT_DB_NAME) {
    this.dbName = dbName;
  }

  public getDBName(): string {
    return this.dbName;
  }

  public async getDB(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open(this.dbName, CURRENT_SCHEMA_VERSION);

        req.onupgradeneeded = (event) => {
          const db = req.result;
          const oldVersion = event.oldVersion;

          // Schema Version 1 Initializer
          if (oldVersion < 1) {
            // Courses store
            const courseStore = db.createObjectStore('courses', { keyPath: 'id' });
            courseStore.createIndex('createdAt', 'createdAt', { unique: false });
            courseStore.createIndex('lastActivityAt', 'lastActivityAt', { unique: false });

            // Lectures store
            const lectureStore = db.createObjectStore('lectures', { keyPath: 'id' });
            lectureStore.createIndex('courseId', 'courseId', { unique: false });
            lectureStore.createIndex('by_course_path', ['courseId', 'relativePath'], { unique: false });

            // Progress store - keyed by composite string `courseId::lectureId`
            const progressStore = db.createObjectStore('progress', { keyPath: 'key' });
            progressStore.createIndex('courseId', 'courseId', { unique: false });
            progressStore.createIndex('updatedAt', 'updatedAt', { unique: false });

            // Notes / Bookmarks store
            const noteStore = db.createObjectStore('notes', { keyPath: 'id' });
            noteStore.createIndex('courseId', 'courseId', { unique: false });
            noteStore.createIndex('by_course_lecture', ['courseId', 'lectureId'], { unique: false });

            // Metadata store
            db.createObjectStore('meta', { keyPath: 'key' });
          }

          // Schema Version 2 Upgrade (Safe migration from v1)
          if (oldVersion >= 1 && oldVersion < 2) {
            const tx = req.transaction;
            if (tx) {
              const noteStore = tx.objectStore('notes');
              if (!noteStore.indexNames.contains('timestampSec')) {
                noteStore.createIndex('timestampSec', 'timestampSec', { unique: false });
              }
              if (!noteStore.indexNames.contains('updatedAt')) {
                noteStore.createIndex('updatedAt', 'updatedAt', { unique: false });
              }
            }
          }
        };

        req.onsuccess = () => {
          const db = req.result;
          resolve(db);
        };

        req.onerror = () => {
          reject(req.error || new Error('Failed to open IndexedDB'));
        };

        req.onblocked = () => {
          console.warn('IndexedDB upgrade blocked by open connection in another tab');
        };
      });
    }
    return this.dbPromise;
  }

  public async close(): Promise<void> {
    if (this.dbPromise) {
      const db = await this.dbPromise;
      db.close();
      this.dbPromise = null;
    }
  }

  // --- Courses Operations ---

  public async saveCourse(course: Course): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['courses', 'meta'], 'readwrite');
      const store = tx.objectStore('courses');
      const metaStore = tx.objectStore('meta');

      store.put(course);
      metaStore.put({
        key: 'schemaVersion',
        value: CURRENT_SCHEMA_VERSION,
        updatedAt: Date.now()
      });

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  public async getCourses(includeArchived = false): Promise<Course[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('courses', 'readonly');
      const store = tx.objectStore('courses');
      const req = store.getAll();

      req.onsuccess = () => {
        let results = (req.result as Course[]) || [];
        if (!includeArchived) {
          results = results.filter((c) => !c.isArchived);
        }
        // Sort descending by lastActivityAt
        results.sort((a, b) => b.lastActivityAt - a.lastActivityAt);
        resolve(results);
      };
      req.onerror = () => reject(req.error);
    });
  }

  public async getCourseById(id: string): Promise<Course | null> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('courses', 'readonly');
      const store = tx.objectStore('courses');
      const req = store.get(id);

      req.onsuccess = () => resolve((req.result as Course) || null);
      req.onerror = () => reject(req.error);
    });
  }

  public async updateCourse(course: Course): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('courses', 'readwrite');
      const store = tx.objectStore('courses');
      store.put(course);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  /**
   * Remove course from library without deleting learning history.
   * Sets `isArchived = true` so progress and notes stay safe.
   */
  public async removeCourseFromLibrary(courseId: string): Promise<void> {
    const course = await this.getCourseById(courseId);
    if (!course) return;
    course.isArchived = true;
    await this.updateCourse(course);
  }

  public async restoreCourseToLibrary(courseId: string): Promise<void> {
    const course = await this.getCourseById(courseId);
    if (!course) return;
    course.isArchived = false;
    course.lastActivityAt = Date.now();
    await this.updateCourse(course);
  }

  /**
   * Permanent deletion requires typed confirmation in the UI.
   * Completely purges the course, its registered lectures, progress, and notes.
   * Original media files on disk are untouched.
   */
  public async deleteCoursePermanently(courseId: string): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['courses', 'lectures', 'progress', 'notes'], 'readwrite');
      const courseStore = tx.objectStore('courses');
      const lectureStore = tx.objectStore('lectures');
      const progressStore = tx.objectStore('progress');
      const noteStore = tx.objectStore('notes');

      courseStore.delete(courseId);

      // Remove lectures by index
      const lectureIndex = lectureStore.index('courseId');
      const lectureReq = lectureIndex.openCursor(IDBKeyRange.only(courseId));
      lectureReq.onsuccess = (e) => {
        const cursor = (e.target as IDBRequest).result as IDBCursorWithValue;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };

      // Remove progress by index
      const progressIndex = progressStore.index('courseId');
      const progressReq = progressIndex.openCursor(IDBKeyRange.only(courseId));
      progressReq.onsuccess = (e) => {
        const cursor = (e.target as IDBRequest).result as IDBCursorWithValue;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };

      // Remove notes by index
      const noteIndex = noteStore.index('courseId');
      const noteReq = noteIndex.openCursor(IDBKeyRange.only(courseId));
      noteReq.onsuccess = (e) => {
        const cursor = (e.target as IDBRequest).result as IDBCursorWithValue;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // --- Lectures Operations ---

  public async saveLecturesBatched(lectures: Lecture[], batchSize = 300): Promise<void> {
    if (lectures.length === 0) return;
    const db = await this.getDB();

    for (let i = 0; i < lectures.length; i += batchSize) {
      const chunk = lectures.slice(i, i + batchSize);
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('lectures', 'readwrite');
        const store = tx.objectStore('lectures');

        for (const item of chunk) {
          store.put(item);
        }

        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    }
  }

  public async getLecturesByCourse(courseId: string): Promise<Lecture[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('lectures', 'readonly');
      const store = tx.objectStore('lectures');
      const index = store.index('courseId');
      const req = index.getAll(IDBKeyRange.only(courseId));

      req.onsuccess = () => {
        const results = (req.result as Lecture[]) || [];
        // Natural sort by relativePath
        results.sort((a, b) => a.relativePath.localeCompare(b.relativePath, undefined, { numeric: true, sensitivity: 'base' }));
        resolve(results);
      };
      req.onerror = () => reject(req.error);
    });
  }

  public async getAllLectures(): Promise<Lecture[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('lectures', 'readonly');
      const store = tx.objectStore('lectures');
      const req = store.getAll();

      req.onsuccess = () => resolve((req.result as Lecture[]) || []);
      req.onerror = () => reject(req.error);
    });
  }

  public async updateLecture(lecture: Lecture): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('lectures', 'readwrite');
      const store = tx.objectStore('lectures');
      store.put(lecture);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // --- Progress Operations ---

  public static getProgressKey(courseId: string, lectureId: string): string {
    return `${courseId}::${lectureId}`;
  }

  /**
   * Save progress idempotently. Keyed on (courseId, lectureId).
   * Repeated writes update the single record without duplicates.
   */
  public async saveProgress(progress: Progress): Promise<void> {
    const db = await this.getDB();
    const key = TrackerDB.getProgressKey(progress.courseId, progress.lectureId);
    const record = {
      ...progress,
      key
    };

    return new Promise((resolve, reject) => {
      const tx = db.transaction(['progress', 'courses'], 'readwrite');
      const progressStore = tx.objectStore('progress');
      const courseStore = tx.objectStore('courses');

      progressStore.put(record);

      // Touch course lastActivityAt
      const courseReq = courseStore.get(progress.courseId);
      courseReq.onsuccess = () => {
        const course = courseReq.result as Course | undefined;
        if (course) {
          course.lastActivityAt = progress.updatedAt || Date.now();
          courseStore.put(course);
        }
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  public async getProgress(courseId: string, lectureId: string): Promise<Progress | null> {
    const db = await this.getDB();
    const key = TrackerDB.getProgressKey(courseId, lectureId);
    return new Promise((resolve, reject) => {
      const tx = db.transaction('progress', 'readonly');
      const store = tx.objectStore('progress');
      const req = store.get(key);

      req.onsuccess = () => {
        if (!req.result) return resolve(null);
        const { key: _, ...rest } = req.result;
        resolve(rest as Progress);
      };
      req.onerror = () => reject(req.error);
    });
  }

  public async getProgressForCourse(courseId: string): Promise<Progress[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('progress', 'readonly');
      const store = tx.objectStore('progress');
      const index = store.index('courseId');
      const req = index.getAll(IDBKeyRange.only(courseId));

      req.onsuccess = () => {
        const results = (req.result || []).map((r: any) => {
          const { key: _, ...rest } = r;
          return rest as Progress;
        });
        resolve(results);
      };
      req.onerror = () => reject(req.error);
    });
  }

  public async getAllProgress(): Promise<Progress[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('progress', 'readonly');
      const store = tx.objectStore('progress');
      const req = store.getAll();

      req.onsuccess = () => {
        const results = (req.result || []).map((r: any) => {
          const { key: _, ...rest } = r;
          return rest as Progress;
        });
        resolve(results);
      };
      req.onerror = () => reject(req.error);
    });
  }

  // --- Notes Operations ---

  public async saveNote(note: LectureNote): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('notes', 'readwrite');
      const store = tx.objectStore('notes');
      store.put(note);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  public async deleteNote(noteId: string): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('notes', 'readwrite');
      const store = tx.objectStore('notes');
      store.delete(noteId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  public async getNotesForLecture(courseId: string, lectureId: string): Promise<LectureNote[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('notes', 'readonly');
      const store = tx.objectStore('notes');
      const index = store.index('by_course_lecture');
      const req = index.getAll(IDBKeyRange.only([courseId, lectureId]));

      req.onsuccess = () => {
        const notes = (req.result as LectureNote[]) || [];
        notes.sort((a, b) => a.timestampSec - b.timestampSec);
        resolve(notes);
      };
      req.onerror = () => reject(req.error);
    });
  }

  public async getAllNotesForCourse(courseId: string): Promise<LectureNote[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('notes', 'readonly');
      const store = tx.objectStore('notes');
      const index = store.index('courseId');
      const req = index.getAll(IDBKeyRange.only(courseId));

      req.onsuccess = () => {
        const notes = (req.result as LectureNote[]) || [];
        notes.sort((a, b) => b.createdAt - a.createdAt);
        resolve(notes);
      };
      req.onerror = () => reject(req.error);
    });
  }

  public async getAllNotes(): Promise<LectureNote[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('notes', 'readonly');
      const store = tx.objectStore('notes');
      const req = store.getAll();

      req.onsuccess = () => resolve((req.result as LectureNote[]) || []);
      req.onerror = () => reject(req.error);
    });
  }

  // --- Meta Operations ---

  public async getMeta(key: string): Promise<any> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('meta', 'readonly');
      const store = tx.objectStore('meta');
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result ? req.result.value : null);
      req.onerror = () => reject(req.error);
    });
  }

  public async setMeta(key: string, value: any): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('meta', 'readwrite');
      const store = tx.objectStore('meta');
      store.put({ key, value, updatedAt: Date.now() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // --- Export & Import Backup (Feature 4) ---

  /**
   * Export all database data to a clean JSON-serializable backup payload
   */
  public async exportAllData(): Promise<AppBackupPayload> {
    const [courses, lectures, progress, notes] = await Promise.all([
      this.getCourses(true),
      this.getAllLectures(),
      this.getAllProgress(),
      this.getAllNotes()
    ]);

    // Strip DOM handles which cannot be JSON serialized
    const safeCourses = courses.map((c) => {
      const { rootHandle: _, ...rest } = c;
      return {
        ...rest,
        connectionState: (c.connectionState === 'connected' ? 'needs_permission' : c.connectionState) as Course['connectionState']
      };
    });

    const safeLectures = lectures.map((l) => {
      const { fileHandle: _, ...rest } = l;
      return rest;
    });

    return {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      app: 'LocalLectureProgressTracker',
      exportedAt: Date.now(),
      courses: safeCourses,
      lectures: safeLectures,
      progress,
      notes
    };
  }

  /**
   * Import data from JSON backup payload
   */
  public async importData(
    payload: AppBackupPayload,
    mode: 'merge' | 'replace' = 'merge'
  ): Promise<{
    importedCourses: number;
    importedLectures: number;
    importedProgress: number;
    importedNotes: number;
  }> {
    if (!payload || !payload.app || !Array.isArray(payload.courses) || !Array.isArray(payload.lectures)) {
      throw new Error('Invalid backup format: missing required schema collections.');
    }

    const db = await this.getDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(['courses', 'lectures', 'progress', 'notes', 'meta'], 'readwrite');
      const courseStore = tx.objectStore('courses');
      const lectureStore = tx.objectStore('lectures');
      const progressStore = tx.objectStore('progress');
      const noteStore = tx.objectStore('notes');
      const metaStore = tx.objectStore('meta');

      if (mode === 'replace') {
        courseStore.clear();
        lectureStore.clear();
        progressStore.clear();
        noteStore.clear();
      }

      // Insert courses
      for (const course of payload.courses) {
        courseStore.put({
          ...course,
          rootHandle: null,
          connectionState: 'needs_permission'
        });
      }

      // Insert lectures
      for (const lecture of payload.lectures) {
        lectureStore.put({
          ...lecture,
          fileHandle: null
        });
      }

      // Insert progress
      for (const prog of payload.progress || []) {
        const key = TrackerDB.getProgressKey(prog.courseId, prog.lectureId);
        progressStore.put({
          ...prog,
          key
        });
      }

      // Insert notes
      for (const note of payload.notes || []) {
        noteStore.put(note);
      }

      metaStore.put({
        key: 'schemaVersion',
        value: CURRENT_SCHEMA_VERSION,
        updatedAt: Date.now()
      });

      tx.oncomplete = () => {
        resolve({
          importedCourses: payload.courses.length,
          importedLectures: payload.lectures.length,
          importedProgress: (payload.progress || []).length,
          importedNotes: (payload.notes || []).length
        });
      };

      tx.onerror = () => reject(tx.error);
    });
  }
}

// Global default instance for the app
export const db = new TrackerDB();
