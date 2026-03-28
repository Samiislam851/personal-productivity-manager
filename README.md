# personal-productivity-manager

[![MCPize](https://mcpize.com/badge/@mcpize/mcpize?type=hosted)](https://mcpize.com)

A Model Context Protocol (MCP) server that provides tools for personal productivity management, including calendar events, notes, and intelligent scheduling.

## Quick Start

```bash
npm install
npm run dev     # Start with hot reload
```

Server runs at `http://localhost:8080/mcp`

## Development

```bash
npm run dev     # Development mode with hot reload
npm run build   # Compile TypeScript
npm test        # Run tests
npm start       # Run compiled server
```

## Project Structure

```
├── src/
│   ├── index.ts        # MCP server entry point
│   └── tools.ts        # Pure tool functions (testable)
├── tests/
│   └── tools.test.ts   # Tool unit tests
├── package.json        # Dependencies and scripts
├── tsconfig.json       # TypeScript configuration
├── mcpize.yaml         # MCPize deployment manifest
├── Dockerfile          # Container build
└── .env.example        # Environment variables template
```

## Tools

### Calendar Management

- **get_today_events** — Retrieves today's scheduled events
  - Example output:
    ```
    10:00 AM — Team meeting
    02:00 PM — Client call
    06:00 PM — Gym
    ```

- **create_calendar_event** — Creates a new calendar event
  - Example: User says "Schedule meeting tomorrow at 3 PM with design team"
  - Agent calls: `create_calendar_event`

- **search_calendar_events** — Searches for calendar events by query
  - Example: query "meeting"
  - Output: List of matching events

- **find_free_time_slot** — Finds available time slots in the calendar

- **auto_schedule_meeting** — Automatically schedules meetings based on availability

- **summarize_week_schedule** — Provides a summary of the week's schedule

### Notes Management

- **create_keep_note** — Creates a new note
  - Example:
    - Title: Startup idea
    - Content: AI powered resume reviewer
  - Output: Note saved

- **get_keep_notes** — Retrieves notes, optionally filtered by query
  - Example: query "startup"
  - Output: Matching notes

- **delete_keep_note** — Deletes a note by ID
  - Input: note_id
  - Output: Note deleted

- **convert_note_to_task** — Converts a note into a scheduled task

### Reminders

- **reminder_agent** — Manages reminders and notifications

## Testing

```bash
npm test                                  # Run unit tests
npx @anthropic-ai/mcp-inspector          # Interactive MCP testing
```

Connect to `http://localhost:8080/mcp` to test tools interactively.

## Deployment

```bash
mcpize deploy
```

## License

MIT
