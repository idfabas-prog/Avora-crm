"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const demoUsers = [
  "owner@avora-demo.com",
  "manager@avora-demo.com",
  "sales@avora-demo.com",
  "provider@avora-demo.com"
];

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState(demoUsers[0]);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    setPending(false);

    if (signInError) {
      setError(signInError.message);
      return;
    }

    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <form className="login-form" onSubmit={onSubmit}>
      <label>
        <span>Email</span>
        <input
          autoComplete="email"
          onChange={(event) => setEmail(event.target.value)}
          required
          type="email"
          value={email}
        />
      </label>
      <label>
        <span>Password</span>
        <input
          autoComplete="current-password"
          onChange={(event) => setPassword(event.target.value)}
          required
          type="password"
          value={password}
        />
      </label>
      {error ? <p className="form-error">{error}</p> : null}
      <button className="primary-button" disabled={pending} type="submit">
        {pending ? "Signing in..." : "Sign in"}
      </button>
      <div className="demo-account-list">
        <span>Demo accounts</span>
        {demoUsers.map((demoEmail) => (
          <button
            key={demoEmail}
            onClick={() => setEmail(demoEmail)}
            type="button"
          >
            {demoEmail}
          </button>
        ))}
      </div>
    </form>
  );
}
