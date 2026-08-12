export type AiMode = "disabled" | "development" | "enabled";

export type AiTrace = {
  tools: string[];
  dateRange?: { start: string; end: string; label: string };
  locations: string[];
  recordCounts: Record<string, number>;
  filters?: Record<string, unknown>;
};

export type AiAnswer = {
  mode: AiMode;
  feature: string;
  observedFacts: string[];
  analysis: string[];
  recommendations: string[];
  basedOn: AiTrace;
  recordLinks: Array<{ label: string; href: string }>;
  requestId?: string | null;
  mock: boolean;
};

export type LeadScoreFactor = {
  label: string;
  points: number;
};

export type LeadScoreResult = {
  score: number;
  label: "hot" | "warm" | "nurture" | "low_priority";
  factors: LeadScoreFactor[];
  recommendedAction: string;
};

export type AiInsight = {
  insightType: string;
  severity: "info" | "watch" | "important";
  title: string;
  summary: string;
  evidence: Record<string, unknown>;
  href?: string;
};
