import * as fs from 'fs';
import * as https from 'https';
import type { UsageState } from './usageState';
import type { LocalFileReader } from './localFileReader';
import type { UsageTracker } from './usageTracker';
import { CREDENTIALS_PATH } from './localFileReader';

export const USAGE_POLL_INTERVAL_MS = 30_000; // 30 seconds
/** How many consecutive token failures before we slow down polling */
const TOKEN_BACKOFF_THRESHOLD = 3;
/** Slowed-down poll interval when token is unavailable (2 minutes) */
const BACKOFF_POLL_INTERVAL_MS = 120_000;

export type TokenState = 'available' | 'expired' | 'missing' | 'unknown';

export class UsagePolling {
  private isPollingUsage = false;
  private usagePollTimer: ReturnType<typeof setInterval> | null = null;
  /** Track token state to only log on transitions */
  private lastTokenState: TokenState = 'unknown';
  /** Count consecutive polls with no token — for backoff */
  private consecutiveTokenFailures = 0;
  /** Whether we're currently in backoff mode */
  private isBackoff = false;

  constructor(
    private state: UsageState,
    private localFileReader: LocalFileReader,
    private usageTracker: UsageTracker,
  ) {}

  /**
   * Start periodic usage polling. Called when Socket.IO is set.
   */
  startUsagePolling(): void {
    // Force-read credentials before first poll so token is available
    this.state.localFilesLastRead = 0;
    this.localFileReader.refreshLocalFiles();

    // Initial poll after a short delay to let server boot up
    setTimeout(() => this.pollUsageLive(), 3000);
    // Periodic polling
    this.usagePollTimer = setInterval(
      () => this.pollUsageLive(),
      USAGE_POLL_INTERVAL_MS,
    );
    console.log(`[UsagePolling] Usage polling started (every ${USAGE_POLL_INTERVAL_MS / 1000}s)`);
  }

  /**
   * Stop polling (for cleanup/testing).
   */
  stopUsagePolling(): void {
    if (this.usagePollTimer) {
      clearInterval(this.usagePollTimer);
      this.usagePollTimer = null;
    }
  }

  /**
   * Poll rate limits by directly calling the Anthropic API with OAuth token.
   * Reads response headers for unified rate limit info (5h, 7d, 7d_sonnet).
   */
  async pollUsageLive(): Promise<void> {
    if (this.isPollingUsage) return;
    this.isPollingUsage = true;

    try {
      // Read OAuth token from credentials file
      const token = this.getOAuthToken();
      if (!token) {
        this.consecutiveTokenFailures++;

        // Enter backoff mode after repeated failures
        if (
          this.consecutiveTokenFailures >= TOKEN_BACKOFF_THRESHOLD
          && !this.isBackoff
        ) {
          this.switchToBackoff();
        }

        // Still refresh local files so at least local stats are available
        this.localFileReader.refreshLocalFiles();
        return;
      }

      // Token is available — reset failure count and exit backoff if needed
      this.consecutiveTokenFailures = 0;
      if (this.isBackoff) {
        this.switchToNormal();
      }

      // Make minimal API call — even 429 returns rate limit headers
      const headers = await this.callAnthropicAPI(token);
      if (!headers) return;

      // Parse rate limit headers for all claim types
      const claimTypes = [
        { abbrev: '5h', type: 'five_hour' },
        { abbrev: '7d', type: 'seven_day' },
        { abbrev: '7d_sonnet', type: 'seven_day_sonnet' },
      ];

      for (const { abbrev, type } of claimTypes) {
        const utilization = headers[`anthropic-ratelimit-unified-${abbrev}-utilization`];
        const reset = headers[`anthropic-ratelimit-unified-${abbrev}-reset`];
        const status = headers[`anthropic-ratelimit-unified-${abbrev}-status`];

        if (utilization !== undefined) {
          const util = parseFloat(utilization) * 100; // API returns 0-1, convert to 0-100
          const resetsAt = reset ? parseInt(reset, 10) : null;

          this.state.usageTracker.rateLimits.set(type, {
            status: status || 'allowed',
            resetsAt,
            utilization: util,
          });
        }
      }

      // Parse overage info
      const overageStatus = headers['anthropic-ratelimit-unified-overage-status'];
      const overageDisabledReason = headers['anthropic-ratelimit-unified-overage-disabled-reason'];
      if (overageStatus) {
        this.state.usageTracker.overage = {
          overageStatus,
          isUsingOverage: headers['anthropic-ratelimit-unified-status'] === 'rejected'
            && (overageStatus === 'allowed' || overageStatus === 'allowed_warning'),
          overageDisabledReason: overageDisabledReason || null,
        };
      }

      this.state.usageTracker.lastUpdatedAt = new Date().toISOString();

      // Refresh local files too
      this.state.localFilesLastRead = 0;
      this.localFileReader.refreshLocalFiles();

      // Broadcast updated usage
      if (this.state.io) {
        this.state.io.emit('usage:updated', this.usageTracker.getUsage());
      }
    } catch (e: any) {
      console.warn(`[UsagePolling] Usage poll failed:`, e.message);
    } finally {
      this.isPollingUsage = false;
    }
  }

  /**
   * Read OAuth access token from ~/.claude/.credentials.json.
   * Logs only on state transitions to avoid log spam.
   */
  getOAuthToken(): string | null {
    try {
      if (!fs.existsSync(CREDENTIALS_PATH)) {
        this.transitionTokenState('missing');
        return null;
      }
      const raw = fs.readFileSync(CREDENTIALS_PATH, 'utf-8');
      const data = JSON.parse(raw);
      const token = data.claudeAiOauth?.accessToken;
      if (!token) {
        this.transitionTokenState('missing');
        return null;
      }

      // Check expiry
      const expiresAt = data.claudeAiOauth?.expiresAt;
      if (expiresAt && Date.now() > expiresAt) {
        this.transitionTokenState('expired');
        // Force re-read credentials next cycle (CLI may refresh the token file)
        this.state.localFilesLastRead = 0;
        return null;
      }

      this.transitionTokenState('available');
      return token;
    } catch {
      this.transitionTokenState('missing');
      return null;
    }
  }

  /**
   * Log only when token state changes to reduce noise.
   */
  private transitionTokenState(newState: TokenState): void {
    if (newState === this.lastTokenState) return;
    const prev = this.lastTokenState;
    this.lastTokenState = newState;

    switch (newState) {
      case 'expired':
        console.warn('[UsagePolling] OAuth token expired — waiting for CLI to refresh');
        break;
      case 'missing':
        console.warn('[UsagePolling] No OAuth token available for rate limit polling');
        break;
      case 'available':
        if (prev !== 'unknown') {
          console.log('[UsagePolling] OAuth token recovered — resuming API polling');
        }
        break;
    }
  }

  /**
   * Switch to slower polling interval when token is repeatedly unavailable.
   */
  private switchToBackoff(): void {
    this.isBackoff = true;
    if (this.usagePollTimer) {
      clearInterval(this.usagePollTimer);
      this.usagePollTimer = setInterval(
        () => this.pollUsageLive(),
        BACKOFF_POLL_INTERVAL_MS,
      );
    }
    console.log(
      `[UsagePolling] No token after ${TOKEN_BACKOFF_THRESHOLD} attempts — ` +
      `slowing poll to ${BACKOFF_POLL_INTERVAL_MS / 1000}s`
    );
  }

  /**
   * Switch back to normal polling interval when token becomes available.
   */
  private switchToNormal(): void {
    this.isBackoff = false;
    if (this.usagePollTimer) {
      clearInterval(this.usagePollTimer);
      this.usagePollTimer = setInterval(
        () => this.pollUsageLive(),
        USAGE_POLL_INTERVAL_MS,
      );
    }
    console.log(
      `[UsagePolling] Token available — restoring normal poll interval (${USAGE_POLL_INTERVAL_MS / 1000}s)`
    );
  }

  /**
   * Make a minimal API call to Anthropic and return response headers.
   * Uses OAuth Bearer token with anthropic-beta: oauth-2025-04-20.
   */
  callAnthropicAPI(token: string): Promise<Record<string, string> | null> {
    return new Promise((resolve) => {
      const body = JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'hi' }],
      });

      const req = https.request(
        {
          hostname: 'api.anthropic.com',
          path: '/v1/messages',
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'anthropic-version': '2023-06-01',
            'anthropic-beta': 'oauth-2025-04-20',
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body),
          },
          timeout: 15000,
        },
        (res) => {
          // Collect headers (both 200 and 429 include rate limit headers)
          const headers: Record<string, string> = {};
          const rawHeaders = res.headers;
          for (const [key, val] of Object.entries(rawHeaders)) {
            if (val) headers[key] = Array.isArray(val) ? val[0] : val;
          }

          // Consume body to prevent memory leak
          res.on('data', () => {});
          res.on('end', () => resolve(headers));
        },
      );

      req.on('error', (err) => {
        console.warn('[UsagePolling] API call failed:', err.message);
        resolve(null);
      });

      req.on('timeout', () => {
        req.destroy();
        console.warn('[UsagePolling] API call timed out');
        resolve(null);
      });

      req.write(body);
      req.end();
    });
  }
}
