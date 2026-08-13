export type EntitlementEvent = {
  eventType: "grant" | "use" | "restore" | "expire" | "cancel" | "adjustment";
  quantity: number;
  treatmentSessionId?: string | null;
};

export function calculateEntitlementUsage(totalQuantity: number, events: EntitlementEvent[]) {
  const usedQuantity = Math.max(
    events.reduce((sum, event) => {
      if (event.eventType === "use") return sum + event.quantity;
      if (event.eventType === "restore") return sum - event.quantity;
      return sum;
    }, 0),
    0
  );
  const adjustmentQuantity = events.reduce((sum, event) => event.eventType === "adjustment" ? sum + event.quantity : sum, 0);
  const availableQuantity = Math.max(totalQuantity + adjustmentQuantity, 0);
  const remainingQuantity = Math.max(availableQuantity - usedQuantity, 0);
  return {
    totalQuantity: availableQuantity,
    usedQuantity,
    remainingQuantity,
    status: remainingQuantity === 0 ? "fully_used" : "active"
  };
}

export function shouldConsumeEntitlement(status: string) {
  return status === "completed";
}

export function nextSessionNumber(completedSessions: number) {
  return completedSessions + 1;
}

export function planProgress(plannedSessions: number, completedSessions: number) {
  const safePlanned = Math.max(plannedSessions, 0);
  const safeCompleted = Math.max(completedSessions, 0);
  return {
    planned: safePlanned,
    completed: safeCompleted,
    remaining: Math.max(safePlanned - safeCompleted, 0),
    percent: safePlanned ? Math.min(Math.round((safeCompleted / safePlanned) * 100), 100) : 0
  };
}

export function isNoteEditable(lockedAt?: string | null) {
  return !lockedAt;
}

export function canExposeClinicalDetail(role: string) {
  return !["salesperson"].includes(role);
}
