import React from 'react';
import { signOut } from 'firebase/auth';
import { auth, FIRESTORE_DATABASE_ID, FIRESTORE_PROJECT_ID } from '../firebase';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
  isQuotaError: boolean;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = {
      hasError: false,
      message: '',
      isQuotaError: false,
    };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    const raw = error?.message || 'An unexpected error occurred.';
    let displayMessage = raw;
    let isQuotaError = false;

    try {
      const parsed = JSON.parse(raw);
      if (parsed?.error) {
        displayMessage = String(parsed.error);
      }
    } catch {
      // Not a JSON FirestoreErrorInfo payload
    }

    if (displayMessage.includes('Quota exceeded')) {
      isQuotaError = true;
    }

    return {
      hasError: true,
      message: displayMessage,
      isQuotaError,
    };
  }

  componentDidCatch(error: Error) {
    console.error('Application ErrorBoundary caught error:', error);
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const quotaUpgradeUrl = `https://console.firebase.google.com/project/${FIRESTORE_PROJECT_ID}/firestore/databases/${FIRESTORE_DATABASE_ID}/data?openUpgradeDialog=true`;

    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 space-y-4">
          <div className="space-y-1.5">
            <h1 className="font-display text-lg font-semibold text-slate-900">
              {this.state.isQuotaError ? 'Firestore Daily Quota Reached' : 'Workspace Sync Interrupted'}
            </h1>
            <p className="text-sm leading-relaxed text-slate-600">{this.state.message}</p>
            {this.state.isQuotaError && (
              <p className="text-xs leading-relaxed text-slate-500">
                Free-tier daily quota resets tomorrow. You can also manage quota settings in{' '}
                <a
                  href={quotaUpgradeUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-slate-900 underline"
                >
                  Firebase Console
                </a>
                .
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2.5 pt-2">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800"
            >
              Reload Workspace
            </button>
            <button
              type="button"
              onClick={async () => {
                try {
                  await signOut(auth);
                } finally {
                  window.location.reload();
                }
              }}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Log Out & Reset
            </button>
          </div>
        </div>
      </div>
    );
  }
}
