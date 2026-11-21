import React, { useState } from 'react';
import { Check, Copy, Play } from 'lucide-react';
import { ActionPlan, MatrixTask } from '../types';
import { buildMarkdownBriefing } from '../utils/deadlines';
import { MarkdownRenderer } from './MarkdownRenderer';

interface ActionPlanViewProps {
  tasks: MatrixTask[];
  actionPlan: ActionPlan | null;
  onStartFocus: (taskId: string) => void;
  onGoToCoach: () => void;
}

export const ActionPlanView: React.FC<ActionPlanViewProps> = ({
  tasks,
  actionPlan,
  onStartFocus,
  onGoToCoach,
}) => {
  const [copied, setCopied] = useState(false);

  if (tasks.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-10 text-center">
        <h2 className="font-display text-lg font-semibold text-slate-900">
          No action plan generated yet
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
          Paste your messy to-do list in the Workspace tab first. Your coach will build an exact execution sequence for Quadrant 1 and Quadrant 2 items, plus a batching plan for Quadrant 3 and 4.
        </p>
        <button
          type="button"
          onClick={onGoToCoach}
          className="mt-5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          Go to Coach Intake
        </button>
      </div>
    );
  }

  const markdown = buildMarkdownBriefing(tasks, actionPlan);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore clipboard failures
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      {/* Left 7 cols: Step-by-step execution sequence */}
      <div className="space-y-5 lg:col-span-7">
        {actionPlan?.urgencyChallenge && (
          <section className="rounded-xl border border-amber-200 bg-amber-50/70 p-5">
            <h3 className="font-display text-sm font-semibold text-amber-900">
              Urgency Triage Reality Check
            </h3>
            <p className="mt-1.5 text-sm leading-relaxed text-amber-900/90">
              {actionPlan.urgencyChallenge}
            </p>
          </section>
        )}

        <section className="rounded-xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-5 py-4">
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900">
                Execution Sequence (Q1 → Q2)
              </h2>
              <p className="text-xs text-slate-500">
                Work straight down this order to eliminate decision fatigue
              </p>
            </div>
          </div>

          <div className="divide-y divide-slate-100">
            {actionPlan && actionPlan.q1q2Sequence.length > 0 ? (
              actionPlan.q1q2Sequence.map((step) => {
                const matchedTask =
                  tasks.find((t) => t.id === step.taskId) ||
                  tasks.find(
                    (t) => t.title.toLowerCase() === step.taskTitle.toLowerCase()
                  );
                return (
                  <div
                    key={step.order}
                    className="flex items-start justify-between gap-4 px-5 py-4"
                  >
                    <div className="flex items-start gap-3.5">
                      <span className="mt-0.5 font-mono text-xs font-semibold tabular-nums text-slate-500">
                        {String(step.order).padStart(2, '0')}.
                      </span>
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span
                            className={`font-semibold ${
                              step.quadrant === 'Q1' ? 'text-red-700' : 'text-emerald-700'
                            }`}
                          >
                            {step.quadrant} {step.quadrant === 'Q1' ? 'Do First' : 'Schedule'}
                          </span>
                          {matchedTask?.dueLabel && (
                            <>
                              <span aria-hidden="true" className="text-slate-300">
                                ·
                              </span>
                              <span className="font-mono tabular-nums text-slate-500">
                                {matchedTask.dueLabel}
                              </span>
                            </>
                          )}
                        </div>
                        <p
                          className={`text-sm font-medium ${
                            matchedTask?.completed
                              ? 'line-through text-slate-400'
                              : 'text-slate-900'
                          }`}
                        >
                          {step.taskTitle}
                        </p>
                        <p className="text-xs leading-relaxed text-slate-600">{step.guidance}</p>
                      </div>
                    </div>

                    {matchedTask && !matchedTask.completed && (
                      <button
                        type="button"
                        onClick={() => onStartFocus(matchedTask.id)}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50 whitespace-nowrap shrink-0"
                      >
                        <Play className="h-3 w-3" />
                        Start
                      </button>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="p-5 text-sm text-slate-500">
                Complete your Q1 tasks top-to-bottom, then schedule blocks for Q2.
              </div>
            )}
          </div>
        </section>

        {/* Q3 & Q4 Batch / Drop Cards */}
        {actionPlan && (
          <div className="grid gap-4 sm:grid-cols-2">
            <section className="rounded-xl border border-slate-200 bg-white p-5">
              <h3 className="font-display text-sm font-semibold text-amber-800">
                Q3 Batch & Delegate Strategy
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-700">
                {actionPlan.q3BatchStrategy}
              </p>
            </section>
            <section className="rounded-xl border border-slate-200 bg-white p-5">
              <h3 className="font-display text-sm font-semibold text-slate-700">
                Q4 Elimination Protocol
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-700">
                {actionPlan.q4DropStrategy}
              </p>
            </section>
          </div>
        )}
      </div>

      {/* Right 5 cols: Clean Markdown Briefing */}
      <div className="lg:col-span-5">
        <section className="rounded-xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-3.5">
            <div>
              <h2 className="font-display text-sm font-semibold text-slate-900">
                Clean Markdown Briefing
              </h2>
              <p className="text-xs text-slate-500">
                Mobile-friendly headings & bullets, no wide tables
              </p>
            </div>
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? 'Copied' : 'Copy Markdown'}
            </button>
          </div>
          <div className="p-5">
            <MarkdownRenderer content={markdown} />
          </div>
        </section>
      </div>
    </div>
  );
};
