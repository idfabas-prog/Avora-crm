import type { GhlAppointment, GhlCalendar, GhlContact, GhlConversation, GhlMessage, GhlOpportunity, GhlPage, GhlPayment } from "./types.ts";

function page<T>(data: T[]): GhlPage<T> {
  return { data, hasMore: false, nextPageToken: null, cursor: null };
}

export class MockGhlClient {
  private readonly locationName: string;

  constructor(locationName = "Demo") {
    this.locationName = locationName;
  }

  getContacts() {
    return Promise.resolve(page<GhlContact>([
      { id: `mock-contact-${this.locationName}-1`, firstName: "Avery", lastName: "Lane", email: "avery.lane@example.com", phone: "+13055550101", tags: ["Consult"], source: "GoHighLevel Mock", updatedAt: "2026-08-14T12:00:00Z" },
      { id: `mock-contact-${this.locationName}-2`, firstName: "Morgan", lastName: "Fields", email: "morgan.fields@example.com", phone: "+13055550102", tags: ["Follow Up"], source: "GoHighLevel Mock", updatedAt: "2026-08-14T12:05:00Z" }
    ]));
  }

  getCalendars() {
    return Promise.resolve(page<GhlCalendar>([
      { id: `mock-calendar-${this.locationName}`, name: `${this.locationName} Consult Calendar`, active: true, timezone: "America/New_York" }
    ]));
  }

  getAppointments() {
    return Promise.resolve(page<GhlAppointment>([
      { id: `mock-appointment-${this.locationName}-1`, contactId: `mock-contact-${this.locationName}-1`, calendarId: `mock-calendar-${this.locationName}`, title: "Consultation", status: "confirmed", startTime: "2026-08-20T14:00:00-04:00", endTime: "2026-08-20T15:00:00-04:00", timezone: "America/New_York" }
    ]));
  }

  getConversations() {
    return Promise.resolve(page<GhlConversation>([
      { id: `mock-conversation-${this.locationName}-1`, contactId: `mock-contact-${this.locationName}-1`, channel: "SMS", lastMessageAt: "2026-08-14T13:00:00Z" }
    ]));
  }

  getMessages() {
    return Promise.resolve(page<GhlMessage>([
      { id: `mock-message-${this.locationName}-1`, conversationId: `mock-conversation-${this.locationName}-1`, contactId: `mock-contact-${this.locationName}-1`, direction: "inbound", channel: "SMS", body: "I would like to book a consultation.", status: "delivered", timestamp: "2026-08-14T13:00:00Z" }
    ]));
  }

  getOpportunities() {
    return Promise.resolve(page<GhlOpportunity>([
      { id: `mock-opportunity-${this.locationName}-1`, contactId: `mock-contact-${this.locationName}-1`, pipelineId: "mock-pipeline", stageId: "mock-stage", name: "Consultation Opportunity", value: 2500, status: "open", source: "GoHighLevel Mock" }
    ]));
  }

  getPayments() {
    return Promise.resolve(page<GhlPayment>([
      { id: `mock-payment-${this.locationName}-1`, contactId: `mock-contact-${this.locationName}-1`, amountCents: 250000, currency: "USD", status: "succeeded", provider: "gohighlevel", receivedAt: "2026-08-14T15:00:00Z" }
    ]));
  }
}
