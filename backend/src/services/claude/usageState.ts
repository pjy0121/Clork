import type { Server as SocketServer } from 'socket.io';
import type { AccountInfo, DailyActivity, ModelUsageStats } from './types';

/** Cached local stats from ~/.claude/stats-cache.json */
export interface LocalStatsData {
  totalSessions: number;
  totalMessages: number;
  dailyActivity: DailyActivity[];
  modelUsage: ModelUsageStats;
  firstSessionDate: string | null;
}

/** Real-time tracking data accumulated during task execution */
export interface UsageTrackerData {
  taskCosts: Map<string, { costUsd: number; durationMs: number; timestamp: string }>;
  totalCostUsd: number;
  taskCount: number;
  completedTasks: number;
  failedTasks: number;
  totalDurationMs: number;
  rateLimits: Map<string, { status: string; resetsAt: number | null; utilization: number | null }>;
  overage: {
    overageStatus: string;
    isUsingOverage: boolean;
    overageDisabledReason: string | null;
  };
  lastUpdatedAt: string;
}

/** Shared mutable state passed to all claude sub-modules */
export interface UsageState {
  io: SocketServer | null;
  accountInfo: AccountInfo;
  localStats: LocalStatsData;
  localFilesLastRead: number;
  usageTracker: UsageTrackerData;
}

/** Create a fresh UsageState with default values */
export function createUsageState(): UsageState {
  return {
    io: null,
    accountInfo: {
      email: null,
      orgId: null,
      orgName: null,
      subscriptionType: null,
      rateLimitTier: null,
      authMethod: null,
    },
    localStats: {
      totalSessions: 0,
      totalMessages: 0,
      dailyActivity: [],
      modelUsage: {},
      firstSessionDate: null,
    },
    localFilesLastRead: 0,
    usageTracker: {
      taskCosts: new Map(),
      totalCostUsd: 0,
      taskCount: 0,
      completedTasks: 0,
      failedTasks: 0,
      totalDurationMs: 0,
      rateLimits: new Map(),
      overage: {
        overageStatus: 'unknown',
        isUsingOverage: false,
        overageDisabledReason: null,
      },
      lastUpdatedAt: new Date().toISOString(),
    },
  };
}
