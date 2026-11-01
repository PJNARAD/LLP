import React, { useState, useEffect, useCallback } from 'react';
import { useCourseStore } from '../store/courseContext';
import { LectureNote } from '../types';
import { db } from '../db/indexedDB';
import { formatDuration, formatTimeAgo } from '../utils/formatters';
import {
  X,
  Bookmark,
  Clock,
  Plus,
  Trash2,
  Edit2,
  Check,
  Search,
  Download,
  Copy,
  Play,
  FileText
} from 'lucide-react';

export const NotesDrawer: React.FC = () => {
  const {
    isNotesDrawerOpen,
    closeNotesDrawer,
    notesDrawerLecture,
    currentCourse,
    activeLecture,
    activeView,
    selectLecture,
    seekTo
  } = useCourseStore();

  const [notes, setNotes] = useState<LectureNote[]>([]);
  const [newContent, setNewContent] = useState('');
  const [newTimestampSec, setNewTimestampSec] = useState<number>(0);
  const [hasTimestamp, setHasTimestamp] = useState(true);
  const [searchFilter, setSearchFilter] = useState('');

  // Editing state
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState('');

  const [copyFeedback, setCopyFeedback] = useState(false);

  const targetLecture = notesDrawerLecture || activeLecture;

  const loadNotes = useCallback(async () => {
    if (!currentCourse || !targetLecture) return;
    try {
      const items = await db.getNotesForLecture(currentCourse.id, targetLecture.id);
      setNotes(items);
    } catch (err) {
      console.error('Failed to load notes for drawer:', err);
    }
  }, [currentCourse, targetLecture]);

  useEffect(() => {
    if (isNotesDrawerOpen && targetLecture) {
      loadNotes();
    }
  }, [isNotesDrawerOpen, targetLecture, loadNotes]);

  if (!isNotesDrawerOpen || !targetLecture || !currentCourse) return null;

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContent.trim()) return;

    const note: LectureNote = {
      id: crypto.randomUUID(),
      courseId: currentCourse.id,
      lectureId: targetLecture.id,
      content: newContent.trim(),
      timestampSec: hasTimestamp ? Math.max(0, Math.floor(newTimestampSec)) : 0,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    await db.saveNote(note);
    setNewContent('');
    await loadNotes();
  };

  const handleDelete = async (id: string) => {
    await db.deleteNote(id);
    await loadNotes();
  };

  const handleStartEdit = (note: LectureNote) => {
    setEditingNoteId(note.id);
    setEditingContent(note.content);
  };

  const handleSaveEdit = async (note: LectureNote) => {
    if (!editingContent.trim()) return;
    const updated: LectureNote = {
      ...note,
      content: editingContent.trim(),
      updatedAt: Date.now()
    };
    await db.saveNote(updated);
    setEditingNoteId(null);
    await loadNotes();
  };

  const handleJumpToTimestamp = (sec: number) => {
    seekTo(sec);
    if (activeView !== 'player' || activeLecture?.id !== targetLecture.id) {
      selectLecture(targetLecture, sec);
    }
  };

  const filteredNotes = notes.filter((n) =>
    n.content.toLowerCase().includes(searchFilter.toLowerCase())
  );

  const handleCopyMarkdown = () => {
    const md = [
      `# Notes for ${targetLecture.name}`,
      `Course: ${currentCourse.name}`,
      `File: ${targetLecture.relativePath}`,
      '',
      ...notes.map((n) => `- **[${formatDuration(n.timestampSec)}]**: ${n.content}`)
    ].join('\n');

    navigator.clipboard.writeText(md);
    setCopyFeedback(true);
    setTimeout(() => setCopyFeedback(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-md transition-opacity animate-in fade-in duration-150">
      <div className="w-full max-w-md bg-slate-900 border-l border-slate-800/80 h-full flex flex-col shadow-2xl text-slate-100 animate-in slide-in-from-right duration-200">
        {/* Drawer Header */}
        <div className="px-5 py-4 border-b border-slate-800/80 bg-slate-900/95 flex items-center justify-between">
          <div className="flex items-center space-x-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0">
              <Bookmark className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-xs font-bold text-white truncate">{targetLecture.name}</h3>
              <p className="text-[10px] text-slate-400 font-mono truncate">Notes & Timestamped Bookmarks</p>
            </div>
          </div>
          <button
            onClick={closeNotesDrawer}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Toolbar: Search & Export Markdown */}
        <div className="px-5 py-2.5 border-b border-slate-800/80 bg-slate-950/60 flex items-center justify-between gap-2">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
            <input
              type="text"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder="Search notes..."
              className="w-full pl-8 pr-2 py-1 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <button
            onClick={handleCopyMarkdown}
            disabled={notes.length === 0}
            className="px-2.5 py-1 bg-slate-950 hover:bg-slate-800 border border-slate-800 disabled:opacity-40 text-slate-300 rounded-lg text-xs font-medium flex items-center space-x-1.5 transition-colors cursor-pointer shrink-0"
            title="Copy as Markdown"
          >
            {copyFeedback ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-400 text-[11px] font-mono">Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-[11px] font-mono">Export MD</span>
              </>
            )}
          </button>
        </div>

        {/* Notes List */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {filteredNotes.length === 0 ? (
            <div className="text-center py-20 text-slate-500 text-xs space-y-2">
              <FileText className="w-10 h-10 text-slate-700 mx-auto" />
              <p className="font-semibold text-slate-400">No notes or bookmarks yet</p>
              <p className="text-[11px] max-w-xs mx-auto text-slate-500 font-mono">
                Add key concepts, code snippets, or reminders linked to specific timestamps.
              </p>
            </div>
          ) : (
            filteredNotes.map((note) => (
              <div
                key={note.id}
                className="p-3.5 bg-slate-950/70 hover:bg-slate-950 border border-slate-800 rounded-2xl text-xs space-y-2 transition-all group shadow-xs"
              >
                <div className="flex items-center justify-between">
                  {note.timestampSec > 0 ? (
                    <button
                      onClick={() => handleJumpToTimestamp(note.timestampSec)}
                      className="inline-flex items-center space-x-1.5 font-mono font-bold text-indigo-400 hover:text-indigo-300 bg-indigo-950/60 hover:bg-indigo-900/60 px-2 py-0.5 rounded border border-indigo-800/60 transition-colors cursor-pointer"
                      title="Click to jump to this position in video player"
                    >
                      <Play className="w-3 h-3 fill-current" />
                      <span>{formatDuration(note.timestampSec)}</span>
                    </button>
                  ) : (
                    <span className="inline-flex items-center space-x-1 font-mono text-[10px] text-slate-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                      <Bookmark className="w-3 h-3" />
                      <span>GENERAL NOTE</span>
                    </span>
                  )}

                  <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => handleStartEdit(note)}
                      className="p-1 text-slate-400 hover:text-white transition-colors cursor-pointer"
                      title="Edit note"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(note.id)}
                      className="p-1 text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
                      title="Delete note"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {editingNoteId === note.id ? (
                  <div className="space-y-2 pt-1">
                    <textarea
                      value={editingContent}
                      onChange={(e) => setEditingContent(e.target.value)}
                      rows={3}
                      className="w-full px-2.5 py-1.5 bg-slate-900 border border-indigo-500 rounded-xl text-xs text-white focus:outline-none"
                      autoFocus
                    />
                    <div className="flex justify-end space-x-2">
                      <button
                        onClick={() => setEditingNoteId(null)}
                        className="px-2.5 py-1 bg-slate-800 text-slate-300 rounded-lg text-[11px]"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleSaveEdit(note)}
                        className="px-2.5 py-1 bg-indigo-600 text-white rounded-lg text-[11px] font-semibold"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-slate-200 text-xs leading-relaxed whitespace-pre-wrap font-sans">
                    {note.content}
                  </p>
                )}

                <div className="text-[10px] text-slate-500 font-mono flex items-center justify-between pt-1 border-t border-slate-800/60">
                  <span>{formatTimeAgo(note.updatedAt || note.createdAt)}</span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Add Note Form at Bottom */}
        <form onSubmit={handleAddNote} className="p-4 border-t border-slate-800/80 bg-slate-950/90 space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-300">
            <span className="font-semibold text-slate-200">Add Timestamped Note</span>
            <label className="flex items-center space-x-1.5 cursor-pointer text-[11px] font-mono text-slate-400">
              <input
                type="checkbox"
                checked={hasTimestamp}
                onChange={(e) => setHasTimestamp(e.target.checked)}
                className="rounded bg-slate-900 border-slate-700 text-indigo-600 focus:ring-0"
              />
              <span>Attach timestamp</span>
            </label>
          </div>

          {hasTimestamp && (
            <div className="flex items-center space-x-2 text-xs bg-slate-900 p-2 rounded-xl border border-slate-800">
              <Clock className="w-3.5 h-3.5 text-indigo-400" />
              <span className="text-slate-400 font-mono text-[11px]">Timestamp (s):</span>
              <input
                type="number"
                min="0"
                value={newTimestampSec}
                onChange={(e) => setNewTimestampSec(Math.max(0, parseInt(e.target.value) || 0))}
                className="w-20 px-2 py-0.5 bg-slate-950 border border-slate-800 rounded-lg text-center font-mono text-white text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <span className="font-mono text-cyan-300 text-[11px]">
                ({formatDuration(newTimestampSec)})
              </span>
            </div>
          )}

          <textarea
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            placeholder="Type notes or code remarks..."
            rows={2}
            className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />

          <button
            type="submit"
            disabled={!newContent.trim()}
            className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-xl text-xs font-semibold flex items-center justify-center space-x-1.5 transition-colors cursor-pointer shadow-[0_0_12px_rgba(99,102,241,0.2)]"
          >
            <Plus className="w-4 h-4" />
            <span>Save Note & Bookmark</span>
          </button>
        </form>
      </div>
    </div>
  );
};
