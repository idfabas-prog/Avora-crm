import { AiModeBadge, AskAvoraForm } from "@/components/crm/AiForms";
import { PageHeader } from "@/components/ui/PageHeader";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { assertAiPermission } from "@/lib/ai/permissions";
import { getAiConfig } from "@/lib/ai/config";

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
        title="Ask Avora"
      />
      {config.mode === "disabled" ? <p className="form-error">AI is disabled. Enable AI_MODE in server configuration to use Ask Avora.</p> : null}
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
