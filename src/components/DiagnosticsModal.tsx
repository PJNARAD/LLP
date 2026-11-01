import React from 'react';
import { DiagnosticItem } from '../types';
import { X, AlertTriangle, AlertCircle, Info, ShieldAlert, CheckCircle2 } from 'lucide-react';

interface DiagnosticsModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  diagnostics: DiagnosticItem[];
  summaryCounts?: {
    candidatesFound?: number;
    registered?: number;
    unsupported?: number;
    skipped?: number;
    errors?: number;
  };
}

export const DiagnosticsModal: React.FC<DiagnosticsModalProps> = ({
  isOpen,
  onClose,
  title = 'Scan & Diagnostic Report',
  diagnostics,
  summaryCounts
}) => {
  if (!isOpen) return null;

  const [activeCategory, setActiveCategory] = React.useState<string>('all');

  const filtered = diagnostics.filter((item) => {
    if (activeCategory === 'all') return true;
    return item.category === activeCategory;
  });

  const getIconForCategory = (cat: DiagnosticItem['category']) => {
    switch (cat) {
      case 'unsupported_format':
        return <AlertTriangle className="w-4 h-4 text-amber-400" />;
      case 'permission_denied':
        return <ShieldAlert className="w-4 h-4 text-red-400" />;
      case 'unreadable_entry':
        return <AlertCircle className="w-4 h-4 text-rose-400" />;
      case 'db_write_error':
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      case 'missing_source':
        return <AlertCircle className="w-4 h-4 text-orange-400" />;
      default:
        return <Info className="w-4 h-4 text-blue-400" />;
    }
  };

  const getCategoryLabel = (cat: DiagnosticItem['category']) => {
    switch (cat) {
      case 'unsupported_format':
        return 'Unsupported Format';
      case 'permission_denied':
        return 'Permission Denied';
      case 'unreadable_entry':
        return 'Unreadable Entry';
      case 'db_write_error':
        return 'DB Write Error';
      case 'missing_source':
        return 'Missing Source';
      case 'filter_exclusion':
        return 'Filter Exclusion';
      default:
        return cat;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-150">
      <div className="bg-slate-900 border border-slate-800/90 rounded-3xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl text-slate-100 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800/80 flex items-center justify-between bg-slate-900/95">
          <div>
            <h3 className="text-sm font-bold text-white tracking-tight">{title}</h3>
            <p className="text-[11px] text-slate-400 font-mono">
              The 56/19 invariant: Every single discrepancy, skip, and unplayable format is tracked here.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Summary Bar if provided */}
        {summaryCounts && (
          <div className="px-6 py-3 bg-slate-950/60 border-b border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800">
              <span className="text-slate-400 block text-[11px]">Candidates Found</span>
              <span className="text-base font-bold text-indigo-400">{summaryCounts.candidatesFound ?? 0}</span>
            </div>
            <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800">
              <span className="text-slate-400 block text-[11px]">Registered In DB</span>
              <span className="text-base font-bold text-emerald-400">{summaryCounts.registered ?? 0}</span>
            </div>
            <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800">
              <span className="text-slate-400 block text-[11px]">Unsupported Formats</span>
              <span className="text-base font-bold text-amber-400">{summaryCounts.unsupported ?? 0}</span>
            </div>
            <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800">
              <span className="text-slate-400 block text-[11px]">Skips & Errors</span>
              <span className="text-base font-bold text-rose-400">
                {(summaryCounts.skipped ?? 0) + (summaryCounts.errors ?? 0)}
              </span>
            </div>
          </div>
        )}

        {/* Category Filters */}
        <div className="px-6 py-2.5 border-b border-slate-800 flex items-center space-x-2 overflow-x-auto text-xs bg-slate-900">
          <button
            onClick={() => setActiveCategory('all')}
            className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
              activeCategory === 'all'
                ? 'bg-indigo-600 text-white'
                : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
            }`}
          >
            All Items ({diagnostics.length})
          </button>
          <button
            onClick={() => setActiveCategory('unsupported_format')}
            className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
              activeCategory === 'unsupported_format'
                ? 'bg-amber-600 text-white'
                : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
            }`}
          >
            Unsupported Formats ({diagnostics.filter((d) => d.category === 'unsupported_format').length})
          </button>
          <button
            onClick={() => setActiveCategory('unreadable_entry')}
            className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
              activeCategory === 'unreadable_entry'
                ? 'bg-rose-600 text-white'
                : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
            }`}
          >
            Unreadable Entries ({diagnostics.filter((d) => d.category === 'unreadable_entry').length})
          </button>
        </div>

        {/* Content list */}
        <div className="flex-1 overflow-y-auto p-6 space-y-2.5">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-2" />
              <p className="font-medium text-slate-200">No issues or skips recorded</p>
              <p className="text-xs text-slate-500 mt-1">All examined files were processed cleanly.</p>
            </div>
          ) : (
            filtered.map((item) => (
              <div
                key={item.id}
                className="p-3.5 bg-slate-800/60 rounded-xl border border-slate-700/60 flex items-start space-x-3 text-xs"
              >
                <div className="mt-0.5 shrink-0">{getIconForCategory(item.category)}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-mono text-indigo-300 font-semibold truncate max-w-[80%]">
                      {item.path}
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700 text-slate-300">
                      {getCategoryLabel(item.category)}
                    </span>
                  </div>
                  <p className="text-slate-300 leading-relaxed">{item.reason}</p>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-900/90 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-sm font-medium transition-colors"
          >
            Close Report
          </button>
        </div>
      </div>
    </div>
  );
};
