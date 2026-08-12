const statusMap: Record<string, string> = {
  queued: "queued",
  accepted: "queued",
  sending: "sending",
  sent: "sent",
  delivered: "delivered",
  undelivered: "undelivered",
  failed: "failed"
};

export function mapTwilioMessageStatus(status: string) {
  return statusMap[status] ?? "sent";
}
