/**
 * Helper to build mock directory trees for Phase 12 testing
 */

import {
  FSDirectoryNode,
  FSFileNode,
  MockFileSystemDirectoryHandle
} from '../scanner/fsAdapter';

export interface MockFixtureOptions {
  candidateCount: number;
  subdirectories?: number;
  uppercaseExtensions?: boolean;
  mixedFormats?: boolean;
  duplicateFilenamesAcrossDirs?: boolean;
  inaccessibleFilesCount?: number;
}

export function buildMockDirectoryTree(
  rootName: string,
  options: MockFixtureOptions
): MockFileSystemDirectoryHandle {
  const rootNode: FSDirectoryNode = {
    name: rootName,
    kind: 'directory',
    entries: {}
  };

  const formats = options.mixedFormats
    ? ['mp4', 'webm', 'ogg', 'mov', 'm4v', 'avi', 'mkv', '3gp']
    : ['mp4'];

  const subdirsCount = options.subdirectories || 1;
  const subdirNodes: FSDirectoryNode[] = [];

  for (let s = 1; s <= subdirsCount; s++) {
    const subName = `Module_${s.toString().padStart(2, '0')}`;
    const subNode: FSDirectoryNode = {
      name: subName,
      kind: 'directory',
      entries: {}
    };
    rootNode.entries[subName] = subNode;
    subdirNodes.push(subNode);
  }

  // Distribute candidates across subdirectories
  for (let i = 1; i <= options.candidateCount; i++) {
    const targetDir = subdirNodes[(i - 1) % subdirNodes.length];
    const rawExt = formats[(i - 1) % formats.length];
    let ext = rawExt;

    if (options.uppercaseExtensions) {
      if (i % 3 === 0) ext = rawExt.toUpperCase();
      else if (i % 3 === 1) ext = rawExt.charAt(0).toUpperCase() + rawExt.slice(1);
    }

    // Name generation: When duplicateFilenamesAcrossDirs is true, every directory shares
    // identical names (e.g., Lecture_01 to Lecture_10 in Module_01, Module_02, etc.)
    const fileIndexInDir = Math.floor((i - 1) / subdirNodes.length) + 1;
    const baseName = options.duplicateFilenamesAcrossDirs
      ? `Lecture_${fileIndexInDir.toString().padStart(2, '0')}`
      : `Lecture_${i.toString().padStart(3, '0')}`;
    const fileName = `${baseName}.${ext}`;

    const isThrow = options.inaccessibleFilesCount && i <= options.inaccessibleFilesCount;

    const fileNode: FSFileNode = {
      name: fileName,
      kind: 'file',
      size: 1024 * 1024 * (10 + (i % 20)),
      lastModified: 1700000000000 + i * 10000,
      throwOnAccess: !!isThrow
    };

    targetDir.entries[fileName] = fileNode;
  }

  return new MockFileSystemDirectoryHandle(rootName, rootNode);
}
