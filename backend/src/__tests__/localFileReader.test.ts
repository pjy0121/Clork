import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LocalFileReader, CREDENTIALS_PATH, STATS_CACHE_PATH } from '../services/claude/localFileReader';
import { createUsageState, UsageState } from '../services/claude/usageState';
import * as fs from 'fs';
import * as child_process from 'child_process';

vi.mock('fs');
vi.mock('child_process');

const mockFs = vi.mocked(fs);
const mockCp = vi.mocked(child_process);

describe('LocalFileReader', () => {
  let state: UsageState;
  let reader: LocalFileReader;

  beforeEach(() => {
    vi.resetAllMocks();
    state = createUsageState();
    reader = new LocalFileReader(state);
  });

  describe('readCredentials', () => {
    it('should read subscriptionType and rateLimitTier from credentials', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify({
        claudeAiOauth: {
          subscriptionType: 'max',
          rateLimitTier: 'default_claude_max_5x',
        },
      }));

      reader.readCredentials();

      expect(state.accountInfo.subscriptionType).toBe('max');
      expect(state.accountInfo.rateLimitTier).toBe('default_claude_max_5x');
      expect(mockFs.readFileSync).toHaveBeenCalledWith(CREDENTIALS_PATH, 'utf-8');
    });

    it('should skip when credentials file does not exist', () => {
      mockFs.existsSync.mockReturnValue(false);

      reader.readCredentials();

      expect(state.accountInfo.subscriptionType).toBeNull();
      expect(mockFs.readFileSync).not.toHaveBeenCalled();
    });

    it('should handle malformed JSON gracefully', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('not-json');

      reader.readCredentials();

      expect(state.accountInfo.subscriptionType).toBeNull();
    });
  });

  describe('readAuthStatus', () => {
    it('should parse email, orgId, orgName, authMethod from CLI output', () => {
      mockCp.execSync.mockReturnValue(JSON.stringify({
        email: 'user@example.com',
        orgId: 'org-123',
        orgName: 'Test Org',
        authMethod: 'oauth',
        subscriptionType: 'pro',
      }));

      reader.readAuthStatus();

      expect(state.accountInfo.email).toBe('user@example.com');
      expect(state.accountInfo.orgId).toBe('org-123');
      expect(state.accountInfo.orgName).toBe('Test Org');
      expect(state.accountInfo.authMethod).toBe('oauth');
      expect(state.accountInfo.subscriptionType).toBe('pro');
    });

    it('should handle CLI failure gracefully', () => {
      mockCp.execSync.mockImplementation(() => { throw new Error('command not found'); });

      reader.readAuthStatus();

      expect(state.accountInfo.email).toBeNull();
    });
  });

  describe('readStatsCache', () => {
    it('should read totalSessions, totalMessages, firstSessionDate', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify({
        totalSessions: 42,
        totalMessages: 500,
        firstSessionDate: '2025-01-01',
      }));

      reader.readStatsCache();

      expect(state.localStats.totalSessions).toBe(42);
      expect(state.localStats.totalMessages).toBe(500);
      expect(state.localStats.firstSessionDate).toBe('2025-01-01');
    });

    it('should slice dailyActivity to last 14 entries', () => {
      const dailyActivity = Array.from({ length: 20 }, (_, i) => ({
        date: `2025-01-${String(i + 1).padStart(2, '0')}`,
        messageCount: i,
        sessionCount: 1,
        toolCallCount: i * 2,
      }));

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify({ dailyActivity }));

      reader.readStatsCache();

      expect(state.localStats.dailyActivity).toHaveLength(14);
      expect(state.localStats.dailyActivity[0].date).toBe('2025-01-07');
    });

    it('should parse modelUsage', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify({
        modelUsage: {
          'claude-sonnet-4': {
            inputTokens: 1000,
            outputTokens: 500,
            cacheReadInputTokens: 200,
            cacheCreationInputTokens: 100,
            costUSD: 0.05,
          },
        },
      }));

      reader.readStatsCache();

      expect(state.localStats.modelUsage['claude-sonnet-4']).toEqual({
        inputTokens: 1000,
        outputTokens: 500,
        cacheReadInputTokens: 200,
        cacheCreationInputTokens: 100,
        costUSD: 0.05,
      });
    });

    it('should skip when stats-cache file does not exist', () => {
      mockFs.existsSync.mockReturnValue(false);

      reader.readStatsCache();

      expect(state.localStats.totalSessions).toBe(0);
    });
  });

  describe('refreshLocalFiles', () => {
    it('should throttle calls within 30 seconds', () => {
      // First call: should proceed (localFilesLastRead is 0)
      mockFs.existsSync.mockReturnValue(false);
      mockCp.execSync.mockImplementation(() => { throw new Error('skip'); });

      reader.refreshLocalFiles();
      const firstLastRead = state.localFilesLastRead;
      expect(firstLastRead).toBeGreaterThan(0);

      // Second call: should be throttled
      mockFs.existsSync.mockClear();
      reader.refreshLocalFiles();

      // existsSync should NOT have been called again (throttled)
      expect(mockFs.existsSync).not.toHaveBeenCalled();
    });

    it('should refresh after 30 seconds', () => {
      mockFs.existsSync.mockReturnValue(false);
      mockCp.execSync.mockImplementation(() => { throw new Error('skip'); });

      reader.refreshLocalFiles();

      // Simulate 31 seconds passing
      state.localFilesLastRead = Date.now() - 31_000;
      mockFs.existsSync.mockClear();

      reader.refreshLocalFiles();

      // Should have been called again (credentials + stats-cache existsSync)
      expect(mockFs.existsSync).toHaveBeenCalled();
    });
  });
});
