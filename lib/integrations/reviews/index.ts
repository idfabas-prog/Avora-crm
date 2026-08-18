export type ReviewProvider = "Google" | "Facebook" | "Yelp";

export type ReviewIntegrationStatus = {
  provider: ReviewProvider;
  configured: boolean;
  requiredEnv: string[];
  liveApiCallsEnabled: false;
};

const providerEnv: Record<ReviewProvider, string[]> = {
  Google: [
    "GOOGLE_BUSINESS_ACCOUNT_ID",
    "GOOGLE_BUSINESS_LOCATION_ID",
    "GOOGLE_BUSINESS_CLIENT_ID",
    "GOOGLE_BUSINESS_CLIENT_SECRET",
    "GOOGLE_BUSINESS_REFRESH_TOKEN"
  ],
  Facebook: ["FACEBOOK_REVIEWS_PAGE_ID", "FACEBOOK_REVIEWS_ACCESS_TOKEN"],
  Yelp: ["YELP_BUSINESS_ID", "YELP_API_KEY"]
};

export function reviewIntegrationStatus(provider: ReviewProvider): ReviewIntegrationStatus {
  const requiredEnv = providerEnv[provider];
  return {
    provider,
    configured: requiredEnv.every((key) => Boolean(process.env[key])),
    requiredEnv,
    liveApiCallsEnabled: false
  };
}

export function getReviewIntegrationStatuses() {
  return (Object.keys(providerEnv) as ReviewProvider[]).map(reviewIntegrationStatus);
}

export async function syncExternalReviews() {
  return {
    recordsProcessed: 0,
    recordsCreated: 0,
    recordsUpdated: 0,
    liveApiCallsEnabled: false,
    message: "Phase 12 runs in demo-safe mode. Live review APIs are not called."
  };
}

export async function publishReviewResponseDraft() {
  throw new Error("Publishing external review responses is intentionally disabled in Phase 12.");
}
