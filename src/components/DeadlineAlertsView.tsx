import React from 'react';
import { Bell, BellRing, Check, Clock, Play, Volume2, VolumeX } from 'lucide-react';
import { AlertSettings, DeadlineAlert, MatrixTask } from '../types';
import { formatCountdown, formatShortDueLabel, QUADRANT_META } from '../utils/deadlines';

interface DeadlineAlertsViewProps {
  tasks: MatrixTask[];
  alerts: DeadlineAlert[];
  settings: AlertSettings;
  snoozedUntil: Record<string, number>;
  nowMs: number;
  notificationPermission: NotificationPermission | 'unsupported';
  onUpdateSettings: (next: Partial<AlertSettings>) => void;
  onRequestDesktopPermission: () => Promise<void>;
  onSnoozeAlert: (taskId: string, minutes: number) => void;
  onDismissAlert: (taskId: string) => void;
  onClearSnooze: (taskId: string) => void;
  onCompleteTask: (taskId: string) => void;
  onStartFocus: (taskId: string) => void;
  onAssignQuickDeadline: (taskId: string, offsetMinutes: number) => void;
  onSendTestAlert: () => void;
}

const THRESHOLD_OPTIONS = [
  { label: '30m', minutes: 30 },
  { label: '1h', minutes: 60 },
  { label: '2h', minutes: 120 },
  { label: '4h', minutes: 240 },
  { label: '24h', minutes: 1440 },
];

export const DeadlineAlertsView: React.FC<DeadlineAlertsViewProps> = ({
  tasks,
  alerts,
  settings,
  snoozedUntil,
  nowMs,
  notificationPermission,
  onUpdateSettings,
  onRequestDesktopPermission,
  onSnoozeAlert,
  onDismissAlert,
  onClearSnooze,
  onCompleteTask,
  onStartFocus,
  onAssignQuickDeadline,
  onSendTestAlert,
}) => {
  const snoozedTasks = tasks.filter(
    (t) => !t.completed && t.dueAt && snoozedUntil[t.id] && snoozedUntil[t.id] > nowMs
  );
  const upcomingOutsideWindow = tasks
    .filter((t) => {
      if (t.completed || !t.dueAt) return false;
      const dueMs = Date.parse(t.dueAt);
      if (Number.isNaN(dueMs)) return false;
      return dueMs - nowMs > settings.thresholdMinutes * 60_000;
    })
    .sort((a, b) => Date.parse(a.dueAt!) - Date.parse(b.dueAt!));

  const tasksWithoutDeadline = tasks.filter((t) => !t.completed && !t.dueAt);

  return (
    <div className="space-y-6">
      {/* Notification Controls Bar */}
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900">
              Approaching Deadline Alert Rules
            </h2>
            <p className="text-xs text-slate-500">
              Self-contained browser watchdog checks task deadlines every 10 seconds
            </p>
          </div>

          <button
            type="button"
            onClick={onSendTestAlert}
            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-medium text-slate-800 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0"
          >
            <BellRing className="h-3.5 w-3.5" />
            Test Deadline Alert
          </button>
        </div>

        <div className="mt-5 grid gap-5 border-t border-slate-100 pt-4 md:grid-cols-3">
          {/* Threshold Segmented Control */}
          <div className="space-y-2">
            <span className="block text-xs font-medium text-slate-700">
              Alert Lead Window
            </span>
            <div className="inline-flex items-center gap-1 rounded-lg bg-slate-100 p-1">
              {THRESHOLD_OPTIONS.map((opt) => (
                <button
                  key={opt.minutes}
                  type="button"
                  onClick={() => onUpdateSettings({ thresholdMinutes: opt.minutes })}
                  className={`rounded-md px-2.5 py-1 font-mono text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    settings.thresholdMinutes === opt.minutes
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Sound Toggle */}
          <div className="space-y-2">
            <span className="block text-xs font-medium text-slate-700">
              Audio Chime
            </span>
            <button
              type="button"
              onClick={() => onUpdateSettings({ soundEnabled: !settings.soundEnabled })}
              className="inline-flex min-h-[36px] items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50"
            >
              {settings.soundEnabled ? (
                <Volume2 className="h-3.5 w-3.5 text-emerald-700" />
              ) : (
                <VolumeX className="h-3.5 w-3.5 text-slate-400" />
              )}
              <span>{settings.soundEnabled ? 'Chime Enabled' : 'Chime Muted'}</span>
            </button>
          </div>

          {/* Desktop Notification Permission */}
          <div className="space-y-2">
            <span className="block text-xs font-medium text-slate-700">
              Browser Desktop Notifications
            </span>
            {notificationPermission === 'unsupported' ? (
              <p className="text-xs text-slate-500">
                Desktop notifications unavailable in this browser; in-app alerts remain active.
              </p>
            ) : notificationPermission === 'granted' ? (
              <button
                type="button"
                onClick={() => onUpdateSettings({ desktopEnabled: !settings.desktopEnabled })}
                className="inline-flex min-h-[36px] items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50"
              >
                <Bell className="h-3.5 w-3.5 text-emerald-700" />
                <span>
                  {settings.desktopEnabled ? 'Desktop Alerts Active' : 'Desktop Alerts Paused'}
                </span>
              </button>
            ) : notificationPermission === 'denied' ? (
              <p className="text-xs text-amber-700">
                Browser notifications blocked. In-app banners and audio chimes are active.
              </p>
            ) : (
              <button
                type="button"
                onClick={onRequestDesktopPermission}
                className="inline-flex min-h-[36px] items-center gap-2 rounded-lg bg-slate-900 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
              >
                <Bell className="h-3.5 w-3.5" />
                Enable Browser Alerts
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Active Alerts List */}
      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
          <h3 className="font-display text-sm font-semibold text-slate-900">
            Active Deadline Alerts ({alerts.length})
          </h3>
          <span className="text-xs text-slate-500">
            Within {settings.thresholdMinutes >= 60 ? `${settings.thresholdMinutes / 60}h` : `${settings.thresholdMinutes}m`} window or overdue
          </span>
        </div>

        {alerts.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-slate-500">
            No deadlines currently overdue or within your {settings.thresholdMinutes >= 60 ? `${settings.thresholdMinutes / 60}-hour` : `${settings.thresholdMinutes}-minute`} alert window.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {alerts.map((alert) => {
              const qMeta = QUADRANT_META[alert.quadrant];
              const isUrgent = alert.severity === 'overdue' || alert.severity === 'critical';
              return (
                <div
                  key={alert.taskId}
                  className="flex flex-wrap items-center justify-between gap-4 px-5 py-4"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span
                        className={`font-semibold ${
                          isUrgent ? 'text-red-700' : 'text-amber-700'
                        }`}
                      >
                        {alert.severity === 'overdue'
                          ? 'Overdue'
                          : alert.severity === 'critical'
                          ? 'Critical (<30m)'
                          : 'Approaching'}
                      </span>
                      <span aria-hidden="true" className="text-slate-300">
                        ·
                      </span>
                      <span className={`font-medium ${qMeta.accentText}`}>
                        {qMeta.code} {qMeta.name}
                      </span>
                      <span aria-hidden="true" className="text-slate-300">
                        ·
                      </span>
                      <span className="font-mono tabular-nums text-slate-700">
                        {formatCountdown(alert.msRemaining)} ({formatShortDueLabel(alert.dueAt)})
                      </span>
                    </div>
                    <p className="text-sm font-medium text-slate-900">{alert.taskTitle}</p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => onStartFocus(alert.taskId)}
                      className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 whitespace-nowrap"
                    >
                      <Play className="h-3 w-3" />
                      Start Focus
                    </button>
                    <button
                      type="button"
                      onClick={() => onSnoozeAlert(alert.taskId, 15)}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                    >
                      <Clock className="h-3 w-3" />
                      Snooze 15m
                    </button>
                    <button
                      type="button"
                      onClick={() => onCompleteTask(alert.taskId)}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50 whitespace-nowrap"
                    >
                      <Check className="h-3 w-3" />
                      Done
                    </button>
                    <button
                      type="button"
                      onClick={() => onDismissAlert(alert.taskId)}
                      className="rounded-lg px-2 py-1.5 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-800 whitespace-nowrap"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Two-column lower section: Scheduled Upcoming + Quick Deadline Assigner */}
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-5 py-3.5">
            <h3 className="font-display text-sm font-semibold text-slate-900">
              Scheduled Later & Snoozed ({upcomingOutsideWindow.length + snoozedTasks.length})
            </h3>
          </div>
          <div className="divide-y divide-slate-100">
            {snoozedTasks.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-800">{t.title}</p>
                  <p className="font-mono text-xs tabular-nums text-amber-700">
                    Snoozed · Due {t.dueLabel || formatShortDueLabel(t.dueAt!)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onClearSnooze(t.id)}
                  className="rounded border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
                >
                  Unsnooze
                </button>
              </div>
            ))}
            {upcomingOutsideWindow.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-800">{t.title}</p>
                  <p className="font-mono text-xs tabular-nums text-slate-500">
                    {formatCountdown(Date.parse(t.dueAt!) - nowMs)} · {t.dueLabel || formatShortDueLabel(t.dueAt!)}
                  </p>
                </div>
                <span className="font-mono text-xs text-slate-500 shrink-0">{t.quadrant}</span>
              </div>
            ))}
            {snoozedTasks.length + upcomingOutsideWindow.length === 0 && (
              <div className="px-5 py-6 text-center text-xs text-slate-400">
                No upcoming tasks outside the active alert window.
              </div>
            )}
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-5 py-3.5">
            <h3 className="font-display text-sm font-semibold text-slate-900">
              Tasks Without Deadlines ({tasksWithoutDeadline.length})
            </h3>
            <p className="text-xs text-slate-500">
              Attach a quick deadline to enable approaching-deadline alerts
            </p>
          </div>
          <div className="divide-y divide-slate-100">
            {tasksWithoutDeadline.length === 0 ? (
              <div className="px-5 py-6 text-center text-xs text-slate-400">
                All active tasks already have deadlines or are completed.
              </div>
            ) : (
              tasksWithoutDeadline.slice(0, 6).map((task) => (
                <div
                  key={task.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-5 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800">{task.title}</p>
                    <p className="text-xs text-slate-500">
                      {task.quadrant} · {QUADRANT_META[task.quadrant].name}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => onAssignQuickDeadline(task.id, 25)}
                      className="rounded border border-slate-200 px-2 py-1 font-mono text-[11px] text-slate-700 hover:bg-slate-50"
                    >
                      +25m
                    </button>
                    <button
                      type="button"
                      onClick={() => onAssignQuickDeadline(task.id, 60)}
                      className="rounded border border-slate-200 px-2 py-1 font-mono text-[11px] text-slate-700 hover:bg-slate-50"
                    >
                      +1h
                    </button>
                    <button
                      type="button"
                      onClick={() => onAssignQuickDeadline(task.id, 240)}
                      className="rounded border border-slate-200 px-2 py-1 font-mono text-[11px] text-slate-700 hover:bg-slate-50"
                    >
                      +4h
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
};
