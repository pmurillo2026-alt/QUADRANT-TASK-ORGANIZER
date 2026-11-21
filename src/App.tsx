import { useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, User } from 'firebase/auth';
import { Bell, Clock, LogIn, LogOut, Play, X } from 'lucide-react';
import { ActionPlanView } from './components/ActionPlanView';
import { CoachChatPanel } from './components/CoachChatPanel';
import { DeadlineAlertsView } from './components/DeadlineAlertsView';
import { FocusSessionBar } from './components/FocusSessionBar';
import { GmailLoginScreen } from './components/GmailLoginScreen';
import { QuadrantMatrix } from './components/QuadrantMatrix';
import { auth, googleProvider } from './firebase';
import {
  createMessageDoc,
  createSingleTask,
  deleteTaskDoc,
  replaceTasksBatch,
  resetUserWorkspaceDocs,
  sanitizeId,
  saveWorkspaceSettings,
  subscribeMessages,
  subscribeSettings,
  subscribeTasks,
  updateTaskCompletion,
  updateTaskDeadlineDoc,
  updateTaskQuadrant,
  upsertUserProfile,
} from './services/firestoreSync';
import {
  ActionPlan,
  AlertSettings,
  ChatMessage,
  CoachAnalysisResult,
  MatrixTask,
  QuadrantId,
} from './types';
import {
  computeDeadlineAlerts,
  countWords,
  formatCountdown,
  formatShortDueLabel,
  getLocalIsoWithOffset,
  playAlertChime,
  QUADRANT_META,
} from './utils/deadlines';

type NavTab = 'workspace' | 'matrix' | 'plan' | 'alerts';

const STORAGE_KEY = 'quadrant_eisenhower_state_v1';

function createInitialCoachMessage(): ChatMessage {
  return {
    id: 'welcome-coach',
    role: 'coach',
    timestamp: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
    content: `### Step 1: Let's Clear Your Head

Paste your unfiltered brain dump of tasks, deadlines, and responsibilities below—along with any key due dates or personal priorities for today or this week.

- Don't worry about organizing or formatting it first.
- Include rough due times (e.g., *"tonight 11:59 PM"*, *"in 45 mins"*, *"Friday 2 PM"*) so I can triage urgency accurately and arm your approaching-deadline alerts.
- Everything stays 100% self-contained right here.`,
  };
}

const DEFAULT_SETTINGS: AlertSettings = {
  thresholdMinutes: 60,
  soundEnabled: true,
  desktopEnabled: true,
};

interface PersistedState {
  messages: ChatMessage[];
  tasks: MatrixTask[];
  actionPlan: ActionPlan | null;
  settings: AlertSettings;
  snoozedUntil: Record<string, number>;
}

function loadLocalState(): PersistedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        messages:
          Array.isArray(parsed.messages) && parsed.messages.length > 0
            ? parsed.messages
            : [createInitialCoachMessage()],
        tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
        actionPlan: parsed.actionPlan ?? null,
        settings: { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) },
        snoozedUntil: parsed.snoozedUntil ?? {},
      };
    }
  } catch {
    // Ignore storage read issues
  }
  return {
    messages: [createInitialCoachMessage()],
    tasks: [],
    actionPlan: null,
    settings: DEFAULT_SETTINGS,
    snoozedUntil: {},
  };
}

export default function App() {
  const initialLocal = useMemo(() => loadLocalState(), []);

  // Auth state
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [guestMode, setGuestMode] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [firestoreError, setFirestoreError] = useState<Error | null>(null);

  // Workspace state
  const [activeTab, setActiveTab] = useState<NavTab>('workspace');
  const [messages, setMessages] = useState<ChatMessage[]>(initialLocal.messages);
  const [tasks, setTasks] = useState<MatrixTask[]>(initialLocal.tasks);
  const [actionPlan, setActionPlan] = useState<ActionPlan | null>(initialLocal.actionPlan);
  const [settings, setSettings] = useState<AlertSettings>(initialLocal.settings);
  const [snoozedUntil, setSnoozedUntil] = useState<Record<string, number>>(
    initialLocal.snoozedUntil
  );
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => new Set());

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [matrixFilter, setMatrixFilter] = useState<'all' | 'active' | 'completed'>('all');
  const [q1SwapPrompt, setQ1SwapPrompt] = useState<{
    pendingTaskId: string;
    pendingTitle: string;
  } | null>(null);

  // Focus timer state
  const [focusTaskId, setFocusTaskId] = useState<string | null>(null);
  const [focusSeconds, setFocusSeconds] = useState<number>(25 * 60);
  const [focusRunning, setFocusRunning] = useState<boolean>(false);

  // Toast alert state
  const [toastAlert, setToastAlert] = useState<{
    title: string;
    detail: string;
    isUrgent: boolean;
  } | null>(null);

  const [notificationPermission, setNotificationPermission] = useState<
    NotificationPermission | 'unsupported'
  >(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
    return Notification.permission;
  });

  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const notifiedKeysRef = useRef<Set<string>>(new Set());

  // Throw Firestore listener errors into ErrorBoundary cleanly
  if (firestoreError) {
    throw firestoreError;
  }

  // Firebase Auth listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      setAuthReady(true);

      if (firebaseUser) {
        setGuestMode(false);
        setAuthError(null);
        try {
          await upsertUserProfile(firebaseUser);
        } catch (err) {
          setFirestoreError(err as Error);
        }
      }
    });
    return () => unsubscribe();
  }, []);

  // Firestore real-time subscriptions when authenticated
  useEffect(() => {
    if (!authReady || !user) return;

    const uid = user.uid;
    const unsubTasks = subscribeTasks(
      uid,
      (remoteTasks) => setTasks(remoteTasks),
      (err) => setFirestoreError(err)
    );

    const unsubMessages = subscribeMessages(
      uid,
      (remoteMsgs) => {
        setMessages(remoteMsgs.length > 0 ? remoteMsgs : [createInitialCoachMessage()]);
      },
      (err) => setFirestoreError(err)
    );

    const unsubSettings = subscribeSettings(
      uid,
      (remote) => {
        setSettings(remote.settings);
        setSnoozedUntil(remote.snoozedUntil);
        setActionPlan(remote.actionPlan);
      },
      (err) => setFirestoreError(err)
    );

    return () => {
      unsubTasks();
      unsubMessages();
      unsubSettings();
    };
  }, [authReady, user]);

  // Persist local guest state only when not signed in
  useEffect(() => {
    if (user) return;
    try {
      const payload: PersistedState = {
        messages,
        tasks,
        actionPlan,
        settings,
        snoozedUntil,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Ignore storage quota errors
    }
  }, [user, messages, tasks, actionPlan, settings, snoozedUntil]);

  // Real-time 10-second deadline watchdog tick
  useEffect(() => {
    const interval = setInterval(() => {
      setNowMs(Date.now());
    }, 10_000);
    return () => clearInterval(interval);
  }, []);

  // Focus session 1-second timer tick
  useEffect(() => {
    if (!focusTaskId || !focusRunning) return;
    const interval = setInterval(() => {
      setFocusSeconds((prev) => {
        if (prev <= 1) {
          setFocusRunning(false);
          if (settings.soundEnabled) playAlertChime();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [focusTaskId, focusRunning, settings.soundEnabled]);

  const activeAlerts = useMemo(
    () =>
      computeDeadlineAlerts(
        tasks,
        nowMs,
        settings.thresholdMinutes,
        snoozedUntil,
        dismissedIds
      ),
    [tasks, nowMs, settings.thresholdMinutes, snoozedUntil, dismissedIds]
  );

  // Fire chime + browser notification + toast when a task crosses into an alert tier
  useEffect(() => {
    for (const alert of activeAlerts) {
      const key = `${alert.taskId}:${alert.severity}`;
      if (notifiedKeysRef.current.has(key)) continue;
      notifiedKeysRef.current.add(key);

      const countdown = formatCountdown(alert.msRemaining);
      const qMeta = QUADRANT_META[alert.quadrant];

      if (settings.soundEnabled) {
        playAlertChime();
      }

      if (
        settings.desktopEnabled &&
        typeof window !== 'undefined' &&
        'Notification' in window &&
        Notification.permission === 'granted'
      ) {
        try {
          new Notification(`Deadline Alert: ${alert.taskTitle}`, {
            body: `${countdown} · ${qMeta.code} ${qMeta.name}`,
          });
        } catch {
          // Ignore Notification constructor errors in restricted contexts
        }
      }

      setToastAlert({
        title: alert.taskTitle,
        detail: `${countdown} · ${qMeta.code} ${qMeta.name}`,
        isUrgent: alert.severity === 'overdue' || alert.severity === 'critical',
      });
    }
  }, [activeAlerts, settings.soundEnabled, settings.desktopEnabled]);

  useEffect(() => {
    if (!toastAlert) return;
    const timer = setTimeout(() => setToastAlert(null), 6000);
    return () => clearTimeout(timer);
  }, [toastAlert]);

  const handleSignInWithGmail = async () => {
    setAuthError(null);
    setIsSigningIn(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err: any) {
      const code = err?.code || '';
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        setAuthError('Sign-in popup was closed before completing Gmail authentication.');
      } else if (code === 'auth/popup-blocked') {
        setAuthError(
          'Your browser blocked the Google sign-in popup. Please allow popups for this site and try again.'
        );
      } else {
        setAuthError(err?.message || 'Unable to sign in with Gmail. Please try again.');
      }
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setGuestMode(false);
      setTasks([]);
      setActionPlan(null);
      setMessages([createInitialCoachMessage()]);
      setSnoozedUntil({});
      setDismissedIds(new Set());
      setFocusTaskId(null);
      setFocusRunning(false);
      setQ1SwapPrompt(null);
      setError(null);
      notifiedKeysRef.current.clear();
    } catch (err: any) {
      setError(err?.message || 'Unable to sign out right now.');
    }
  };

  const handleSubmitBrainDump = async (text: string) => {
    setError(null);
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
    };

    const nextHistory = [...messages, userMsg];
    setMessages(nextHistory);
    setIsAnalyzing(true);

    try {
      const res = await fetch('/api/coach/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brainDump: text,
          clientNow: getLocalIsoWithOffset(),
          existingTasks: tasks,
          history: nextHistory,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Coach analysis failed.');
      }

      const result = data as CoachAnalysisResult;
      const coachMsg: ChatMessage = {
        id: `coach-${Date.now() + 1}`,
        role: 'coach',
        content: result.coachMessage,
        timestamp: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
      };

      const previousTasks = tasks;
      setMessages((prev) => [...prev, coachMsg]);
      setTasks(result.tasks);
      setActionPlan(result.actionPlan);
      setNowMs(Date.now());

      if (user) {
        await Promise.all([
          createMessageDoc(user.uid, userMsg),
          createMessageDoc(user.uid, coachMsg),
          replaceTasksBatch(user.uid, result.tasks, previousTasks),
          saveWorkspaceSettings(user.uid, settings, snoozedUntil, result.actionPlan),
        ]);
      }
    } catch (err: any) {
      setError(err?.message || 'Unable to reach the prioritization coach.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleResetSession = async () => {
    const prevTasks = tasks;
    const prevMessages = messages;
    setMessages([createInitialCoachMessage()]);
    setTasks([]);
    setActionPlan(null);
    setSnoozedUntil({});
    setDismissedIds(new Set());
    setFocusTaskId(null);
    setFocusRunning(false);
    setQ1SwapPrompt(null);
    setError(null);
    notifiedKeysRef.current.clear();
    setActiveTab('workspace');

    if (user) {
      try {
        await resetUserWorkspaceDocs(user.uid, prevTasks, prevMessages, settings);
      } catch (err) {
        setFirestoreError(err as Error);
      }
    }

    setTimeout(() => composerRef.current?.focus(), 50);
  };

  const handleToggleComplete = async (taskId: string) => {
    const target = tasks.find((t) => t.id === taskId);
    if (!target) return;
    const nextCompleted = !target.completed;

    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, completed: nextCompleted } : t))
    );
    if (focusTaskId === taskId) {
      setFocusTaskId(null);
      setFocusRunning(false);
    }

    if (user) {
      try {
        await updateTaskCompletion(user.uid, taskId, nextCompleted);
      } catch (err) {
        setFirestoreError(err as Error);
      }
    }
  };

  const handleMoveTask = async (taskId: string, targetQuadrant: QuadrantId) => {
    const targetTask = tasks.find((t) => t.id === taskId);
    if (!targetTask) return;

    if (targetQuadrant === 'Q1' && !targetTask.completed) {
      const activeQ1Count = tasks.filter((t) => t.quadrant === 'Q1' && !t.completed).length;
      if (activeQ1Count >= 4) {
        setQ1SwapPrompt({ pendingTaskId: taskId, pendingTitle: targetTask.title });
        return;
      }
    }

    const nextIsTop = targetQuadrant === 'Q1' ? targetTask.isTopThree : false;
    const nextRank = targetQuadrant === 'Q1' ? targetTask.topRank : null;

    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId
          ? { ...t, quadrant: targetQuadrant, isTopThree: nextIsTop, topRank: nextRank }
          : t
      )
    );

    if (user) {
      try {
        await updateTaskQuadrant(user.uid, taskId, {
          quadrant: targetQuadrant,
          isTopThree: nextIsTop,
          topRank: nextRank,
          rationale: targetTask.rationale,
        });
      } catch (err) {
        setFirestoreError(err as Error);
      }
    }
  };

  const handleResolveQ1Swap = async (demoteTaskId: string) => {
    if (!q1SwapPrompt) return;
    const promoteId = q1SwapPrompt.pendingTaskId;
    const demoteTask = tasks.find((t) => t.id === demoteTaskId);
    const promoteTask = tasks.find((t) => t.id === promoteId);

    const demoteRationale = demoteTask
      ? `${demoteTask.rationale} (Moved to Q2 to maintain Q1 focus limit.)`
      : 'Moved to Q2 to maintain Q1 focus limit.';

    setTasks((prev) =>
      prev.map((t) => {
        if (t.id === demoteTaskId) {
          return {
            ...t,
            quadrant: 'Q2',
            isTopThree: false,
            topRank: null,
            rationale: demoteRationale,
          };
        }
        if (t.id === promoteId) {
          return { ...t, quadrant: 'Q1' };
        }
        return t;
      })
    );
    setQ1SwapPrompt(null);

    if (user) {
      try {
        await Promise.all([
          updateTaskQuadrant(user.uid, demoteTaskId, {
            quadrant: 'Q2',
            isTopThree: false,
            topRank: null,
            rationale: demoteRationale,
          }),
          promoteTask
            ? updateTaskQuadrant(user.uid, promoteId, {
                quadrant: 'Q1',
                isTopThree: promoteTask.isTopThree,
                topRank: promoteTask.topRank,
                rationale: promoteTask.rationale,
              })
            : Promise.resolve(),
        ]);
      } catch (err) {
        setFirestoreError(err as Error);
      }
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
    if (focusTaskId === taskId) {
      setFocusTaskId(null);
      setFocusRunning(false);
    }
    if (user) {
      try {
        await deleteTaskDoc(user.uid, taskId);
      } catch (err) {
        setFirestoreError(err as Error);
      }
    }
  };

  const handleUpdateDeadline = async (
    taskId: string,
    dueAt: string | null,
    dueLabel: string | null
  ) => {
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, dueAt, dueLabel } : t)));
    setDismissedIds((prev) => {
      const next = new Set(prev);
      next.delete(taskId);
      return next;
    });
    const nextSnoozed = { ...snoozedUntil };
    delete nextSnoozed[taskId];
    setSnoozedUntil(nextSnoozed);

    for (const key of Array.from(notifiedKeysRef.current)) {
      if (key.startsWith(`${taskId}:`)) notifiedKeysRef.current.delete(key);
    }
    setNowMs(Date.now());

    if (user) {
      try {
        await Promise.all([
          updateTaskDeadlineDoc(user.uid, taskId, dueAt, dueLabel),
          saveWorkspaceSettings(user.uid, settings, nextSnoozed, actionPlan),
        ]);
      } catch (err) {
        setFirestoreError(err as Error);
      }
    }
  };

  const handleAddTask = async (title: string, quadrant: QuadrantId, dueAt: string | null) => {
    const words = title.trim().split(/\s+/);
    const conciseTitle =
      countWords(title) > 12 ? `${words.slice(0, 11).join(' ')}…` : words.join(' ');
    const dueLabel = dueAt ? formatShortDueLabel(dueAt) : null;
    const newId = sanitizeId(`task-${Date.now()}`, 'task');

    let finalQuadrant: QuadrantId = quadrant;
    let rationale = 'Added directly in workspace.';
    let triggerSwap = false;

    if (quadrant === 'Q1') {
      const activeQ1 = tasks.filter((t) => t.quadrant === 'Q1' && !t.completed).length;
      if (activeQ1 >= 4) {
        finalQuadrant = 'Q2';
        rationale = 'Added manually; temporarily placed in Q2 until Q1 has capacity.';
        triggerSwap = true;
      }
    }

    const newTask: MatrixTask = {
      id: newId,
      title: conciseTitle,
      quadrant: finalQuadrant,
      isTopThree: false,
      topRank: null,
      rationale,
      dueAt,
      dueLabel,
      estimatedMinutes: null,
      completed: false,
    };

    setTasks((prev) => [...prev, newTask]);
    if (triggerSwap) {
      setQ1SwapPrompt({ pendingTaskId: newId, pendingTitle: conciseTitle });
    }

    if (user) {
      try {
        await createSingleTask(user.uid, newTask);
      } catch (err) {
        setFirestoreError(err as Error);
      }
    }
  };

  const handleUpdateSettings = async (nextPartial: Partial<AlertSettings>) => {
    const updated = { ...settings, ...nextPartial };
    setSettings(updated);
    if (user) {
      try {
        await saveWorkspaceSettings(user.uid, updated, snoozedUntil, actionPlan);
      } catch (err) {
        setFirestoreError(err as Error);
      }
    }
  };

  const handleStartFocus = (taskId: string) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    setFocusTaskId(task.id);
    setFocusSeconds((task.estimatedMinutes ?? 25) * 60);
    setFocusRunning(true);
  };

  const handleStartTaskOne = () => {
    const taskOne =
      tasks.find((t) => t.quadrant === 'Q1' && t.isTopThree && t.topRank === 1 && !t.completed) ||
      tasks.find((t) => t.quadrant === 'Q1' && t.isTopThree && !t.completed) ||
      tasks.find((t) => t.quadrant === 'Q1' && !t.completed);
    if (taskOne) handleStartFocus(taskOne.id);
  };

  const handleRequestDesktopPermission = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setNotificationPermission('unsupported');
      return;
    }
    const result = await Notification.requestPermission();
    setNotificationPermission(result);
    if (result === 'granted') {
      await handleUpdateSettings({ desktopEnabled: true });
    }
  };

  const handleSnoozeAlert = async (taskId: string, minutes: number) => {
    const nextSnoozed = {
      ...snoozedUntil,
      [taskId]: Date.now() + minutes * 60_000,
    };
    setSnoozedUntil(nextSnoozed);
    if (user) {
      try {
        await saveWorkspaceSettings(user.uid, settings, nextSnoozed, actionPlan);
      } catch (err) {
        setFirestoreError(err as Error);
      }
    }
  };

  const handleDismissAlert = (taskId: string) => {
    setDismissedIds((prev) => new Set(prev).add(taskId));
  };

  const handleClearSnooze = async (taskId: string) => {
    const nextSnoozed = { ...snoozedUntil };
    delete nextSnoozed[taskId];
    setSnoozedUntil(nextSnoozed);
    if (user) {
      try {
        await saveWorkspaceSettings(user.uid, settings, nextSnoozed, actionPlan);
      } catch (err) {
        setFirestoreError(err as Error);
      }
    }
  };

  const handleAssignQuickDeadline = (taskId: string, offsetMinutes: number) => {
    const target = new Date(Date.now() + offsetMinutes * 60_000);
    const iso = target.toISOString();
    handleUpdateDeadline(taskId, iso, formatShortDueLabel(iso));
  };

  const handleSendTestAlert = () => {
    if (settings.soundEnabled) playAlertChime();
    if (
      settings.desktopEnabled &&
      typeof window !== 'undefined' &&
      'Notification' in window &&
      Notification.permission === 'granted'
    ) {
      try {
        new Notification('Quadrant Deadline Alert Test', {
          body: 'Approaching-deadline notifications are active and working.',
        });
      } catch {
        // Ignore
      }
    }
    setToastAlert({
      title: 'Deadline Alert System Active',
      detail: `Audio chime & live alerts armed (${settings.thresholdMinutes}m lead window)`,
      isUrgent: false,
    });
  };

  const focusTask = tasks.find((t) => t.id === focusTaskId) ?? null;

  const filteredTasks = useMemo(() => {
    if (matrixFilter === 'active') return tasks.filter((t) => !t.completed);
    if (matrixFilter === 'completed') return tasks.filter((t) => t.completed);
    return tasks;
  }, [tasks, matrixFilter]);

  const urgentAlert = activeAlerts[0] ?? null;

  // Loading auth session screen
  if (!authReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-500">
        Checking session...
      </div>
    );
  }

  // Gmail Login Gate (unless signed in OR user opted into local guest mode)
  if (!user && !guestMode) {
    return (
      <GmailLoginScreen
        isSigningIn={isSigningIn}
        authError={authError}
        onSignInWithGmail={handleSignInWithGmail}
        onContinueLocal={() => setGuestMode(true)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Top Bar Contract: 3 zones separated by gap-8 */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-8 px-4 py-3.5 sm:px-6">
          {/* Zone 1: Single-line Brand Wordmark */}
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('workspace');
            }}
            className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            Quadrant
          </a>

          {/* Zone 2: Clean Single-Line Nav Links */}
          <nav
            aria-label="Primary navigation"
            className="flex items-center gap-6 overflow-x-auto text-sm font-medium"
          >
            <button
              type="button"
              onClick={() => setActiveTab('workspace')}
              className={`border-b-2 py-1 transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'workspace'
                  ? 'border-slate-900 text-slate-900'
                  : 'border-transparent text-slate-500 hover:text-slate-900'
              }`}
            >
              Workspace
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('matrix')}
              className={`border-b-2 py-1 transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'matrix'
                  ? 'border-slate-900 text-slate-900'
                  : 'border-transparent text-slate-500 hover:text-slate-900'
              }`}
            >
              Matrix
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('plan')}
              className={`border-b-2 py-1 transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'plan'
                  ? 'border-slate-900 text-slate-900'
                  : 'border-transparent text-slate-500 hover:text-slate-900'
              }`}
            >
              Action Plan
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('alerts')}
              className={`border-b-2 py-1 transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'alerts'
                  ? 'border-slate-900 text-slate-900'
                  : 'border-transparent text-slate-500 hover:text-slate-900'
              }`}
            >
              <span className="tabular-nums">
                {activeAlerts.length > 0 ? `Alerts (${activeAlerts.length})` : 'Alerts'}
              </span>
            </button>
          </nav>

          {/* Zone 3: Gmail Account Log In / Log Out */}
          <div className="flex items-center gap-3 shrink-0">
            {user ? (
              <>
                <span className="hidden md:inline max-w-[190px] truncate text-xs text-slate-600">
                  {user.email}
                </span>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-800 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 whitespace-nowrap shrink-0"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span>Log Out</span>
                </button>
              </>
            ) : (
              <button
                type="button"
                disabled={isSigningIn}
                onClick={handleSignInWithGmail}
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-slate-800 disabled:bg-slate-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 whitespace-nowrap shrink-0"
              >
                <LogIn className="h-3.5 w-3.5" />
                <span>{isSigningIn ? 'Signing in...' : 'Log in with Gmail'}</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Active Focus Session Bar */}
      {focusTask && (
        <FocusSessionBar
          task={focusTask}
          secondsRemaining={focusSeconds}
          isRunning={focusRunning}
          onToggleRun={() => setFocusRunning((r) => !r)}
          onComplete={handleToggleComplete}
          onExit={() => {
            setFocusTaskId(null);
            setFocusRunning(false);
          }}
        />
      )}

      {/* Approaching-Deadline Alert Strip */}
      {urgentAlert && activeTab !== 'alerts' && (
        <div
          role="region"
          aria-label="Approaching deadline alert"
          className={`border-b ${
            urgentAlert.severity === 'overdue' || urgentAlert.severity === 'critical'
              ? 'border-red-200 bg-red-50 text-red-900'
              : 'border-amber-200 bg-amber-50 text-amber-900'
          }`}
        >
          <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
            <div className="flex min-w-0 items-center gap-2.5 text-xs sm:text-sm">
              <Bell className="h-4 w-4 shrink-0" />
              <p className="truncate font-medium">
                {urgentAlert.severity === 'overdue' ? 'Overdue' : 'Approaching deadline'}:{' '}
                <span className="font-semibold">{urgentAlert.taskTitle}</span>
                <span className="mx-2 opacity-40" aria-hidden="true">
                  ·
                </span>
                <span className="font-mono tabular-nums">
                  {formatCountdown(urgentAlert.msRemaining)}
                </span>
                <span className="mx-2 opacity-40" aria-hidden="true">
                  ·
                </span>
                <span>
                  {urgentAlert.quadrant} {QUADRANT_META[urgentAlert.quadrant].name}
                </span>
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => handleStartFocus(urgentAlert.taskId)}
                className="inline-flex items-center gap-1 rounded-md bg-slate-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-slate-800 whitespace-nowrap"
              >
                <Play className="h-3 w-3" />
                Focus
              </button>
              <button
                type="button"
                onClick={() => handleSnoozeAlert(urgentAlert.taskId, 15)}
                className="inline-flex items-center gap-1 rounded-md border border-current/20 bg-white/70 px-2.5 py-1 text-xs font-medium hover:bg-white whitespace-nowrap"
              >
                <Clock className="h-3 w-3" />
                Snooze 15m
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('alerts')}
                className="text-xs font-semibold underline-offset-2 hover:underline whitespace-nowrap"
              >
                All Alerts ({activeAlerts.length})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Container */}
      <main className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6">
        {activeTab === 'workspace' && (
          <div className="grid gap-6 lg:grid-cols-12 lg:items-start">
            <div className="lg:col-span-5 lg:sticky lg:top-6 lg:h-[calc(100vh-7.5rem)]">
              <CoachChatPanel
                messages={messages}
                tasks={tasks}
                isAnalyzing={isAnalyzing}
                error={error}
                composerRef={composerRef}
                onSubmitText={handleSubmitBrainDump}
                onStartTaskOne={handleStartTaskOne}
                onResetSession={handleResetSession}
              />
            </div>

            <div className="lg:col-span-7">
              <QuadrantMatrix
                tasks={tasks}
                nowMs={nowMs}
                thresholdMinutes={settings.thresholdMinutes}
                onToggleComplete={handleToggleComplete}
                onMoveTask={handleMoveTask}
                onDeleteTask={handleDeleteTask}
                onUpdateDeadline={handleUpdateDeadline}
                onAddTask={handleAddTask}
                onStartFocus={handleStartFocus}
                q1SwapPrompt={q1SwapPrompt}
                onResolveQ1Swap={handleResolveQ1Swap}
                onCancelQ1Swap={() => setQ1SwapPrompt(null)}
              />
            </div>
          </div>
        )}

        {activeTab === 'matrix' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white px-5 py-3.5">
              <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600">
                <span className="font-display text-sm font-semibold text-slate-900">
                  Full Eisenhower Matrix
                </span>
                <span aria-hidden="true" className="text-slate-300">
                  ·
                </span>
                <span className="font-mono tabular-nums">
                  {tasks.filter((t) => !t.completed).length} active / {tasks.length} total
                </span>
              </div>

              <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
                {(['all', 'active', 'completed'] as const).map((filter) => (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => setMatrixFilter(filter)}
                    className={`rounded-md px-3 py-1 text-xs font-medium capitalize transition-colors whitespace-nowrap shrink-0 ${
                      matrixFilter === filter
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {filter}
                  </button>
                ))}
              </div>
            </div>

            <QuadrantMatrix
              tasks={filteredTasks}
              nowMs={nowMs}
              thresholdMinutes={settings.thresholdMinutes}
              onToggleComplete={handleToggleComplete}
              onMoveTask={handleMoveTask}
              onDeleteTask={handleDeleteTask}
              onUpdateDeadline={handleUpdateDeadline}
              onAddTask={handleAddTask}
              onStartFocus={handleStartFocus}
              q1SwapPrompt={q1SwapPrompt}
              onResolveQ1Swap={handleResolveQ1Swap}
              onCancelQ1Swap={() => setQ1SwapPrompt(null)}
            />
          </div>
        )}

        {activeTab === 'plan' && (
          <ActionPlanView
            tasks={tasks}
            actionPlan={actionPlan}
            onStartFocus={handleStartFocus}
            onGoToCoach={() => setActiveTab('workspace')}
          />
        )}

        {activeTab === 'alerts' && (
          <DeadlineAlertsView
            tasks={tasks}
            alerts={activeAlerts}
            settings={settings}
            snoozedUntil={snoozedUntil}
            nowMs={nowMs}
            notificationPermission={notificationPermission}
            onUpdateSettings={handleUpdateSettings}
            onRequestDesktopPermission={handleRequestDesktopPermission}
            onSnoozeAlert={handleSnoozeAlert}
            onDismissAlert={handleDismissAlert}
            onClearSnooze={handleClearSnooze}
            onCompleteTask={handleToggleComplete}
            onStartFocus={handleStartFocus}
            onAssignQuickDeadline={handleAssignQuickDeadline}
            onSendTestAlert={handleSendTestAlert}
          />
        )}
      </main>

      {/* In-app deadline notification toast */}
      {toastAlert && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed right-5 bottom-5 z-50 w-full max-w-sm rounded-xl border p-4 shadow-lg ${
            toastAlert.isUrgent
              ? 'border-red-200 bg-white text-slate-900'
              : 'border-slate-200 bg-white text-slate-900'
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <p
                className={`text-xs font-semibold ${
                  toastAlert.isUrgent ? 'text-red-700' : 'text-amber-700'
                }`}
              >
                Approaching Deadline Alert
              </p>
              <p className="text-sm font-medium text-slate-900">{toastAlert.title}</p>
              <p className="font-mono text-xs tabular-nums text-slate-600">{toastAlert.detail}</p>
            </div>
            <button
              type="button"
              onClick={() => setToastAlert(null)}
              aria-label="Close alert notification"
              className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
