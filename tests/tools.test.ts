import { describe, it, expect, vi } from "vitest";
import {
  getTodaysEvents,
  createCalendarEvent,
  findFreeTimeSlot,
  autoScheduleMeeting,
  summarizeWeekSchedule,
  createKeepNote,
  getKeepNotes,
  deleteKeepNote,
  convertNoteToTask,
  reminderAgent,
} from "../src/tools.js";

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

function makeFreebusyCalendar(busy: { start: string; end: string }[]) {
  return {
    freebusy: {
      query: vi.fn().mockResolvedValue({ data: { calendars: { primary: { busy } } } }),
    },
  } as any;
}

describe("findFreeTimeSlot", () => {
  it("finds gaps around a single busy period", async () => {
    const calendar = makeFreebusyCalendar([
      { start: "2026-08-10T10:00:00.000Z", end: "2026-08-10T11:00:00.000Z" },
    ]);

    const result = await findFreeTimeSlot({
      startOfDay: "2026-08-10T09:00:00.000Z",
      endOfDay: "2026-08-10T12:00:00.000Z",
      durationMinutes: 30,
      calendar,
    });

    expect(calendar.freebusy.query).toHaveBeenCalledWith({
      requestBody: {
        timeMin: "2026-08-10T09:00:00.000Z",
        timeMax: "2026-08-10T12:00:00.000Z",
        items: [{ id: "primary" }],
      },
    });
    expect(result.structuredContent.freeSlots).toEqual([
      { start: "2026-08-10T09:00:00.000Z", end: "2026-08-10T10:00:00.000Z" },
      { start: "2026-08-10T11:00:00.000Z", end: "2026-08-10T12:00:00.000Z" },
    ]);
  });

  it("returns the whole range when there are no busy periods", async () => {
    const calendar = makeFreebusyCalendar([]);

    const result = await findFreeTimeSlot({
      startOfDay: "2026-08-10T09:00:00.000Z",
      endOfDay: "2026-08-10T12:00:00.000Z",
      durationMinutes: 60,
      calendar,
    });

    expect(result.structuredContent.freeSlots).toEqual([
      { start: "2026-08-10T09:00:00.000Z", end: "2026-08-10T12:00:00.000Z" },
    ]);
  });

  it("excludes gaps shorter than the requested duration", async () => {
    const calendar = makeFreebusyCalendar([
      { start: "2026-08-10T09:15:00.000Z", end: "2026-08-10T11:00:00.000Z" },
    ]);

    const result = await findFreeTimeSlot({
      startOfDay: "2026-08-10T09:00:00.000Z",
      endOfDay: "2026-08-10T11:20:00.000Z",
      durationMinutes: 30,
      calendar,
    });

    expect(result.structuredContent.freeSlots).toEqual([]);
  });

  it("merges overlapping busy periods when computing gaps", async () => {
    const calendar = makeFreebusyCalendar([
      { start: "2026-08-10T10:00:00.000Z", end: "2026-08-10T11:00:00.000Z" },
      { start: "2026-08-10T10:30:00.000Z", end: "2026-08-10T12:00:00.000Z" },
    ]);

    const result = await findFreeTimeSlot({
      startOfDay: "2026-08-10T09:00:00.000Z",
      endOfDay: "2026-08-10T13:00:00.000Z",
      durationMinutes: 30,
      calendar,
    });

    expect(result.structuredContent.freeSlots).toEqual([
      { start: "2026-08-10T09:00:00.000Z", end: "2026-08-10T10:00:00.000Z" },
      { start: "2026-08-10T12:00:00.000Z", end: "2026-08-10T13:00:00.000Z" },
    ]);
  });
});

describe("autoScheduleMeeting", () => {
  it("books the earliest free slot", async () => {
    const createdEvent = { id: "e1", summary: "Sync" };
    const calendar = {
      freebusy: {
        query: vi.fn().mockResolvedValue({
          data: { calendars: { primary: { busy: [{ start: "2026-08-10T09:00:00.000Z", end: "2026-08-10T09:30:00.000Z" }] } } },
        }),
      },
      events: {
        insert: vi.fn().mockResolvedValue({ data: createdEvent }),
      },
    } as any;

    const result = await autoScheduleMeeting({
      startOfDay: "2026-08-10T09:00:00.000Z",
      endOfDay: "2026-08-10T12:00:00.000Z",
      durationMinutes: 30,
      summary: "Sync",
      calendar,
    });

    expect(calendar.events.insert).toHaveBeenCalledWith({
      calendarId: "primary",
      requestBody: expect.objectContaining({
        summary: "Sync",
        start: { dateTime: "2026-08-10T09:30:00.000Z", timeZone: undefined },
        end: { dateTime: "2026-08-10T10:00:00.000Z", timeZone: undefined },
      }),
    });
    expect(result.structuredContent).toEqual({ scheduled: true, event: createdEvent });
  });

  it("reports no free slot instead of creating an event", async () => {
    const calendar = {
      freebusy: {
        query: vi.fn().mockResolvedValue({
          data: { calendars: { primary: { busy: [{ start: "2026-08-10T09:00:00.000Z", end: "2026-08-10T12:00:00.000Z" }] } } },
        }),
      },
      events: { insert: vi.fn() },
    } as any;

    const result = await autoScheduleMeeting({
      startOfDay: "2026-08-10T09:00:00.000Z",
      endOfDay: "2026-08-10T12:00:00.000Z",
      durationMinutes: 30,
      summary: "Sync",
      calendar,
    });

    expect(calendar.events.insert).not.toHaveBeenCalled();
    expect(result.structuredContent).toEqual({ scheduled: false });
  });
});

describe("summarizeWeekSchedule", () => {
  it("summarizes events into readable lines", async () => {
    const calendar = makeCalendar([
      { summary: "Team meeting", start: { dateTime: "2026-08-10T10:00:00.000Z" } },
      { summary: "Client call", start: { dateTime: "2026-08-10T14:00:00.000Z" } },
    ]);

    const result = await summarizeWeekSchedule({
      startOfWeek: "2026-08-10T00:00:00.000Z",
      endOfWeek: "2026-08-16T23:59:59.999Z",
      calendar,
    });

    expect(result.structuredContent.eventCount).toBe(2);
    expect(result.structuredContent.summary).toBe("10:00 AM — Team meeting\n02:00 PM — Client call");
  });

  it("reports no events scheduled", async () => {
    const calendar = makeCalendar([]);

    const result = await summarizeWeekSchedule({
      startOfWeek: "2026-08-10T00:00:00.000Z",
      endOfWeek: "2026-08-16T23:59:59.999Z",
      calendar,
    });

    expect(result.structuredContent.eventCount).toBe(0);
    expect(result.structuredContent.summary).toBe("No events scheduled this week.");
  });
});

describe("createKeepNote", () => {
  it("creates a note with title and content", async () => {
    const noteData = { name: "notes/1", title: "Idea" };
    const keep = { notes: { create: vi.fn().mockResolvedValue({ data: noteData }) } } as any;

    const result = await createKeepNote({ title: "Idea", content: "AI resume reviewer", keep });

    expect(keep.notes.create).toHaveBeenCalledWith({
      requestBody: { title: "Idea", body: { text: { text: "AI resume reviewer" } } },
    });
    expect(result.structuredContent.note).toEqual(noteData);
  });
});

describe("getKeepNotes", () => {
  it("returns all notes when no query is given", async () => {
    const notes = [{ title: "Idea" }, { title: "Groceries" }];
    const keep = { notes: { list: vi.fn().mockResolvedValue({ data: { notes } }) } } as any;

    const result = await getKeepNotes({ keep });

    expect(result.structuredContent.notes).toEqual(notes);
  });

  it("filters notes by title/content query", async () => {
    const notes = [
      { title: "Startup idea", body: { text: { text: "resume reviewer" } } },
      { title: "Groceries", body: { text: { text: "milk, eggs" } } },
    ];
    const keep = { notes: { list: vi.fn().mockResolvedValue({ data: { notes } }) } } as any;

    const result = await getKeepNotes({ query: "startup", keep });

    expect(result.structuredContent.notes).toEqual([notes[0]]);
  });
});

describe("deleteKeepNote", () => {
  it("deletes the note by id", async () => {
    const keep = { notes: { delete: vi.fn().mockResolvedValue({}) } } as any;

    const result = await deleteKeepNote({ noteId: "notes/1", keep });

    expect(keep.notes.delete).toHaveBeenCalledWith({ name: "notes/1" });
    expect(result.structuredContent).toEqual({ deleted: true, noteId: "notes/1" });
  });
});

describe("convertNoteToTask", () => {
  it("creates a task from a note's title and content", async () => {
    const keep = {
      notes: {
        get: vi.fn().mockResolvedValue({ data: { title: "Idea", body: { text: { text: "Build it" } } } }),
      },
    } as any;
    const taskData = { id: "t1", title: "Idea" };
    const tasks = { tasks: { insert: vi.fn().mockResolvedValue({ data: taskData }) } } as any;

    const result = await convertNoteToTask({ noteId: "notes/1", dueDate: "2026-08-15T00:00:00.000Z", keep, tasks });

    expect(keep.notes.get).toHaveBeenCalledWith({ name: "notes/1" });
    expect(tasks.tasks.insert).toHaveBeenCalledWith({
      tasklist: "@default",
      requestBody: { title: "Idea", notes: "Build it", due: "2026-08-15T00:00:00.000Z" },
    });
    expect(result.structuredContent.task).toEqual(taskData);
  });
});

describe("reminderAgent", () => {
  it("creates a reminder", async () => {
    const taskData = { id: "t1", title: "Call mom" };
    const tasks = { tasks: { insert: vi.fn().mockResolvedValue({ data: taskData }) } } as any;

    const result = await reminderAgent({ action: "create", title: "Call mom", tasks });

    expect(tasks.tasks.insert).toHaveBeenCalledWith({
      tasklist: "@default",
      requestBody: { title: "Call mom", notes: undefined, due: undefined },
    });
    expect(result.structuredContent.task).toEqual(taskData);
  });

  it("lists reminders", async () => {
    const items = [{ id: "t1", title: "Call mom" }];
    const tasks = { tasks: { list: vi.fn().mockResolvedValue({ data: { items } }) } } as any;

    const result = await reminderAgent({ action: "list", tasks });

    expect(result.structuredContent.tasks).toEqual(items);
  });

  it("completes a reminder", async () => {
    const taskData = { id: "t1", status: "completed" };
    const tasks = { tasks: { patch: vi.fn().mockResolvedValue({ data: taskData }) } } as any;

    const result = await reminderAgent({ action: "complete", taskId: "t1", tasks });

    expect(tasks.tasks.patch).toHaveBeenCalledWith({
      tasklist: "@default",
      task: "t1",
      requestBody: { status: "completed" },
    });
    expect(result.structuredContent.task).toEqual(taskData);
  });

  it("deletes a reminder", async () => {
    const tasks = { tasks: { delete: vi.fn().mockResolvedValue({}) } } as any;

    const result = await reminderAgent({ action: "delete", taskId: "t1", tasks });

    expect(tasks.tasks.delete).toHaveBeenCalledWith({ tasklist: "@default", task: "t1" });
    expect(result.structuredContent).toEqual({ deleted: true, taskId: "t1" });
  });
});
