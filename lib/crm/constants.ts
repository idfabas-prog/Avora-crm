export const contactStatuses = [
  "New Lead",
  "Contacted",
  "Consultation Booked",
  "Active Patient",
  "Follow Up",
  "Lost",
  "Inactive"
];

export const appointmentStatuses = [
  "Scheduled",
  "Confirmed",
  "Checked In",
  "Completed",
  "Cancelled",
  "No Show"
];

export const taskStatuses = ["Open", "In Progress", "Completed", "Cancelled"];

export function toDbStatus(status: string) {
  return status.toLowerCase().replaceAll(" ", "_").replaceAll("-", "_");
}

export function fromDbStatus(status: string | null | undefined) {
  if (!status) {
    return "New Lead";
  }

  return status
    .split("_")
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

export function formatCurrency(cents: number | null | undefined) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format((cents ?? 0) / 100);
}

export function formatDate(value: string | null | undefined) {
  if (!value) {
    return "No activity";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(value));
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "No activity";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

export function formatTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}
