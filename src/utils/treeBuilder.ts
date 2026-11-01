import { FolderTreeNode, FolderNodeStats, Lecture, Progress } from '../types';

/**
 * Builds a hierarchical tree structure of folders and lectures
 * supporting arbitrary directory nesting depth.
 */
export function buildFolderTree(
  lectures: Lecture[],
  progressMap: Map<string, Progress>
): FolderTreeNode {
  interface MutableNode {
    id: string;
    name: string;
    fullPath: string;
    depth: number;
    lectures: Lecture[];
    childrenMap: Map<string, MutableNode>;
  }

  const root: MutableNode = {
    id: 'root',
    name: 'Root Folder',
    fullPath: '',
    depth: 0,
    lectures: [],
    childrenMap: new Map()
  };

  // Group lectures into folders based on relativePath
  for (const lecture of lectures) {
    const rawSegments = lecture.relativePath.split('/').filter(Boolean);
    // The last segment is the filename; preceding segments are directory names
    const dirSegments = rawSegments.slice(0, -1);

    let currentNode = root;
    let accumulatedPath = '';

    for (let i = 0; i < dirSegments.length; i++) {
      const seg = dirSegments[i];
      accumulatedPath = accumulatedPath ? `${accumulatedPath}/${seg}` : seg;

      if (!currentNode.childrenMap.has(seg)) {
        currentNode.childrenMap.set(seg, {
          id: accumulatedPath,
          name: seg,
          fullPath: accumulatedPath,
          depth: i + 1,
          lectures: [],
          childrenMap: new Map()
        });
      }
      currentNode = currentNode.childrenMap.get(seg)!;
    }

    currentNode.lectures.push(lecture);
  }

  // Recursively finalize nodes into FolderTreeNode and calculate stats
  function finalizeNode(node: MutableNode): FolderTreeNode {
    // Sort direct lectures by relativePath or name naturally
    node.lectures.sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
    );

    // Convert children map to sorted array
    const sortedChildren = Array.from(node.childrenMap.values())
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))
      .map(finalizeNode);

    // Calculate stats
    let totalLectures = node.lectures.length;
    let completedLectures = 0;
    let inProgressLectures = 0;
    let notStartedLectures = 0;
    let totalDurationSec = 0;
    let remainingDurationSec = 0;

    for (const lec of node.lectures) {
      const p = progressMap.get(lec.id);
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
        remainingDurationSec += Math.max(0, lec.durationSec - pos);
      }
    }

    // Accumulate child folder stats
    for (const child of sortedChildren) {
      totalLectures += child.stats.totalLectures;
      completedLectures += child.stats.completedLectures;
      inProgressLectures += child.stats.inProgressLectures;
      notStartedLectures += child.stats.notStartedLectures;
      totalDurationSec += child.stats.totalDurationSec;
      remainingDurationSec += child.stats.remainingDurationSec;
    }

    const completionPercentage =
      totalLectures > 0 ? Math.round((completedLectures / totalLectures) * 100) : 0;

    const stats: FolderNodeStats = {
      totalLectures,
      completedLectures,
      inProgressLectures,
      notStartedLectures,
      totalDurationSec,
      remainingDurationSec,
      completionPercentage
    };

    return {
      id: node.id,
      name: node.name,
      fullPath: node.fullPath,
      depth: node.depth,
      lectures: node.lectures,
      children: sortedChildren,
      stats
    };
  }

  return finalizeNode(root);
}
