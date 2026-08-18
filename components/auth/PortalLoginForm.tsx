"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const demoPatients = ["isabella.m@example.com", "camila.s@example.com", "danielle.c@example.com"];

export function PortalLoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState(demoPatients[0]);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setPending(false);

    if (signInError) {
      setError(signInError.message);
      return;
    }

    router.replace("/portal");
    router.refresh();
  }

  return (
    <form className="portal-login-form" onSubmit={onSubmit}>
      <label><span>Email</span><input autoComplete="email" onChange={(event) => setEmail(event.target.value)} required type="email" value={email} /></label>
      <label><span>Password</span><input autoComplete="current-password" onChange={(event) => setPassword(event.target.value)} required type="password" value={password} /></label>
      {error ? <p className="form-error">{error}</p> : null}
      <button className="primary-button" disabled={pending} type="submit">{pending ? "Signing in..." : "Sign in"}</button>
      <div className="demo-account-list">
        <span>Fictional patient accounts</span>
        {demoPatients.map((demoEmail) => <button key={demoEmail} onClick={() => setEmail(demoEmail)} type="button">{demoEmail}</button>)}
      </div>
    </form>
  );
}
