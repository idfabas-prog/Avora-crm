import test from "node:test";
import assert from "node:assert/strict";
import { normalizeSourceAlias, parseUtmCapture, chooseFirstTouch, chooseLastTouch, nextAttributionType } from "./attribution.ts";
import { calculateMarketingMetrics, safeDivide } from "./metrics.ts";
import { hasMarketingPermission } from "./permissions.ts";

test("parses UTM capture centrally", () => {
  const parsed = parseUtmCapture({ url: "https://example.com/?utm_source=meta&utm_medium=paid_social&utm_campaign=miami&utm_content=video&utm_term=hair", referrer: "https://facebook.com" });
  assert.equal(parsed.utm_source, "meta");
  assert.equal(parsed.utm_campaign, "miami");
  assert.equal(parsed.referrer, "https://facebook.com");
});

test("normalizes source aliases", () => {
  assert.equal(normalizeSourceAlias("Facebook Lead Ads"), "facebook_lead_ads");
  assert.equal(normalizeSourceAlias(" FB "), "fb");
});

test("keeps first and last touch attribution separate", () => {
  const events = [
    { attribution_type: "first_touch", captured_at: "2026-08-01T00:00:00Z" },
    { attribution_type: "last_touch", captured_at: "2026-08-10T00:00:00Z" }
  ];
  assert.equal(chooseFirstTouch(events)?.attribution_type, "first_touch");
  assert.equal(chooseLastTouch(events)?.attribution_type, "last_touch");
  assert.equal(nextAttributionType([]), "first_touch");
  assert.equal(nextAttributionType(events), "last_touch");
});

test("calculates CPL, CAC, ROAS, and conversion rates with safe division", () => {
  const metrics = calculateMarketingMetrics({
    spendCents: 2000000,
    impressions: 100000,
    clicks: 4000,
    leads: 200,
    booked: 90,
    showed: 72,
    sales: 30,
    grossRevenueCents: 20000000,
    collectedRevenueCents: 19000000,
    refundedCents: 1000000
  });
  assert.equal(metrics.cplCents, 10000);
  assert.equal(metrics.costPerBookedCents, 22222);
  assert.equal(metrics.cacCents, 66667);
  assert.equal(metrics.netCollectedRoas, 9);
  assert.equal(metrics.leadToBookingRate, 45);
  assert.equal(metrics.bookingToShowRate, 80);
});

test("handles zero denominators", () => {
  assert.equal(safeDivide(100, 0), 0);
  assert.equal(calculateMarketingMetrics({ spendCents: 0, impressions: 0, clicks: 0, leads: 0, booked: 0, showed: 0, sales: 0, grossRevenueCents: 0, collectedRevenueCents: 0, refundedCents: 0 }).netCollectedRoas, 0);
});

test("marketing permissions hide spend from salespeople", () => {
  const salesperson = { role: "salesperson" };
  const manager = { role: "manager" };
  assert.equal(hasMarketingPermission(salesperson, "marketing.attribution.read"), true);
  assert.equal(hasMarketingPermission(salesperson, "marketing.spend.read"), false);
  assert.equal(hasMarketingPermission(manager, "marketing.spend.read"), true);
});
