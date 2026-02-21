# Clork Architecture

> Claude + Work: Web-based Claude Code task management tool

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Zustand 5, Vite 6, Tailwind CSS 3, @dnd-kit |
| Backend | Express 4, Socket.IO 4, better-sqlite3 |
| AI Integration | Claude Code CLI (spawned as child process) |
| Language | TypeScript 5 (strict mode) |

## System Diagram

```
Browser (React + Zustand)
  │
  ├── HTTP (fetch) ──► Express Routes ──► SQLite (better-sqlite3)
  │                         │
  └── WebSocket ◄──── Socket.IO ◄──── TaskRunner ◄──── ClaudeService
       (real-time)                        │                   │
                                          │              Claude CLI
                                          │              (child_process)
                                          └──► DB Updates
```

## Data Flow

1. **User Action** → Frontend API call → Express route → SQLite write
2. **Task Execution** → TaskRunner.processSession() → ClaudeService.executeTask() → spawn `claude` CLI
3. **Streaming** → Claude CLI writes JSONL to temp file → ClaudeService polls file → Socket.IO emit → Zustand store update → React re-render

## Core Concepts

- **Project**: Working directory + default model + permission mode + auto-process settings
- **Session**: Ordered queue of tasks within a project. Multiple sessions can run concurrently.
- **Task**: A prompt sent to Claude. Flows: `backlog → todo → (running) → done`
- **TaskEvent**: Streamed output from Claude CLI execution (assistant, tool_use, result, etc.)
- **Auto-process**: Projects can auto-create sessions from backlog tasks (when enabled)

## Directory Structure

```
Clork/
├── backend/src/
│   ├── index.ts              # Express + Socket.IO server
│   ├── database.ts           # SQLite schema + prepared statements
│   ├── types.ts              # Shared TypeScript interfaces
│   ├── routes/               # REST API endpoints
│   │   ├── projects.ts
│   │   ├── sessions.ts
│   │   ├── tasks.ts
│   │   └── settings.ts
│   └── services/
│       ├── claudeService.ts  # Claude CLI execution + streaming
│       └── taskRunner.ts     # Session/task orchestration
├── frontend/src/
│   ├── main.tsx              # Entry point
│   ├── App.tsx               # Root component + Socket.IO listeners
│   ├── api.ts                # HTTP API client
│   ├── store.ts              # Zustand global state
│   ├── socket.ts             # Socket.IO client
│   ├── types.ts              # Frontend type definitions
│   └── components/
│       ├── Header.tsx
│       ├── UnifiedSidebar.tsx # Project + Session + Backlog
│       ├── SessionView.tsx    # Todo/Done kanban board
│       ├── TaskCard.tsx
│       ├── TaskDetailModal.tsx
│       ├── HumanInTheLoop.tsx
│       ├── SettingsModal.tsx
│       ├── ProjectSettingsModal.tsx
│       └── LoginPrompt.tsx
└── docs/                     # This documentation
```
