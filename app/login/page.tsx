import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/LoginForm";
import { getCurrentProfile } from "@/lib/auth/profile";

export default async function LoginPage() {
  const profile = await getCurrentProfile();

  if (profile) {
    redirect("/dashboard");
  }

  return (
    <main className="login-page">
      <section className="login-panel">
        <div>
          <p className="eyebrow">Avora CRM</p>
          <h1>Sign in to your workspace</h1>
          <p>
            Use one of the fictional development accounts provisioned in
            Supabase Auth.
          </p>
        </div>
        <LoginForm />
      </section>
    </main>
  );
}
