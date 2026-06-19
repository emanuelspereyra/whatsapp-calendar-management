import { google, calendar_v3 } from "googleapis";
import type { AppConfig } from "../../config/env";
import type { DependencyHealth } from "../../types";
import { logger } from "../../utils/logger";

export type CalendarEventInput = {
  title: string;
  description: string;
  startDateTime: Date;
  endDateTime: Date;
};

export interface CalendarService {
  checkAvailability(startDateTime: Date, endDateTime: Date): Promise<boolean>;
  createEvent(input: CalendarEventInput): Promise<{ googleEventId: string }>;
  healthCheck(): Promise<DependencyHealth>;
}

export class GoogleCalendarService implements CalendarService {
  private readonly calendar: calendar_v3.Calendar;

  constructor(private readonly config: AppConfig, calendarClient?: calendar_v3.Calendar) {
    if (calendarClient) {
      this.calendar = calendarClient;
      return;
    }

    const auth = new google.auth.JWT({
      email: config.googleClientEmail,
      key: config.googlePrivateKey,
      scopes: ["https://www.googleapis.com/auth/calendar"]
    });
    this.calendar = google.calendar({ version: "v3", auth });
  }

  async checkAvailability(startDateTime: Date, endDateTime: Date): Promise<boolean> {
    const result = await this.calendar.freebusy.query({
      requestBody: {
        timeMin: startDateTime.toISOString(),
        timeMax: endDateTime.toISOString(),
        items: [{ id: this.config.googleCalendarId }]
      }
    });

    const busy = result.data.calendars?.[this.config.googleCalendarId]?.busy ?? [];
    return busy.length === 0;
  }

  async createEvent(input: CalendarEventInput): Promise<{ googleEventId: string }> {
    const result = await this.calendar.events.insert({
      calendarId: this.config.googleCalendarId,
      requestBody: {
        summary: input.title,
        description: input.description,
        start: {
          dateTime: input.startDateTime.toISOString(),
          timeZone: this.config.defaultTimezone
        },
        end: {
          dateTime: input.endDateTime.toISOString(),
          timeZone: this.config.defaultTimezone
        }
      }
    });

    if (!result.data.id) {
      throw new Error("Google Calendar did not return an event id");
    }

    return { googleEventId: result.data.id };
  }

  async healthCheck(): Promise<DependencyHealth> {
    try {
      await this.calendar.calendars.get({ calendarId: this.config.googleCalendarId });
      return { status: "ok", message: "Google Calendar reachable" };
    } catch (error) {
      logger.warn({ err: error }, "google calendar healthcheck failed");
      return {
        status: "down",
        message: error instanceof Error ? error.message : "Google Calendar healthcheck failed"
      };
    }
  }
}
