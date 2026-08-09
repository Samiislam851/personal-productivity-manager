import { calendar_v3 } from "googleapis";

/**
 * Pure tool functions — business logic only, no MCP dependency.
 * Each function is registered as an MCP tool in index.ts.
 *
 * This separation makes tools easy to unit test without MCP infrastructure.
 */
export const getTodaysEvents = async ({ startOfDay, endOfDay , calendar} : { startOfDay: string , endOfDay: string , calendar: calendar_v3.Calendar}) => {

    const events = await calendar.events.list({
      calendarId: "primary",
      timeMin: startOfDay,
      timeMax: endOfDay,
      singleEvents: true,
      orderBy: "startTime",
    });

    const items = events.data.items ?? [];

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(items),
        },
      ],
      structuredContent: {
        events: items
      }
    };
  }

export const createCalendarEvent = async ({
  summary,
  description,
  startDateTime,
  endDateTime,
  timeZone,
  attendees,
  calendar,
}: {
  summary: string;
  description?: string;
  startDateTime: string;
  endDateTime: string;
  timeZone?: string;
  attendees?: string[];
  calendar: calendar_v3.Calendar;
}) => {
  const event = await calendar.events.insert({
    calendarId: "primary",
    requestBody: {
      summary,
      description,
      start: { dateTime: startDateTime, timeZone },
      end: { dateTime: endDateTime, timeZone },
      attendees: attendees?.map((email) => ({ email })),
    },
  });

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(event.data),
      },
    ],
    structuredContent: {
      event: event.data,
    },
  };
};
