"use client";

import { useState, useTransition } from "react";
import {
  askAvoraAction,
  recalculateLeadScoreAction,
  refreshAiInsightsAction,
  submitAiFeedback,
  summarizeContactAction,
  summarizeConversationAction,
  suggestReplyAction
} from "@/app/ai-actions";
import {
  aiModeLabel,
  contextualFollowUps,
  describeLocationScope,
  humanFeatureLabel,
  metricLabelsFromAnswer,
  sourceRows,
  zeroDataContext
} from "@/lib/ai/display";
import type { AiAnswer, AiMode, LeadScoreFactor } from "@/lib/ai/types";
import { ActionForm } from "@/components/crm/ActionForm";

const promptGroups = [
  {
    category: "Revenue",
    prompts: [
      "How much did we collect today?",
      "Compare this month to last month.",
      "What are our outstanding balances?"
    ]
  },
  {
    category: "Sales",
    prompts: [
      "Which salesperson has the highest close rate?",
      "Which leads should we follow up with today?",
      "Which salesperson needs follow-up help?"
    ]
  },
  {
    category: "Operations",
    prompts: [
      "Which location is performing best?",
      "Which appointments are most likely to no-show?",
      "Why did revenue change this week?"
    ]
  }
];

type SessionItem = {
  id: string;
  question: string;
  answer: AiAnswer;
  createdAt: string;
};

type AiSummaryRow = {
  summary_type: string;
  content_json: unknown;
  generated_at: string | null;
};

type LeadScoreRow = {
  id: string;
  score: number;
  label: string;
  factors_json: unknown;
  calculated_at: string | null;
};

export function AiModeBadge({ mode, mock }: { mode: AiMode; mock?: boolean }) {
  return <span className="ai-mode-badge">{mock || mode === "development" ? "Development AI" : aiModeLabel(mode)}</span>;
}

export function AskAvoraForm({ mode }: { mode: AiMode }) {
  const [question, setQuestion] = useState("");
  const [session, setSession] = useState<SessionItem[]>([]);
  const [error, setError] = useState<{ message: string; question: string } | null>(null);
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function askQuestion(nextQuestion = question) {
    const trimmed = nextQuestion.trim();
    if (!trimmed || pending) return;
    setError(null);
    setPendingQuestion(trimmed);
    const formData = new FormData();
    formData.set("question", trimmed);
    startTransition(async () => {
      try {
        const answer = await askAvoraAction(formData);
        setSession((items) => [
          ...items,
          { id: crypto.randomUUID(), question: trimmed, answer, createdAt: new Date().toISOString() }
        ]);
        setQuestion("");
      } catch {
        setError({ message: "Ask Avora couldn't complete this analysis.", question: trimmed });
      } finally {
        setPendingQuestion(null);
      }
    });
  }

  return (
    <section className="ask-avora-shell" aria-busy={pending}>
      <div className="ask-composer panel">
        <div className="ask-composer-header">
          <div>
            <h2>What should Avora analyze?</h2>
            <p>Ask about revenue, leads, appointments, sales, follow-up, or performance.</p>
          </div>
          <AiModeBadge mode={mode} />
        </div>
        <form
          className="ask-input-wrap"
          onSubmit={(event) => {
            event.preventDefault();
            askQuestion();
          }}
        >
          <textarea
            aria-label="Ask Avora question"
            name="question"
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                askQuestion();
              }
            }}
            placeholder="Ask Avora about revenue, leads, appointments, sales, or follow-up..."
            rows={4}
            value={question}
          />
          <div className="ask-composer-actions">
            <span>Enter to ask. Shift+Enter for a new line.</span>
            <button className="primary-button" disabled={pending || !question.trim()} type="submit">
              {pending ? "Reviewing..." : "Ask Avora"}
            </button>
          </div>
        </form>
      </div>

      <AiPromptChips onAsk={(item) => {
        setQuestion(item);
        askQuestion(item);
      }} />

      {pending ? <AiLoadingState question={pendingQuestion} /> : null}
      {error ? <AiErrorState error={error.message} onEdit={() => setQuestion(error.question)} onRetry={() => askQuestion(error.question)} /> : null}

      {session.length ? (
        <section className="ai-session-thread" aria-label="Ask Avora session">
          <div className="ai-session-toolbar">
            <strong>Current Analysis</strong>
            <button className="secondary-button" onClick={() => setSession([])} type="button">Clear Conversation</button>
          </div>
          {session.map((item) => (
            <article className="ai-session-item" key={item.id}>
              <div className="ai-question-bubble">
                <span>You asked</span>
                <p>{item.question}</p>
              </div>
              <AiAnswerCard answer={item.answer} askedAt={item.createdAt} onFollowUp={askQuestion} />
            </article>
          ))}
        </section>
      ) : (
        <section className="ai-empty-state">
          <strong>Ready when you are.</strong>
          <p>Try a suggested question or ask Avora what changed in the business today.</p>
        </section>
      )}
    </section>
  );
}

export function AiPromptChips({ onAsk }: { onAsk: (question: string) => void }) {
  return (
    <section className="ai-prompt-groups" aria-label="Suggested questions">
      {promptGroups.map((group) => (
        <div className="ai-prompt-group" key={group.category}>
          <h3>{group.category}</h3>
          <div className="ai-prompt-chip-row">
            {group.prompts.map((item) => (
              <button className="ai-prompt-chip" key={item} onClick={() => onAsk(item)} type="button">
                {item}
              </button>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

export function AiAnswerCard({ answer, askedAt, onFollowUp }: { answer: AiAnswer; askedAt?: string; onFollowUp?: (question: string) => void }) {
  const allText = [...answer.observedFacts, ...answer.analysis, ...answer.recommendations].join(" ");
  const metrics = metricLabelsFromAnswer(allText);
  const zeroData = zeroDataContext(answer.observedFacts);

  return (
    <section className="ai-answer-card">
      <div className="ai-answer-header">
        <div>
          <span>Avora Insight</span>
          <h2>{humanFeatureLabel(answer.feature)}</h2>
          <p>{formatDateTime(askedAt)} · {describeLocationScope(answer.basedOn)}{answer.basedOn.dateRange ? ` · ${answer.basedOn.dateRange.label}` : ""}</p>
        </div>
        <AiModeBadge mode={answer.mode} mock={answer.mock} />
      </div>
      {metrics.length ? (
        <div className="ai-metric-strip">
          {metrics.slice(0, 4).map((metric) => <span key={metric}>{metric}</span>)}
        </div>
      ) : null}
      {zeroData ? <p className="ai-context-note">{zeroData}</p> : null}
      <AiFactSection title="Observed CRM Facts" tone="fact" items={answer.observedFacts} />
      <AiFactSection title="Analysis" tone="analysis" items={answer.analysis} />
      <AiFactSection title="Recommendation" tone="recommendation" items={answer.recommendations} />
      <AiSourcePanel answer={answer} metrics={metrics} />
      <div className="ai-action-row">
        {answer.recordLinks.map((link) => <a className="secondary-button" href={link.href} key={link.href}>{link.label}</a>)}
      </div>
      {onFollowUp ? <AiFollowUpQuestions feature={answer.feature} onAsk={onFollowUp} /> : null}
      {answer.requestId ? <AiFeedbackForm requestId={answer.requestId} /> : null}
    </section>
  );
}

function AiFactSection({ title, items, tone }: { title: string; items: string[]; tone: "fact" | "analysis" | "recommendation" }) {
  return (
    <section className={`ai-answer-section ${tone}`}>
      <h3>{title}</h3>
      <ul>{items.map((item) => <li key={item}><EmphasizedText text={item} /></li>)}</ul>
    </section>
  );
}

function AiSourcePanel({ answer, metrics }: { answer: AiAnswer; metrics: string[] }) {
  return (
    <details className="ai-source-panel">
      <summary>Based On</summary>
      <dl>
        <div><dt>Date Range</dt><dd>{answer.basedOn.dateRange ? `${formatDate(answer.basedOn.dateRange.start)} - ${formatDate(answer.basedOn.dateRange.end)}` : "Current CRM context"}</dd></div>
        <div><dt>Locations</dt><dd>{describeLocationScope(answer.basedOn)}</dd></div>
        <div><dt>Records Used</dt><dd>{sourceRows(answer.basedOn).join(", ") || "Structured CRM metrics"}</dd></div>
        <div><dt>Metrics</dt><dd>{metrics.join(", ") || "Operational CRM metrics"}</dd></div>
      </dl>
    </details>
  );
}

function AiFollowUpQuestions({ feature, onAsk }: { feature: string; onAsk: (question: string) => void }) {
  return (
    <div className="ai-follow-ups" aria-label="Follow-up questions">
      {contextualFollowUps(feature).map((item) => (
        <button key={item} onClick={() => onAsk(item)} type="button">{item}</button>
      ))}
    </div>
  );
}

function AiLoadingState({ question }: { question: string | null }) {
  return (
    <section aria-live="polite" className="ai-loading-card">
      <span />
      <div>
        <strong>Reviewing Avora data...</strong>
        <p>{question ? `Analyzing: ${question}` : "Comparing performance and CRM metrics."}</p>
      </div>
    </section>
  );
}

function AiErrorState({ error, onRetry, onEdit }: { error: string; onRetry: () => void; onEdit: () => void }) {
  return (
    <section aria-live="polite" className="ai-error-card">
      <strong>{error}</strong>
      <p>The CRM is still available. You can retry or edit the question.</p>
      <div className="quick-actions">
        <button onClick={onRetry} type="button">Try Again</button>
        <button onClick={onEdit} type="button">Edit Question</button>
      </div>
    </section>
  );
}

export function AiFeedbackForm({ requestId }: { requestId: string }) {
  return (
    <div className="ai-feedback-row">
      <span>Was this helpful?</span>
      {(["helpful", "not_helpful"] as const).map((rating) => (
        <form action={submitAiFeedback} key={rating}>
          <input name="ai_request_id" type="hidden" value={requestId} />
          <input name="rating" type="hidden" value={rating} />
          <button type="submit">{rating === "helpful" ? "Helpful" : "Not Helpful"}</button>
        </form>
      ))}
    </div>
  );
}

export function ConversationAiActions({ conversationId, summaries = [] }: { conversationId: string; summaries?: AiSummaryRow[] }) {
  return (
    <section className="ai-inline-card">
      <div className="ai-inline-header">
        <div>
          <h2>Conversation Intelligence</h2>
          <p>Summaries and replies are generated for review only. Nothing is sent automatically.</p>
        </div>
      </div>
      <div className="ai-reply-controls">
        <ActionForm action={summarizeConversationAction} className="record-form compact-action-form" submitLabel="Summarize Conversation" successMessage="Conversation summary refreshed">
          <input name="conversation_id" type="hidden" value={conversationId} />
        </ActionForm>
        <ActionForm action={suggestReplyAction} className="record-form compact-action-form" submitLabel="Suggest Reply" successMessage="Suggested reply generated">
          <input name="conversation_id" type="hidden" value={conversationId} />
          <label><span>Style</span><select name="style"><option value="concise">Concise</option><option value="warm">Warm</option><option value="sales">Sales-focused</option><option value="informational">Informational</option><option value="follow_up">Follow-up</option><option value="rebooking">Rebooking</option></select></label>
        </ActionForm>
      </div>
      <AiSummaryList summaries={summaries} context="conversation" />
    </section>
  );
}

export function AiSummaryList({ summaries, context }: { summaries: AiSummaryRow[]; context: "conversation" | "contact" }) {
  if (!summaries.length) {
    return (
      <div className="ai-summary-empty">
        <strong>{context === "conversation" ? "No conversation summary yet" : "No AI summary yet"}</strong>
        <p>{context === "conversation" ? "Generate a concise review before replying." : "Refresh the summary or recalculate the lead score after new activity."}</p>
      </div>
    );
  }

  return (
    <div className="ai-summary-grid">
      {summaries.map((summary) => {
        const content = asRecord(summary.content_json);
        const reply = getString(content, "reply");
        return (
          <article className="ai-summary-card" key={summary.summary_type}>
            <div className="ai-summary-card-header">
              <strong>{humanFeatureLabel(summary.summary_type)}</strong>
              <span>{formatDateTime(summary.generated_at)}</span>
            </div>
            {reply ? <SuggestedReplyPreview reply={reply} /> : <SummaryFields content={content} />}
          </article>
        );
      })}
    </div>
  );
}

export function ContactAiActions({ contactId }: { contactId: string }) {
  return (
    <div className="quick-actions">
      <form action={summarizeContactAction}>
        <input name="contact_id" type="hidden" value={contactId} />
        <button className="secondary-button" type="submit">Refresh Summary</button>
      </form>
      <form action={recalculateLeadScoreAction}>
        <input name="contact_id" type="hidden" value={contactId} />
        <button className="secondary-button" type="submit">Recalculate Score</button>
      </form>
    </div>
  );
}

export function LeadScoreCards({ scores }: { scores: LeadScoreRow[] }) {
  if (!scores.length) {
    return null;
  }

  return (
    <div className="lead-score-grid">
      {scores.map((score) => {
        const factors = parseFactors(score.factors_json);
        return (
          <article className="lead-score-card" key={score.id}>
            <div>
              <strong>{score.score} / 100</strong>
              <span>{labelLeadScore(score.label)}</span>
            </div>
            <p>Lead scores are prioritization guidance, not certainty.</p>
            <details>
              <summary>Why this score?</summary>
              <ul>{factors.map((factor) => <li key={`${factor.label}-${factor.points}`}>{factor.label} <span>{factor.points > 0 ? "+" : ""}{factor.points}</span></li>)}</ul>
            </details>
            <small>Calculated {formatDateTime(score.calculated_at)}</small>
          </article>
        );
      })}
    </div>
  );
}

export function RefreshInsightsButton() {
  return (
    <form action={refreshAiInsightsAction}>
      <button className="secondary-button" type="submit">Refresh Insights</button>
    </form>
  );
}

function SuggestedReplyPreview({ reply }: { reply: string }) {
  return (
    <div className="suggested-reply-preview">
      <span>Suggested SMS</span>
      <p>{reply}</p>
      <div className="quick-actions">
        <button onClick={() => window.dispatchEvent(new CustomEvent("avora:use-suggested-reply", { detail: { reply } }))} type="button">Use Reply</button>
        <span>Review and edit before sending.</span>
      </div>
    </div>
  );
}

function SummaryFields({ content }: { content: Record<string, unknown> }) {
  const fields = [
    ["Current Situation", getString(content, "current_status") || getString(content, "leadIntent")],
    ["Recent Activity", getString(content, "communication_history") || getString(content, "lastCommitment")],
    ["Sales / Opportunity Context", getString(content, "sales_payment_history") || getString(content, "opportunity_history") || getString(content, "servicesDiscussed")],
    ["Recommended Next Action", getString(content, "likely_next_action") || getString(content, "nextAction")],
    ["Questions / Concerns", getString(content, "primaryConcerns")],
    ["Objections", getString(content, "pricingObjections")],
    ["Unresolved Issues", getString(content, "unresolvedIssues")]
  ].filter(([, value]) => value);

  return (
    <dl className="ai-summary-fields">
      {fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
    </dl>
  );
}

function EmphasizedText({ text }: { text: string }) {
  const parts = text.split(/(\$[\d,]+(?:\.\d{2})?|\b\d+(?:\.\d+)?%|\b\d+\b)/g);
  return <>{parts.map((part, index) => /^(?:\$[\d,]+(?:\.\d{2})?|\d+(?:\.\d+)?%|\d+)$/.test(part) ? <strong className="metric-value" key={`${part}-${index}`}>{part}</strong> : part)}</>;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function getString(record: Record<string, unknown>, key: string) {
  const value = record[key];
  if (Array.isArray(value)) return value.map(String).join(", ");
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

function parseFactors(value: unknown): LeadScoreFactor[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => asRecord(item))
    .filter((item) => typeof item.label === "string" && typeof item.points === "number")
    .map((item) => ({ label: String(item.label), points: Number(item.points) }));
}

function labelLeadScore(label: string) {
  if (label === "hot") return "Hot";
  if (label === "warm") return "Warm";
  if (label === "nurture") return "Nurture";
  return "Low Priority";
}

function formatDateTime(value?: string | null) {
  if (!value) return "Just now";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}
