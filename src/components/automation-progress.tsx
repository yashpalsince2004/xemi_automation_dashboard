import { useState, useEffect, useCallback, useRef } from 'react';
import {
  CheckCircle2,
  XCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
  Zap,
  X,
} from 'lucide-react';

interface FileEntry {
  name: string;
  status: 'success' | 'failed' | 'processing' | 'pending';
  duration?: string;
  error?: string;
}

interface AutomationState {
  running: boolean;
  total: number;
  completed: number;
  succeeded: number;
  failed: number;
  currentFile: string;
  currentSubStatus: string;
  files: FileEntry[];
  startedAt: number | null;
  finishedAt: number | null;
}

const INITIAL_STATE: AutomationState = {
  running: false,
  total: 0,
  completed: 0,
  succeeded: 0,
  failed: 0,
  currentFile: '',
  currentSubStatus: '',
  files: [],
  startedAt: null,
  finishedAt: null,
};

export default function AutomationProgress() {
  const [state, setState] = useState<AutomationState>(INITIAL_STATE);
  const [expanded, setExpanded] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [visible, setVisible] = useState(false);
  const [errorLogs, setErrorLogs] = useState<{file: string, error: string}[] | null>(null);
  const [showLogs, setShowLogs] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const dismissTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const connectSSE = useCallback(() => {
    if (eventSourceRef.current) return;

    const es = new EventSource(`/api/automation-stream`);
    eventSourceRef.current = es;

    es.addEventListener('state', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data) as AutomationState;
        setState(data);

        // Show widget when automation is running or has results
        if (data.running || data.completed > 0) {
          setVisible(true);
          setDismissed(false);
        }
      } catch { /* ignore parse errors */ }
    });

    es.addEventListener('done', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data) as AutomationState;
        setState(data);
        setVisible(true);
        setDismissed(false);

        // Auto-dismiss after 30s when done
        if (dismissTimeoutRef.current) clearTimeout(dismissTimeoutRef.current);
        dismissTimeoutRef.current = setTimeout(() => {
          setDismissed(true);
        }, 30000);
      } catch { /* ignore parse errors */ }
    });

    es.onerror = () => {
      es.close();
      eventSourceRef.current = null;
      setTimeout(connectSSE, 3000);
    };
  }, []);

  const fetchLogs = async () => {
    try {
      const res = await fetch('/api/automation-logs');
      const json = await res.json();
      if (json.success && json.data.errors) {
        setErrorLogs(json.data.errors);
        setShowLogs(true);
      }
    } catch(err) {
      console.error('Failed to fetch logs', err);
    }
  };

  useEffect(() => {
    connectSSE();
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (dismissTimeoutRef.current) clearTimeout(dismissTimeoutRef.current);
    };
  }, [connectSSE]);

  // Don't render if we have nothing to show or user dismissed
  if (!visible || dismissed) return null;
  if (!state.running && state.completed === 0) return null;

  const pct = state.total > 0 ? Math.round((state.completed / state.total) * 100) : 0;
  const isRunning = state.running;
  const isDone = !state.running && state.completed > 0;
  const elapsed = state.startedAt
    ? Math.round(((state.finishedAt || Date.now()) - state.startedAt) / 1000)
    : 0;
  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;

  return (
    <div
      id="automation-progress-widget"
      className={`fixed bottom-6 right-6 z-50 transition-all duration-500 ease-out ${
        expanded ? 'w-96' : 'w-[22rem]'
      }`}
      style={{ fontFamily: "'Inter', system-ui, -apple-system, sans-serif" }}
    >
      <div
        className={`rounded-2xl border shadow-2xl backdrop-blur-xl overflow-hidden transition-all duration-300 ${
          isRunning
            ? 'border-blue-200 bg-white/95 shadow-blue-500/10 dark:border-blue-400/30 dark:bg-slate-900/95'
            : isDone && state.failed === 0
            ? 'border-emerald-200 bg-white/95 shadow-emerald-500/10 dark:border-emerald-400/30 dark:bg-slate-900/95'
            : isDone
            ? 'border-amber-200 bg-white/95 shadow-amber-500/10 dark:border-amber-400/30 dark:bg-slate-900/95'
            : 'border-slate-200 bg-white/95 shadow-slate-500/10 dark:border-slate-600/30 dark:bg-slate-900/95'
        }`}
      >
        {/* Animated top accent bar */}
        <div className="h-0.5 w-full relative overflow-hidden">
          {isRunning ? (
            <div className="absolute inset-0 bg-gradient-to-r from-blue-500 via-cyan-400 to-blue-500 animate-shimmer" />
          ) : isDone && state.failed === 0 ? (
            <div className="absolute inset-0 bg-gradient-to-r from-emerald-500 to-teal-400" />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-r from-amber-500 to-orange-400" />
          )}
        </div>

        {/* Header */}
        <div className="px-4 pt-3 pb-2 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {isRunning ? (
              <div className="relative">
                <div className="h-8 w-8 rounded-lg bg-blue-500/15 flex items-center justify-center">
                  <Loader2 className="h-4 w-4 text-blue-400 animate-spin" />
                </div>
                <div className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 bg-blue-400 rounded-full animate-pulse" />
              </div>
            ) : isDone && state.failed === 0 ? (
              <div className="h-8 w-8 rounded-lg bg-emerald-500/15 flex items-center justify-center">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              </div>
            ) : (
              <div className="h-8 w-8 rounded-lg bg-amber-500/15 flex items-center justify-center">
                <Zap className="h-4 w-4 text-amber-400" />
              </div>
            )}
            <div>
              <p className="text-sm font-semibold text-slate-800 dark:text-white leading-tight">
                {isRunning ? 'Export Automation' : 'Automation Complete'}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight mt-0.5">
                {isRunning
                  ? `${state.completed}/${state.total} files`
                  : `${state.succeeded} passed · ${state.failed} failed`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setExpanded(!expanded)}
              className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white transition-colors"
              aria-label={expanded ? 'Collapse' : 'Expand'}
            >
              {expanded ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronUp className="h-3.5 w-3.5" />
              )}
            </button>
            {isDone && (
              <button
                onClick={() => setDismissed(true)}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white transition-colors"
                aria-label="Dismiss"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Progress bar */}
        <div className="px-4 pb-2">
          <div className="flex items-center justify-between text-[10px] text-slate-500 mb-1.5">
            <span>{pct}%</span>
            {elapsed > 0 && (
              <span>
                {mins > 0 ? `${mins}m ` : ''}{secs}s
              </span>
            )}
          </div>
          <div className="h-2.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ease-out ${
                isRunning
                  ? 'bg-gradient-to-r from-blue-500 to-cyan-400'
                  : state.failed === 0
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                  : 'bg-gradient-to-r from-amber-500 to-orange-400'
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {/* Current file / Final Status indicator */}
        {(isRunning && state.currentFile) ? (
          <div className="px-4 pb-2">
            <div className="flex flex-col gap-1 px-2.5 py-1.5 bg-blue-50 dark:bg-blue-500/10 rounded-lg border border-blue-100 dark:border-blue-500/10">
              <div className="flex items-center gap-2">
                <Loader2 className="h-3 w-3 text-blue-500 dark:text-blue-400 animate-spin flex-shrink-0" />
                <span className="text-[11px] font-medium text-blue-800 dark:text-blue-200 truncate">
                  {state.currentFile}
                </span>
              </div>
              {state.currentSubStatus && (
                <div className="flex items-center gap-2 pl-5">
                  <span className="text-[10px] text-blue-600/80 dark:text-blue-300/80 truncate">
                    {state.currentSubStatus}
                  </span>
                </div>
              )}
            </div>
          </div>
        ) : isDone ? (
          <div className="px-4 pb-2 animate-fade-in">
            <div className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border ${
              state.failed === 0 
                ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-100 dark:border-emerald-500/20' 
                : 'bg-amber-50 dark:bg-amber-500/10 border-amber-100 dark:border-amber-500/20'
            }`}>
              {state.failed === 0 ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 dark:text-emerald-400 flex-shrink-0" />
              ) : (
                <Zap className="h-3.5 w-3.5 text-amber-500 dark:text-amber-400 flex-shrink-0" />
              )}
              <span className={`text-[11px] font-medium ${
                state.failed === 0 
                  ? 'text-emerald-700 dark:text-emerald-300' 
                  : 'text-amber-700 dark:text-amber-300'
              }`}>
                {state.failed === 0 
                  ? `All ${state.total} files completed successfully!` 
                  : `${state.succeeded} files completed, ${state.failed} failed.`}
              </span>
            </div>
          </div>
        ) : null}

        {/* Expanded file list */}
        {expanded && state.files.length > 0 && (
          <div className="px-4 pb-3 max-h-48 overflow-y-auto scrollbar-thin">
            <div className="space-y-1">
              {state.files.map((f, i) => (
                <div
                  key={`${f.name}-${i}`}
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 dark:bg-white/[0.03] dark:hover:bg-white/[0.06] transition-colors"
                >
                  {f.status === 'success' ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 flex-shrink-0" />
                  ) : f.status === 'failed' ? (
                    <XCircle className="h-3.5 w-3.5 text-rose-400 flex-shrink-0" />
                  ) : (
                    <Loader2 className="h-3.5 w-3.5 text-blue-500 dark:text-blue-400 animate-spin flex-shrink-0" />
                  )}
                  <span className="text-[11px] text-slate-700 dark:text-slate-300 truncate flex-1">
                    {f.name}
                  </span>
                  {f.duration && (
                    <span className="text-[10px] text-slate-500 flex-shrink-0">
                      {f.duration}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Bottom stats (when done) */}
        {isDone && (
          <div className="px-4 pb-3">
            <div className="grid grid-cols-3 gap-2">
              <div className="text-center px-2 py-1.5 rounded-lg bg-slate-50 dark:bg-white/[0.04]">
                <p className="text-[10px] text-slate-500 uppercase tracking-wider">Total</p>
                <p className="text-sm font-bold text-slate-800 dark:text-white">{state.total}</p>
              </div>
              <div className="text-center px-2 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-500/10">
                <p className="text-[10px] text-emerald-600 dark:text-emerald-400/70 uppercase tracking-wider">Passed</p>
                <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">{state.succeeded}</p>
              </div>
              <div className="text-center px-2 py-1.5 rounded-lg bg-rose-50 dark:bg-rose-500/10">
                <p className="text-[10px] text-rose-600 dark:text-rose-400/70 uppercase tracking-wider">Failed</p>
                <p className="text-sm font-bold text-rose-600 dark:text-rose-400">{state.failed}</p>
              </div>
            </div>
            {state.failed > 0 && !showLogs && (
              <button 
                onClick={fetchLogs}
                className="w-full mt-3 flex items-center justify-center gap-2 py-2 px-3 bg-rose-50 hover:bg-rose-100 dark:bg-rose-500/10 dark:hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 rounded-lg text-xs font-semibold transition-colors"
                aria-label="View Error Logs"
              >
                View Error Logs
              </button>
            )}
          </div>
        )}

        {/* Error Logs View */}
        {showLogs && errorLogs && (
          <div className="px-4 pb-4 animate-fade-in">
            <div className="pt-3 border-t border-slate-200 dark:border-slate-700/50">
               <div className="flex justify-between items-center mb-2.5 px-1">
                 <h4 className="text-[11px] uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400">Error Logs</h4>
                 <button onClick={() => setShowLogs(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                   <ChevronUp className="h-3.5 w-3.5" />
                 </button>
               </div>
               <div className="space-y-2 max-h-56 overflow-y-auto scrollbar-thin pr-1">
                 {errorLogs.map((log, i) => (
                   <div key={i} className="bg-rose-50/50 dark:bg-rose-900/10 rounded-lg p-2.5 border border-rose-100/50 dark:border-rose-900/20">
                     <p className="text-[11px] font-medium text-slate-800 dark:text-slate-300 break-words mb-1">
                       {log.file}
                     </p>
                     <p className="text-[10px] text-rose-600 dark:text-rose-400 break-words font-mono leading-relaxed">
                       {log.error}
                     </p>
                   </div>
                 ))}
                 {errorLogs.length === 0 && (
                   <p className="text-xs text-center text-slate-500 py-4">No structured error logs found.</p>
                 )}
               </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
