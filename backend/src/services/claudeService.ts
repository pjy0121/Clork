import type { Server as SocketServer } from 'socket.io';
import type { ClaudeExecutionOptions, ClaudeStreamEvent } from '../types';
import type { ClaudeCallbacks, UsageData } from './claude/types';
import { createUsageState } from './claude/usageState';
import { LocalFileReader } from './claude/localFileReader';
import { UsageTracker } from './claude/usageTracker';
import { TaskExecutor } from './claude/taskExecutor';
import { UsagePolling } from './claude/usagePolling';

// Re-export all types for backward compatibility
export type {
  ClaudeCallbacks,
  RateLimitEntry,
  OverageInfo,
  AccountInfo,
  DailyActivity,
  ModelUsageStats,
  UsageData,
} from './claude/types';

/**
 * Thin facade that preserves the original ClaudeService public API.
 * All logic is delegated to sub-modules in ./claude/.
 */
class ClaudeService {
  private state = createUsageState();
  private localFileReader = new LocalFileReader(this.state);
  private usageTrackerModule = new UsageTracker(this.state, this.localFileReader);
  private taskExecutor = new TaskExecutor();
  private usagePolling = new UsagePolling(this.state, this.localFileReader, this.usageTrackerModule);

  constructor() {
    this.localFileReader.refreshLocalFiles();
  }

  setIO(io: SocketServer): void {
    this.state.io = io;
    this.usagePolling.startUsagePolling();
  }

  async pollUsageLive(): Promise<void> {
    return this.usagePolling.pollUsageLive();
  }

  trackEvent(taskId: string, event: ClaudeStreamEvent): void {
    this.usageTrackerModule.trackEvent(taskId, event);
  }

  trackTaskComplete(taskId: string, success: boolean): void {
    this.usageTrackerModule.trackTaskComplete(taskId, success);
  }

  checkStatus(): { installed: boolean; loggedIn: boolean; user: string | null; version: string | null } {
    return this.usageTrackerModule.checkStatus();
  }

  getUsage(): UsageData {
    return this.usageTrackerModule.getUsage();
  }

  executeTask(taskId: string, options: ClaudeExecutionOptions, callbacks: ClaudeCallbacks): void {
    this.taskExecutor.executeTask(taskId, options, callbacks);
  }

  abort(taskId: string): boolean {
    return this.taskExecutor.abort(taskId);
  }

  sendInput(taskId: string, input: string): boolean {
    return this.taskExecutor.sendInput(taskId, input);
  }

  hasRunningTasks(): boolean {
    return this.taskExecutor.hasRunningTasks();
  }

  getRunningTaskIds(): string[] {
    return this.taskExecutor.getRunningTaskIds();
  }
}

export const claudeService = new ClaudeService();
