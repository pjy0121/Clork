# Clork (Claude + Work)

Web-based task management tool for [Claude Code](https://docs.anthropic.com/en/docs/claude-code). Create projects, organize tasks into sessions, and let Claude execute them — with real-time streaming output via WebSocket.

## Features

- **Project Management** — Group tasks by working directory with configurable Claude model and permission mode
- **Session-based Execution** — Organize tasks into ordered sessions that auto-start when tasks are queued
- **Real-time Streaming** — Watch Claude's output live via Socket.IO as tasks execute
- **Drag & Drop** — Reorder tasks and move them between backlog, todo, and done
- **Multiple Concurrent Sessions** — Run several sessions in parallel
- **Human-in-the-Loop** — Intervene during task execution when Claude needs input

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Zustand 5, Vite, Tailwind CSS, @dnd-kit |
| Backend | Express, Socket.IO, better-sqlite3 (SQLite) |
| AI | Claude Code CLI (`claude`) via child_process |
| Language | TypeScript (strict mode) |

## Prerequisites

- **Node.js** 18+
- **Claude Code CLI** — Install via `npm install -g @anthropic-ai/claude-code`
- Claude Code must be authenticated (`claude login`)

## Getting Started

```bash
# Clone
git clone https://github.com/pjy0121/Clork.git
cd Clork

# Install dependencies
npm install
cd backend && npm install
cd ../frontend && npm install
cd ..

# Start development servers
npm run dev
```

- Frontend: http://localhost:5173
- Backend API: http://localhost:3001

## Architecture

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

**Task lifecycle**: `backlog → todo → running → done`

**Session lifecycle**: `idle → running → completed` (auto-transitions)

See [`docs/`](docs/) for detailed documentation:
- [Architecture](docs/ARCHITECTURE.md) — System structure and data flow
- [API](docs/API.md) — REST endpoints and WebSocket events
- [Database](docs/DATABASE.md) — SQLite schema
- [Conventions](docs/CONVENTIONS.md) — Coding standards

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start both servers (backend + frontend) |
| `npm run build` | Build for production |
| `npm run test` | Run all tests (backend + frontend) |
| `npm run test:backend` | Run backend tests only |
| `npm run test:frontend` | Run frontend tests only |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

[MIT](LICENSE)
