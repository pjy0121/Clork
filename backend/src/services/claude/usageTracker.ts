import { execSync } from 'child_process';
import type { ClaudeStreamEvent } from '../../types';
import type { UsageData, RateLimitEntry } from './types';
import type { UsageState } from './usageState';
import type { LocalFileReader } from './localFileReader';

export class UsageTracker {
  constructor(
    private state: UsageState,
    private localFileReader: LocalFileReader,
  ) {}

  /**
   * Track a stream event for usage accumulation.
   * Called from taskRunner for every event received from Claude CLI.
   */
  trackEvent(taskId: string, event: ClaudeStreamEvent): void {
    // Track rate limit info — store per rateLimitType
    if (event.type === 'rate_limit_event' && event.rate_limit_info) {
      this.processRateLimitInfo(event.rate_limit_info);
    }

    // Track cost from result events
    if (event.type === 'result') {
      const costUsd = event.cost_usd || 0;
      const durationMs = event.duration_ms || 0;

      this.state.usageTracker.taskCosts.set(taskId, {
        costUsd,
        durationMs,
        timestamp: new Date().toISOString(),
      });

      // Recalculate totals from all tasks
      let totalCost = 0;
      let totalDuration = 0;
      for (const [, data] of this.state.usageTracker.taskCosts) {
        totalCost += data.costUsd;
        totalDuration += data.durationMs;
      }
      this.state.usageTracker.totalCostUsd = totalCost;
      this.state.usageTracker.totalDurationMs = totalDuration;
      this.state.usageTracker.lastUpdatedAt = new Date().toISOString();
    }
  }

  /**
   * Track task completion for usage stats.
   */
  trackTaskComplete(taskId: string, success: boolean): void {
    this.state.usageTracker.taskCount++;
    if (success) this.state.usageTracker.completedTasks++;
    else this.state.usageTracker.failedTasks++;
    this.state.usageTracker.lastUpdatedAt = new Date().toISOString();
  }

  /**
   * Process rate limit info from a rate_limit_event (from task execution CLI events).
   * CLI events have utilization as 0-1 fraction. We convert to 0-100.
   */
  processRateLimitInfo(info: any): void {
    const key = info.rateLimitType || 'unknown';

    // CLI utilization is 0-1, convert to 0-100 for consistency
    let utilization: number | null = null;
    if (info.utilization !== undefined && info.utilization !== null) {
      utilization = typeof info.utilization === 'number'
        ? (info.utilization <= 1.5 ? info.utilization * 100 : info.utilization) // 0-1 → 0-100
        : null;
    }

    this.state.usageTracker.rateLimits.set(key, {
      status: info.status || 'unknown',
      resetsAt: info.resetsAt ?? null,
      utilization,
    });

    if (info.overageStatus !== undefined) {
      this.state.usageTracker.overage = {
        overageStatus: info.overageStatus || 'unknown',
        isUsingOverage: !!info.isUsingOverage,
        overageDisabledReason: info.overageDisabledReason || null,
      };
    }

    this.state.usageTracker.lastUpdatedAt = new Date().toISOString();

    console.log(
      `[UsageTracker] Rate limit (CLI) — type: ${key}, status: ${info.status}, ` +
      `utilization: ${utilization !== null ? utilization.toFixed(1) : 'N/A'}%, ` +
      `resetsAt: ${info.resetsAt ? new Date(info.resetsAt * 1000).toLocaleTimeString() : 'N/A'}`
    );
  }

  /**
   * Check if Claude Code CLI is installed and user is logged in
   */
  checkStatus(): { installed: boolean; loggedIn: boolean; user: string | null; version: string | null } {
    try {
      const result = execSync('claude --version', {
        encoding: 'utf-8',
        timeout: 10000,
        shell: true as any,
      }).trim();
      console.log('[UsageTracker] CLI version:', result);

      // Also refresh local files on status check
      this.localFileReader.refreshLocalFiles();

      return {
        installed: true,
        loggedIn: true,
        user: this.state.accountInfo.email || 'Claude User',
        version: result,
      };
    } catch (e: any) {
      console.error('[UsageTracker] CLI not found:', e.message);
      return { installed: false, loggedIn: false, user: null, version: null };
    }
  }

  /**
   * Get full usage data: account + rate limits + local stats + clork stats.
   */
  getUsage(): UsageData {
    // Refresh local files (cached 30s)
    this.localFileReader.refreshLocalFiles();

    // Build rate limits list
    const rateLimits: RateLimitEntry[] = [];
    for (const [type, data] of this.state.usageTracker.rateLimits) {
      rateLimits.push({
        status: data.status,
        resetsAt: data.resetsAt,
        rateLimitType: type,
        utilization: data.utilization,
      });
    }

    // Build recent tasks list (last 50)
    const recentTasks: UsageData['clorkStats']['recentTasks'] = [];
    for (const [taskId, data] of this.state.usageTracker.taskCosts) {
      recentTasks.push({ taskId, ...data });
    }
    recentTasks.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return {
      account: { ...this.state.accountInfo },
      rateLimits,
      overage: { ...this.state.usageTracker.overage },
      localStats: { ...this.state.localStats },
      clorkStats: {
        totalCostUsd: this.state.usageTracker.totalCostUsd,
        taskCount: this.state.usageTracker.taskCount,
        completedTasks: this.state.usageTracker.completedTasks,
        failedTasks: this.state.usageTracker.failedTasks,
        totalDurationMs: this.state.usageTracker.totalDurationMs,
        recentTasks: recentTasks.slice(0, 50),
      },
      lastUpdatedAt: this.state.usageTracker.lastUpdatedAt,
    };
  }
}
