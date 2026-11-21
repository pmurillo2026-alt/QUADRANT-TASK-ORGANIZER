import { ActionPlan, AlertSeverity, DeadlineAlert, MatrixTask, QuadrantId } from '../types';

export const QUADRANT_META: Record<
  QuadrantId,
  {
    code: QuadrantId;
    name: string;
    subtitle: string;
    description: string;
    accentText: string;
    headerBg: string;
    borderColor: string;
  }
> = {
  Q1: {
    code: 'Q1',
    name: 'Do First',
    subtitle: 'Urgent & Important',
    description: 'Critical deadlines, crises, or high-impact tasks due today (max 3–4).',
    accentText: 'text-red-700',
    headerBg: 'bg-red-50/70',
    borderColor: 'border-red-200',
  },
  Q2: {
    code: 'Q2',
    name: 'Schedule',
    subtitle: 'Not Urgent & Important',
    description: 'Deep work, studying, skill-building, and planning that prevent future crises.',
    accentText: 'text-emerald-700',
    headerBg: 'bg-emerald-50/60',
    borderColor: 'border-emerald-200',
  },
  Q3: {
    code: 'Q3',
    name: 'Delegate / Minimize',
    subtitle: 'Urgent & Not Important',
    description: 'Interruptions, low-value favors, and minor admin to batch or hand off.',
    accentText: 'text-amber-700',
    headerBg: 'bg-amber-50/70',
    borderColor: 'border-amber-200',
  },
  Q4: {
    code: 'Q4',
    name: 'Eliminate',
    subtitle: 'Not Urgent & Not Important',
    description: 'Time-wasters, distractions, and busywork to drop completely.',
    accentText: 'text-slate-600',
    headerBg: 'bg-slate-100/80',
    borderColor: 'border-slate-200',
  },
};

export function getLocalIsoWithOffset(date: Date = new Date()): string {
  const tzOffsetMin = -date.getTimezoneOffset();
  const sign = tzOffsetMin >= 0 ? '+' : '-';
  const absOffset = Math.abs(tzOffsetMin);
  const hh = String(Math.floor(absOffset / 60)).padStart(2, '0');
  const mm = String(absOffset % 60).padStart(2, '0');

  const yyyy = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hr = String(date.getHours()).padStart(2, '0');
  const mi = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');

  return `${yyyy}-${mo}-${dd}T${hr}:${mi}:${ss}${sign}${hh}:${mm}`;
}

export function toDatetimeLocalValue(isoString: string | null): string {
  if (!isoString) return '';
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return '';
  const yyyy = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hr = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mo}-${dd}T${hr}:${mi}`;
}

export function formatShortDueLabel(isoString: string): string {
  const target = new Date(isoString);
  if (Number.isNaN(target.getTime())) return '';
  const now = new Date();
  const sameDay =
    target.getFullYear() === now.getFullYear() &&
    target.getMonth() === now.getMonth() &&
    target.getDate() === now.getDate();

  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const isTomorrow =
    target.getFullYear() === tomorrow.getFullYear() &&
    target.getMonth() === tomorrow.getMonth() &&
    target.getDate() === tomorrow.getDate();

  const timeStr = target.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (sameDay) return `Today ${timeStr}`;
  if (isTomorrow) return `Tomorrow ${timeStr}`;
  const dayStr = target.toLocaleDateString([], { month: 'short', day: 'numeric' });
  return `${dayStr}, ${timeStr}`;
}

export function formatCountdown(msRemaining: number): string {
  const absMs = Math.abs(msRemaining);
  const totalMinutes = Math.floor(absMs / 60_000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  let core = '';
  if (days > 0) {
    core = `${days}d ${hours}h`;
  } else if (hours > 0) {
    core = `${hours}h ${minutes}m`;
  } else if (totalMinutes >= 1) {
    core = `${totalMinutes}m`;
  } else {
    const secs = Math.max(1, Math.floor(absMs / 1000));
    core = `${secs}s`;
  }

  return msRemaining <= 0 ? `Overdue by ${core}` : `Due in ${core}`;
}

export function getAlertSeverity(msRemaining: number, thresholdMinutes: number): AlertSeverity | null {
  if (msRemaining <= 0) return 'overdue';
  if (msRemaining <= 30 * 60_000) return 'critical';
  if (msRemaining <= thresholdMinutes * 60_000) return 'approaching';
  return null;
}

export function computeDeadlineAlerts(
  tasks: MatrixTask[],
  nowMs: number,
  thresholdMinutes: number,
  snoozedUntil: Record<string, number>,
  dismissedIds: Set<string>
): DeadlineAlert[] {
  const alerts: DeadlineAlert[] = [];

  for (const task of tasks) {
    if (task.completed || !task.dueAt) continue;
    if (dismissedIds.has(task.id)) continue;
    const snoozeExp = snoozedUntil[task.id];
    if (snoozeExp && snoozeExp > nowMs) continue;

    const dueMs = Date.parse(task.dueAt);
    if (Number.isNaN(dueMs)) continue;

    const msRemaining = dueMs - nowMs;
    const severity = getAlertSeverity(msRemaining, thresholdMinutes);
    if (!severity) continue;

    alerts.push({
      taskId: task.id,
      taskTitle: task.title,
      quadrant: task.quadrant,
      dueAt: task.dueAt,
      msRemaining,
      severity,
    });
  }

  return alerts.sort((a, b) => a.msRemaining - b.msRemaining);
}

export function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

export function playAlertChime(): void {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    const notes = [587.33, 880]; // D5 -> A5 gentle executive chime
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.14);

      gain.gain.setValueAtTime(0.001, now + idx * 0.14);
      gain.gain.exponentialRampToValueAtTime(0.12, now + idx * 0.14 + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.14 + 0.42);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.14);
      osc.stop(now + idx * 0.14 + 0.45);
    });
  } catch {
    // Ignore audio context autoplay restrictions silently
  }
}

export function buildMarkdownBriefing(tasks: MatrixTask[], actionPlan: ActionPlan | null): string {
  const q1 = tasks.filter((t) => t.quadrant === 'Q1');
  const q2 = tasks.filter((t) => t.quadrant === 'Q2');
  const q3 = tasks.filter((t) => t.quadrant === 'Q3');
  const q4 = tasks.filter((t) => t.quadrant === 'Q4');
  const top3 = q1
    .filter((t) => t.isTopThree)
    .sort((a, b) => (a.topRank ?? 99) - (b.topRank ?? 99));

  const formatList = (items: MatrixTask[]) =>
    items.length === 0
      ? '- None'
      : items
          .map(
            (t) =>
              `- [${t.completed ? 'x' : ' '}] ${t.title}${t.dueLabel ? ` (${t.dueLabel})` : ''}`
          )
          .join('\n');

  const lines: string[] = [
    '# Eisenhower Matrix Briefing',
    '',
    '### Top 3 Do First Priorities',
    top3.length === 0
      ? '- No Top 3 priorities locked yet.'
      : top3
          .map(
            (t, idx) =>
              `${idx + 1}. **${t.title}**${t.dueLabel ? ` — ${t.dueLabel}` : ''} (${t.rationale})`
          )
          .join('\n'),
    '',
    '### Quadrant 1: Do First (Urgent & Important)',
    formatList(q1),
    '',
    '### Quadrant 2: Schedule (Not Urgent & Important)',
    formatList(q2),
    '',
    '### Quadrant 3: Delegate / Minimize (Urgent & Not Important)',
    formatList(q3),
    '',
    '### Quadrant 4: Eliminate (Not Urgent & Not Important)',
    formatList(q4),
  ];

  if (actionPlan) {
    lines.push('', '### Concrete Execution Order');
    if (actionPlan.q1q2Sequence.length > 0) {
      actionPlan.q1q2Sequence.forEach((step) => {
        lines.push(`${step.order}. [${step.quadrant}] **${step.taskTitle}** — ${step.guidance}`);
      });
    }
    lines.push('', `**Q3 Batching:** ${actionPlan.q3BatchStrategy}`);
    lines.push(`**Q4 Elimination:** ${actionPlan.q4DropStrategy}`);
  }

  return lines.join('\n');
}

export function getSampleBrainDumps(now: Date = new Date()) {
  const plus35m = new Date(now.getTime() + 35 * 60_000);
  const plus90m = new Date(now.getTime() + 90 * 60_000);
  const formatTime = (d: Date) =>
    d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  return [
    {
      label: 'Overwhelmed Grad Student',
      text: `Everything feels due at once and I'm paralyzed:
- Submit ethics IRB revision form due in 35 minutes (${formatTime(plus35m)})
- Finish final capstone literature review draft due tonight at 11:59 PM
- Reply to lab partner's Slack message about slide colors
- Study for Friday's Biostatistics midterm (ch 4-7)
- Clean up my desktop folders and reorganize Notion tabs
- Pay overdue campus parking ticket before 5 PM tomorrow
- Pick up groceries and detergent
- Rewatch lecture 3 recording (not tested until next week)
- Scroll academic twitter / check group chat updates
- Draft 2-page fellowship personal statement due in 10 days`,
    },
    {
      label: 'Product Launch Crunch',
      text: `My week is completely on fire, help me sort this:
- Fix checkout confirmation email bug affecting live beta users (due by ${formatTime(plus90m)})
- Finalize Q4 board deck metrics with finance before tomorrow 9 AM
- Answer vendor cold emails asking for a 15-min intro call
- Plan next month's onboarding flow redesign (high impact, no hard deadline)
- Approve teammate's minor icon tweak on the settings page
- Book dentist appointment this week
- Organize Slack channels and archive old threads
- Write launch changelog blog post before Thursday 2 PM
- Compare 5 mechanical keyboard reviews for home office`,
    },
  ];
}
