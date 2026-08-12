# Communications Development Notes

Phase 3 uses Twilio for production SMS and voice webhooks, but defaults to development simulation.

Required public webhook URLs when configuring Twilio:

- Inbound SMS: `/api/webhooks/twilio/sms`
- Message status callbacks: `/api/webhooks/twilio/status`
- Voice/call events: `/api/webhooks/twilio/call`

Twilio must reach an HTTPS-accessible URL. For local development, expose the local Next.js app through an HTTPS tunnel or development domain and set `TWILIO_WEBHOOK_BASE_URL` to that public origin.

Keep these server-only:

- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_MESSAGING_SERVICE_SID`
- `SUPABASE_SERVICE_ROLE_KEY`

Development mode:

- `COMMUNICATIONS_MODE=development`
- `COMMUNICATIONS_ALLOW_LIVE_SEND=false`

In development mode, outbound SMS records are simulated and marked as simulated. No real SMS is sent.
