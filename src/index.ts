import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express, { Request, Response } from "express";
import { z } from "zod";
import chalk from "chalk";
import { google } from "googleapis";

console.log('hey---',process.env.CLIENT_ID)

const auth = new google.auth.OAuth2(
  process.env.CLIENT_ID,
  process.env.CLIENT_SECRET,
  "http://localhost:3000/oauth/callback"
);

const calendar = google.calendar({
  version: "v3",
  auth
});


const events = await calendar.events.list({
  calendarId: "primary"
});

console.log('events.data.items');

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
  async ({ name }) => {
    const output = { message: `Hello, ${name}! Welcome to MCP.` };
    return {
      content: [{ type: "text", text: JSON.stringify(output) }],
      structuredContent: output,
    };
  }
);


// server.registerTool(
//   "get_todays_events",
//   {
//     title: "Get Todays Events",
//     description: "get todays events from google calender",
//     inputSchema: {

//     }
//   },
//   async ({ name }) => {
//     const output = { message: `Hello, ${name}! Welcome to MCP.` };
//     return {
//       content: [{ type: "text", text: JSON.stringify(output) }],
//       structuredContent: output,
//     };
//   }
// )
// ============================================================================
// Express App Setup
// ============================================================================

const app = express();
app.use(express.json());

// Health check endpoint (required for Cloud Run)
app.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({ status: "healthy" });
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
