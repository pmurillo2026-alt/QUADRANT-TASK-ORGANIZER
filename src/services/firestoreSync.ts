import { User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  Unsubscribe,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { ActionPlan, AlertSettings, ChatMessage, MatrixTask } from '../types';

const VALID_THRESHOLDS = new Set([30, 60, 120, 240, 1440]);

export function sanitizeId(raw: string, fallbackPrefix: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 120);
  return cleaned.length > 0 ? cleaned : `${fallbackPrefix}-${Date.now()}`;
}

function clampString(val: string, maxLen: number): string {
  const trimmed = val.trim();
  return trimmed.length > maxLen ? trimmed.slice(0, maxLen) : trimmed;
}

function sanitizeActionPlan(plan: ActionPlan | null): ActionPlan | null {
  if (!plan) return null;
  return {
    q1q2Sequence: (plan.q1q2Sequence || []).slice(0, 50).map((s, idx) => ({
      order: typeof s.order === 'number' ? s.order : idx + 1,
      taskId: s.taskId ?? null,
      taskTitle: clampString(s.taskTitle || '', 160),
      quadrant: s.quadrant === 'Q2' ? 'Q2' : 'Q1',
      guidance: clampString(s.guidance || '', 500),
    })),
    q3BatchStrategy: clampString(plan.q3BatchStrategy || '', 1000),
    q4DropStrategy: clampString(plan.q4DropStrategy || '', 1000),
    urgencyChallenge: plan.urgencyChallenge ? clampString(plan.urgencyChallenge, 1000) : null,
  };
}

export async function upsertUserProfile(user: User): Promise<void> {
  const path = `users/${user.uid}/private/profile`;
  const ref = doc(db, 'users', user.uid, 'private', 'profile');

  try {
    const existing = await getDoc(ref);
    const email = clampString(user.email || 'user@gmail.com', 254);
    const displayName = clampString(user.displayName || email.split('@')[0] || 'User', 120);
    const photoURL = user.photoURL ? clampString(user.photoURL, 500) : null;

    if (!existing.exists()) {
      await setDoc(ref, {
        uid: user.uid,
        email,
        displayName,
        photoURL,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, {
        email,
        displayName,
        photoURL,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export function subscribeTasks(
  uid: string,
  onData: (tasks: MatrixTask[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const path = `users/${uid}/tasks`;
  const q = query(collection(db, 'users', uid, 'tasks'), where('ownerId', '==', uid));

  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs
        .map((d) => {
          const data = d.data();
          return {
            task: {
              id: String(data.id ?? d.id),
              title: String(data.title ?? ''),
              quadrant: (data.quadrant as MatrixTask['quadrant']) ?? 'Q2',
              isTopThree: Boolean(data.isTopThree),
              topRank: data.topRank ?? null,
              rationale: String(data.rationale ?? ''),
              dueAt: data.dueAt ?? null,
              dueLabel: data.dueLabel ?? null,
              estimatedMinutes: data.estimatedMinutes ?? null,
              completed: Boolean(data.completed),
            } satisfies MatrixTask,
            createdMs:
              data.createdAt instanceof Timestamp ? data.createdAt.toMillis() : 0,
          };
        })
        .sort((a, b) => a.createdMs - b.createdMs)
        .map((x) => x.task);

      onData(items);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onError(wrapped as Error);
      }
    }
  );
}

export function subscribeMessages(
  uid: string,
  onData: (messages: ChatMessage[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const path = `users/${uid}/messages`;
  const q = query(collection(db, 'users', uid, 'messages'), where('ownerId', '==', uid));

  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs
        .map((d) => {
          const data = d.data();
          return {
            msg: {
              id: String(data.id ?? d.id),
              role: (data.role === 'user' ? 'user' : 'coach') as ChatMessage['role'],
              content: String(data.content ?? ''),
              timestamp: String(data.timestamp ?? ''),
            } satisfies ChatMessage,
            createdMs:
              data.createdAt instanceof Timestamp ? data.createdAt.toMillis() : 0,
          };
        })
        .sort((a, b) => a.createdMs - b.createdMs)
        .map((x) => x.msg);

      onData(items);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onError(wrapped as Error);
      }
    }
  );
}

export function subscribeSettings(
  uid: string,
  onData: (payload: {
    settings: AlertSettings;
    snoozedUntil: Record<string, number>;
    actionPlan: ActionPlan | null;
  }) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const path = `users/${uid}/workspace/settings`;
  const ref = doc(db, 'users', uid, 'workspace', 'settings');

  return onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      const threshold = VALID_THRESHOLDS.has(Number(data.thresholdMinutes))
        ? Number(data.thresholdMinutes)
        : 60;
      onData({
        settings: {
          thresholdMinutes: threshold,
          soundEnabled: data.soundEnabled !== false,
          desktopEnabled: data.desktopEnabled !== false,
        },
        snoozedUntil: (data.snoozedUntil as Record<string, number>) ?? {},
        actionPlan: (data.actionPlan as ActionPlan | null) ?? null,
      });
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.GET, path);
      } catch (wrapped) {
        onError(wrapped as Error);
      }
    }
  );
}

export async function saveWorkspaceSettings(
  uid: string,
  settings: AlertSettings,
  snoozedUntil: Record<string, number>,
  actionPlan: ActionPlan | null
): Promise<void> {
  const path = `users/${uid}/workspace/settings`;
  const ref = doc(db, 'users', uid, 'workspace', 'settings');
  const threshold = VALID_THRESHOLDS.has(settings.thresholdMinutes)
    ? settings.thresholdMinutes
    : 60;

  // Enforce <= 100 entries in snoozedUntil map
  const snoozeEntries = Object.entries(snoozedUntil).slice(0, 100);
  const boundedSnoozes = Object.fromEntries(snoozeEntries);

  try {
    await setDoc(ref, {
      ownerId: uid,
      thresholdMinutes: threshold,
      soundEnabled: Boolean(settings.soundEnabled),
      desktopEnabled: Boolean(settings.desktopEnabled),
      snoozedUntil: boundedSnoozes,
      actionPlan: sanitizeActionPlan(actionPlan),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function replaceTasksBatch(
  uid: string,
  newTasks: MatrixTask[],
  existingTasks: MatrixTask[]
): Promise<void> {
  const path = `users/${uid}/tasks`;
  const batch = writeBatch(db);
  const nextIds = new Set(newTasks.map((t) => sanitizeId(t.id, 'task')));

  try {
    for (const oldTask of existingTasks) {
      const oldId = sanitizeId(oldTask.id, 'task');
      if (!nextIds.has(oldId)) {
        batch.delete(doc(db, 'users', uid, 'tasks', oldId));
      }
    }

    const existingMap = new Map(existingTasks.map((t) => [sanitizeId(t.id, 'task'), t]));

    for (const t of newTasks) {
      const taskId = sanitizeId(t.id, 'task');
      const ref = doc(db, 'users', uid, 'tasks', taskId);
      const alreadyExists = existingMap.has(taskId);

      const basePayload = {
        id: taskId,
        ownerId: uid,
        title: clampString(t.title || 'Untitled task', 160),
        quadrant: t.quadrant,
        isTopThree: Boolean(t.isTopThree && t.quadrant === 'Q1'),
        topRank:
          t.quadrant === 'Q1' && (t.topRank === 1 || t.topRank === 2 || t.topRank === 3)
            ? t.topRank
            : null,
        rationale: clampString(t.rationale || '', 500),
        dueAt: t.dueAt ? clampString(t.dueAt, 64) : null,
        dueLabel: t.dueLabel ? clampString(t.dueLabel, 80) : null,
        estimatedMinutes:
          typeof t.estimatedMinutes === 'number' && t.estimatedMinutes >= 1
            ? Math.min(1440, Math.round(t.estimatedMinutes))
            : null,
        completed: Boolean(t.completed),
        updatedAt: serverTimestamp(),
      };

      if (alreadyExists) {
        batch.update(ref, basePayload);
      } else {
        batch.set(ref, {
          ...basePayload,
          createdAt: serverTimestamp(),
        });
      }
    }

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function createSingleTask(uid: string, task: MatrixTask): Promise<void> {
  const taskId = sanitizeId(task.id, 'task');
  const path = `users/${uid}/tasks/${taskId}`;
  const ref = doc(db, 'users', uid, 'tasks', taskId);

  try {
    await setDoc(ref, {
      id: taskId,
      ownerId: uid,
      title: clampString(task.title || 'Untitled task', 160),
      quadrant: task.quadrant,
      isTopThree: Boolean(task.isTopThree && task.quadrant === 'Q1'),
      topRank: task.topRank ?? null,
      rationale: clampString(task.rationale || '', 500),
      dueAt: task.dueAt ? clampString(task.dueAt, 64) : null,
      dueLabel: task.dueLabel ? clampString(task.dueLabel, 80) : null,
      estimatedMinutes: task.estimatedMinutes ?? null,
      completed: Boolean(task.completed),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateTaskCompletion(
  uid: string,
  taskId: string,
  completed: boolean
): Promise<void> {
  const safeId = sanitizeId(taskId, 'task');
  const path = `users/${uid}/tasks/${safeId}`;
  try {
    await updateDoc(doc(db, 'users', uid, 'tasks', safeId), {
      completed,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function updateTaskQuadrant(
  uid: string,
  taskId: string,
  fields: {
    quadrant: MatrixTask['quadrant'];
    isTopThree: boolean;
    topRank: 1 | 2 | 3 | null;
    rationale: string;
  }
): Promise<void> {
  const safeId = sanitizeId(taskId, 'task');
  const path = `users/${uid}/tasks/${safeId}`;
  try {
    await updateDoc(doc(db, 'users', uid, 'tasks', safeId), {
      quadrant: fields.quadrant,
      isTopThree: fields.isTopThree,
      topRank: fields.topRank,
      rationale: clampString(fields.rationale, 500),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function updateTaskDeadlineDoc(
  uid: string,
  taskId: string,
  dueAt: string | null,
  dueLabel: string | null
): Promise<void> {
  const safeId = sanitizeId(taskId, 'task');
  const path = `users/${uid}/tasks/${safeId}`;
  try {
    await updateDoc(doc(db, 'users', uid, 'tasks', safeId), {
      dueAt: dueAt ? clampString(dueAt, 64) : null,
      dueLabel: dueLabel ? clampString(dueLabel, 80) : null,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteTaskDoc(uid: string, taskId: string): Promise<void> {
  const safeId = sanitizeId(taskId, 'task');
  const path = `users/${uid}/tasks/${safeId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'tasks', safeId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function createMessageDoc(uid: string, msg: ChatMessage): Promise<void> {
  const msgId = sanitizeId(msg.id, 'msg');
  const path = `users/${uid}/messages/${msgId}`;
  try {
    await setDoc(doc(db, 'users', uid, 'messages', msgId), {
      id: msgId,
      ownerId: uid,
      role: msg.role,
      content: clampString(msg.content, 8000),
      timestamp: clampString(msg.timestamp, 40),
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function resetUserWorkspaceDocs(
  uid: string,
  tasks: MatrixTask[],
  messages: ChatMessage[],
  settings: AlertSettings
): Promise<void> {
  const path = `users/${uid}`;
  const batch = writeBatch(db);
  try {
    for (const t of tasks) {
      batch.delete(doc(db, 'users', uid, 'tasks', sanitizeId(t.id, 'task')));
    }
    for (const m of messages) {
      batch.delete(doc(db, 'users', uid, 'messages', sanitizeId(m.id, 'msg')));
    }
    batch.set(doc(db, 'users', uid, 'workspace', 'settings'), {
      ownerId: uid,
      thresholdMinutes: VALID_THRESHOLDS.has(settings.thresholdMinutes)
        ? settings.thresholdMinutes
        : 60,
      soundEnabled: Boolean(settings.soundEnabled),
      desktopEnabled: Boolean(settings.desktopEnabled),
      snoozedUntil: {},
      actionPlan: null,
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}
