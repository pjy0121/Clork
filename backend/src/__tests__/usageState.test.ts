import { describe, it, expect } from 'vitest';
import { createUsageState } from '../services/claude/usageState';

describe('createUsageState', () => {
  it('should return default accountInfo with all null fields', () => {
    const state = createUsageState();
    expect(state.accountInfo).toEqual({
      email: null,
      orgId: null,
      orgName: null,
      subscriptionType: null,
      rateLimitTier: null,
      authMethod: null,
    });
  });

  it('should return default localStats with zeros and empty arrays', () => {
    const state = createUsageState();
    expect(state.localStats).toEqual({
      totalSessions: 0,
      totalMessages: 0,
      dailyActivity: [],
      modelUsage: {},
      firstSessionDate: null,
    });
  });

  it('should return default usageTracker with empty Maps and zero counters', () => {
    const state = createUsageState();
    expect(state.usageTracker.taskCosts).toBeInstanceOf(Map);
    expect(state.usageTracker.taskCosts.size).toBe(0);
    expect(state.usageTracker.rateLimits).toBeInstanceOf(Map);
    expect(state.usageTracker.rateLimits.size).toBe(0);
    expect(state.usageTracker.totalCostUsd).toBe(0);
    expect(state.usageTracker.taskCount).toBe(0);
    expect(state.usageTracker.completedTasks).toBe(0);
    expect(state.usageTracker.failedTasks).toBe(0);
    expect(state.usageTracker.totalDurationMs).toBe(0);
  });

  it('should return default overage as unknown', () => {
    const state = createUsageState();
    expect(state.usageTracker.overage).toEqual({
      overageStatus: 'unknown',
      isUsingOverage: false,
      overageDisabledReason: null,
    });
  });

  it('should have io as null and localFilesLastRead as 0', () => {
    const state = createUsageState();
    expect(state.io).toBeNull();
    expect(state.localFilesLastRead).toBe(0);
  });

  it('should create independent instances (no shared references)', () => {
    const state1 = createUsageState();
    const state2 = createUsageState();
    state1.accountInfo.email = 'test@example.com';
    state1.usageTracker.taskCosts.set('t1', { costUsd: 1, durationMs: 100, timestamp: '' });
    expect(state2.accountInfo.email).toBeNull();
    expect(state2.usageTracker.taskCosts.size).toBe(0);
  });
});
