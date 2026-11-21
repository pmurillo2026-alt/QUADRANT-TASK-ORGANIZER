import { ActionPlan, ActionStep, CoachAnalysisResult, MatrixTask, QuadrantId } from '../types';

interface ParsedDeadline {
  dueAt: string | null;
  dueLabel: string | null;
  hoursUntil: number | null;
}

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

interface ClientClock {
  nowMs: number;
  offsetMinutes: number; // e.g., -480 for -08:00
}

function parseClientClock(clientNowIso?: string): ClientClock {
  if (!clientNowIso) {
    const d = new Date();
    return { nowMs: d.getTime(), offsetMinutes: -d.getTimezoneOffset() };
  }
  const parsedMs = Date.parse(clientNowIso);
  const nowMs = Number.isNaN(parsedMs) ? Date.now() : parsedMs;

  const tzMatch = clientNowIso.match(/([+-])(\d{2}):(\d{2})$/);
  let offsetMinutes = 0;
  if (tzMatch) {
    const sign = tzMatch[1] === '-' ? -1 : 1;
    offsetMinutes = sign * (parseInt(tzMatch[2], 10) * 60 + parseInt(tzMatch[3], 10));
  } else if (!clientNowIso.endsWith('Z')) {
    offsetMinutes = -new Date().getTimezoneOffset();
  }
  return { nowMs, offsetMinutes };
}

// Shift UTC timestamp by offsetMinutes so .getUTC* methods read the user's local wall-clock fields
function toLocalWallDate(utcMs: number, offsetMinutes: number): Date {
  return new Date(utcMs + offsetMinutes * 60_000);
}

function fromLocalWallParts(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  offsetMinutes: number
): number {
  const wallUtcMs = Date.UTC(year, month, day, hour, minute, 0, 0);
  return wallUtcMs - offsetMinutes * 60_000;
}

function formatOffsetIso(utcMs: number, offsetMinutes: number): string {
  const wall = toLocalWallDate(utcMs, offsetMinutes);
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMinutes);
  const hh = String(Math.floor(abs / 60)).padStart(2, '0');
  const mm = String(abs % 60).padStart(2, '0');

  const y = wall.getUTCFullYear();
  const mo = String(wall.getUTCMonth() + 1).padStart(2, '0');
  const d = String(wall.getUTCDate()).padStart(2, '0');
  const h = String(wall.getUTCHours()).padStart(2, '0');
  const mi = String(wall.getUTCMinutes()).padStart(2, '0');
  const s = String(wall.getUTCSeconds()).padStart(2, '0');
  return `${y}-${mo}-${d}T${h}:${mi}:${s}${sign}${hh}:${mm}`;
}

function formatTime12(hour24: number, minute: number): string {
  const meridiem = hour24 >= 12 ? 'PM' : 'AM';
  const h12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${h12}:${String(minute).padStart(2, '0')} ${meridiem}`;
}

function formatLabel(targetUtcMs: number, clock: ClientClock): string {
  const targetWall = toLocalWallDate(targetUtcMs, clock.offsetMinutes);
  const nowWall = toLocalWallDate(clock.nowMs, clock.offsetMinutes);

  const sameDay =
    targetWall.getUTCFullYear() === nowWall.getUTCFullYear() &&
    targetWall.getUTCMonth() === nowWall.getUTCMonth() &&
    targetWall.getUTCDate() === nowWall.getUTCDate();

  const tomorrowWall = new Date(
    Date.UTC(nowWall.getUTCFullYear(), nowWall.getUTCMonth(), nowWall.getUTCDate() + 1)
  );
  const isTomorrow =
    targetWall.getUTCFullYear() === tomorrowWall.getUTCFullYear() &&
    targetWall.getUTCMonth() === tomorrowWall.getUTCMonth() &&
    targetWall.getUTCDate() === tomorrowWall.getUTCDate();

  const timeStr = formatTime12(targetWall.getUTCHours(), targetWall.getUTCMinutes());
  if (sameDay) return `Today ${timeStr}`;
  if (isTomorrow) return `Tomorrow ${timeStr}`;

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dayStr = `${dayNames[targetWall.getUTCDay()]}, ${monthNames[targetWall.getUTCMonth()]} ${targetWall.getUTCDate()}`;
  return `${dayStr}, ${timeStr}`;
}

function parseTimeParts(text: string): { hour: number; minute: number } | null {
  const m = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
  if (m) {
    let hour = parseInt(m[1], 10);
    const minute = m[2] ? parseInt(m[2], 10) : 0;
    const meridiem = m[3].toLowerCase();
    if (meridiem === 'pm' && hour < 12) hour += 12;
    if (meridiem === 'am' && hour === 12) hour = 0;
    return { hour, minute };
  }
  if (/\bmorning\b/i.test(text)) return { hour: 9, minute: 0 };
  if (/\bnoon\b|\blunch\b/i.test(text)) return { hour: 12, minute: 0 };
  if (/\bafternoon\b/i.test(text)) return { hour: 15, minute: 0 };
  if (/\bevening\b|\btonight\b|\beod\b|\bend of day\b/i.test(text)) return { hour: 21, minute: 0 };
  return null;
}

export function extractDeadline(rawLine: string, clock: ClientClock): ParsedDeadline {
  const lower = rawLine.toLowerCase();
  const nowWall = toLocalWallDate(clock.nowMs, clock.offsetMinutes);

  // 1. Relative minutes: "in 35 minutes", "in 45 mins"
  const relMin = lower.match(/\bin\s+(\d+)\s*(?:min|mins|minute|minutes|m)\b/);
  if (relMin) {
    const mins = parseInt(relMin[1], 10);
    const targetMs = clock.nowMs + mins * 60_000;
    return {
      dueAt: formatOffsetIso(targetMs, clock.offsetMinutes),
      dueLabel: formatLabel(targetMs, clock),
      hoursUntil: mins / 60,
    };
  }

  // 2. Relative hours: "in 2 hours", "in 1 hr"
  const relHr = lower.match(/\bin\s+(\d+(?:\.\d+)?)\s*(?:hr|hrs|hour|hours|h)\b/);
  if (relHr) {
    const hrs = parseFloat(relHr[1]);
    const targetMs = clock.nowMs + hrs * 3_600_000;
    return {
      dueAt: formatOffsetIso(targetMs, clock.offsetMinutes),
      dueLabel: formatLabel(targetMs, clock),
      hoursUntil: hrs,
    };
  }

  // 3. Relative days: "in 10 days", "in 3 days"
  const relDays = lower.match(/\bin\s+(\d+)\s*(?:day|days|d)\b/);
  if (relDays) {
    const days = parseInt(relDays[1], 10);
    const t = parseTimeParts(lower) ?? { hour: 17, minute: 0 };
    const targetMs = fromLocalWallParts(
      nowWall.getUTCFullYear(),
      nowWall.getUTCMonth(),
      nowWall.getUTCDate() + days,
      t.hour,
      t.minute,
      clock.offsetMinutes
    );
    return {
      dueAt: formatOffsetIso(targetMs, clock.offsetMinutes),
      dueLabel: formatLabel(targetMs, clock),
      hoursUntil: (targetMs - clock.nowMs) / 3_600_000,
    };
  }

  const timeParts = parseTimeParts(lower);

  // 4. Tomorrow
  if (/\btomorrow\b/.test(lower)) {
    const t = timeParts ?? { hour: 17, minute: 0 };
    const targetMs = fromLocalWallParts(
      nowWall.getUTCFullYear(),
      nowWall.getUTCMonth(),
      nowWall.getUTCDate() + 1,
      t.hour,
      t.minute,
      clock.offsetMinutes
    );
    return {
      dueAt: formatOffsetIso(targetMs, clock.offsetMinutes),
      dueLabel: formatLabel(targetMs, clock),
      hoursUntil: (targetMs - clock.nowMs) / 3_600_000,
    };
  }

  // 5. Today / Tonight
  if (/\btoday\b|\btonight\b|\bthis evening\b/.test(lower)) {
    const t = timeParts ?? (/\btonight\b/.test(lower) ? { hour: 23, minute: 59 } : { hour: 18, minute: 0 });
    let dayOffset = 0;
    let targetMs = fromLocalWallParts(
      nowWall.getUTCFullYear(),
      nowWall.getUTCMonth(),
      nowWall.getUTCDate() + dayOffset,
      t.hour,
      t.minute,
      clock.offsetMinutes
    );
    if (targetMs < clock.nowMs - 15 * 60_000 && !/\boverdue\b/.test(lower)) {
      dayOffset = 1;
      targetMs = fromLocalWallParts(
        nowWall.getUTCFullYear(),
        nowWall.getUTCMonth(),
        nowWall.getUTCDate() + dayOffset,
        t.hour,
        t.minute,
        clock.offsetMinutes
      );
    }
    return {
      dueAt: formatOffsetIso(targetMs, clock.offsetMinutes),
      dueLabel: formatLabel(targetMs, clock),
      hoursUntil: (targetMs - clock.nowMs) / 3_600_000,
    };
  }

  // 6. Named weekday (e.g., "Friday", "Thursday 2 PM")
  for (let i = 0; i < WEEKDAYS.length; i++) {
    const dayRegex = new RegExp(`\\b${WEEKDAYS[i]}(?:'s)?\\b`, 'i');
    if (dayRegex.test(lower)) {
      const currentDay = nowWall.getUTCDay();
      let delta = (i - currentDay + 7) % 7;
      if (delta === 0) delta = 7;
      const t = timeParts ?? { hour: 17, minute: 0 };
      const targetMs = fromLocalWallParts(
        nowWall.getUTCFullYear(),
        nowWall.getUTCMonth(),
        nowWall.getUTCDate() + delta,
        t.hour,
        t.minute,
        clock.offsetMinutes
      );
      return {
        dueAt: formatOffsetIso(targetMs, clock.offsetMinutes),
        dueLabel: formatLabel(targetMs, clock),
        hoursUntil: (targetMs - clock.nowMs) / 3_600_000,
      };
    }
  }

  // 7. Explicit clock time alone (e.g., "by 4:30 PM")
  if (timeParts) {
    let targetMs = fromLocalWallParts(
      nowWall.getUTCFullYear(),
      nowWall.getUTCMonth(),
      nowWall.getUTCDate(),
      timeParts.hour,
      timeParts.minute,
      clock.offsetMinutes
    );
    if (targetMs <= clock.nowMs) {
      targetMs = fromLocalWallParts(
        nowWall.getUTCFullYear(),
        nowWall.getUTCMonth(),
        nowWall.getUTCDate() + 1,
        timeParts.hour,
        timeParts.minute,
        clock.offsetMinutes
      );
    }
    return {
      dueAt: formatOffsetIso(targetMs, clock.offsetMinutes),
      dueLabel: formatLabel(targetMs, clock),
      hoursUntil: (targetMs - clock.nowMs) / 3_600_000,
    };
  }

  if (/\bthis week\b/.test(lower)) {
    return { dueAt: null, dueLabel: 'This week', hoursUntil: 72 };
  }

  return { dueAt: null, dueLabel: null, hoursUntil: null };
}

function capitalizeFirst(str: string): string {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function condenseTitle(rawLine: string): string {
  const cleaned = rawLine
    .replace(/^[\s\-*•]+/, '')
    .replace(/^\d+[.)]\s*/, '')
    .replace(/\s*\(\d{1,2}:\d{2}\s*(?:AM|PM)?\)/gi, '')
    .trim();

  const words = cleaned.split(/\s+/);
  if (words.length <= 11) {
    return capitalizeFirst(cleaned);
  }

  const trimmedClauses = cleaned
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .replace(/\s+(?:affecting|before|until|asking for)\s+.*$/i, '')
    .trim();

  const shortWords = trimmedClauses.split(/\s+/);
  const finalTitle =
    shortWords.length > 11 ? `${shortWords.slice(0, 10).join(' ')}…` : shortWords.join(' ');
  return capitalizeFirst(finalTitle);
}

interface ScoredCandidate {
  id: string;
  raw: string;
  title: string;
  deadline: ParsedDeadline;
  urgencyScore: number;
  importanceScore: number;
  estimatedMinutes: number | null;
  quadrant: QuadrantId;
  rationale: string;
}

const HIGH_IMPORTANCE_RE =
  /\b(thesis|capstone|midterm|exam|final|irb|ethics|board deck|metrics|finance|bug|checkout|live users|production|client|deliverable|proposal|fellowship|personal statement|study|studying|plan|redesign|onboarding|changelog|blog post|health|dentist|doctor|tax|rent|tuition|scholarship|interview|review draft|literature review|paper|assignment|lab report|ticket|overdue)\b/i;

const ELIMINATE_RE =
  /\b(scroll|twitter|social media|group chat|youtube|netflix|tiktok|instagram|reddit|desktop folders|reorganize.*tabs|notion tabs|archive old|slack channels|keyboard reviews|compare.*reviews|binge|procrastinat)\b/i;

const DELEGATE_MINIMIZE_RE =
  /\b(reply to.*slack|slide colors|cold emails|vendor|icon tweak|approve.*tweak|groceries|detergent|errand|minor admin|schedule.*call|check email|inbox zero|favor|rsvp)\b/i;

const HIGH_URGENCY_RE =
  /\b(urgent|asap|immediately|crisis|critical|overdue|bug|live|today|tonight|tomorrow|minutes|mins|hour|hours|due in|before \d|by \d)\b/i;

function scoreCandidate(line: string, idx: number, clock: ClientClock): ScoredCandidate {
  const deadline = extractDeadline(line, clock);
  const lower = line.toLowerCase();

  let urgency = 0;
  let importance = 0;

  if (deadline.hoursUntil !== null) {
    if (deadline.hoursUntil <= 2) urgency += 6;
    else if (deadline.hoursUntil <= 14) urgency += 5;
    else if (deadline.hoursUntil <= 30) urgency += 4;
    else if (deadline.hoursUntil <= 72) urgency += 2;
    else urgency += 1;
  }
  if (HIGH_URGENCY_RE.test(lower)) urgency += 3;
  if (/\boverdue\b|\bbug\b|\bcrisis\b|\btoday\b|\btonight\b|\bminutes\b/.test(lower)) urgency += 2;
  if (/\bno hard deadline\b|\bnext week\b|\bin 10 days\b|\bnot tested until\b/.test(lower)) {
    urgency = Math.min(urgency, 2);
  }

  if (HIGH_IMPORTANCE_RE.test(lower)) importance += 5;
  if (/\bmidterm\b|\bfinal\b|\bboard deck\b|\bcheckout\b|\bcapstone\b|\birb\b|\boverdue.*ticket\b|\bfellowship\b/.test(lower)) {
    importance += 3;
  }
  if (DELEGATE_MINIMIZE_RE.test(lower)) importance -= 3;
  if (ELIMINATE_RE.test(lower)) importance -= 6;

  let estimatedMinutes: number | null = 30;
  if (/\breply\b|\bapprove\b|\bpay\b|\bbook\b|\bslack\b/.test(lower)) estimatedMinutes = 10;
  else if (/\bdraft\b|\bliterature review\b|\bstudy\b|\bboard deck\b|\bredesign\b/.test(lower)) {
    estimatedMinutes = 60;
  } else if (/\bfix\b|\bbug\b|\bsubmit\b/.test(lower)) {
    estimatedMinutes = 40;
  } else if (ELIMINATE_RE.test(lower)) {
    estimatedMinutes = null;
  }

  let quadrant: QuadrantId = 'Q2';
  let rationale = '';

  if (ELIMINATE_RE.test(lower)) {
    quadrant = 'Q4';
    rationale = 'Low impact with no urgent deadline—drop it to protect deep-work focus.';
  } else if (DELEGATE_MINIMIZE_RE.test(lower)) {
    quadrant = 'Q3';
    rationale = 'Feels urgent or noisy, but has low strategic impact—batch or delegate.';
  } else if (urgency >= 4 && importance >= 3) {
    quadrant = 'Q1';
    rationale = deadline.dueLabel
      ? `High-consequence deliverable with an imminent deadline (${deadline.dueLabel}).`
      : 'Critical, time-sensitive obligation with immediate consequences if delayed.';
  } else if (importance >= 2) {
    quadrant = 'Q2';
    rationale =
      deadline.hoursUntil !== null && deadline.hoursUntil > 24
        ? `High long-term value (${deadline.dueLabel}); schedule a dedicated block before it turns into a crisis.`
        : 'High-value progress that builds momentum without an immediate crisis today.';
  } else if (urgency >= 3) {
    quadrant = 'Q3';
    rationale = 'Time-sensitive admin or interruption; handle in a short batch after Q1.';
  } else {
    quadrant = 'Q4';
    rationale = 'Low urgency and minimal impact—eliminate or defer indefinitely.';
  }

  return {
    id: `task-${clock.nowMs}-${idx + 1}`,
    raw: line,
    title: condenseTitle(line),
    deadline,
    urgencyScore: urgency,
    importanceScore: importance,
    estimatedMinutes,
    quadrant,
    rationale,
  };
}

function isPreambleLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return true;
  if (trimmed.endsWith(':') && trimmed.split(/\s+/).length <= 14) return true;
  if (
    /^(here is|here's|my week|everything feels|help me|i need to|my list)/i.test(trimmed) &&
    !/\b(due|submit|finish|study|fix|pay|reply|draft)\b/i.test(trimmed)
  ) {
    return true;
  }
  return false;
}

function splitBrainDump(text: string): string[] {
  const rawLines = text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !isPreambleLine(l));

  if (rawLines.length === 1 && rawLines[0].includes(';')) {
    return rawLines[0]
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (rawLines.length === 1 && rawLines[0].split(',').length >= 3) {
    return rawLines[0]
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  return rawLines;
}

function buildPlanAndMessage(
  tasks: MatrixTask[],
  urgencyChallenge: string | null,
  customLeadNote?: string
): { actionPlan: ActionPlan; coachMessage: string } {
  const q1 = tasks.filter((t) => t.quadrant === 'Q1');
  const q2 = tasks.filter((t) => t.quadrant === 'Q2');
  const q3 = tasks.filter((t) => t.quadrant === 'Q3');
  const q4 = tasks.filter((t) => t.quadrant === 'Q4');

  const top3 = q1
    .filter((t) => t.isTopThree)
    .sort((a, b) => (a.topRank ?? 99) - (b.topRank ?? 99));

  const q1q2Sequence: ActionStep[] = [];
  let orderCounter = 1;

  q1.forEach((t) => {
    q1q2Sequence.push({
      order: orderCounter++,
      taskId: t.id,
      taskTitle: t.title,
      quadrant: 'Q1',
      guidance: t.dueLabel
        ? `Complete immediately before ${t.dueLabel}. ${t.rationale}`
        : `Tackle right away with zero distractions. ${t.rationale}`,
    });
  });

  q2.forEach((t) => {
    q1q2Sequence.push({
      order: orderCounter++,
      taskId: t.id,
      taskTitle: t.title,
      quadrant: 'Q2',
      guidance: t.dueLabel
        ? `Reserve a focused ${t.estimatedMinutes ?? 45}-minute block ahead of ${t.dueLabel}.`
        : `Schedule a protected ${t.estimatedMinutes ?? 45}-minute deep-work block this week.`,
    });
  });

  const q3BatchStrategy =
    q3.length > 0
      ? `Batch ${q3.length} Q3 item${q3.length > 1 ? 's' : ''} (${q3
          .map((t) => t.title)
          .slice(0, 3)
          .join(', ')}) into one 20-minute admin sprint only after finishing your Top 3.`
      : 'No Q3 tasks flagged—protect your deep-work blocks from incoming requests.';

  const q4DropStrategy =
    q4.length > 0
      ? `Drop ${q4.length} Q4 distraction${q4.length > 1 ? 's' : ''} (${q4
          .map((t) => t.title)
          .slice(0, 3)
          .join(', ')}) completely until your Q1 list is cleared.`
      : 'No Q4 distractions detected—stay disciplined as new distractions appear.';

  const lines: string[] = [];

  if (customLeadNote) {
    lines.push('### Matrix Updated', '', customLeadNote);
  } else {
    lines.push(
      `### Triage Complete: ${tasks.length} Tasks Organized`,
      '',
      'I sorted every item from your brain dump into the four Eisenhower quadrants and armed deadline alerts for timed items.'
    );
  }

  if (urgencyChallenge) {
    lines.push('', '### Urgency Reality Check', '', urgencyChallenge);
  }

  lines.push('', '### Top 3 "Do First" Priorities');
  if (top3.length === 0) {
    lines.push('- No critical Q1 emergencies right now—start with your top Q2 block.');
  } else {
    top3.forEach((t, idx) => {
      lines.push(
        `${idx + 1}. **${t.title}**${t.dueLabel ? ` (${t.dueLabel})` : ''} — ${t.rationale}`
      );
    });
  }

  if (q2.length > 0 || q3.length > 0) {
    lines.push('', '### Why Borderline Tasks Landed Where They Did');
    [...q2.slice(0, 2), ...q3.slice(0, 2)].forEach((t) => {
      lines.push(`- **${t.title}** (${t.quadrant}): ${t.rationale}`);
    });
  }

  lines.push('', '### Concrete Action Plan');
  q1q2Sequence.slice(0, 6).forEach((step) => {
    lines.push(`${step.order}. **${step.taskTitle}** (${step.quadrant}) — ${step.guidance}`);
  });
  lines.push(`- **Batch Q3:** ${q3BatchStrategy}`);
  lines.push(`- **Drop Q4:** ${q4DropStrategy}`);

  lines.push(
    '',
    '### Next Step',
    'Do any deadlines or quadrant placements need to be adjusted, or are you ready to start on **Task #1**?'
  );

  return {
    actionPlan: {
      q1q2Sequence,
      q3BatchStrategy,
      q4DropStrategy,
      urgencyChallenge,
    },
    coachMessage: lines.join('\n'),
  };
}

function finalizeQuadrants(candidates: ScoredCandidate[]): {
  tasks: MatrixTask[];
  urgencyChallenge: string | null;
} {
  const q1Candidates = candidates
    .filter((c) => c.quadrant === 'Q1')
    .sort((a, b) => {
      const aTime = a.deadline.hoursUntil ?? 999;
      const bTime = b.deadline.hoursUntil ?? 999;
      if (aTime !== bTime) return aTime - bTime;
      return b.importanceScore + b.urgencyScore - (a.importanceScore + a.urgencyScore);
    });

  let urgencyChallenge: string | null = null;
  if (q1Candidates.length > 4) {
    const demoted = q1Candidates.slice(4);
    demoted.forEach((item) => {
      item.quadrant = item.importanceScore >= 3 ? 'Q2' : 'Q3';
      item.rationale = `${item.rationale} Kept out of Q1 to prevent overwhelm (4-item Q1 cap).`;
    });
    urgencyChallenge = `More than 4 items looked urgent, so I kept only the 4 highest-consequence deadlines in Q1 and moved ${demoted
      .map((d) => `"${d.title}"`)
      .join(', ')} to Q2/Q3. Tell me if any of those carry irreversible consequences today.`;
  }

  const topQ1Ids = q1Candidates.slice(0, 3).map((c) => c.id);

  const tasks: MatrixTask[] = candidates.map((c) => {
    const topIdx = topQ1Ids.indexOf(c.id);
    return {
      id: c.id,
      title: c.title,
      quadrant: c.quadrant,
      isTopThree: topIdx !== -1,
      topRank: topIdx !== -1 ? ((topIdx + 1) as 1 | 2 | 3) : null,
      rationale: c.rationale,
      dueAt: c.deadline.dueAt,
      dueLabel: c.deadline.dueLabel,
      estimatedMinutes: c.estimatedMinutes,
      completed: false,
    };
  });

  return { tasks, urgencyChallenge };
}

function handleRefinement(
  input: string,
  existingTasks: MatrixTask[],
  clock: ClientClock
): CoachAnalysisResult | null {
  const lower = input.toLowerCase().trim();

  if (lower.includes('challenge') && (lower.includes('q1') || lower.includes('urgency') || lower.includes('priorit'))) {
    const q1 = existingTasks.filter((t) => t.quadrant === 'Q1' && !t.completed);
    if (q1.length === 0) {
      return {
        coachMessage:
          '### Q1 Reality Check\n\nYour Quadrant 1 is already empty! Focus on scheduling your highest-leverage Q2 task or paste new tasks below.',
        tasks: existingTasks,
        actionPlan: buildPlanAndMessage(existingTasks, null).actionPlan,
      };
    }
    const lastQ1 = q1[q1.length - 1];
    const challengeMsg = [
      '### Q1 Urgency Challenge',
      '',
      `Look closely at **${lastQ1.title}**${lastQ1.dueLabel ? ` (${lastQ1.dueLabel})` : ''}:`,
      '- If this waited 48 hours, would there be an irreversible penalty, lost opportunity, or blocker for others?',
      '- If not, move it to **Q2 Schedule** so your Top 3 get 100% of your cognitive energy.',
      '',
      'Reply with `"Move [task] to Q2"` to adjust it, or click **Start Task #1** to begin.',
    ].join('\n');
    const { actionPlan } = buildPlanAndMessage(existingTasks, null);
    return { coachMessage: challengeMsg, tasks: existingTasks, actionPlan };
  }

  const moveMatch = lower.match(/move\s+(.+?)\s+to\s+(q[1-4])/i);
  if (moveMatch) {
    const needle = moveMatch[1].replace(/["']/g, '').trim();
    const targetQ = moveMatch[2].toUpperCase() as QuadrantId;
    const match = existingTasks.find((t) => t.title.toLowerCase().includes(needle));
    if (match) {
      let updated = existingTasks.map((t) =>
        t.id === match.id
          ? {
              ...t,
              quadrant: targetQ,
              isTopThree: targetQ === 'Q1' ? t.isTopThree : false,
              topRank: targetQ === 'Q1' ? t.topRank : null,
              rationale: `Moved to ${targetQ} per your priority adjustment.`,
            }
          : t
      );

      const activeQ1 = updated.filter((t) => t.quadrant === 'Q1' && !t.completed);
      let note = `Moved **${match.title}** to **${targetQ}**.`;
      if (activeQ1.length > 4) {
        const demote = activeQ1.find((t) => t.id !== match.id) ?? activeQ1[0];
        updated = updated.map((t) =>
          t.id === demote.id
            ? { ...t, quadrant: 'Q2', isTopThree: false, topRank: null }
            : t
        );
        note += ` To keep Q1 at 4 items max, **${demote.title}** shifted to **Q2 Schedule**.`;
      }
      let rank = 1;
      updated = updated.map((t) => {
        if (t.quadrant === 'Q1' && !t.completed && rank <= 3) {
          return { ...t, isTopThree: true, topRank: rank++ as 1 | 2 | 3 };
        }
        return { ...t, isTopThree: false, topRank: null };
      });

      const { actionPlan, coachMessage } = buildPlanAndMessage(updated, null, note);
      return { coachMessage, tasks: updated, actionPlan };
    }
  }

  if (lower.startsWith('adjust deadline') || /\bdue\b/.test(lower)) {
    const newDeadline = extractDeadline(input, clock);
    if (newDeadline.dueAt || newDeadline.dueLabel) {
      const cleanedQuery = lower
        .replace(/^adjust deadline:\s*/i, '')
        .replace(/\b(today|tonight|tomorrow|in \d+.*|at \d+.*|by \d+.*)$/i, '')
        .trim();
      const match = existingTasks.find((t) =>
        cleanedQuery
          .split(/\s+/)
          .filter((w) => w.length > 3)
          .some((w) => t.title.toLowerCase().includes(w))
      );
      if (match) {
        const updated = existingTasks.map((t) =>
          t.id === match.id
            ? { ...t, dueAt: newDeadline.dueAt, dueLabel: newDeadline.dueLabel }
            : t
        );
        const { actionPlan, coachMessage } = buildPlanAndMessage(
          updated,
          null,
          `Updated deadline for **${match.title}** to **${newDeadline.dueLabel}** and re-armed your alerts.`
        );
        return { coachMessage, tasks: updated, actionPlan };
      }
    }
  }

  return null;
}

export function analyzeBrainDump(
  brainDump: string,
  clientNowIso?: string,
  existingTasks?: MatrixTask[]
): CoachAnalysisResult {
  const clock = parseClientClock(clientNowIso);
  const hasExisting = Array.isArray(existingTasks) && existingTasks.length > 0;

  if (hasExisting) {
    const refined = handleRefinement(brainDump, existingTasks, clock);
    if (refined) return refined;
  }

  const lines = splitBrainDump(brainDump);
  const candidates = lines.map((line, i) => scoreCandidate(line, i, clock));
  const { tasks: newTasks, urgencyChallenge } = finalizeQuadrants(candidates);

  if (hasExisting && lines.length <= 3 && !brainDump.includes('\n')) {
    const merged = [...existingTasks!, ...newTasks];
    const activeQ1 = merged.filter((t) => t.quadrant === 'Q1' && !t.completed);
    let rank = 1;
    const normalized = merged.map((t, idx) => {
      if (t.quadrant === 'Q1' && !t.completed) {
        if (rank <= 4) {
          const isTop = rank <= 3;
          const r = isTop ? (rank as 1 | 2 | 3) : null;
          rank++;
          return { ...t, isTopThree: isTop, topRank: r };
        }
        return { ...t, quadrant: 'Q2' as QuadrantId, isTopThree: false, topRank: null };
      }
      return { ...t, id: t.id || `task-${idx}` };
    });
    const note =
      activeQ1.length > 4
        ? 'Added your new item(s) and kept Quadrant 1 capped at 4 items max.'
        : 'Added your new item(s) to the matrix.';
    const { actionPlan, coachMessage } = buildPlanAndMessage(normalized, null, note);
    return { coachMessage, tasks: normalized, actionPlan };
  }

  const { actionPlan, coachMessage } = buildPlanAndMessage(newTasks, urgencyChallenge);
  return {
    coachMessage,
    tasks: newTasks,
    actionPlan,
  };
}
