import { describe, it, expect, vi } from "vitest";
import { getTodaysEvents } from "../src/tools.js";

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
