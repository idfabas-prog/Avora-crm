import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/LoginForm";
import { getCurrentProfile } from "@/lib/auth/profile";
import { APP_DISPLAY_NAME } from "@/lib/config/branding";

export default async function LoginPage() {
  const profile = await getCurrentProfile();

  if (profile) {
    redirect("/dashboard");
  }

  return (
    <main className="login-page">
      <section className="login-panel">
        <div>
          <p className="eyebrow">{APP_DISPLAY_NAME}</p>
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
