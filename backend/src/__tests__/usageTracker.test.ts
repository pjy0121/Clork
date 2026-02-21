import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UsageTracker } from '../services/claude/usageTracker';
import { createUsageState, UsageState } from '../services/claude/usageState';
import { LocalFileReader } from '../services/claude/localFileReader';
import * as child_process from 'child_process';

vi.mock('child_process');
vi.mock('fs');

const mockCp = vi.mocked(child_process);

describe('UsageTracker', () => {
  let state: UsageState;
  let mockReader: LocalFileReader;
  let tracker: UsageTracker;

  beforeEach(() => {
    vi.resetAllMocks();
    state = createUsageState();
    mockReader = { refreshLocalFiles: vi.fn() } as any;
    tracker = new UsageTracker(state, mockReader);
  });

  describe('trackEvent', () => {
    it('should process rate_limit_event and store rate limits', () => {
      tracker.trackEvent('task-1', {
        type: 'rate_limit_event',
        rate_limit_info: {
          rateLimitType: 'five_hour',
          status: 'allowed',
          utilization: 0.42,
          resetsAt: 1700000000,
        },
      });

      const rl = state.usageTracker.rateLimits.get('five_hour');
      expect(rl).toBeDefined();
      expect(rl!.status).toBe('allowed');
      expect(rl!.utilization).toBe(42); // 0.42 * 100
      expect(rl!.resetsAt).toBe(1700000000);
    });

    it('should track cost from result events', () => {
      tracker.trackEvent('task-1', {
        type: 'result',
        cost_usd: 0.05,
        duration_ms: 5000,
      });

      expect(state.usageTracker.totalCostUsd).toBe(0.05);
      expect(state.usageTracker.totalDurationMs).toBe(5000);
      expect(state.usageTracker.taskCosts.has('task-1')).toBe(true);
    });

    it('should recalculate totals across multiple tasks', () => {
      tracker.trackEvent('task-1', { type: 'result', cost_usd: 0.05, duration_ms: 3000 });
      tracker.trackEvent('task-2', { type: 'result', cost_usd: 0.10, duration_ms: 7000 });

      expect(state.usageTracker.totalCostUsd).toBeCloseTo(0.15);
      expect(state.usageTracker.totalDurationMs).toBe(10000);
    });

    it('should ignore events that are not rate_limit_event or result', () => {
      const before = { ...state.usageTracker };
      tracker.trackEvent('task-1', { type: 'assistant', message: 'hello' });
      expect(state.usageTracker.totalCostUsd).toBe(before.totalCostUsd);
    });
  });

  describe('processRateLimitInfo', () => {
    it('should convert 0-1 utilization to 0-100', () => {
      tracker.processRateLimitInfo({
        rateLimitType: 'seven_day',
        status: 'allowed',
        utilization: 0.75,
      });

      expect(state.usageTracker.rateLimits.get('seven_day')!.utilization).toBe(75);
    });

    it('should keep already-percentage values (> 1.5) as-is', () => {
      tracker.processRateLimitInfo({
        rateLimitType: 'five_hour',
        status: 'allowed',
        utilization: 85, // already percentage
      });

      expect(state.usageTracker.rateLimits.get('five_hour')!.utilization).toBe(85);
    });

    it('should update overage info when present', () => {
      tracker.processRateLimitInfo({
        rateLimitType: 'five_hour',
        status: 'rejected',
        overageStatus: 'accepted',
        isUsingOverage: true,
        overageDisabledReason: null,
      });

      expect(state.usageTracker.overage.overageStatus).toBe('accepted');
      expect(state.usageTracker.overage.isUsingOverage).toBe(true);
    });

    it('should default rateLimitType to unknown', () => {
      tracker.processRateLimitInfo({ status: 'allowed' });
      expect(state.usageTracker.rateLimits.has('unknown')).toBe(true);
    });
  });

  describe('trackTaskComplete', () => {
    it('should increment taskCount and completedTasks on success', () => {
      tracker.trackTaskComplete('task-1', true);
      expect(state.usageTracker.taskCount).toBe(1);
      expect(state.usageTracker.completedTasks).toBe(1);
      expect(state.usageTracker.failedTasks).toBe(0);
    });

    it('should increment taskCount and failedTasks on failure', () => {
      tracker.trackTaskComplete('task-1', false);
      expect(state.usageTracker.taskCount).toBe(1);
      expect(state.usageTracker.completedTasks).toBe(0);
      expect(state.usageTracker.failedTasks).toBe(1);
    });
  });

  describe('checkStatus', () => {
    it('should return installed/loggedIn when CLI responds', () => {
      mockCp.execSync.mockReturnValue('1.0.20');
      state.accountInfo.email = 'user@test.com';

      const result = tracker.checkStatus();

      expect(result.installed).toBe(true);
      expect(result.loggedIn).toBe(true);
      expect(result.version).toBe('1.0.20');
      expect(result.user).toBe('user@test.com');
      expect(mockReader.refreshLocalFiles).toHaveBeenCalled();
    });

    it('should return not installed when CLI fails', () => {
      mockCp.execSync.mockImplementation(() => { throw new Error('not found'); });

      const result = tracker.checkStatus();

      expect(result.installed).toBe(false);
      expect(result.loggedIn).toBe(false);
      expect(result.user).toBeNull();
      expect(result.version).toBeNull();
    });
  });

  describe('getUsage', () => {
    it('should assemble full UsageData from state', () => {
      state.accountInfo.email = 'user@test.com';
      state.usageTracker.rateLimits.set('five_hour', {
        status: 'allowed', resetsAt: 1700000000, utilization: 42,
      });
      state.usageTracker.taskCosts.set('task-1', {
        costUsd: 0.05, durationMs: 3000, timestamp: '2025-01-01T00:00:00Z',
      });
      state.usageTracker.totalCostUsd = 0.05;
      state.usageTracker.taskCount = 1;
      state.usageTracker.completedTasks = 1;

      const usage = tracker.getUsage();

      expect(usage.account.email).toBe('user@test.com');
      expect(usage.rateLimits).toHaveLength(1);
      expect(usage.rateLimits[0].rateLimitType).toBe('five_hour');
      expect(usage.clorkStats.totalCostUsd).toBe(0.05);
      expect(usage.clorkStats.recentTasks).toHaveLength(1);
      expect(mockReader.refreshLocalFiles).toHaveBeenCalled();
    });

    it('should limit recentTasks to 50', () => {
      for (let i = 0; i < 60; i++) {
        state.usageTracker.taskCosts.set(`task-${i}`, {
          costUsd: 0.01, durationMs: 100, timestamp: new Date(2025, 0, 1, 0, 0, i).toISOString(),
        });
      }

      const usage = tracker.getUsage();
      expect(usage.clorkStats.recentTasks).toHaveLength(50);
    });

    it('should sort recentTasks by most recent first', () => {
      state.usageTracker.taskCosts.set('old', {
        costUsd: 0.01, durationMs: 100, timestamp: '2025-01-01T00:00:00Z',
      });
      state.usageTracker.taskCosts.set('new', {
        costUsd: 0.02, durationMs: 200, timestamp: '2025-06-01T00:00:00Z',
      });

      const usage = tracker.getUsage();
      expect(usage.clorkStats.recentTasks[0].taskId).toBe('new');
      expect(usage.clorkStats.recentTasks[1].taskId).toBe('old');
    });
  });
});
