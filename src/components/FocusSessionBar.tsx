import React from 'react';
import { Check, Pause, Play, X } from 'lucide-react';
import { MatrixTask } from '../types';
import { QUADRANT_META } from '../utils/deadlines';

interface FocusSessionBarProps {
  task: MatrixTask;
  secondsRemaining: number;
  isRunning: boolean;
  onToggleRun: () => void;
  onComplete: (taskId: string) => void;
  onExit: () => void;
}

export const FocusSessionBar: React.FC<FocusSessionBarProps> = ({
  task,
  secondsRemaining,
  isRunning,
  onToggleRun,
  onComplete,
  onExit,
}) => {
  const mins = String(Math.floor(secondsRemaining / 60)).padStart(2, '0');
  const secs = String(secondsRemaining % 60).padStart(2, '0');
  const meta = QUADRANT_META[task.quadrant];

  return (
    <div className="border-b border-slate-200 bg-slate-900 text-white">
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-4 px-4 py-2.5 sm:px-6">
        <div className="flex min-w-0 items-center gap-4">
          <span className="font-mono text-base font-semibold tracking-tight tabular-nums text-white">
            {mins}:{secs}
          </span>
          <span className="text-slate-500" aria-hidden="true">
            ·
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-white">
              Focus: {task.title}
            </p>
            <p className="text-xs text-slate-300">
              {meta.code} · {meta.name}
              {task.dueLabel ? ` · ${task.dueLabel}` : ''}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onToggleRun}
            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white whitespace-nowrap shrink-0"
          >
            {isRunning ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            {isRunning ? 'Pause' : 'Resume'}
          </button>

          <button
            type="button"
            onClick={() => onComplete(task.id)}
            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white whitespace-nowrap shrink-0"
          >
            <Check className="h-3.5 w-3.5" />
            Mark Done
          </button>

          <button
            type="button"
            onClick={onExit}
            aria-label="Exit focus session"
            className="inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg text-slate-300 transition-colors hover:bg-slate-800 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
