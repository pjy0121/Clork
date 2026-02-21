import { describe, it, expect, vi, beforeEach } from 'vitest';
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

      const pollPromise1 = polling.pollUsageLive();
      // Second immediate call should be guarded (isPollingUsage is true)
      const pollPromise2 = polling.pollUsageLive();

      // callAnthropicAPI should only be called once (from first call)
      expect(polling.callAnthropicAPI).toHaveBeenCalledTimes(1);

      // Let the first call finish
      resolveApi();
      await Promise.all([pollPromise1, pollPromise2]);
    });

    it('should warn and return when no OAuth token', async () => {
      mockFs.existsSync.mockReturnValue(false);

      await polling.pollUsageLive();
      // Should not throw, just log warning
    });
  });

  describe('startUsagePolling / stopUsagePolling', () => {
    it('should start and stop without errors', () => {
      vi.useFakeTimers();

      polling.startUsagePolling();
      // Should not throw
      polling.stopUsagePolling();

      vi.useRealTimers();
    });
  });
});
