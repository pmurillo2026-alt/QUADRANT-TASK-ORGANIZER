import React from 'react';
import { ArrowRight } from 'lucide-react';

interface GmailLoginScreenProps {
  isSigningIn: boolean;
  authError: string | null;
  onSignInWithGmail: () => Promise<void>;
  onContinueLocal: () => void;
}

export const GmailLoginScreen: React.FC<GmailLoginScreenProps> = ({
  isSigningIn,
  authError,
  onSignInWithGmail,
  onContinueLocal,
}) => {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-8 px-4 py-3.5 sm:px-6">
          <span className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0">
            Quadrant
          </span>
          <span className="text-xs text-slate-500 whitespace-nowrap shrink-0">
            Eisenhower Matrix & Deadline Coach
          </span>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-7 sm:p-8">
          <div className="space-y-2">
            <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">
              Sign in with your Gmail account
            </h1>
            <p className="text-sm leading-relaxed text-slate-600">
              Sync your Eisenhower Matrix, Top 3 priorities, coach sessions, and approaching-deadline alerts privately across devices via Firebase.
            </p>
          </div>

          {authError && (
            <div
              role="alert"
              className="mt-5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs leading-relaxed text-red-800"
            >
              {authError}
            </div>
          )}

          <div className="mt-6 space-y-3">
            <button
              type="button"
              disabled={isSigningIn}
              onClick={onSignInWithGmail}
              className="flex min-h-[44px] w-full items-center justify-center gap-3 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
            >
              <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="#EA4335"
                  d="M12 10.2v3.9h5.4c-.2 1.3-1.5 3.9-5.4 3.9-3.3 0-6-2.7-6-6s2.7-6 6-6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.7 3.4 14.6 2.5 12 2.5 6.8 2.5 2.5 6.8 2.5 12s4.3 9.5 9.5 9.5c5.5 0 9.1-3.9 9.1-9.3 0-.6-.1-1.1-.2-1.6H12z"
                />
              </svg>
              <span>{isSigningIn ? 'Connecting to Google...' : 'Log in with Gmail'}</span>
            </button>

            <button
              type="button"
              onClick={onContinueLocal}
              className="flex min-h-[40px] w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
            >
              <span>Continue without signing in (local session only)</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="mt-6 border-t border-slate-100 pt-4 text-xs leading-relaxed text-slate-500">
            Authentication uses Google Sign-In via Firebase. Your matrix tasks and deadlines are stored privately under your account and never shared.
          </div>
        </div>
      </main>
    </div>
  );
};
