"use client";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <h1>This page couldn&apos;t load</h1>
        <p>A safe error report was generated. Try again, or check System Health if the issue continues.</p>
        {error.digest ? <p>Reference: {error.digest}</p> : null}
        <button className="primary-button" onClick={reset} type="button">Try again</button>
      </section>
    </main>
  );
}
