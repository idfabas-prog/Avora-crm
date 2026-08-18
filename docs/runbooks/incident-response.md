# Incident Response Runbook

Severity labels are internal operational labels, not compliance certifications.

- SEV-1: patient safety, data exposure, total outage, or live payment/call incident.
- SEV-2: major workflow outage, provider integration failure, or broad access issue.
- SEV-3: degraded module, delayed jobs, or limited user impact.
- SEV-4: drill, minor issue, or informational event.

## Response

1. Create an incident record.
2. Assign an owner.
3. Preserve logs and request IDs.
4. Disable live-write gates if provider behavior is involved.
5. Enable maintenance mode or read-only mode when needed.
6. Communicate a plain-language support message.
7. Apply rollback or forward fix.
8. Verify health and core workflows.
9. Close with summary and prevention tasks.

Never place secrets, full clinical notes, card data, transcript bodies, or sensitive patient information in incident summaries.

