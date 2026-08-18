import { AiModeBadge, AskAvoraForm } from "@/components/crm/AiForms";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { assertAiPermission } from "@/lib/ai/permissions";
import { getAiConfig } from "@/lib/ai/config";
import { AI_ASSISTANT_DISPLAY_NAME } from "@/lib/config/branding";

export default async function AiPage() {
  const profile = await requireCurrentProfile();
  assertAiPermission(profile, "ai.use");
  const supabase = await createClient();
  const config = getAiConfig();
  const { data: savedQuestions } = await supabase
    .from("ai_saved_questions")
    .select("id, title, question, category")
    .eq("organization_id", profile.organizationId)
    .order("created_at", { ascending: false })
    .limit(12);

  return (
    <div className="page-stack">
      <PageHeader
        action={<AiModeBadge mode={config.mode} />}
        description="Ask questions about revenue, leads, appointments, sales, follow-up, and performance."
        title={AI_ASSISTANT_DISPLAY_NAME}
      />
      <section className="settings-nav" aria-label="AI views">
        <Link href="/ai/operating-system">AI Operating System</Link>
        <Link href="/executive/brief">Executive Brief</Link>
        <Link href="/ai/insights">Insights</Link>
        <Link href="/ai/risk/no-shows">No-Show Risk</Link>
        <Link href="/ai/risk/churn">Churn Risk</Link>
        <Link href="/ai/collections">Collections</Link>
      </section>
      {config.mode === "disabled" ? <p className="form-error">AI is disabled. Enable AI_MODE in server configuration to use {AI_ASSISTANT_DISPLAY_NAME}.</p> : null}
      <AskAvoraForm mode={config.mode} />
      <section className="panel">
        <div className="panel-header"><h2>Saved Questions</h2><span>Owner/admin shared prompts</span></div>
        <div className="ai-saved-question-grid">
          {(savedQuestions ?? []).map((question) => <article key={question.id}><strong>{question.title}</strong><p>{question.question}</p><span>{question.category}</span></article>)}
          {!(savedQuestions ?? []).length ? <p className="quiet-text">No saved questions yet.</p> : null}
        </div>
      </section>
    </div>
  );
}
