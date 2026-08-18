# Live Integration Enablement Runbook

Live integrations must be enabled one at a time.

## Stripe

1. Configure live Stripe secret and publishable keys.
2. Configure the live webhook endpoint and live `STRIPE_WEBHOOK_SECRET`.
3. Confirm test keys are not mixed with live mode.
4. Verify webhook signature failures are rejected.
5. Run sandbox or low-risk validation.
6. Enable `PAYMENTS_ALLOW_LIVE_CHARGES=true`.
7. Monitor payment, refund, and webhook idempotency.

## Twilio

1. Provision numbers.
2. Configure webhook URLs.
3. Verify Twilio signatures.
4. Confirm recording consent settings.
5. Enable `TELEPHONY_ALLOW_LIVE_CALLS=true` only after approval.

## Campaigns

1. Confirm opt-out, suppression, quiet hours, and frequency caps.
2. Verify launch permissions.
3. Confirm campaign test mode.
4. Enable `CAMPAIGNS_ALLOW_LIVE_SENDS=true` only for approved campaigns.

## Accounting

1. Configure OAuth credentials.
2. Import/review chart and mappings.
3. Generate mock batch.
4. Obtain approval.
5. Enable `ACCOUNTING_ALLOW_LIVE_EXPORTS=true`.

## Push

1. Configure APNs/Firebase credentials when implemented.
2. Confirm no sensitive push payloads.
3. Enable `PUSH_ALLOW_LIVE_SENDS=true` only after device testing.

## AI

1. Configure API key and model.
2. Set budget and rate limits.
3. Review tool allowlists.
4. Confirm no autonomous writes.
5. Enable `AI_LIVE_PROVIDER_ENABLED=true` only after monitoring is ready.

