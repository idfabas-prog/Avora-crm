import { renderSmsTemplate } from "../communications/templates.ts";

type Message = { direction?: string | null; body?: string | null; created_at?: string | null; is_internal_note?: boolean | null };

export function buildConversationSummary(messages: Message[]) {
  const inbound = messages.filter((message) => message.direction === "inbound");
  const outbound = messages.filter((message) => message.direction === "outbound" && !message.is_internal_note);
  const latest = messages.at(-1);
  return {
    leadIntent: inbound.length ? "Lead engaged via inbound conversation." : "No inbound intent captured in the selected message window.",
    primaryConcerns: "Review message history for explicit concerns; no unsupported claims are inferred.",
    servicesDiscussed: messages.some((message) => /hair|consult|treatment|financing/i.test(message.body ?? "")) ? "Hair consultation/treatment or financing may have been discussed." : "No service keyword detected.",
    pricingObjections: messages.some((message) => /price|cost|financing|expensive/i.test(message.body ?? "")) ? "Pricing or financing language detected." : "No pricing objection detected.",
    nextAction: inbound.length > outbound.length ? "Reply to the lead." : "Monitor or follow up if a task is due.",
    sentiment: inbound.length ? "Engaged" : "Unknown",
    lastCommitment: latest?.body?.slice(0, 160) ?? "No recent message.",
    unresolvedIssues: "Use staff review before sending any response."
  };
}

export function suggestedReply(style: string, values: { first_name?: string | null; location_name?: string | null }) {
  const bodies: Record<string, string> = {
    concise: "Hi {{first_name}}, thanks for reaching out. Would you like help booking your Avora consultation?",
    warm: "Hi {{first_name}}, happy to help. We can answer questions and find a consultation time that works for you.",
    sales: "Hi {{first_name}}, we can help you take the next step. Would morning or afternoon work better for a consultation?",
    informational: "Hi {{first_name}}, Avora can walk you through options, timing, and next steps during a consultation.",
    follow_up: "Hi {{first_name}}, checking in from Avora. Are you still interested in moving forward?",
    rebooking: "Hi {{first_name}}, we can help reschedule your consultation. What day works best?"
  };
  const rendered = renderSmsTemplate(bodies[style] ?? bodies.concise, {
    first_name: values.first_name ?? "there",
    location_name: values.location_name ?? "Avora"
  });
  return rendered.rendered;
}
