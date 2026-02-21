import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { UsagePolling, USAGE_POLL_INTERVAL_MS } from '../services/claude/usagePolling';
import { createUsageState, UsageState } from '../services/claude/usageState';
import * as fs from 'fs';

vi.mock('fs');
vi.mock('https');

const mockFs = vi.mocked(fs);

describe('UsagePolling', () => {
  let state: UsageState;
  let mockLocalFileReader: any;
  let mockUsageTracker: any;
  let polling: UsagePolling;

  beforeEach(() => {
    vi.resetAllMocks();
    state = createUsageState();
    mockLocalFileReader = { refreshLocalFiles: vi.fn() };
    mockUsageTracker = { getUsage: vi.fn().mockReturnValue({}) };
    polling = new UsagePolling(state, mockLocalFileReader, mockUsageTracker);
  });

  it('should export USAGE_POLL_INTERVAL_MS as 30000', () => {
    expect(USAGE_POLL_INTERVAL_MS).toBe(30_000);
  });

  describe('getOAuthToken', () => {
    it('should return access token from credentials file', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify({
        claudeAiOauth: {
          accessToken: 'test-token-123',
          expiresAt: Date.now() + 3600_000, // 1 hour from now
        },
      }));

      const token = polling.getOAuthToken();
      expect(token).toBe('test-token-123');
    });

    it('should return null when credentials file does not exist', () => {
      mockFs.existsSync.mockReturnValue(false);
      expect(polling.getOAuthToken()).toBeNull();
    });

    it('should return null when token is expired', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify({
        claudeAiOauth: {
          accessToken: 'expired-token',
          expiresAt: Date.now() - 1000, // expired 1 second ago
        },
      }));

      expect(polling.getOAuthToken()).toBeNull();
    });

    it('should return null when no accessToken field', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify({
        claudeAiOauth: {},
      }));

      expect(polling.getOAuthToken()).toBeNull();
    });

    it('should return null on JSON parse error', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('not-json');

      expect(polling.getOAuthToken()).toBeNull();
    });

    it('should return token when no expiresAt field (no expiry check)', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify({
        claudeAiOauth: {
          accessToken: 'no-expiry-token',
        },
      }));

      expect(polling.getOAuthToken()).toBe('no-expiry-token');
    });
  });

  describe('token state transitions', () => {
    it('should log only on state change, not every poll', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // First call: missing → should log
      mockFs.existsSync.mockReturnValue(false);
      polling.getOAuthToken();
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledWith(
        '[UsagePolling] No OAuth token available for rate limit polling',
      );

      // Second call: still missing → should NOT log again
      warnSpy.mockClear();
      polling.getOAuthToken();
      expect(warnSpy).not.toHaveBeenCalled();

      warnSpy.mockRestore();
    });

    it('should log when token transitions from missing to available', () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      vi.spyOn(console, 'warn').mockImplementation(() => {});

      // First: missing
      mockFs.existsSync.mockReturnValue(false);
      polling.getOAuthToken();

      // Then: available
      logSpy.mockClear();
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify({
        claudeAiOauth: { accessToken: 'tok', expiresAt: Date.now() + 60000 },
      }));
      polling.getOAuthToken();
      expect(logSpy).toHaveBeenCalledWith(
        '[UsagePolling] OAuth token recovered — resuming API polling',
      );

      logSpy.mockRestore();
    });

    it('should log when token transitions from available to expired', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.spyOn(console, 'log').mockImplementation(() => {});

      // First: available
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify({
        claudeAiOauth: { accessToken: 'tok', expiresAt: Date.now() + 60000 },
      }));
      polling.getOAuthToken();

      // Then: expired
      warnSpy.mockClear();
      mockFs.readFileSync.mockReturnValue(JSON.stringify({
        claudeAiOauth: { accessToken: 'tok', expiresAt: Date.now() - 1000 },
      }));
      polling.getOAuthToken();
      expect(warnSpy).toHaveBeenCalledWith(
        '[UsagePolling] OAuth token expired — waiting for CLI to refresh',
      );

      warnSpy.mockRestore();
    });

    it('should force-reset localFilesLastRead when token is expired', () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      state.localFilesLastRead = 99999;

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify({
        claudeAiOauth: { accessToken: 'tok', expiresAt: Date.now() - 1000 },
      }));
      polling.getOAuthToken();

      expect(state.localFilesLastRead).toBe(0);
    });
  });

  describe('pollUsageLive', () => {
    it('should skip when already polling (re-entrancy guard)', async () => {
      // Make getOAuthToken return a token so callAnthropicAPI is reached
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify({
        claudeAiOauth: { accessToken: 'tok' },
      }));

      // Make callAnthropicAPI hang (never resolves) so isPollingUsage stays true
      let resolveApi!: () => void;
      const apiPromise = new Promise<void>((r) => { resolveApi = r; });
      vi.spyOn(polling, 'callAnthropicAPI').mockReturnValue(
        apiPromise.then(() => null) as any,
      );
      vi.spyOn(console, 'log').mockImplementation(() => {});

      const pollPromise1 = polling.pollUsageLive();
      // Second immediate call should be guarded (isPollingUsage is true)
      const pollPromise2 = polling.pollUsageLive();

      // callAnthropicAPI should only be called once (from first call)
      expect(polling.callAnthropicAPI).toHaveBeenCalledTimes(1);

      // Let the first call finish
      resolveApi();
      await Promise.all([pollPromise1, pollPromise2]);
    });

    it('should not log "Polling rate limits" when no OAuth token', async () => {
      mockFs.existsSync.mockReturnValue(false);
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      vi.spyOn(console, 'warn').mockImplementation(() => {});

      await polling.pollUsageLive();

      const pollingLogCalls = logSpy.mock.calls.filter(
        (args) => typeof args[0] === 'string' && args[0].includes('Polling rate limits'),
      );
      expect(pollingLogCalls).toHaveLength(0);

      logSpy.mockRestore();
    });

    it('should still refresh local files when no token', async () => {
      mockFs.existsSync.mockReturnValue(false);
      vi.spyOn(console, 'warn').mockImplementation(() => {});

      await polling.pollUsageLive();

      expect(mockLocalFileReader.refreshLocalFiles).toHaveBeenCalled();
    });
  });

  describe('backoff behavior', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.spyOn(console, 'log').mockImplementation(() => {});
      vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
      polling.stopUsagePolling();
      vi.useRealTimers();
    });

    it('should enter backoff after 3 consecutive token failures', async () => {
      mockFs.existsSync.mockReturnValue(false);
      const logSpy = vi.spyOn(console, 'log');

      // Simulate 3 failures
      await polling.pollUsageLive();
      await polling.pollUsageLive();

      // Third should trigger backoff
      polling.startUsagePolling();
      await polling.pollUsageLive();

      const backoffLogs = logSpy.mock.calls.filter(
        (args) => typeof args[0] === 'string' && args[0].includes('slowing poll'),
      );
      expect(backoffLogs.length).toBe(1);
    });

    it('should restore normal interval when token becomes available after backoff', async () => {
      mockFs.existsSync.mockReturnValue(false);
      const logSpy = vi.spyOn(console, 'log');

      // Enter backoff
      polling.startUsagePolling();
      await polling.pollUsageLive();
      await polling.pollUsageLive();
      await polling.pollUsageLive();

      // Now token becomes available
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify({
        claudeAiOauth: { accessToken: 'tok' },
      }));
      vi.spyOn(polling, 'callAnthropicAPI').mockResolvedValue({});

      await polling.pollUsageLive();

      const restoreLogs = logSpy.mock.calls.filter(
        (args) => typeof args[0] === 'string' && args[0].includes('restoring normal poll'),
      );
      expect(restoreLogs.length).toBe(1);
    });
  });

  describe('startUsagePolling / stopUsagePolling', () => {
    it('should start and stop without errors', () => {
      vi.useFakeTimers();
      vi.spyOn(console, 'log').mockImplementation(() => {});

      polling.startUsagePolling();
      // Should force-refresh local files on start
      expect(mockLocalFileReader.refreshLocalFiles).toHaveBeenCalled();
      expect(state.localFilesLastRead).toBe(0);

      polling.stopUsagePolling();
      vi.useRealTimers();
    });
  });
});
