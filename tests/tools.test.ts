import { describe, it, expect, vi } from "vitest";
import { getTodaysEvents, createCalendarEvent } from "../src/tools.js";

function makeCalendar(items: unknown[]) {
  return {
    events: {
      list: vi.fn().mockResolvedValue({ data: { items } }),
    },
  } as any;
}

describe("getTodaysEvents", () => {
  it("returns events from the calendar for the given range", async () => {
    const events = [
      { id: "1", summary: "Team meeting" },
      { id: "2", summary: "Client call" },
    ];
    const calendar = makeCalendar(events);

    const result = await getTodaysEvents({
      startOfDay: "2026-08-09T00:00:00.000Z",
      endOfDay: "2026-08-09T23:59:59.999Z",
      calendar,
    });

    expect(calendar.events.list).toHaveBeenCalledWith({
      calendarId: "primary",
      timeMin: "2026-08-09T00:00:00.000Z",
      timeMax: "2026-08-09T23:59:59.999Z",
      singleEvents: true,
      orderBy: "startTime",
    });
    expect(result.structuredContent.events).toEqual(events);
    expect(result.content[0].type).toBe("text");
    expect(JSON.parse(result.content[0].text)).toEqual(events);
  });

  it("returns an empty list when there are no events", async () => {
    const calendar = makeCalendar([]);

    const result = await getTodaysEvents({
      startOfDay: "2026-08-09T00:00:00.000Z",
      endOfDay: "2026-08-09T23:59:59.999Z",
      calendar,
    });

    expect(result.structuredContent.events).toEqual([]);
  });

  it("defaults to an empty array when the calendar returns no items", async () => {
    const calendar = {
      events: {
        list: vi.fn().mockResolvedValue({ data: {} }),
      },
    } as any;

    const result = await getTodaysEvents({
      startOfDay: "2026-08-09T00:00:00.000Z",
      endOfDay: "2026-08-09T23:59:59.999Z",
      calendar,
    });

    expect(result.structuredContent.events).toEqual([]);
  });
});

function makeInsertCalendar(eventData: unknown) {
  return {
    events: {
      insert: vi.fn().mockResolvedValue({ data: eventData }),
    },
  } as any;
}

describe("createCalendarEvent", () => {
  it("creates an event with the given details", async () => {
    const createdEvent = { id: "abc123", summary: "Team meeting" };
    const calendar = makeInsertCalendar(createdEvent);

    const result = await createCalendarEvent({
      summary: "Team meeting",
      description: "Weekly sync",
      startDateTime: "2026-08-10T10:00:00.000Z",
      endDateTime: "2026-08-10T11:00:00.000Z",
      timeZone: "Asia/Dhaka",
      attendees: ["a@example.com", "b@example.com"],
      calendar,
    });

    expect(calendar.events.insert).toHaveBeenCalledWith({
      calendarId: "primary",
      requestBody: {
        summary: "Team meeting",
        description: "Weekly sync",
        start: { dateTime: "2026-08-10T10:00:00.000Z", timeZone: "Asia/Dhaka" },
        end: { dateTime: "2026-08-10T11:00:00.000Z", timeZone: "Asia/Dhaka" },
        attendees: [{ email: "a@example.com" }, { email: "b@example.com" }],
      },
    });
    expect(result.structuredContent.event).toEqual(createdEvent);
    expect(JSON.parse(result.content[0].text)).toEqual(createdEvent);
  });

  it("omits optional fields when not provided", async () => {
    const createdEvent = { id: "xyz789", summary: "Solo focus block" };
    const calendar = makeInsertCalendar(createdEvent);

    await createCalendarEvent({
      summary: "Solo focus block",
      startDateTime: "2026-08-10T09:00:00.000Z",
      endDateTime: "2026-08-10T10:00:00.000Z",
      calendar,
    });

    expect(calendar.events.insert).toHaveBeenCalledWith({
      calendarId: "primary",
      requestBody: {
        summary: "Solo focus block",
        description: undefined,
        start: { dateTime: "2026-08-10T09:00:00.000Z", timeZone: undefined },
        end: { dateTime: "2026-08-10T10:00:00.000Z", timeZone: undefined },
        attendees: undefined,
      },
    });
  });
});
