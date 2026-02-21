export interface ClaudeCallbacks {
  onData: (event: import('../../types').ClaudeStreamEvent) => void;
  onComplete: (result: any) => void;
  onError: (error: any) => void;
  onHumanInput: (data: any) => void;
}

/** Rate limit entry from rate_limit_event */
export interface RateLimitEntry {
  status: string;         // 'allowed' | 'rejected' | 'limited'
  resetsAt: number | null; // Unix timestamp (seconds)
  rateLimitType: string;   // 'five_hour' | 'seven_day_sonnet' | 'seven_day_opus' | 'seven_day'
  utilization: number | null; // 0-100 percentage, null if unknown
}

/** Overage (추가 사용량) info from rate_limit_event */
export interface OverageInfo {
  overageStatus: string;  // 'rejected' | 'accepted' | 'unknown'
  isUsingOverage: boolean;
  overageDisabledReason: string | null;
}

/** Account info from claude auth status + credentials */
export interface AccountInfo {
  email: string | null;
  orgId: string | null;
  orgName: string | null;
  subscriptionType: string | null;  // 'free' | 'pro' | 'max' | 'team'
  rateLimitTier: string | null;     // e.g. 'default_claude_max_5x'
  authMethod: string | null;
}

/** Claude Code stats-cache.json daily activity */
export interface DailyActivity {
  date: string;
  messageCount: number;
  sessionCount: number;
  toolCallCount: number;
}

/** Claude Code stats-cache.json model usage */
export interface ModelUsageStats {
  [model: string]: {
    inputTokens: number;
    outputTokens: number;
    cacheReadInputTokens: number;
    cacheCreationInputTokens: number;
    costUSD: number;
  };
}

export interface UsageData {
  // Account info (from credentials + auth status)
  account: AccountInfo;
  // Rate limits from rate_limit_event (multiple types)
  rateLimits: RateLimitEntry[];
  // Overage from rate_limit_event
  overage: OverageInfo;
  // Claude Code local stats (from ~/.claude/stats-cache.json)
  localStats: {
    totalSessions: number;
    totalMessages: number;
    dailyActivity: DailyActivity[];
    modelUsage: ModelUsageStats;
    firstSessionDate: string | null;
  };
  // Accumulated cost from Clork task executions
  clorkStats: {
    totalCostUsd: number;
    taskCount: number;
    completedTasks: number;
    failedTasks: number;
    totalDurationMs: number;
    recentTasks: Array<{ taskId: string; costUsd: number; durationMs: number; timestamp: string }>;
  };
  lastUpdatedAt: string;
}
