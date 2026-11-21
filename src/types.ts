export type QuadrantId = 'Q1' | 'Q2' | 'Q3' | 'Q4';

export interface MatrixTask {
  id: string;
  title: string; // Concise, < 12 words
  quadrant: QuadrantId;
  isTopThree: boolean;
  topRank: 1 | 2 | 3 | null;
  rationale: string;
  dueAt: string | null; // ISO-8601 datetime string
  dueLabel: string | null; // Short human label e.g. "Today 5:00 PM"
  estimatedMinutes: number | null;
  completed: boolean;
}

export interface ActionStep {
  order: number;
  taskId: string | null;
  taskTitle: string;
  quadrant: 'Q1' | 'Q2';
  guidance: string;
}

export interface ActionPlan {
  q1q2Sequence: ActionStep[];
  q3BatchStrategy: string;
  q4DropStrategy: string;
  urgencyChallenge: string | null;
}

export interface CoachAnalysisResult {
  coachMessage: string;
  tasks: MatrixTask[];
  actionPlan: ActionPlan;
}

export interface ChatMessage {
  id: string;
  role: 'coach' | 'user';
  content: string;
  timestamp: string;
  isError?: boolean;
}

export interface AlertSettings {
  thresholdMinutes: number; // e.g., 30, 60, 120, 240, 1440
  soundEnabled: boolean;
  desktopEnabled: boolean;
}

export type AlertSeverity = 'overdue' | 'critical' | 'approaching';

export interface DeadlineAlert {
  taskId: string;
  taskTitle: string;
  quadrant: QuadrantId;
  dueAt: string;
  msRemaining: number;
  severity: AlertSeverity;
}
