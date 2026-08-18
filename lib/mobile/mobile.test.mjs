import test from "node:test";
import assert from "node:assert/strict";
import { breakpointForWidth, isMobileWidth } from "./breakpoints.ts";
import { mobileNavForProfile, quickActionsForRole } from "./navigation.ts";
import { buildNativeFutureLink, buildWebLink, parseSafeRoute } from "./deep-links.ts";
import { capabilityLabel, safeSharePayload, webMobileCapabilities } from "./capabilities.ts";
import { canQueueOfflineWrite, offlineGuardMessage } from "./offline.ts";
import { sanitizeNotificationBody } from "./notifications.ts";
import { createDraftKey, redactDraftPreview } from "./drafts.ts";

test("classifies mobile breakpoints centrally", () => {
  assert.equal(breakpointForWidth(375), "phone");
  assert.equal(breakpointForWidth(430), "largePhone");
  assert.equal(breakpointForWidth(768), "tablet");
  assert.equal(isMobileWidth(390), true);
});

test("filters role-aware mobile navigation without granting permissions", () => {
  assert.equal(mobileNavForProfile({ role: "provider" })[0].label, "Today");
  assert.equal(mobileNavForProfile({ role: "salesperson" })[0].label, "Leads");
  assert.equal(quickActionsForRole("provider").includes("Record Inventory"), true);
});

test("allows only safe deep-link routes", () => {
  assert.equal(parseSafeRoute("/contacts/abc"), "/contacts/abc");
  assert.equal(parseSafeRoute("https://evil.example"), "/mobile");
  assert.equal(buildWebLink("/portal/appointments"), "/portal/appointments");
  assert.equal(buildNativeFutureLink("/calls/123"), "avora://calls/123");
});

test("documents browser capability and safe share payloads", () => {
  assert.equal(webMobileCapabilities.isNative, false);
  assert.equal(capabilityLabel("canCamera", true), "canCamera: available");
  assert.equal(safeSharePayload({ title: "Referral", text: "Share", url: "/r/demo" }).text, "Share");
});

test("blocks critical offline writes while preserving drafts", () => {
  assert.equal(canQueueOfflineWrite("payment"), false);
  assert.equal(canQueueOfflineWrite("contact_note"), true);
  assert.equal(offlineGuardMessage("inventory_deduction").includes("Reconnect"), true);
});

test("redacts sensitive notification and draft previews", () => {
  assert.equal(sanitizeNotificationBody("Your treatment notes are ready"), "You have a new Dev Dashboard update.");
  assert.equal(createDraftKey({ draftType: "clinical_note", route: "/clinical/sessions/1", entityId: "1" }), "clinical_note:/clinical/sessions/1:1");
  assert.equal(redactDraftPreview({ draftType: "clinical_note", route: "/x", payload: { note: "private" }, sensitivity: "clinical" }), "Sensitive draft saved");
});
