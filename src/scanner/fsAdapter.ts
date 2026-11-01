/**
 * Filesystem Adapter
 * Provides a unified interface over:
 * 1. File System Access API (Chromium primary)
 * 2. webkitdirectory <input> fallback (Firefox/Safari/legacy)
 * 3. MockDirectoryHandle for automated Vitest suites
 */

export interface UnifiedFileEntry {
  name: string;
  relativePath: string;
  size: number;
  lastModified: number;
  handle?: FileSystemFileHandle | null;
  fileObj?: File | null;
}

export interface FSDirectoryNode {
  name: string;
  kind: 'directory';
  entries: Record<string, FSNode>;
}

export interface FSFileNode {
  name: string;
  kind: 'file';
  size: number;
  lastModified: number;
  content?: Uint8Array;
  throwOnAccess?: boolean;
}

export type FSNode = FSDirectoryNode | FSFileNode;

export class MockFileSystemDirectoryHandle {
  readonly kind = 'directory' as const;
  readonly name: string;
  private node: FSDirectoryNode;

  constructor(name: string, node: FSDirectoryNode) {
    this.name = name;
    this.node = node;
  }

  async *values(): AsyncIterable<MockFileSystemDirectoryHandle | MockFileSystemFileHandle> {
    for (const [name, child] of Object.entries(this.node.entries)) {
      if (child.kind === 'directory') {
        yield new MockFileSystemDirectoryHandle(name, child);
      } else {
        yield new MockFileSystemFileHandle(name, child);
      }
    }
  }

  async *entries(): AsyncIterable<[string, MockFileSystemDirectoryHandle | MockFileSystemFileHandle]> {
    for (const [name, child] of Object.entries(this.node.entries)) {
      if (child.kind === 'directory') {
        yield [name, new MockFileSystemDirectoryHandle(name, child)];
      } else {
        yield [name, new MockFileSystemFileHandle(name, child)];
      }
    }
  }

  async isSameEntry(other: any): Promise<boolean> {
    return other instanceof MockFileSystemDirectoryHandle && other.node === this.node;
  }
}

export class MockFileSystemFileHandle {
  readonly kind = 'file' as const;
  readonly name: string;
  private node: FSFileNode;

  constructor(name: string, node: FSFileNode) {
    this.name = name;
    this.node = node;
  }

  async getFile(): Promise<File> {
    if (this.node.throwOnAccess) {
      throw new Error(`Permission denied or unreadable file: ${this.name}`);
    }
    const buffer = new ArrayBuffer(this.node.size);
    const blob = new Blob([buffer]);
    return new File([blob], this.name, {
      lastModified: this.node.lastModified,
      type: 'video/mp4'
    });
  }

  async isSameEntry(other: any): Promise<boolean> {
    return other instanceof MockFileSystemFileHandle && other.node === this.node;
  }
}

/**
 * Check if the browser supports the File System Access API
 */
export function isFileSystemAccessSupported(): boolean {
  return typeof window !== 'undefined' && typeof (window as any).showDirectoryPicker === 'function';
}

/**
 * Open the native directory picker or throw if unsupported
 */
export async function pickNativeDirectory(): Promise<FileSystemDirectoryHandle> {
  if (!isFileSystemAccessSupported()) {
    throw new Error('FILE_SYSTEM_ACCESS_UNSUPPORTED');
  }
  return await (window as any).showDirectoryPicker({
    mode: 'read'
  });
}

/**
 * Verify or re-request read permission for a stored directory/file handle
 */
export async function verifyHandlePermission(
  handle: any,
  readWrite = false
): Promise<boolean> {
  if (!handle || typeof handle.queryPermission !== 'function') {
    return false;
  }

  const options: Record<string, string> = { mode: readWrite ? 'readwrite' : 'read' };

  try {
    const query = await handle.queryPermission(options);
    if (query === 'granted') {
      return true;
    }
    const request = await handle.requestPermission(options);
    return request === 'granted';
  } catch (err) {
    console.warn('Error querying/requesting handle permission:', err);
    return false;
  }
}

/**
 * Normalize paths to use forward slashes and strip leading/trailing slashes
 */
export function normalizePath(p: string): string {
  return p.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
}
