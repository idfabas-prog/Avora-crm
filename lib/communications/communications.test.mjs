import assert from "node:assert/strict";
import { test } from "node:test";

const phone = await import("./phone.ts");
const optOut = await import("./opt-out.ts");
const templates = await import("./templates.ts");
const status = await import("./message-status.ts");

test("normalizes US phone numbers to E.164", () => {
  assert.equal(phone.normalizePhoneNumber("(305) 555-1212"), "+13055551212");
  assert.equal(phone.normalizePhoneNumber("13055551212"), "+13055551212");
  assert.equal(phone.normalizePhoneNumber("abc"), null);
});

test("detects common SMS opt-out keywords", () => {
  assert.equal(optOut.isSmsOptOut("STOP"), true);
  assert.equal(optOut.isSmsOptOut(" unsubscribe "), true);
  assert.equal(optOut.isSmsOptOut("please stop texting"), false);
});

test("renders safe SMS templates and reports missing variables", () => {
  const result = templates.renderSmsTemplate("Hi {{first_name}} at {{location_name}}", {
    first_name: "Ista"
  });
  assert.equal(result.rendered, "Hi Ista at {{location_name}}");
  assert.deepEqual(result.missing, ["location_name"]);
});

test("maps Twilio statuses to internal statuses", () => {
  assert.equal(status.mapTwilioMessageStatus("delivered"), "delivered");
  assert.equal(status.mapTwilioMessageStatus("accepted"), "queued");
  assert.equal(status.mapTwilioMessageStatus("mystery"), "sent");
});
