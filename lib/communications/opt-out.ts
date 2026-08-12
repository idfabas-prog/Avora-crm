const optOutWords = new Set(["STOP", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"]);

export function isSmsOptOut(body: string) {
  const normalized = body.trim().toUpperCase();
  return optOutWords.has(normalized);
}
