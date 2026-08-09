import { calendar_v3, keep_v1, tasks_v1 } from "googleapis";

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

export const findFreeTimeSlot = async ({
  startOfDay,
  endOfDay,
  durationMinutes,
  calendar,
}: {
  startOfDay: string;
  endOfDay: string;
  durationMinutes: number;
  calendar: calendar_v3.Calendar;
}) => {
  const freebusy = await calendar.freebusy.query({
    requestBody: {
      timeMin: startOfDay,
      timeMax: endOfDay,
      items: [{ id: "primary" }],
    },
  });

  const busy = (freebusy.data.calendars?.primary?.busy ?? [])
    .filter((b): b is { start: string; end: string } => !!b.start && !!b.end)
    .map((b) => ({ start: new Date(b.start).getTime(), end: new Date(b.end).getTime() }))
    .sort((a, b) => a.start - b.start);

  const rangeStart = new Date(startOfDay).getTime();
  const rangeEnd = new Date(endOfDay).getTime();
  const durationMs = durationMinutes * 60 * 1000;

  const freeSlots: { start: string; end: string }[] = [];
  let cursor = rangeStart;

  for (const period of busy) {
    if (period.start - cursor >= durationMs) {
      freeSlots.push({ start: new Date(cursor).toISOString(), end: new Date(period.start).toISOString() });
    }
    cursor = Math.max(cursor, period.end);
  }

  if (rangeEnd - cursor >= durationMs) {
    freeSlots.push({ start: new Date(cursor).toISOString(), end: new Date(rangeEnd).toISOString() });
  }

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(freeSlots),
      },
    ],
    structuredContent: {
      freeSlots,
    },
  };
};

export const autoScheduleMeeting = async ({
  startOfDay,
  endOfDay,
  durationMinutes,
  summary,
  description,
  timeZone,
  attendees,
  calendar,
}: {
  startOfDay: string;
  endOfDay: string;
  durationMinutes: number;
  summary: string;
  description?: string;
  timeZone?: string;
  attendees?: string[];
  calendar: calendar_v3.Calendar;
}) => {
  const { structuredContent } = await findFreeTimeSlot({ startOfDay, endOfDay, durationMinutes, calendar });
  const slot = structuredContent.freeSlots[0];

  if (!slot) {
    return {
      content: [{ type: "text" as const, text: "No free slot available in the given range." }],
      structuredContent: { scheduled: false as const },
    };
  }

  const slotEnd = new Date(new Date(slot.start).getTime() + durationMinutes * 60 * 1000).toISOString();
  const created = await createCalendarEvent({
    summary,
    description,
    startDateTime: slot.start,
    endDateTime: slotEnd,
    timeZone,
    attendees,
    calendar,
  });

  return {
    content: created.content,
    structuredContent: { scheduled: true as const, event: created.structuredContent.event },
  };
};

function formatEventTime(dateTime?: string | null, date?: string | null): string {
  if (dateTime) {
    return new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "UTC" }).format(
      new Date(dateTime)
    );
  }
  return date ? "All day" : "";
}

export const summarizeWeekSchedule = async ({
  startOfWeek,
  endOfWeek,
  calendar,
}: {
  startOfWeek: string;
  endOfWeek: string;
  calendar: calendar_v3.Calendar;
}) => {
  const events = await calendar.events.list({
    calendarId: "primary",
    timeMin: startOfWeek,
    timeMax: endOfWeek,
    singleEvents: true,
    orderBy: "startTime",
  });

  const items = events.data.items ?? [];
  const lines = items.map(
    (e) => `${formatEventTime(e.start?.dateTime, e.start?.date)} — ${e.summary ?? "(no title)"}`
  );
  const summary = items.length ? lines.join("\n") : "No events scheduled this week.";

  return {
    content: [{ type: "text" as const, text: summary }],
    structuredContent: { eventCount: items.length, summary },
  };
};

export const createKeepNote = async ({
  title,
  content,
  keep,
}: {
  title: string;
  content: string;
  keep: keep_v1.Keep;
}) => {
  const note = await keep.notes.create({
    requestBody: { title, body: { text: { text: content } } },
  });

  return {
    content: [{ type: "text" as const, text: JSON.stringify(note.data) }],
    structuredContent: { note: note.data },
  };
};

export const getKeepNotes = async ({ query, keep }: { query?: string; keep: keep_v1.Keep }) => {
  const res = await keep.notes.list({});
  let notes = res.data.notes ?? [];

  if (query) {
    const q = query.toLowerCase();
    notes = notes.filter(
      (n) => n.title?.toLowerCase().includes(q) || n.body?.text?.text?.toLowerCase().includes(q)
    );
  }

  return {
    content: [{ type: "text" as const, text: JSON.stringify(notes) }],
    structuredContent: { notes },
  };
};

export const deleteKeepNote = async ({ noteId, keep }: { noteId: string; keep: keep_v1.Keep }) => {
  await keep.notes.delete({ name: noteId });

  return {
    content: [{ type: "text" as const, text: `Deleted note ${noteId}` }],
    structuredContent: { deleted: true, noteId },
  };
};

export const convertNoteToTask = async ({
  noteId,
  dueDate,
  keep,
  tasks,
}: {
  noteId: string;
  dueDate?: string;
  keep: keep_v1.Keep;
  tasks: tasks_v1.Tasks;
}) => {
  const note = await keep.notes.get({ name: noteId });

  const task = await tasks.tasks.insert({
    tasklist: "@default",
    requestBody: {
      title: note.data.title || "Untitled note",
      notes: note.data.body?.text?.text ?? undefined,
      due: dueDate,
    },
  });

  return {
    content: [{ type: "text" as const, text: JSON.stringify(task.data) }],
    structuredContent: { task: task.data },
  };
};

export const reminderAgent = async ({
  action,
  title,
  notes,
  dueDate,
  taskId,
  tasks,
}: {
  action: "create" | "list" | "complete" | "delete";
  title?: string;
  notes?: string;
  dueDate?: string;
  taskId?: string;
  tasks: tasks_v1.Tasks;
}) => {
  if (action === "create") {
    const created = await tasks.tasks.insert({
      tasklist: "@default",
      requestBody: { title, notes, due: dueDate },
    });
    return {
      content: [{ type: "text" as const, text: JSON.stringify(created.data) }],
      structuredContent: { task: created.data },
    };
  }

  if (action === "list") {
    const list = await tasks.tasks.list({ tasklist: "@default" });
    const items = list.data.items ?? [];
    return {
      content: [{ type: "text" as const, text: JSON.stringify(items) }],
      structuredContent: { tasks: items },
    };
  }

  if (action === "complete") {
    const completed = await tasks.tasks.patch({
      tasklist: "@default",
      task: taskId!,
      requestBody: { status: "completed" },
    });
    return {
      content: [{ type: "text" as const, text: JSON.stringify(completed.data) }],
      structuredContent: { task: completed.data },
    };
  }

  await tasks.tasks.delete({ tasklist: "@default", task: taskId! });
  return {
    content: [{ type: "text" as const, text: `Deleted reminder ${taskId}` }],
    structuredContent: { deleted: true, taskId },
  };
};
