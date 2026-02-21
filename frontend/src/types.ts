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
  | 'aborted'
  | 'rate_limit_event'
  | 'tool';

export interface TaskEvent {
  id: string;
  taskId: string;
  eventType: TaskEventType;
  data: string; // JSON string
  timestamp: string;
}

// ========== Parsed event data helpers ==========
export interface ParsedEventData {
  type?: string;
  subtype?: string;
  text?: string;
  error?: string;
  message?: {
    content?: Array<{
      type: string;
      text?: string;
      thinking?: string;
      name?: string;
      input?: any;
    }>;
    model?: string;
  };
  content?: any;
  result?: string;
  cost_usd?: number;
  total_cost_usd?: number;
  duration_ms?: number;
  num_turns?: number;
  session_id?: string;
  model?: string;
  prompt?: string;
  exitCode?: number;
  rate_limit_info?: any;
  [key: string]: any;
}

// ========== Claude Usage ==========
export interface RateLimitEntry {
  status: string;           // 'allowed' | 'rejected' | 'limited'
  resetsAt: number | null;  // Unix timestamp (seconds)
  rateLimitType: string;    // 'five_hour' | 'seven_day_sonnet' | 'seven_day_opus' | 'seven_day'
  utilization: number | null; // 0-100 percentage, null if unknown
}

export interface OverageInfo {
  overageStatus: string;     // 'rejected' | 'accepted' | 'unknown'
  isUsingOverage: boolean;
  overageDisabledReason: string | null;
}

export interface AccountInfo {
  email: string | null;
  orgId: string | null;
  orgName: string | null;
  subscriptionType: string | null;  // 'free' | 'pro' | 'max' | 'team'
  rateLimitTier: string | null;
  authMethod: string | null;
}

export interface DailyActivity {
  date: string;
  messageCount: number;
  sessionCount: number;
  toolCallCount: number;
}

export interface ModelUsageStats {
  [model: string]: {
    inputTokens: number;
    outputTokens: number;
    cacheReadInputTokens: number;
    cacheCreationInputTokens: number;
    costUSD: number;
  };
}

export interface ClaudeUsage {
  account: AccountInfo;
  rateLimits: RateLimitEntry[];
  overage: OverageInfo;
  localStats: {
    totalSessions: number;
    totalMessages: number;
    dailyActivity: DailyActivity[];
    modelUsage: ModelUsageStats;
    firstSessionDate: string | null;
  };
  clorkStats: {
    totalCostUsd: number;
    taskCount: number;
    completedTasks: number;
    failedTasks: number;
    totalDurationMs: number;
    recentTasks: Array<{
      taskId: string;
      costUsd: number;
      durationMs: number;
      timestamp: string;
    }>;
  };
  lastUpdatedAt: string;
}
