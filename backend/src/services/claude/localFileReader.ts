import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { UsageState } from './usageState';

// ===== Paths to Claude Code local files =====
export const CLAUDE_HOME = path.join(os.homedir(), '.claude');
export const CREDENTIALS_PATH = path.join(CLAUDE_HOME, '.credentials.json');
export const STATS_CACHE_PATH = path.join(CLAUDE_HOME, 'stats-cache.json');

export class LocalFileReader {
  constructor(private state: UsageState) {}

  /**
   * Read Claude Code local files for account + stats data.
   * Cached for 30 seconds to avoid excessive disk reads.
   */
  refreshLocalFiles(): void {
    const now = Date.now();
    if (now - this.state.localFilesLastRead < 30_000) return;
    this.state.localFilesLastRead = now;

    this.readCredentials();
    this.readAuthStatus();
    this.readStatsCache();
  }

  readCredentials(): void {
    try {
      if (!fs.existsSync(CREDENTIALS_PATH)) return;
      const raw = fs.readFileSync(CREDENTIALS_PATH, 'utf-8');
      const data = JSON.parse(raw);
      const oauth = data.claudeAiOauth;
      if (oauth) {
        this.state.accountInfo.subscriptionType = oauth.subscriptionType || null;
        this.state.accountInfo.rateLimitTier = oauth.rateLimitTier || null;
      }
    } catch (e: any) {
      console.warn('[LocalFileReader] Failed to read credentials:', e.message);
    }
  }

  readAuthStatus(): void {
    try {
      const raw = execSync('claude auth status', {
        encoding: 'utf-8',
        timeout: 10000,
        shell: true as any,
      }).trim();
      const data = JSON.parse(raw);
      this.state.accountInfo.email = data.email || null;
      this.state.accountInfo.orgId = data.orgId || null;
      this.state.accountInfo.orgName = data.orgName || null;
      this.state.accountInfo.authMethod = data.authMethod || null;
      if (data.subscriptionType) {
        this.state.accountInfo.subscriptionType = data.subscriptionType;
      }
    } catch (e: any) {
      console.warn('[LocalFileReader] Failed to read auth status:', e.message);
    }
  }

  readStatsCache(): void {
    try {
      if (!fs.existsSync(STATS_CACHE_PATH)) return;
      const raw = fs.readFileSync(STATS_CACHE_PATH, 'utf-8');
      const data = JSON.parse(raw);

      this.state.localStats.totalSessions = data.totalSessions || 0;
      this.state.localStats.totalMessages = data.totalMessages || 0;
      this.state.localStats.firstSessionDate = data.firstSessionDate || null;

      // Daily activity (last 14 days)
      if (Array.isArray(data.dailyActivity)) {
        this.state.localStats.dailyActivity = data.dailyActivity.slice(-14);
      }

      // Model usage
      if (data.modelUsage) {
        this.state.localStats.modelUsage = {};
        for (const [model, usage] of Object.entries(data.modelUsage)) {
          const u = usage as any;
          this.state.localStats.modelUsage[model] = {
            inputTokens: u.inputTokens || 0,
            outputTokens: u.outputTokens || 0,
            cacheReadInputTokens: u.cacheReadInputTokens || 0,
            cacheCreationInputTokens: u.cacheCreationInputTokens || 0,
            costUSD: u.costUSD || 0,
          };
        }
      }
    } catch (e: any) {
      console.warn('[LocalFileReader] Failed to read stats-cache:', e.message);
    }
  }
}
