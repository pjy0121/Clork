# REST API Reference

Base URL: `http://localhost:3001/api`

## Projects

| Method | Path | Body | Description |
|--------|------|------|-------------|
| GET | /projects | | List all projects |
| GET | /projects/:id | | Get project |
| POST | /projects | `{name, rootDirectory, defaultModel?, permissionMode?}` | Create project |
| PUT | /projects/:id | `{name?, rootDirectory?, defaultModel?, permissionMode?, autoProcessBacklog?, maxTasksPerSession?}` | Update project |
| DELETE | /projects/:id | | Delete project + cascade |

## Sessions

| Method | Path | Body | Description |
|--------|------|------|-------------|
| GET | /sessions?projectId= | | List sessions for project |
| GET | /sessions/:id | | Get session |
| POST | /sessions | `{projectId, name, model?}` | Create session |
| PUT | /sessions/:id | `{name?, sessionOrder?, status?}` | Update session |
| POST | /sessions/:id/start | | Start session processing |
| POST | /sessions/reorder | `{sessionOrders: [{id, sessionOrder}]}` | Reorder sessions |
| DELETE | /sessions/:id | | Delete session (aborts running tasks) |

## Tasks

| Method | Path | Body | Description |
|--------|------|------|-------------|
| GET | /tasks?projectId=&location? | | List tasks (filter by location) |
| GET | /tasks?sessionId=&location? | | List tasks for session |
| GET | /tasks/:id | | Get task |
| GET | /tasks/:id/events | | Get task events |
| POST | /tasks | `{projectId, sessionId?, prompt, location?}` | Create task |
| PUT | /tasks/:id | `{prompt?, taskOrder?}` | Update task |
| POST | /tasks/:id/move | `{location, sessionId?, taskOrder?}` | Move task |
| POST | /tasks/:id/abort | | Abort running task |
| POST | /tasks/:id/rerun | `{sessionId?}` | Re-run as new task |
| POST | /tasks/:id/human-response | `{response}` | Send human input |
| POST | /tasks/reorder | `{taskOrders: [{id, taskOrder}]}` | Reorder tasks |
| DELETE | /tasks/:id | | Delete task |

**Auto-start**: Moving a task to `todo` automatically triggers `processSession()` if the session is idle/running/completed.

## Settings

| Method | Path | Body | Description |
|--------|------|------|-------------|
| GET | /settings | | Get theme |
| PUT | /settings | `{theme?}` | Update theme |
| GET | /settings/claude-status | | Check Claude CLI status |

## WebSocket Events (Socket.IO)

### Server → Client
| Event | Payload | When |
|-------|---------|------|
| task:started | `{taskId, sessionId, task}` | Task begins execution |
| task:progress | `{taskId, event: TaskEvent}` | Each Claude CLI output event |
| task:completed | `{taskId, sessionId, task, result}` | Task finishes successfully |
| task:failed | `{taskId, sessionId, task, error}` | Task fails |
| task:aborted | `{taskId, sessionId, task}` | Task manually aborted |
| task:humanInput | `{taskId, sessionId, prompt}` | Claude needs human input |
| session:updated | `Session` | Session status change |
| claude:status | `{loggedIn, user?}` | Claude CLI status update |

### Client → Server
| Event | Payload | Action |
|-------|---------|--------|
| task:abort | `{taskId}` | Abort running task |
| task:humanResponse | `{taskId, response}` | Send human input |
| session:start | `{sessionId}` | Start session |
