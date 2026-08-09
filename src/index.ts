import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express, { Request, Response } from "express";
import { z } from "zod";
import chalk from "chalk";
import { google } from "googleapis";
import {
  applyRefreshTokenFromEnv,
  assertOAuthClientConfigured,
  createOAuth2Client,
  getGoogleAuthUrl,
  getOAuthRedirectUri,
} from "./googleAuth.js";
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
} from "./tools.js";

const auth = createOAuth2Client();
applyRefreshTokenFromEnv(auth);

const calendar = google.calendar({
  version: "v3",
  auth,
});
const keep = google.keep({
  version: "v1",
  auth,
});
const tasks = google.tasks({
  version: "v1",
  auth,
});

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ============================================================================
// MCP Server Setup
// ============================================================================

const server = new McpServer({
  name: "personal-productivity-manager",
  version: "1.0.0",
});
const isDev = process.env.NODE_ENV !== "production";

// Register a simple "hello" tool
server.registerTool(
  "hello",
  {
    title: "Hello Tool",
    description: "Returns a greeting message",
    inputSchema: {
      name: z.string().describe("Name to greet"),
    },
    outputSchema: {
      message: z.string(),
    },
  },
  async ({ name }:{name:string}) => {
    const output = { message: `Hello, ${name}! Welcome to MCP.` };
    return {
      content: [{ type: "text", text: JSON.stringify(output) }],
      structuredContent: output,
    };
  }
);

server.registerTool(
  "get_todays_events",
  {
    title: "Get Todays Events",
    description: "get todays events from google calender",
    inputSchema: {
      startOfDay: z.string().describe("ISO start of day"),
      endOfDay: z.string().describe("ISO end of day")
    }
  },
  async ({ startOfDay, endOfDay }:{startOfDay:string, endOfDay:string }) => {
   return getTodaysEvents({startOfDay,endOfDay,calendar})
  }
);

server.registerTool(
  "create_calendar_event",
  {
    title: "Create Calendar Event",
    description: "Creates a new event on the user's primary Google Calendar",
    inputSchema: {
      summary: z.string().describe("Event title"),
      description: z.string().optional().describe("Event description"),
      startDateTime: z.string().describe("ISO start date-time"),
      endDateTime: z.string().describe("ISO end date-time"),
      timeZone: z.string().optional().describe("IANA time zone, e.g. Asia/Dhaka"),
      attendees: z.array(z.string()).optional().describe("Attendee email addresses"),
    },
  },
  async ({ summary, description, startDateTime, endDateTime, timeZone, attendees }) => {
    return createCalendarEvent({
      summary,
      description,
      startDateTime,
      endDateTime,
      timeZone,
      attendees,
      calendar,
    });
  }
);

server.registerTool(
  "find_free_time_slot",
  {
    title: "Find Free Time Slot",
    description: "Finds free time slots of a given duration within a time range on the user's primary calendar",
    inputSchema: {
      startOfDay: z.string().describe("ISO start of range"),
      endOfDay: z.string().describe("ISO end of range"),
      durationMinutes: z.number().describe("Minimum free slot duration in minutes"),
    },
  },
  async ({ startOfDay, endOfDay, durationMinutes }) => {
    return findFreeTimeSlot({ startOfDay, endOfDay, durationMinutes, calendar });
  }
);

server.registerTool(
  "auto_schedule_meeting",
  {
    title: "Auto Schedule Meeting",
    description: "Finds the earliest free slot in a range and books a meeting there",
    inputSchema: {
      startOfDay: z.string().describe("ISO start of range"),
      endOfDay: z.string().describe("ISO end of range"),
      durationMinutes: z.number().describe("Meeting duration in minutes"),
      summary: z.string().describe("Event title"),
      description: z.string().optional().describe("Event description"),
      timeZone: z.string().optional().describe("IANA time zone, e.g. Asia/Dhaka"),
      attendees: z.array(z.string()).optional().describe("Attendee email addresses"),
    },
  },
  async ({ startOfDay, endOfDay, durationMinutes, summary, description, timeZone, attendees }) => {
    return autoScheduleMeeting({ startOfDay, endOfDay, durationMinutes, summary, description, timeZone, attendees, calendar });
  }
);

server.registerTool(
  "summarize_week_schedule",
  {
    title: "Summarize Week Schedule",
    description: "Summarizes all events between two dates on the user's primary calendar",
    inputSchema: {
      startOfWeek: z.string().describe("ISO start of week"),
      endOfWeek: z.string().describe("ISO end of week"),
    },
  },
  async ({ startOfWeek, endOfWeek }) => {
    return summarizeWeekSchedule({ startOfWeek, endOfWeek, calendar });
  }
);

server.registerTool(
  "create_keep_note",
  {
    title: "Create Keep Note",
    description: "Creates a new Google Keep note",
    inputSchema: {
      title: z.string().describe("Note title"),
      content: z.string().describe("Note content"),
    },
  },
  async ({ title, content }) => {
    return createKeepNote({ title, content, keep });
  }
);

server.registerTool(
  "get_keep_notes",
  {
    title: "Get Keep Notes",
    description: "Retrieves Google Keep notes, optionally filtered by a text query",
    inputSchema: {
      query: z.string().optional().describe("Text to filter notes by title/content"),
    },
  },
  async ({ query }) => {
    return getKeepNotes({ query, keep });
  }
);

server.registerTool(
  "delete_keep_note",
  {
    title: "Delete Keep Note",
    description: "Deletes a Google Keep note by its resource name/ID",
    inputSchema: {
      noteId: z.string().describe("Keep note resource name, e.g. notes/xxxxx"),
    },
  },
  async ({ noteId }) => {
    return deleteKeepNote({ noteId, keep });
  }
);

server.registerTool(
  "convert_note_to_task",
  {
    title: "Convert Note To Task",
    description: "Converts a Google Keep note into a Google Task",
    inputSchema: {
      noteId: z.string().describe("Keep note resource name, e.g. notes/xxxxx"),
      dueDate: z.string().optional().describe("ISO due date for the task"),
    },
  },
  async ({ noteId, dueDate }) => {
    return convertNoteToTask({ noteId, dueDate, keep, tasks });
  }
);

server.registerTool(
  "reminder_agent",
  {
    title: "Reminder Agent",
    description: "Creates, lists, completes, or deletes reminders (backed by Google Tasks)",
    inputSchema: {
      action: z.enum(["create", "list", "complete", "delete"]).describe("Action to perform"),
      title: z.string().optional().describe("Reminder title (for create)"),
      notes: z.string().optional().describe("Reminder notes (for create)"),
      dueDate: z.string().optional().describe("ISO due date (for create)"),
      taskId: z.string().optional().describe("Task ID (for complete/delete)"),
    },
  },
  async ({ action, title, notes, dueDate, taskId }) => {
    return reminderAgent({ action, title, notes, dueDate, taskId, tasks });
  }
);
const app = express();
app.use(express.json());

// Health check endpoint (required for Cloud Run)
app.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({ status: "healthy" });
});

// Google OAuth: open this in a browser once, then save GOOGLE_REFRESH_TOKEN to .env
app.get("/oauth/google", (_req: Request, res: Response) => {
  try {
    assertOAuthClientConfigured();
    res.redirect(302, getGoogleAuthUrl(auth));
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).type("text/plain").send(message);
  }
});

app.get("/oauth/google/callback", async (req: Request, res: Response) => {
  const err = typeof req.query.error === "string" ? req.query.error : undefined;
  if (err) {
    res.status(400).type("html").send(`<p>OAuth error: ${escapeHtml(err)}</p>`);
    return;
  }
  const code = typeof req.query.code === "string" ? req.query.code : undefined;
  if (!code) {
    res.status(400).type("text/plain").send("Missing authorization code.");
    return;
  }
  try {
    assertOAuthClientConfigured();
    const { tokens } = await auth.getToken(code);
    auth.setCredentials(tokens);
    const refresh = tokens.refresh_token;
    const html = refresh
      ? `<!DOCTYPE html>
            <html><head><meta charset="utf-8"><title>Google connected</title></head>
            <body>
              <p>Calendar access is authorized. Add this line to your <code>.env</code> and restart the server:</p>
              <pre id="r" style="word-break:break-all;background:#f4f4f4;padding:12px"></pre>
              <script>document.getElementById("r").textContent="GOOGLE_REFRESH_TOKEN=" + ${JSON.stringify(refresh)};</script>
              <p>If you already had a refresh token, replace the old value.</p>
            </body></html>`
                  : `<!DOCTYPE html>
            <html><head><meta charset="utf-8"><title>Google connected</title></head>
            <body>
              <p>Authorization succeeded, but Google did not return a new refresh token.</p>
              <p>Keep your existing <code>GOOGLE_REFRESH_TOKEN</code> in <code>.env</code>, or revoke app access in Google Account settings and try the link again.</p>
            </body></html>`;
    res.status(200).type("html").send(html);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).type("text/plain").send(`Token exchange failed: ${message}`);
  }
});

// MCP endpoint with dev logging
app.post("/mcp", async (req: Request, res: Response) => {
  const startTime = Date.now();
  const body = req.body;

  // Extract method and params from JSON-RPC request
  const method = body?.method || "unknown";
  const params = body?.params;


  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  // Capture response body for logging
  let responseBody = "";
  const originalWrite = res.write.bind(res) as typeof res.write;
  const originalEnd = res.end.bind(res) as typeof res.end;

  res.write = function (chunk: unknown, encodingOrCallback?: BufferEncoding | ((error: Error | null | undefined) => void), callback?: (error: Error | null | undefined) => void) {
    if (chunk) {
      responseBody += typeof chunk === "string" ? chunk : Buffer.from(chunk as ArrayBuffer).toString();
    }
    return originalWrite(chunk as string, encodingOrCallback as BufferEncoding, callback);
  };

  res.end = function (chunk?: unknown, encodingOrCallback?: BufferEncoding | (() => void), callback?: () => void) {
    if (chunk) {
      responseBody += typeof chunk === "string" ? chunk : Buffer.from(chunk as ArrayBuffer).toString();
    }

    return originalEnd(chunk as string, encodingOrCallback as BufferEncoding, callback);
  };

  res.on("close", () => {
    transport.close();
  });

  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

// JSON error handler (Express defaults to HTML errors)
app.use((_err: unknown, _req: Request, res: Response, _next: Function) => {
  res.status(500).json({ error: "Internal server error" });
});

// ============================================================================
// Start Server
// ============================================================================

const port = parseInt(process.env.PORT || "8080");
const httpServer = app.listen(port, () => {
  console.log();
  console.log(chalk.bold("MCP Server running on"), chalk.cyan(`http://localhost:${port}`));
  console.log(`  ${chalk.gray("Health:")} http://localhost:${port}/health`);
  console.log(`  ${chalk.gray("MCP:")}    http://localhost:${port}/mcp`);
  console.log(`  ${chalk.gray("OAuth:")} http://localhost:${port}/oauth/google`);
  console.log(
    `  ${chalk.gray("Redirect URI (add exactly in Google Cloud → Credentials → your OAuth client):")}`,
  );
  console.log(`  ${chalk.cyan(getOAuthRedirectUri())}`);

  if (!process.env.GOOGLE_REFRESH_TOKEN?.trim()) {
    console.log();
    console.log(
      chalk.yellow("No GOOGLE_REFRESH_TOKEN in env — open the OAuth URL above to authorize Calendar."),
    );
  }

  if (isDev) {
    console.log();
    console.log(chalk.gray("─".repeat(50)));
    console.log();
  }
});

// Graceful shutdown for Cloud Run (SIGTERM before kill)
process.on("SIGTERM", () => {
  console.log("Received SIGTERM, shutting down...");
  httpServer.close(() => {
    process.exit(0);
  });
});
