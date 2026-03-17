export interface EmailAttachment {
  filename: string;
  mimeType: string;
  content: Buffer;
}

export interface SendEmailResult {
  messageId: string;
  threadId: string;
  link: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  startTime: string;
  endTime: string;
}

export interface EmailProvider {
  sendEmail(
    to: string,
    subject: string,
    body: string,
    attachments?: EmailAttachment[]
  ): Promise<SendEmailResult>;
  getHistory(startHistoryId: string): Promise<any>;
  getMessage(messageId: string): Promise<any>;
  getProfile(): Promise<{ email: string }>;
}

export interface CalendarProvider {
  createEvent(params: {
    title: string;
    description?: string;
    startTime: string;
    endTime: string;
  }): Promise<string | null>;
  updateEvent(
    eventId: string,
    params: { title?: string; description?: string; startTime?: string; endTime?: string }
  ): Promise<void>;
  deleteEvent(eventId: string): Promise<void>;
  listEvents(timeMin: string, timeMax: string): Promise<CalendarEvent[]>;
}

export interface NotesProvider {
  syncLead(lead: any, databaseId: string): Promise<string | null>;
  syncContact(contact: any, databaseId: string): Promise<string | null>;
  syncActivity(activity: any, databaseId: string): Promise<string | null>;
}
