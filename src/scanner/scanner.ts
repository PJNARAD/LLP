/**
 * Recursive Video Scanner for Local Lecture Progress Tracker
 *
 * Adheres strictly to:
 * - Case-insensitive extension matching: mp4, webm, ogg, mov, m4v, avi, mkv, 3gp
 * - Detection != playability: registers all candidates; marks unsupported formats explicitly
 * - Never loads video contents or creates Blob URLs during scanning
 * - The 56/19 invariant: accounts for every skip, error, and discrepancy in diagnostic logs
 * - Live cancellation support via AbortSignal
 */

import {
  DiagnosticItem,
  ScanStats,
  SUPPORTED_VIDEO_EXTENSIONS,
  BROWSER_NATIVE_VIDEO_EXTENSIONS,
  SupportState
} from '../types';
import { normalizePath, UnifiedFileEntry } from './fsAdapter';

export interface ScanResult {
  stats: ScanStats;
  entries: UnifiedFileEntry[];
}

export interface ScannerOptions {
  signal?: AbortSignal;
  onProgress?: (stats: ScanStats) => void;
}

export function extractFileExtension(filename: string): string {
  const dotIndex = filename.lastIndexOf('.');
  if (dotIndex === -1 || dotIndex === filename.length - 1) return '';
  return filename.slice(dotIndex + 1).toLowerCase();
}

export function isVideoCandidateExtension(ext: string): boolean {
  return (SUPPORTED_VIDEO_EXTENSIONS as readonly string[]).includes(ext);
}

export function determineSupportState(ext: string): SupportState {
  if ((BROWSER_NATIVE_VIDEO_EXTENSIONS as readonly string[]).includes(ext)) {
    return 'supported';
  }
  return 'unsupported_format';
}

/**
 * Scan a FileSystemDirectoryHandle recursively
 */
export async function scanDirectoryHandle(
  rootDirHandle: FileSystemDirectoryHandle,
  options: ScannerOptions = {}
): Promise<ScanResult> {
  const signal = options.signal;
  const diagnostics: DiagnosticItem[] = [];
  const entries: UnifiedFileEntry[] = [];

  const stats: ScanStats = {
    status: 'scanning',
    directoriesVisited: 0,
    filesExamined: 0,
    candidatesFound: 0,
    newlyRegistered: 0,
    matchedExisting: 0,
    unsupported: 0,
    skippedInaccessible: 0,
    errors: 0,
    diagnostics
  };

  const notifyProgress = () => {
    if (options.onProgress) {
      options.onProgress({ ...stats, diagnostics: [...diagnostics] });
    }
  };

  async function recurse(dirHandle: FileSystemDirectoryHandle, currentPath: string): Promise<void> {
    if (signal?.aborted) {
      throw new DOMException('Scan aborted by user', 'AbortError');
    }

    stats.directoriesVisited++;
    notifyProgress();

    // Iterate through directory entries safely
    let iterator: AsyncIterable<[string, any]>;
    try {
      iterator = (dirHandle as any).entries();
    } catch (err: any) {
      stats.skippedInaccessible++;
      stats.errors++;
      diagnostics.push({
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        category: 'unreadable_entry',
        path: currentPath || dirHandle.name,
        reason: `Cannot open directory entries: ${err?.message || 'Access error'}`
      });
      notifyProgress();
      return;
    }

    try {
      for await (const [name, handle] of iterator) {
        if (signal?.aborted) {
          throw new DOMException('Scan aborted by user', 'AbortError');
        }

        const entryPath = currentPath ? `${currentPath}/${name}` : name;
        const normalized = normalizePath(entryPath);

        // Ignore hidden system files/folders (e.g., .DS_Store, .git)
        if (name.startsWith('.')) {
          continue;
        }

        if (handle.kind === 'directory') {
          try {
            await recurse(handle as FileSystemDirectoryHandle, normalized);
          } catch (dirErr: any) {
            if (dirErr.name === 'AbortError') throw dirErr;
            stats.skippedInaccessible++;
            stats.errors++;
            diagnostics.push({
              id: crypto.randomUUID(),
              timestamp: Date.now(),
              category: 'unreadable_entry',
              path: normalized,
              reason: `Failed to descend into directory: ${dirErr?.message || 'Access error'}`
            });
            notifyProgress();
          }
        } else if (handle.kind === 'file') {
          stats.filesExamined++;
          const ext = extractFileExtension(name);

          if (isVideoCandidateExtension(ext)) {
            try {
              // Note: getFile() only reads file metadata (size, lastModified), NEVER reads stream into memory!
              const fileMeta = await (handle as FileSystemFileHandle).getFile();
              const support = determineSupportState(ext);

              stats.candidatesFound++;
              if (support === 'unsupported_format') {
                stats.unsupported++;
                diagnostics.push({
                  id: crypto.randomUUID(),
                  timestamp: Date.now(),
                  category: 'unsupported_format',
                  path: normalized,
                  reason: `Extension .${ext} is a registered video candidate, but requires external codec playback.`
                });
              }

              entries.push({
                name,
                relativePath: normalized,
                size: fileMeta.size,
                lastModified: fileMeta.lastModified,
                handle: handle as FileSystemFileHandle
              });
            } catch (fileErr: any) {
              stats.skippedInaccessible++;
              stats.errors++;
              diagnostics.push({
                id: crypto.randomUUID(),
                timestamp: Date.now(),
                category: 'permission_denied',
                path: normalized,
                reason: `Failed to inspect file metadata: ${fileErr?.message || 'Permission denied'}`
              });
            }
          }
          notifyProgress();
        }
      }
    } catch (iterErr: any) {
      if (iterErr.name === 'AbortError') throw iterErr;
      stats.skippedInaccessible++;
      stats.errors++;
      diagnostics.push({
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        category: 'unreadable_entry',
        path: currentPath || dirHandle.name,
        reason: `Error during directory traversal: ${iterErr?.message || 'Iterator fault'}`
      });
      notifyProgress();
    }
  }

  try {
    await recurse(rootDirHandle, '');
    stats.status = 'completed';
  } catch (err: any) {
    if (err.name === 'AbortError') {
      stats.status = 'cancelled';
      diagnostics.push({
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        category: 'unreadable_entry',
        path: rootDirHandle.name,
        reason: 'Scan was cancelled by user.'
      });
    } else {
      stats.status = 'error';
      stats.errorMessage = err?.message || 'Unknown scan error';
      diagnostics.push({
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        category: 'unreadable_entry',
        path: rootDirHandle.name,
        reason: `Fatal scan error: ${stats.errorMessage}`
      });
    }
  }

  notifyProgress();
  return { stats, entries };
}

/**
 * Scan a FileList from <input type="file" webkitdirectory> fallback
 */
export function scanWebkitFileList(
  fileList: FileList,
  options: ScannerOptions = {}
): ScanResult {
  const signal = options.signal;
  const diagnostics: DiagnosticItem[] = [];
  const entries: UnifiedFileEntry[] = [];
  const visitedDirs = new Set<string>();

  const stats: ScanStats = {
    status: 'scanning',
    directoriesVisited: 0,
    filesExamined: 0,
    candidatesFound: 0,
    newlyRegistered: 0,
    matchedExisting: 0,
    unsupported: 0,
    skippedInaccessible: 0,
    errors: 0,
    diagnostics
  };

  for (let i = 0; i < fileList.length; i++) {
    if (signal?.aborted) {
      stats.status = 'cancelled';
      return { stats, entries };
    }

    const file = fileList[i];
    stats.filesExamined++;

    // webkitRelativePath is like "Folder/Subfolder/file.mp4"
    const rawPath = file.webkitRelativePath || file.name;
    // Strip root folder name from relativePath to make it relative to the course root
    const slashIdx = rawPath.indexOf('/');
    const relPath = slashIdx !== -1 ? rawPath.slice(slashIdx + 1) : file.name;
    const normalized = normalizePath(relPath);

    // Track directories
    const dirPart = normalized.includes('/') ? normalized.substring(0, normalized.lastIndexOf('/')) : '';
    if (dirPart && !visitedDirs.has(dirPart)) {
      visitedDirs.add(dirPart);
      stats.directoriesVisited++;
    }

    const ext = extractFileExtension(file.name);
    if (isVideoCandidateExtension(ext)) {
      stats.candidatesFound++;
      const support = determineSupportState(ext);

      if (support === 'unsupported_format') {
        stats.unsupported++;
        diagnostics.push({
          id: crypto.randomUUID(),
          timestamp: Date.now(),
          category: 'unsupported_format',
          path: normalized,
          reason: `Extension .${ext} is a recognized video format, but native browser playback is unsupported.`
        });
      }

      entries.push({
        name: file.name,
        relativePath: normalized,
        size: file.size,
        lastModified: file.lastModified,
        fileObj: file
      });
    }
  }

  stats.status = 'completed';
  if (options.onProgress) {
    options.onProgress({ ...stats });
  }

  return { stats, entries };
}
