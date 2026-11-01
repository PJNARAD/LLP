/**
 * In-memory Session File Store & Media Stream Resolvers
 *
 * Keeps active File references during browser sessions so that:
 * 1. Lectures imported via <input webkitdirectory> or <input type="file"> stream natively.
 * 2. Directly selected or drag-dropped files link instantly to active lectures.
 * 3. File System Access handles are traversed safely via rootHandle if deep handles detach.
 */

import { verifyHandlePermission } from './fsAdapter';

class SessionFileStore {
  private filesByLectureId = new Map<string, File>();
  private filesByPathKey = new Map<string, File>(); // courseId + '::' + relativePath
  private filesByNameKey = new Map<string, File>(); // courseId + '::' + filename

  /**
   * Store a file for a specific lecture ID and path keys
   */
  storeFile(courseId: string, lectureId: string, file: File, relativePath?: string): void {
    this.filesByLectureId.set(lectureId, file);
    if (relativePath) {
      this.filesByPathKey.set(`${courseId}::${relativePath}`, file);
    }
    this.filesByNameKey.set(`${courseId}::${file.name}`, file);
  }

  /**
   * Register a batch of files (e.g. from <input webkitdirectory> or multi-file input)
   */
  registerFiles(courseId: string, files: File[] | FileList): void {
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const rawPath = (file as any).webkitRelativePath || file.name;
      const slashIdx = rawPath.indexOf('/');
      const relPath = slashIdx !== -1 ? rawPath.slice(slashIdx + 1) : file.name;

      this.filesByPathKey.set(`${courseId}::${relPath}`, file);
      this.filesByNameKey.set(`${courseId}::${file.name}`, file);
    }
  }

  /**
   * Look up a file by lecture ID, relative path, or file name
   */
  getFile(
    courseId: string,
    lectureId: string,
    relativePath?: string,
    fileName?: string
  ): File | null {
    if (this.filesByLectureId.has(lectureId)) {
      return this.filesByLectureId.get(lectureId)!;
    }
    if (relativePath && this.filesByPathKey.has(`${courseId}::${relativePath}`)) {
      const f = this.filesByPathKey.get(`${courseId}::${relativePath}`)!;
      this.filesByLectureId.set(lectureId, f);
      return f;
    }
    if (fileName && this.filesByNameKey.has(`${courseId}::${fileName}`)) {
      const f = this.filesByNameKey.get(`${courseId}::${fileName}`)!;
      this.filesByLectureId.set(lectureId, f);
      return f;
    }
    return null;
  }

  /**
   * Check if a file is cached for a lecture
   */
  hasFile(courseId: string, lectureId: string, relativePath?: string, fileName?: string): boolean {
    return this.getFile(courseId, lectureId, relativePath, fileName) !== null;
  }

  /**
   * Clear session files for a course
   */
  clearCourse(courseId: string): void {
    const prefix = `${courseId}::`;
    for (const key of this.filesByPathKey.keys()) {
      if (key.startsWith(prefix)) {
        this.filesByPathKey.delete(key);
      }
    }
    for (const key of this.filesByNameKey.keys()) {
      if (key.startsWith(prefix)) {
        this.filesByNameKey.delete(key);
      }
    }
  }
}

export const sessionFileStore = new SessionFileStore();

/**
 * Traverse directory handles safely using relativePath to obtain a File object
 */
export async function getFileFromRootHandle(
  rootHandle: FileSystemDirectoryHandle,
  relativePath: string
): Promise<File | null> {
  try {
    const hasPermission = await verifyHandlePermission(rootHandle, false);
    if (!hasPermission) {
      return null;
    }

    const segments = relativePath.split('/').filter(Boolean);
    if (segments.length === 0) return null;

    let currentDir: FileSystemDirectoryHandle = rootHandle;
    for (let i = 0; i < segments.length - 1; i++) {
      currentDir = await currentDir.getDirectoryHandle(segments[i]);
    }

    const targetFileName = segments[segments.length - 1];
    const fileHandle = await currentDir.getFileHandle(targetFileName);
    return await fileHandle.getFile();
  } catch (err) {
    console.warn(`Failed to resolve file from rootHandle for "${relativePath}":`, err);
    return null;
  }
}

/**
 * Attempt to obtain a File for playback using:
 * 1. sessionFileStore (instant)
 * 2. activeLecture.fileHandle (direct handle)
 * 3. currentCourse.rootHandle (directory traversal)
 */
export async function resolveLectureMediaFile(
  courseId: string,
  lectureId: string,
  relativePath: string,
  fileName: string,
  fileHandle?: FileSystemFileHandle | null,
  rootHandle?: FileSystemDirectoryHandle | null
): Promise<File | null> {
  // 1. In-memory session store
  const cached = sessionFileStore.getFile(courseId, lectureId, relativePath, fileName);
  if (cached) {
    return cached;
  }

  // 2. Direct fileHandle
  if (fileHandle) {
    try {
      const hasPerm = await verifyHandlePermission(fileHandle, false);
      if (hasPerm) {
        const file = await fileHandle.getFile();
        sessionFileStore.storeFile(courseId, lectureId, file, relativePath);
        return file;
      }
    } catch (err) {
      console.warn('Direct fileHandle getFile() failed:', err);
    }
  }

  // 3. Fallback traversal via course rootHandle
  if (rootHandle) {
    try {
      const file = await getFileFromRootHandle(rootHandle, relativePath);
      if (file) {
        sessionFileStore.storeFile(courseId, lectureId, file, relativePath);
        return file;
      }
    } catch (err) {
      console.warn('Root handle traversal failed:', err);
    }
  }

  return null;
}

/**
 * Create a browser-compatible Blob URL from a video File
 */
export function createPlayableBlobUrl(file: File): string {
  // Determine if MIME type is missing or needs fallback
  if (!file.type || file.type === 'application/octet-stream') {
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    let mime = 'video/mp4';
    if (ext === 'webm') mime = 'video/webm';
    else if (ext === 'ogg' || ext === 'ogv') mime = 'video/ogg';
    else if (ext === 'mov') mime = 'video/quicktime';

    const typedBlob = new Blob([file], { type: mime });
    return URL.createObjectURL(typedBlob);
  }

  return URL.createObjectURL(file);
}
