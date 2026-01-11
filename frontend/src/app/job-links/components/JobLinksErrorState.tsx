'use client';

type JobLinksErrorStateProps = {
  message: string;
};

export default function JobLinksErrorState({ message }: JobLinksErrorStateProps) {
  return (
    <section className="rounded-3xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700 shadow-[0_18px_60px_-50px_rgba(225,29,72,0.2)]">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-full bg-rose-100 text-rose-600">
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 9v4" />
            <path d="M12 17h.01" />
            <path d="M10.29 3.86l-7.4 12.82A1 1 0 0 0 3.74 18h16.52a1 1 0 0 0 .85-1.32l-7.4-12.82a1 1 0 0 0-1.72 0z" />
          </svg>
        </span>
        <div>
          <div className="text-xs uppercase tracking-[0.18em] text-rose-500">
            Error
          </div>
          <div className="mt-1 font-semibold text-rose-800">{message}</div>
          <div className="mt-1 text-xs text-rose-600">
            Please refresh or adjust filters and try again.
          </div>
        </div>
      </div>
    </section>
  );
}
