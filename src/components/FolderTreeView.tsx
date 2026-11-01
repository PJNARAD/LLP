import React, { useState, useEffect } from 'react';
import { FolderTreeNode, Lecture, Progress } from '../types';
import { formatBytes, formatDuration } from '../utils/formatters';
import {
  Folder,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  Play,
  CheckCircle2,
  Clock,
  Bookmark,
  AlertTriangle,
  AlertCircle,
  FileVideo,
  ListCollapse,
  ListFilter
} from 'lucide-react';

interface FolderTreeViewProps {
  rootNode: FolderTreeNode;
  progressMap: Map<string, Progress>;
  onSelectLecture: (lecture: Lecture) => void;
  onOpenNotes: (lecture: Lecture) => void;
}

export const FolderTreeView: React.FC<FolderTreeViewProps> = ({
  rootNode,
  progressMap,
  onSelectLecture,
  onOpenNotes
}) => {
  // Set of open folder paths
  const [openFolders, setOpenFolders] = useState<Set<string>>(() => {
    // Default open all top-level directories
    const initial = new Set<string>();
    initial.add('root');
    for (const child of rootNode.children) {
      initial.add(child.id);
    }
    return initial;
  });

  const toggleFolder = (folderId: string) => {
    setOpenFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  };

  const expandAll = () => {
    const all = new Set<string>();
    function collect(node: FolderTreeNode) {
      all.add(node.id);
      for (const child of node.children) {
        collect(child);
      }
    }
    collect(rootNode);
    setOpenFolders(all);
  };

  const collapseAll = () => {
    setOpenFolders(new Set(['root']));
  };

  // Render a specific folder tree node
  const renderNode = (node: FolderTreeNode, isRoot: boolean = false) => {
    const isOpen = openFolders.has(node.id);
    const hasChildren = node.children.length > 0;
    const hasLectures = node.lectures.length > 0;
    const isEmpty = !hasChildren && !hasLectures;

    if (isEmpty && !isRoot) return null;

    return (
      <div key={node.id} className={`${isRoot ? 'space-y-3' : 'mt-1.5'}`}>
        {/* Folder Header Row (unless root) */}
        {!isRoot && (
          <div
            onClick={() => toggleFolder(node.id)}
            className="group flex items-center justify-between p-2.5 rounded-xl bg-slate-900/90 hover:bg-slate-850/80 border border-slate-800/80 hover:border-slate-700/80 transition-all cursor-pointer select-none"
          >
            <div className="flex items-center space-x-2.5 min-w-0 flex-1">
              {/* Chevron */}
              <button
                type="button"
                className="text-slate-400 group-hover:text-white transition-colors"
              >
                {isOpen ? (
                  <ChevronDown className="w-4 h-4 text-indigo-400" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-slate-500" />
                )}
              </button>

              {/* Folder Icon */}
              <div className="text-indigo-400 group-hover:text-indigo-300">
                {isOpen ? (
                  <FolderOpen className="w-4 h-4 text-indigo-400" />
                ) : (
                  <Folder className="w-4 h-4 text-slate-400 group-hover:text-indigo-400" />
                )}
              </div>

              {/* Folder Name */}
              <span className="font-semibold text-xs sm:text-sm text-slate-200 group-hover:text-white truncate font-mono">
                {node.name}
              </span>

              {/* Lecture Count Pill */}
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-950 border border-slate-800 text-slate-400 font-mono">
                {node.stats.totalLectures} {node.stats.totalLectures === 1 ? 'file' : 'files'}
              </span>
            </div>

            {/* Folder Progress & Duration metrics */}
            <div className="flex items-center space-x-3 text-xs shrink-0 pl-2">
              {node.stats.totalLectures > 0 && (
                <div className="hidden sm:flex items-center space-x-2">
                  <div className="w-20 bg-slate-950 h-1.5 rounded-full overflow-hidden border border-slate-800">
                    <div
                      className="bg-emerald-500 h-full rounded-full transition-all"
                      style={{ width: `${node.stats.completionPercentage}%` }}
                    />
                  </div>
                  <span className="text-[11px] font-mono text-emerald-400 font-medium">
                    {node.stats.completedLectures}/{node.stats.totalLectures} ({node.stats.completionPercentage}%)
                  </span>
                </div>
              )}

              {node.stats.remainingDurationSec > 0 && (
                <span className="text-[11px] font-mono text-slate-400 hidden md:inline">
                  {formatDuration(node.stats.remainingDurationSec)} left
                </span>
              )}
            </div>
          </div>
        )}

        {/* Folder Contents (Children subfolders + Lectures) */}
        {(isOpen || isRoot) && (
          <div className={`${!isRoot ? 'ml-3 sm:ml-5 pl-2 sm:pl-3 border-l border-slate-800/80 space-y-1.5 pt-1 pb-1' : 'space-y-3'}`}>
            {/* Direct Subfolders */}
            {node.children.map((child) => renderNode(child, false))}

            {/* Direct Lectures */}
            {node.lectures.length > 0 && (
              <div className="space-y-1.5">
                {node.lectures.map((lec) => renderLectureItem(lec))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // Render individual lecture row
  const renderLectureItem = (lec: Lecture) => {
    const prog = progressMap.get(lec.id);
    const isDone = prog?.completed || false;
    const isProgress = !isDone && (prog?.positionSec || 0) > 5;
    const isUnsupported = lec.supportState === 'unsupported_format';
    const isMissing = lec.supportState === 'missing_source';

    return (
      <div
        key={lec.id}
        className="px-3.5 py-2.5 rounded-xl bg-slate-900/60 hover:bg-slate-850/80 border border-slate-800/60 hover:border-slate-700/80 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 group"
      >
        <div
          onClick={() => onSelectLecture(lec)}
          className="flex items-center space-x-3 min-w-0 flex-1 cursor-pointer"
        >
          {/* Status Indicator */}
          <div className="shrink-0">
            {isDone ? (
              <div className="w-5 h-5 rounded-full bg-emerald-950/90 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.25)]">
                <CheckCircle2 className="w-3 h-3" />
              </div>
            ) : isProgress ? (
              <div className="w-5 h-5 rounded-full bg-amber-950/90 border border-amber-500/40 flex items-center justify-center text-amber-400">
                <Clock className="w-3 h-3" />
              </div>
            ) : (
              <div className="w-5 h-5 rounded-full bg-slate-950 border border-slate-800 flex items-center justify-center text-slate-500 group-hover:text-indigo-400 group-hover:border-indigo-500/50 transition-colors">
                <Play className="w-2.5 h-2.5 fill-current ml-0.5" />
              </div>
            )}
          </div>

          {/* Name & Format */}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-semibold text-xs text-slate-200 group-hover:text-indigo-300 transition-colors truncate">
                {lec.name}
              </span>
              <span className="text-[9px] px-1.5 py-0.2 rounded font-mono uppercase bg-slate-950 text-slate-400 border border-slate-800">
                {lec.ext}
              </span>

              {isUnsupported && (
                <span className="text-[9px] px-1.5 py-0.2 rounded font-medium bg-amber-950/80 text-amber-400 border border-amber-800/60 flex items-center space-x-0.5">
                  <AlertTriangle className="w-2.5 h-2.5 mr-0.5" />
                  Unsupported
                </span>
              )}

              {isMissing && (
                <span className="text-[9px] px-1.5 py-0.2 rounded font-medium bg-orange-950/80 text-orange-400 border border-orange-800/60 flex items-center space-x-0.5">
                  <AlertCircle className="w-2.5 h-2.5 mr-0.5" />
                  Missing
                </span>
              )}
            </div>

            {/* Sub-bar if in progress */}
            {isProgress && prog?.durationSec && (
              <div className="mt-1.5 w-36 bg-slate-950 h-1 rounded-full overflow-hidden border border-slate-800">
                <div
                  className="bg-gradient-to-r from-indigo-500 to-emerald-400 h-full rounded-full"
                  style={{
                    width: `${Math.min(100, (prog.positionSec / prog.durationSec) * 100)}%`
                  }}
                />
              </div>
            )}
          </div>
        </div>

        {/* Actions & Timestamps */}
        <div className="flex items-center space-x-2.5 shrink-0 text-xs text-slate-400 pl-8 sm:pl-0 font-mono">
          <span className="text-[11px] text-slate-500 hidden sm:inline">{formatBytes(lec.size)}</span>
          {prog && prog.positionSec > 0 ? (
            <span className="text-cyan-300 text-[11px]">
              {formatDuration(prog.positionSec)}
              {prog.durationSec ? ` / ${formatDuration(prog.durationSec)}` : ''}
            </span>
          ) : (
            <span className="text-[11px] text-slate-400">{formatDuration(lec.durationSec)}</span>
          )}

          {/* Bookmarks / Notes */}
          <button
            onClick={() => onOpenNotes(lec)}
            className="p-1 bg-slate-950 hover:bg-slate-800 text-slate-400 hover:text-indigo-300 rounded-lg border border-slate-800 hover:border-slate-700 transition-colors cursor-pointer"
            title="Notes & Bookmarks"
          >
            <Bookmark className="w-3.5 h-3.5" />
          </button>

          {/* Play Button */}
          <button
            onClick={() => onSelectLecture(lec)}
            className="px-2 py-0.5 bg-indigo-600/90 hover:bg-indigo-500 text-white rounded-lg text-xs font-medium flex items-center space-x-1 transition-colors cursor-pointer"
          >
            <Play className="w-2.5 h-2.5 fill-current" />
            <span>Play</span>
          </button>
        </div>
      </div>
    );
  };

  const totalFiles = rootNode.stats.totalLectures;

  return (
    <div className="space-y-3">
      {/* Tree View Controls Bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-slate-900/80 border border-slate-800/80 rounded-2xl text-xs font-mono">
        <div className="flex items-center space-x-2 text-slate-400">
          <Folder className="w-3.5 h-3.5 text-indigo-400" />
          <span>Hierarchy: {rootNode.children.length} chapters / folders • {totalFiles} lectures</span>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={expandAll}
            className="px-2.5 py-1 bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800 rounded-lg text-[11px] font-medium transition-colors cursor-pointer"
          >
            Expand All
          </button>
          <button
            onClick={collapseAll}
            className="px-2.5 py-1 bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800 rounded-lg text-[11px] font-medium transition-colors cursor-pointer"
          >
            Collapse All
          </button>
        </div>
      </div>

      {/* Render Hierarchical Tree */}
      <div className="bg-slate-900/40 border border-slate-800/80 rounded-3xl p-3 sm:p-4 shadow-sm">
        {renderNode(rootNode, true)}
      </div>
    </div>
  );
};
