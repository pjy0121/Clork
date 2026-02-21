import { describe, it, expect, vi } from 'vitest';

// Mock fs and child_process before importing claudeService
// (constructor calls refreshLocalFiles which reads files)
vi.mock('fs', () => ({
  existsSync: vi.fn().mockReturnValue(false),
  readFileSync: vi.fn().mockReturnValue('{}'),
  writeFileSync: vi.fn(),
  statSync: vi.fn(),
  openSync: vi.fn(),
  readSync: vi.fn(),
  closeSync: vi.fn(),
  unlinkSync: vi.fn(),
}));

vi.mock('child_process', () => ({
  execSync: vi.fn().mockImplementation(() => { throw new Error('mocked'); }),
  spawn: vi.fn(),
}));

vi.mock('https');

describe('claudeService facade', () => {
  it('should export claudeService singleton with all public methods', async () => {
    const { claudeService } = await import('../services/claudeService');

    expect(typeof claudeService.setIO).toBe('function');
    expect(typeof claudeService.pollUsageLive).toBe('function');
    expect(typeof claudeService.trackEvent).toBe('function');
    expect(typeof claudeService.trackTaskComplete).toBe('function');
    expect(typeof claudeService.checkStatus).toBe('function');
    expect(typeof claudeService.getUsage).toBe('function');
    expect(typeof claudeService.executeTask).toBe('function');
    expect(typeof claudeService.abort).toBe('function');
    expect(typeof claudeService.sendInput).toBe('function');
    expect(typeof claudeService.hasRunningTasks).toBe('function');
    expect(typeof claudeService.getRunningTaskIds).toBe('function');
  });

  it('should re-export types from claude/types', async () => {
    // Verify type re-exports compile (import check)
    const mod = await import('../services/claudeService');
    // UsageData is a type-only export, so we check the module has the expected shape
    expect(mod.claudeService).toBeDefined();
  });

  it('should delegate trackEvent to usageTracker', async () => {
    const { claudeService } = await import('../services/claudeService');

    // Track a result event and verify getUsage reflects it
    claudeService.trackEvent('test-task', {
      type: 'result',
      cost_usd: 0.03,
      duration_ms: 2000,
    });

    const usage = claudeService.getUsage();
    expect(usage.clorkStats.totalCostUsd).toBe(0.03);
    expect(usage.clorkStats.recentTasks).toHaveLength(1);
    expect(usage.clorkStats.recentTasks[0].taskId).toBe('test-task');
  });

  it('should delegate trackTaskComplete to usageTracker', async () => {
    const { claudeService } = await import('../services/claudeService');

    claudeService.trackTaskComplete('t1', true);
    claudeService.trackTaskComplete('t2', false);

    const usage = claudeService.getUsage();
    expect(usage.clorkStats.taskCount).toBeGreaterThanOrEqual(2);
    expect(usage.clorkStats.completedTasks).toBeGreaterThanOrEqual(1);
    expect(usage.clorkStats.failedTasks).toBeGreaterThanOrEqual(1);
  });

  it('should delegate hasRunningTasks / getRunningTaskIds to taskExecutor', async () => {
    const { claudeService } = await import('../services/claudeService');
    expect(claudeService.hasRunningTasks()).toBe(false);
    expect(claudeService.getRunningTaskIds()).toEqual([]);
  });

  it('should delegate abort to taskExecutor', async () => {
    const { claudeService } = await import('../services/claudeService');
    expect(claudeService.abort('nonexistent')).toBe(false);
  });

  it('should delegate sendInput to taskExecutor', async () => {
    const { claudeService } = await import('../services/claudeService');
    expect(claudeService.sendInput('task-1', 'yes')).toBe(false);
  });
});
