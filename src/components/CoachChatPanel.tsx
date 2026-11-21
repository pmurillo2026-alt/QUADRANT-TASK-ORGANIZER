import React, { useEffect, useRef, useState } from 'react';
import { ArrowUp, RotateCcw } from 'lucide-react';
import { ChatMessage, MatrixTask } from '../types';
import { getSampleBrainDumps } from '../utils/deadlines';
import { MarkdownRenderer } from './MarkdownRenderer';

interface CoachChatPanelProps {
  messages: ChatMessage[];
  tasks: MatrixTask[];
  isAnalyzing: boolean;
  error: string | null;
  composerRef: React.RefObject<HTMLTextAreaElement | null>;
  onSubmitText: (text: string) => Promise<void>;
  onStartTaskOne: () => void;
  onResetSession: () => void;
}

export const CoachChatPanel: React.FC<CoachChatPanelProps> = ({
  messages,
  tasks,
  isAnalyzing,
  error,
  composerRef,
  onSubmitText,
  onStartTaskOne,
  onResetSession,
}) => {
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const samples = getSampleBrainDumps();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isAnalyzing]);

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const text = draft.trim();
    if (!text || isAnalyzing) return;
    setDraft('');
    await onSubmitText(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSend();
    }
  };

  const hasTasks = tasks.length > 0;
  const topTask = tasks.find((t) => t.quadrant === 'Q1' && t.isTopThree && !t.completed) ||
    tasks.find((t) => t.quadrant === 'Q1' && !t.completed);

  return (
    <section
      aria-label="Executive Productivity Coach"
      className="flex h-full flex-col rounded-xl border border-slate-200 bg-white"
    >
      <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-5 py-3.5">
        <div>
          <h2 className="font-display text-sm font-semibold text-slate-900">
            Executive Prioritization Coach
          </h2>
          <p className="text-xs text-slate-500">
            Self-contained triage · Relies strictly on what you paste here
          </p>
        </div>
        {messages.length > 1 && (
          <button
            type="button"
            onClick={onResetSession}
            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 whitespace-nowrap shrink-0"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            New Session
          </button>
        )}
      </div>

      {/* Conversation thread */}
      <div ref={scrollRef} className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
        {messages.map((msg) => {
          const isCoach = msg.role === 'coach';
          return (
            <div key={msg.id} className={isCoach ? 'space-y-1.5' : 'flex justify-end'}>
              {isCoach ? (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span className="font-medium text-slate-900">Coach</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">{msg.timestamp}</span>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3.5">
                    <MarkdownRenderer content={msg.content} />
                  </div>
                </div>
              ) : (
                <div className="max-w-[88%] space-y-1">
                  <div className="flex items-center justify-end gap-2 text-xs text-slate-500">
                    <span className="font-mono tabular-nums">{msg.timestamp}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-medium text-slate-700">You</span>
                  </div>
                  <div className="whitespace-pre-wrap rounded-xl bg-slate-900 px-4 py-3 text-sm leading-relaxed text-white">
                    {msg.content}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {isAnalyzing && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span className="font-medium text-slate-900">Coach</span>
              <span aria-hidden="true">·</span>
              <span>Sorting tasks into four quadrants...</span>
            </div>
            <div className="space-y-2.5 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
              <div className="h-3.5 w-2/5 animate-pulse rounded bg-slate-200" />
              <div className="h-3 w-full animate-pulse rounded bg-slate-200" />
              <div className="h-3 w-4/5 animate-pulse rounded bg-slate-200" />
              <div className="h-3 w-3/5 animate-pulse rounded bg-slate-200" />
            </div>
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          >
            <p className="font-medium">Unable to process request</p>
            <p className="mt-0.5 text-xs text-red-700">{error}</p>
          </div>
        )}
      </div>

      {/* Step 1 quick-fill samples when empty, OR Step 5 quick refinement prompts when populated */}
      <div className="border-t border-slate-100 px-5 pt-3">
        {!hasTasks ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-500">Try a sample brain dump:</span>
            {samples.map((sample) => (
              <button
                key={sample.label}
                type="button"
                onClick={() => setDraft(sample.text)}
                className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 whitespace-nowrap shrink-0"
              >
                {sample.label}
              </button>
            ))}
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {topTask && (
              <button
                type="button"
                onClick={onStartTaskOne}
                className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 whitespace-nowrap shrink-0"
              >
                Start Task #1
              </button>
            )}
            <button
              type="button"
              disabled={isAnalyzing}
              onClick={() =>
                onSubmitText(
                  'Challenge my Q1 list—are any of these actually Q2 or Q3 if delayed 48 hours?'
                )
              }
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 whitespace-nowrap shrink-0"
            >
              Challenge Q1 Urgency
            </button>
            <button
              type="button"
              disabled={isAnalyzing}
              onClick={() =>
                setDraft('Adjust deadline: ')
              }
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 whitespace-nowrap shrink-0"
            >
              Adjust a Deadline
            </button>
          </div>
        )}
      </div>

      {/* Input form */}
      <form onSubmit={handleSend} className="p-4 pt-3">
        <div className="rounded-xl border border-slate-200 bg-white p-2 focus-within:border-slate-400">
          <textarea
            ref={composerRef}
            rows={hasTasks ? 3 : 5}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              hasTasks
                ? 'Reply to adjust deadlines, move priorities, or paste more tasks...'
                : 'Paste your unfiltered list of tasks, deadlines, and responsibilities for today or this week...'
            }
            className="w-full resize-none bg-transparent px-2 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
          />
          <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-2 pt-2">
            <span className="text-xs text-slate-400">
              Press Ctrl+Enter or Cmd+Enter to send
            </span>
            <button
              type="submit"
              disabled={!draft.trim() || isAnalyzing}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 whitespace-nowrap shrink-0"
            >
              <span>{isAnalyzing ? 'Analyzing...' : hasTasks ? 'Send Update' : 'Organize Matrix'}</span>
              <ArrowUp className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </form>
    </section>
  );
};
