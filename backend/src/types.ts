// ========== Project ==========
export interface Project {
  id: string;
  name: string;
  rootDirectory: string;
  defaultModel: string;
  permissionMode: 'plan' | 'default' | 'full';
  autoProcessBacklog: boolean;
  maxTasksPerSession: number;
  createdAt: string;
  updatedAt: string;
}

// ========== Session ==========
export type SessionStatus = 'idle' | 'queued' | 'running' | 'completed' | 'paused';

export interface Session {
  id: string;
  projectId: string;
  name: string;
  model: string | null;
  status: SessionStatus;
  sessionOrder: number;
  claudeSessionId: string | null;
  nextSessionId: string | null;
  createdAt: string;
  updatedAt: string;
}

// ========== Task ==========
export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'aborted';
export type TaskLocation = 'queue' | 'backlog' | 'todo' | 'done';

export interface Task {
  id: string;
  projectId: string;
  sessionId: string | null;
  prompt: string;
  status: TaskStatus;
  location: TaskLocation;
  taskOrder: number;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

// ========== Task Event ==========
export type TaskEventType =
  | 'system'
  | 'assistant'
  | 'tool_use'
  | 'tool_result'
  | 'result'
  | 'error'
  | 'human_input'
  | 'raw'
  | 'stderr'
  | 'aborted';

export interface TaskEvent {
  id: string;
  taskId: string;
  eventType: TaskEventType;
  data: string; // JSON string
  timestamp: string;
}

// ========== Settings ==========
export interface AppSettings {
  theme: 'light' | 'dark';
  claudeLoggedIn: boolean;
  claudeUser: string | null;
}

// ========== Claude Code Integration ==========
export interface ClaudeExecutionOptions {
  prompt: string;
  model: string;
  cwd: string;
  permissionMode: 'plan' | 'default' | 'full';
  claudeSessionId?: string | null;
}

export interface ClaudeStreamEvent {
  type: string;
  subtype?: string;
  message?: any;
  result?: string;
  session_id?: string;
  cost_usd?: number;
  duration_ms?: number;
  [key: string]: any;
}

// ========== WebSocket Events ==========
export interface ServerToClientEvents {
  'task:started': (data: { taskId: string; sessionId: string }) => void;
  'task:progress': (data: { taskId: string; event: TaskEvent }) => void;
  'task:completed': (data: { taskId: string; sessionId: string; result?: any }) => void;
  'task:failed': (data: { taskId: string; sessionId: string; error?: string }) => void;
  'task:aborted': (data: { taskId: string; sessionId: string }) => void;
  'task:humanInput': (data: { taskId: string; sessionId: string; prompt: string }) => void;
  'session:updated': (data: Session) => void;
  'project:updated': (data: Project) => void;
  'claude:status': (data: { loggedIn: boolean; user?: string }) => void;
}

export interface ClientToServerEvents {
  'task:abort': (data: { taskId: string }) => void;
  'task:humanResponse': (data: { taskId: string; response: string }) => void;
  'session:start': (data: { sessionId: string }) => void;
}
