"use client";

import { useRef, useState, useTransition } from "react";

export function ActionForm({
  action,
  children,
  submitLabel,
  successMessage,
  className = "record-form"
}: {
  action: (formData: FormData) => Promise<void>;
  children: React.ReactNode;
  submitLabel: string;
  successMessage: string;
  className?: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className={className}
      ref={formRef}
      onSubmit={(event) => {
        event.preventDefault();
        setMessage(null);
        setError(null);
        const formData = new FormData(event.currentTarget);

        startTransition(async () => {
          try {
            await action(formData);
            setMessage(successMessage);
            formRef.current?.reset();
          } catch (caught) {
            setError(caught instanceof Error ? caught.message : "Something went wrong");
          }
        });
      }}
    >
      {children}
      {error ? <p className="form-error">{error}</p> : null}
      {message ? <p className="form-success">{message}</p> : null}
      <button className="primary-button" disabled={pending} type="submit">
        {pending ? "Saving..." : submitLabel}
      </button>
    </form>
  );
}
