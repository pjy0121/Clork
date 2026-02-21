# Clork - Claude + Work

Web-based Claude Code task management tool. Express + SQLite backend, React + Zustand frontend.

## Quick Reference

- **Docs**: `docs/` — ARCHITECTURE.md, API.md, DATABASE.md, CONVENTIONS.md
- **Backend**: `backend/src/` — Express routes + SQLite + Claude CLI integration
- **Frontend**: `frontend/src/` — React components + Zustand store
- **Dev**: `npm run dev` (both servers), Backend :3001, Frontend :5173
- **Test**: `npm run test` (root), or `npm run test` in backend/frontend separately

## Core Rules

4. **Localization (i18n)**: All user-facing text MUST use `react-i18next` (`useTranslation` hook). No hardcoded strings in components.
   - **English (en)**: Use Sentence case for labels/messages, Title Case for buttons/headers.
   - **Translation Files**: `frontend/src/i18n/locales/{en|ko}/translation.json`
5. **No manual session start**: Sessions auto-start when tasks are added to todo
6. **Model override**: Sessions can override project default model
7. **Multiple concurrent sessions**: Sessions can run in parallel

## Key Architecture

- **Data flow**: HTTP API → Express routes → SQLite → TaskRunner → ClaudeService → `claude` CLI (child_process)
- **Real-time**: Socket.IO for task progress streaming
- **State**: Zustand single store with localStorage persistence for activeProjectId/activeSessionId
- **Task lifecycle**: `backlog → todo → running → done`
- **Session lifecycle**: `idle → running → completed` (auto-transitions)
