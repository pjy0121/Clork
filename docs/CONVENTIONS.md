# Coding Conventions

## General

- **Language**: TypeScript (strict mode) for both frontend and backend
- **UI Text**: Korean (한국어) for all user-facing strings
- **IDs**: UUID v4 via `crypto.randomUUID()`
- **Timestamps**: ISO 8601 strings via SQLite `datetime('now')`

## Backend

- **Framework**: Express with typed Request/Response
- **DB Access**: Prepared statements via `better-sqlite3` (synchronous)
- **Error Handling**: try/catch in every route handler, return `{error: string}` with appropriate status
- **Naming**: `camelCase` for variables/functions, `PascalCase` for types/interfaces
- **Exports**: Named exports for DB operations (`projectOps`, `sessionOps`, etc.), default export for routers

## Frontend

- **State**: Zustand store (`useStore`) — single store, no context providers
- **Components**: Function components with hooks, default export
- **Styling**: Tailwind CSS utility classes, dark mode via `dark:` prefix
- **Icons**: `lucide-react` library
- **Notifications**: `react-hot-toast`
- **Drag & Drop**: `@dnd-kit/core` + `@dnd-kit/sortable`

## File Conventions

- One component per file, filename matches component name
- Types shared between frontend/backend are defined separately in each `types.ts`
- API client functions mirror backend route structure

## Workflow

- **TDD 적용 기준**: See `CLAUDE.md` Core Rule #2 for detailed criteria.
- **Post-change**: 핵심 로직 변경 후에만 테스트 실행. 문서는 필요 시에만 업데이트.
