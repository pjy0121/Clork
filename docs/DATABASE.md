# Database Schema

SQLite database at `backend/data/clork.db`. WAL mode enabled.

## Tables

### projects
| Column | Type | Default | Notes |
|--------|------|---------|-------|
| id | TEXT PK | | UUID |
| name | TEXT NOT NULL | | |
| rootDirectory | TEXT NOT NULL | | Absolute path |
| defaultModel | TEXT | 'claude-sonnet-4-20250514' | |
| permissionMode | TEXT | 'default' | 'plan' \| 'default' \| 'full' |
| autoProcessBacklog | INTEGER | 0 | 0=off, 1=on |
| maxTasksPerSession | INTEGER | 10 | Max tasks per auto-created session |
| createdAt | TEXT | datetime('now') | |
| updatedAt | TEXT | datetime('now') | |

### sessions
| Column | Type | Default | Notes |
|--------|------|---------|-------|
| id | TEXT PK | | UUID |
| projectId | TEXT NOT NULL | | FK → projects.id CASCADE |
| name | TEXT NOT NULL | | Default: #N |
| model | TEXT | NULL | Overrides project default |
| status | TEXT | 'idle' | idle/queued/running/completed/paused |
| sessionOrder | INTEGER NOT NULL | | Display order |
| claudeSessionId | TEXT | NULL | For `--resume` flag |
| createdAt/updatedAt | TEXT | datetime('now') | |

### tasks
| Column | Type | Default | Notes |
|--------|------|---------|-------|
| id | TEXT PK | | UUID |
| projectId | TEXT NOT NULL | | FK → projects.id CASCADE |
| sessionId | TEXT | NULL | FK → sessions.id CASCADE |
| prompt | TEXT NOT NULL | | User prompt for Claude |
| status | TEXT | 'pending' | pending/running/completed/failed/aborted |
| location | TEXT | 'backlog' | backlog/todo/done |
| taskOrder | INTEGER NOT NULL | | Order within location |
| startedAt | TEXT | NULL | |
| completedAt | TEXT | NULL | |
| createdAt/updatedAt | TEXT | datetime('now') | |

### task_events
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| taskId | TEXT NOT NULL | FK → tasks.id CASCADE |
| eventType | TEXT NOT NULL | system/assistant/tool_use/tool_result/result/error/human_input/raw/stderr/aborted |
| data | TEXT NOT NULL | JSON string |
| timestamp | TEXT | datetime('now') |

### settings
| Column | Type | Notes |
|--------|------|-------|
| key | TEXT PK | e.g., 'theme' |
| value | TEXT NOT NULL | e.g., 'dark' |

## Migrations

Migrations are run inline in `database.ts` after schema creation, before prepared statements:

```typescript
// Example: Adding model column to sessions
try { db.exec(`ALTER TABLE sessions ADD COLUMN model TEXT`); }
catch { /* Column already exists */ }
```

New migrations must be placed between the schema `db.exec()` block and the operations exports.
