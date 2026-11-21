import React, { useState } from 'react';
import { CalendarClock, Check, Play, Plus, Trash2, X } from 'lucide-react';
import { MatrixTask, QuadrantId } from '../types';
import {
  countWords,
  formatCountdown,
  formatShortDueLabel,
  getAlertSeverity,
  QUADRANT_META,
  toDatetimeLocalValue,
} from '../utils/deadlines';

interface QuadrantMatrixProps {
  tasks: MatrixTask[];
  nowMs: number;
  thresholdMinutes: number;
  onToggleComplete: (taskId: string) => void;
  onMoveTask: (taskId: string, targetQuadrant: QuadrantId) => void;
  onDeleteTask: (taskId: string) => void;
  onUpdateDeadline: (taskId: string, dueAt: string | null, dueLabel: string | null) => void;
  onAddTask: (title: string, quadrant: QuadrantId, dueAt: string | null) => void;
  onStartFocus: (taskId: string) => void;
  q1SwapPrompt: { pendingTaskId: string; pendingTitle: string } | null;
  onResolveQ1Swap: (demoteTaskId: string) => void;
  onCancelQ1Swap: () => void;
}

const QUADRANT_ORDER: QuadrantId[] = ['Q1', 'Q2', 'Q3', 'Q4'];

export const QuadrantMatrix: React.FC<QuadrantMatrixProps> = ({
  tasks,
  nowMs,
  thresholdMinutes,
  onToggleComplete,
  onMoveTask,
  onDeleteTask,
  onUpdateDeadline,
  onAddTask,
  onStartFocus,
  q1SwapPrompt,
  onResolveQ1Swap,
  onCancelQ1Swap,
}) => {
  const [editingDeadlineId, setEditingDeadlineId] = useState<string | null>(null);
  const [customDeadlineInput, setCustomDeadlineInput] = useState<string>('');
  const [addingToQuadrant, setAddingToQuadrant] = useState<QuadrantId | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDue, setNewTaskDue] = useState('');

  const top3Tasks = tasks
    .filter((t) => t.quadrant === 'Q1' && t.isTopThree)
    .sort((a, b) => (a.topRank ?? 99) - (b.topRank ?? 99));

  const q1Active = tasks.filter((t) => t.quadrant === 'Q1' && !t.completed);

  const openDeadlineEditor = (task: MatrixTask) => {
    if (editingDeadlineId === task.id) {
      setEditingDeadlineId(null);
      return;
    }
    setEditingDeadlineId(task.id);
    setCustomDeadlineInput(toDatetimeLocalValue(task.dueAt));
  };

  const applyPresetDeadline = (taskId: string, offsetMinutes: number) => {
    const target = new Date(Date.now() + offsetMinutes * 60_000);
    const iso = target.toISOString();
    onUpdateDeadline(taskId, iso, formatShortDueLabel(iso));
    setEditingDeadlineId(null);
  };

  const applyTodayTime = (taskId: string, hour: number, minute: number, addDays = 0) => {
    const target = new Date();
    target.setDate(target.getDate() + addDays);
    target.setHours(hour, minute, 0, 0);
    const iso = target.toISOString();
    onUpdateDeadline(taskId, iso, formatShortDueLabel(iso));
    setEditingDeadlineId(null);
  };

  const handleSaveCustomDeadline = (taskId: string) => {
    if (!customDeadlineInput) {
      onUpdateDeadline(taskId, null, null);
      setEditingDeadlineId(null);
      return;
    }
    const parsed = new Date(customDeadlineInput);
    if (!Number.isNaN(parsed.getTime())) {
      const iso = parsed.toISOString();
      onUpdateDeadline(taskId, iso, formatShortDueLabel(iso));
    }
    setEditingDeadlineId(null);
  };

  const handleCreateTask = (e: React.FormEvent, quadrant: QuadrantId) => {
    e.preventDefault();
    const cleaned = newTaskTitle.trim();
    if (!cleaned) return;
    let dueIso: string | null = null;
    if (newTaskDue) {
      const d = new Date(newTaskDue);
      if (!Number.isNaN(d.getTime())) dueIso = d.toISOString();
    }
    onAddTask(cleaned, quadrant, dueIso);
    setNewTaskTitle('');
    setNewTaskDue('');
    setAddingToQuadrant(null);
  };

  if (tasks.length === 0) {
    return (
      <div className="flex h-full min-h-[420px] flex-col items-center justify-center rounded-xl border border-slate-200 bg-white p-8 text-center">
        <div className="w-full max-w-md space-y-4">
          <div className="space-y-2">
            <h2 className="font-display text-lg font-semibold text-slate-900">
              Your Eisenhower Matrix is waiting
            </h2>
            <p className="text-sm leading-relaxed text-slate-600">
              Paste your unfiltered tasks into the Coach panel to triage them automatically, or add your first task directly to the matrix below.
            </p>
          </div>

          {addingToQuadrant ? (
            <form
              onSubmit={(e) => handleCreateTask(e, addingToQuadrant)}
              className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4 text-left"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-slate-700">
                  Add Task ({QUADRANT_META[addingToQuadrant].code} · {QUADRANT_META[addingToQuadrant].name})
                </span>
                <span
                  className={`font-mono text-xs tabular-nums ${
                    countWords(newTaskTitle) > 12 ? 'font-medium text-red-700' : 'text-slate-500'
                  }`}
                >
                  {countWords(newTaskTitle)} / 12 words
                </span>
              </div>

              <div className="flex items-center gap-1 rounded-lg bg-slate-200/70 p-1">
                {QUADRANT_ORDER.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => setAddingToQuadrant(q)}
                    className={`flex-1 rounded-md py-1 font-mono text-xs font-medium transition-colors ${
                      addingToQuadrant === q
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {q}
                  </button>
                ))}
              </div>

              <input
                type="text"
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                placeholder="Concise task under 12 words..."
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none"
                autoFocus
              />

              <div className="flex flex-wrap items-center justify-between gap-2">
                <input
                  type="datetime-local"
                  value={newTaskDue}
                  onChange={(e) => setNewTaskDue(e.target.value)}
                  aria-label="Optional deadline"
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-xs text-slate-700 focus:border-slate-400 focus:outline-none"
                />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setAddingToQuadrant(null)}
                    className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-200/60"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!newTaskTitle.trim()}
                    className="rounded-lg bg-slate-900 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:bg-slate-300"
                  >
                    Add Task
                  </button>
                </div>
              </div>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setAddingToQuadrant('Q1')}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-800 transition-colors hover:bg-slate-50"
            >
              <Plus className="h-3.5 w-3.5" />
              Add First Task Manually
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Top 3 Do First Spotlight */}
      {top3Tasks.length > 0 && (
        <section
          aria-label="Top 3 Do First Priorities"
          className="rounded-xl border border-slate-200 bg-white px-5 py-4"
        >
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <h2 className="font-display text-sm font-semibold text-slate-900">
                Top 3 Do First Priorities
              </h2>
              <p className="text-xs text-slate-500">
                Tackle these in order before checking secondary tasks
              </p>
            </div>
            <span className="font-mono text-xs tabular-nums text-slate-500">
              {top3Tasks.filter((t) => t.completed).length}/{top3Tasks.length} completed
            </span>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            {top3Tasks.map((task, idx) => {
              const msRemaining = task.dueAt ? Date.parse(task.dueAt) - nowMs : null;
              const severity =
                msRemaining !== null && !task.completed
                  ? getAlertSeverity(msRemaining, thresholdMinutes)
                  : null;

              return (
                <div
                  key={task.id}
                  className="flex flex-col justify-between gap-2.5 rounded-lg border border-slate-200 bg-slate-50/50 p-3.5"
                >
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-mono font-semibold tabular-nums text-red-700">
                        Priority #{task.topRank ?? idx + 1}
                      </span>
                      {task.dueLabel && (
                        <span
                          className={`font-mono tabular-nums ${
                            severity === 'overdue' || severity === 'critical'
                              ? 'font-medium text-red-700'
                              : severity === 'approaching'
                              ? 'font-medium text-amber-700'
                              : 'text-slate-500'
                          }`}
                        >
                          {msRemaining !== null && !task.completed
                            ? formatCountdown(msRemaining)
                            : task.dueLabel}
                        </span>
                      )}
                    </div>
                    <p
                      className={`text-sm font-medium leading-snug ${
                        task.completed ? 'line-through text-slate-400' : 'text-slate-900'
                      }`}
                    >
                      {task.title}
                    </p>
                    <p className="text-xs leading-relaxed text-slate-600">{task.rationale}</p>
                  </div>

                  <div className="flex items-center justify-between gap-2 border-t border-slate-200/70 pt-2">
                    <button
                      type="button"
                      onClick={() => onToggleComplete(task.id)}
                      className="text-xs font-medium text-slate-600 hover:text-slate-900 whitespace-nowrap shrink-0"
                    >
                      {task.completed ? 'Reopen' : 'Mark Done'}
                    </button>
                    {!task.completed && (
                      <button
                        type="button"
                        onClick={() => onStartFocus(task.id)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-slate-900 hover:underline whitespace-nowrap shrink-0"
                      >
                        <Play className="h-3 w-3" />
                        Start Focus
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Q1 Guardrail Challenge Modal/Banner when user tries to add 5th item to Q1 */}
      {q1SwapPrompt && (
        <div
          role="alertdialog"
          aria-label="Quadrant 1 Priority Challenge"
          className="rounded-xl border border-red-200 bg-red-50/70 p-4"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <h3 className="font-display text-sm font-semibold text-red-900">
                Quadrant 1 is capped at 4 items max
              </h3>
              <p className="text-xs leading-relaxed text-red-800">
                To add <span className="font-semibold">"{q1SwapPrompt.pendingTitle}"</span> to Do First, choose which current Q1 item has fewer immediate consequences and can move to Q2 Schedule:
              </p>
            </div>
            <button
              type="button"
              onClick={onCancelQ1Swap}
              className="rounded-lg p-1 text-red-700 hover:bg-red-100"
              aria-label="Cancel Q1 swap"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {q1Active.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onResolveQ1Swap(item.id)}
                className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 transition-colors hover:border-red-300 hover:bg-red-50"
              >
                Move "{item.title}" to Q2
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 2x2 Eisenhower Matrix Grid */}
      <div className="grid gap-4 lg:grid-cols-2">
        {QUADRANT_ORDER.map((quadrantId) => {
          const meta = QUADRANT_META[quadrantId];
          const qTasks = tasks.filter((t) => t.quadrant === quadrantId);
          const activeCount = qTasks.filter((t) => !t.completed).length;

          return (
            <section
              key={quadrantId}
              aria-label={`${meta.code}: ${meta.name}`}
              className="flex flex-col rounded-xl border border-slate-200 bg-white"
            >
              {/* Quadrant Header */}
              <div
                className={`flex items-start justify-between gap-3 rounded-t-xl border-b border-slate-200 px-4 py-3 ${meta.headerBg}`}
              >
                <div>
                  <div className="flex items-baseline gap-2">
                    <span className={`font-display text-sm font-bold ${meta.accentText}`}>
                      {meta.code} · {meta.name}
                    </span>
                    <span className="text-xs text-slate-500">
                      {meta.subtitle}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-600">{meta.description}</p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className="font-mono text-xs font-medium tabular-nums text-slate-600">
                    {quadrantId === 'Q1' ? `${activeCount}/4` : `${activeCount}`}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setAddingToQuadrant(addingToQuadrant === quadrantId ? null : quadrantId)
                    }
                    aria-label={`Add task to ${meta.code}`}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* Inline Add Task Composer */}
              {addingToQuadrant === quadrantId && (
                <form
                  onSubmit={(e) => handleCreateTask(e, quadrantId)}
                  className="border-b border-slate-200 bg-slate-50/80 px-4 py-3 space-y-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-xs font-medium text-slate-700">
                      New {meta.code} task (under 12 words)
                    </label>
                    <span
                      className={`font-mono text-xs tabular-nums ${
                        countWords(newTaskTitle) > 12 ? 'text-red-700 font-medium' : 'text-slate-500'
                      }`}
                    >
                      {countWords(newTaskTitle)} / 12 words
                    </span>
                  </div>
                  <input
                    type="text"
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                    placeholder="Concise task description..."
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none"
                    autoFocus
                  />
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <input
                      type="datetime-local"
                      value={newTaskDue}
                      onChange={(e) => setNewTaskDue(e.target.value)}
                      aria-label="Optional deadline"
                      className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-mono text-slate-700 focus:border-slate-400 focus:outline-none"
                    />
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setAddingToQuadrant(null)}
                        className="rounded-lg px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-200/60"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={!newTaskTitle.trim()}
                        className="rounded-lg bg-slate-900 px-3 py-1 text-xs font-medium text-white hover:bg-slate-800 disabled:bg-slate-300"
                      >
                        Add Task
                      </button>
                    </div>
                  </div>
                </form>
              )}

              {/* Task Rows */}
              <div className="divide-y divide-slate-100">
                {qTasks.length === 0 ? (
                  <div className="px-4 py-6 text-center text-xs text-slate-400">
                    No tasks in {meta.code} {meta.name}.
                  </div>
                ) : (
                  qTasks.map((task) => {
                    const msRemaining = task.dueAt ? Date.parse(task.dueAt) - nowMs : null;
                    const severity =
                      msRemaining !== null && !task.completed
                        ? getAlertSeverity(msRemaining, thresholdMinutes)
                        : null;
                    const isEditingDeadline = editingDeadlineId === task.id;

                    return (
                      <div key={task.id} className="px-4 py-3 transition-colors hover:bg-slate-50/70">
                        <div className="flex items-start gap-3">
                          <button
                            type="button"
                            onClick={() => onToggleComplete(task.id)}
                            aria-label={
                              task.completed
                                ? `Mark "${task.title}" incomplete`
                                : `Mark "${task.title}" complete`
                            }
                            className={`mt-0.5 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded border transition-colors ${
                              task.completed
                                ? 'border-slate-900 bg-slate-900 text-white'
                                : 'border-slate-300 bg-white hover:border-slate-500'
                            }`}
                          >
                            {task.completed && <Check className="h-3 w-3" />}
                          </button>

                          <div className="min-w-0 flex-1 space-y-1">
                            <p
                              className={`text-sm font-medium leading-snug ${
                                task.completed ? 'line-through text-slate-400' : 'text-slate-900'
                              }`}
                            >
                              {task.title}
                            </p>

                            {/* Unboxed metadata row with typographic separators */}
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
                              {task.isTopThree && task.topRank && (
                                <>
                                  <span className="font-medium text-red-700">
                                    Top #{task.topRank}
                                  </span>
                                  <span aria-hidden="true">·</span>
                                </>
                              )}
                              {task.dueAt && msRemaining !== null && !task.completed ? (
                                <span
                                  className={`font-mono tabular-nums ${
                                    severity === 'overdue' || severity === 'critical'
                                      ? 'font-medium text-red-700'
                                      : severity === 'approaching'
                                      ? 'font-medium text-amber-700'
                                      : 'text-slate-500'
                                  }`}
                                >
                                  {formatCountdown(msRemaining)} ({task.dueLabel || formatShortDueLabel(task.dueAt)})
                                </span>
                              ) : task.dueLabel ? (
                                <span className="font-mono tabular-nums">{task.dueLabel}</span>
                              ) : (
                                <span>No deadline set</span>
                              )}
                              {task.estimatedMinutes && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span className="font-mono tabular-nums">
                                    ~{task.estimatedMinutes}m
                                  </span>
                                </>
                              )}
                            </div>

                            <p className="text-xs leading-relaxed text-slate-600">
                              {task.rationale}
                            </p>

                            {/* Action strip */}
                            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                              <div className="flex items-center gap-1">
                                {QUADRANT_ORDER.filter((q) => q !== quadrantId).map((targetQ) => (
                                  <button
                                    key={targetQ}
                                    type="button"
                                    onClick={() => onMoveTask(task.id, targetQ)}
                                    className="rounded px-1.5 py-0.5 font-mono text-[11px] font-medium text-slate-500 transition-colors hover:bg-slate-200/70 hover:text-slate-900"
                                    title={`Move to ${QUADRANT_META[targetQ].name}`}
                                  >
                                    → {targetQ}
                                  </button>
                                ))}
                              </div>

                              <div className="flex items-center gap-2">
                                {!task.completed && (
                                  <button
                                    type="button"
                                    onClick={() => onStartFocus(task.id)}
                                    className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium text-slate-600 hover:bg-slate-200/70 hover:text-slate-900"
                                    title="Start focus timer"
                                  >
                                    <Play className="h-3 w-3" />
                                    Focus
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => openDeadlineEditor(task)}
                                  className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium text-slate-600 hover:bg-slate-200/70 hover:text-slate-900"
                                  title="Set or edit deadline"
                                >
                                  <CalendarClock className="h-3 w-3" />
                                  Deadline
                                </button>
                                <button
                                  type="button"
                                  onClick={() => onDeleteTask(task.id)}
                                  aria-label={`Delete "${task.title}"`}
                                  className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-700"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>

                            {/* Inline Deadline Picker */}
                            {isEditingDeadline && (
                              <div className="mt-2 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                                <div className="flex flex-wrap gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => applyPresetDeadline(task.id, 20)}
                                    className="rounded border border-slate-200 bg-white px-2 py-1 font-mono text-[11px] text-slate-700 hover:bg-slate-100"
                                  >
                                    +20m
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => applyPresetDeadline(task.id, 60)}
                                    className="rounded border border-slate-200 bg-white px-2 py-1 font-mono text-[11px] text-slate-700 hover:bg-slate-100"
                                  >
                                    +1h
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => applyTodayTime(task.id, 17, 0, 0)}
                                    className="rounded border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-700 hover:bg-slate-100"
                                  >
                                    Today 5 PM
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => applyTodayTime(task.id, 9, 0, 1)}
                                    className="rounded border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-700 hover:bg-slate-100"
                                  >
                                    Tomorrow 9 AM
                                  </button>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <input
                                    type="datetime-local"
                                    value={customDeadlineInput}
                                    onChange={(e) => setCustomDeadlineInput(e.target.value)}
                                    className="rounded border border-slate-200 bg-white px-2 py-1 font-mono text-xs text-slate-800"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handleSaveCustomDeadline(task.id)}
                                    className="rounded bg-slate-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-slate-800"
                                  >
                                    Save
                                  </button>
                                  {task.dueAt && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        onUpdateDeadline(task.id, null, null);
                                        setEditingDeadlineId(null);
                                      }}
                                      className="rounded px-2 py-1 text-xs text-red-700 hover:bg-red-50"
                                    >
                                      Clear
                                    </button>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
};
