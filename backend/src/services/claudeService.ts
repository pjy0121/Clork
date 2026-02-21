import { spawn, ChildProcess, execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as https from 'https';
import type { Server as SocketServer } from 'socket.io';
import { ClaudeExecutionOptions, ClaudeStreamEvent } from '../types';

export interface ClaudeCallbacks {
  onData: (event: ClaudeStreamEvent) => void;
  onComplete: (result: any) => void;
  onError: (error: any) => void;
  onHumanInput: (data: any) => void;
}

/** Rate limit entry from rate_limit_event */
export interface RateLimitEntry {
  status: string;         // 'allowed' | 'rejected' | 'limited'
  resetsAt: number | null; // Unix timestamp (seconds)
  rateLimitType: string;   // 'five_hour' | 'seven_day_sonnet' | 'seven_day_opus' | 'seven_day'
  utilization: number | null; // 0-100 percentage, null if unknown
}

/** Overage (추가 사용량) info from rate_limit_event */
export interface OverageInfo {
  overageStatus: string;  // 'rejected' | 'accepted' | 'unknown'
  isUsingOverage: boolean;
  overageDisabledReason: string | null;
}

/** Account info from claude auth status + credentials */
export interface AccountInfo {
  email: string | null;
  orgId: string | null;
  orgName: string | null;
  subscriptionType: string | null;  // 'free' | 'pro' | 'max' | 'team'
  rateLimitTier: string | null;     // e.g. 'default_claude_max_5x'
  authMethod: string | null;
}

/** Claude Code stats-cache.json daily activity */
export interface DailyActivity {
  date: string;
  messageCount: number;
  sessionCount: number;
  toolCallCount: number;
}

/** Claude Code stats-cache.json model usage */
export interface ModelUsageStats {
  [model: string]: {
    inputTokens: number;
    outputTokens: number;
    cacheReadInputTokens: number;
    cacheCreationInputTokens: number;
    costUSD: number;
  };
}

export interface UsageData {
  // Account info (from credentials + auth status)
  account: AccountInfo;
  // Rate limits from rate_limit_event (multiple types)
  rateLimits: RateLimitEntry[];
  // Overage from rate_limit_event
  overage: OverageInfo;
  // Claude Code local stats (from ~/.claude/stats-cache.json)
  localStats: {
    totalSessions: number;
    totalMessages: number;
    dailyActivity: DailyActivity[];
    modelUsage: ModelUsageStats;
    firstSessionDate: string | null;
  };
  // Accumulated cost from Clork task executions
  clorkStats: {
    totalCostUsd: number;
    taskCount: number;
    completedTasks: number;
    failedTasks: number;
    totalDurationMs: number;
    recentTasks: Array<{ taskId: string; costUsd: number; durationMs: number; timestamp: string }>;
  };
  lastUpdatedAt: string;
}

// ===== Paths to Claude Code local files =====
const CLAUDE_HOME = path.join(os.homedir(), '.claude');
const CREDENTIALS_PATH = path.join(CLAUDE_HOME, '.credentials.json');
const STATS_CACHE_PATH = path.join(CLAUDE_HOME, 'stats-cache.json');

class ClaudeService {
  private processes: Map<string, ChildProcess> = new Map();
  private pollIntervals: Map<string, ReturnType<typeof setInterval>> = new Map();
  private outputFiles: Map<string, string> = new Map();

  // ===== Socket.IO for broadcasting usage updates =====
  private io: SocketServer | null = null;

  // ===== Live usage polling =====
  private isPollingUsage = false;
  private usagePollTimer: ReturnType<typeof setInterval> | null = null;
  private static USAGE_POLL_INTERVAL_MS = 30_000; // 30 seconds

  // ===== Cached local file data =====
  private accountInfo: AccountInfo = {
    email: null, orgId: null, orgName: null,
    subscriptionType: null, rateLimitTier: null, authMethod: null,
  };
  private localStats = {
    totalSessions: 0,
    totalMessages: 0,
    dailyActivity: [] as DailyActivity[],
    modelUsage: {} as ModelUsageStats,
    firstSessionDate: null as string | null,
  };
  private localFilesLastRead = 0;

  // ===== Real-time tracking from task execution =====
  private usageTracker = {
    taskCosts: new Map<string, { costUsd: number; durationMs: number; timestamp: string }>(),
    totalCostUsd: 0,
    taskCount: 0,
    completedTasks: 0,
    failedTasks: 0,
    totalDurationMs: 0,
    rateLimits: new Map<string, { status: string; resetsAt: number | null; utilization: number | null }>(),
    overage: {
      overageStatus: 'unknown' as string,
      isUsingOverage: false,
      overageDisabledReason: null as string | null,
    },
    lastUpdatedAt: new Date().toISOString(),
  };

  constructor() {
    // Initial read of local files
    this.refreshLocalFiles();
  }

  /**
   * Set Socket.IO instance and start periodic usage polling.
   */
  setIO(io: SocketServer): void {
    this.io = io;
    this.startUsagePolling();
  }

  // ===== Live Usage Polling =====

  private startUsagePolling(): void {
    // Initial poll after a short delay to let server boot up
    setTimeout(() => this.pollUsageLive(), 5000);
    // Periodic polling
    this.usagePollTimer = setInterval(
      () => this.pollUsageLive(),
      ClaudeService.USAGE_POLL_INTERVAL_MS,
    );
    console.log(`[ClaudeService] Usage polling started (every ${ClaudeService.USAGE_POLL_INTERVAL_MS / 1000}s)`);
  }

  /**
   * Poll rate limits by directly calling the Anthropic API with OAuth token.
   * Reads response headers for unified rate limit info (5h, 7d, 7d_sonnet).
   * Header abbreviation → type mapping:
   *   5h → five_hour, 7d → seven_day, 7d_sonnet → seven_day_sonnet
   * Even on 429 (rate-limited), headers are returned.
   */
  async pollUsageLive(): Promise<void> {
    if (this.isPollingUsage) return;
    this.isPollingUsage = true;

    console.log(`[ClaudeService] Polling rate limits via API...`);

    try {
      // Read OAuth token from credentials file
      const token = this.getOAuthToken();
      if (!token) {
        console.warn('[ClaudeService] No OAuth token available for rate limit polling');
        return;
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

          this.usageTracker.rateLimits.set(type, {
            status: status || 'allowed',
            resetsAt,
            utilization: util,
          });

          console.log(
            `[ClaudeService] Rate limit — type: ${type}, status: ${status || 'allowed'}, ` +
            `utilization: ${util.toFixed(1)}%, ` +
            `resetsAt: ${resetsAt ? new Date(resetsAt * 1000).toLocaleTimeString() : 'N/A'}`
          );
        }
      }

      // Parse overage info
      const overageStatus = headers['anthropic-ratelimit-unified-overage-status'];
      const overageDisabledReason = headers['anthropic-ratelimit-unified-overage-disabled-reason'];
      if (overageStatus) {
        this.usageTracker.overage = {
          overageStatus,
          isUsingOverage: headers['anthropic-ratelimit-unified-status'] === 'rejected'
            && (overageStatus === 'allowed' || overageStatus === 'allowed_warning'),
          overageDisabledReason: overageDisabledReason || null,
        };
      }

      this.usageTracker.lastUpdatedAt = new Date().toISOString();

      // Refresh local files too
      this.localFilesLastRead = 0;
      this.refreshLocalFiles();

      // Broadcast updated usage
      if (this.io) {
        this.io.emit('usage:updated', this.getUsage());
      }
    } catch (e: any) {
      console.warn(`[ClaudeService] Usage poll failed:`, e.message);
    } finally {
      this.isPollingUsage = false;
    }
  }

  /**
   * Read OAuth access token from ~/.claude/.credentials.json
   */
  private getOAuthToken(): string | null {
    try {
      if (!fs.existsSync(CREDENTIALS_PATH)) return null;
      const raw = fs.readFileSync(CREDENTIALS_PATH, 'utf-8');
      const data = JSON.parse(raw);
      const token = data.claudeAiOauth?.accessToken;
      if (!token) return null;

      // Check expiry
      const expiresAt = data.claudeAiOauth?.expiresAt;
      if (expiresAt && Date.now() > expiresAt) {
        console.warn('[ClaudeService] OAuth token expired');
        return null;
      }

      return token;
    } catch {
      return null;
    }
  }

  /**
   * Make a minimal API call to Anthropic and return response headers.
   * Uses OAuth Bearer token with anthropic-beta: oauth-2025-04-20.
   * Returns headers as a flat object, or null on failure.
   */
  private callAnthropicAPI(token: string): Promise<Record<string, string> | null> {
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
        console.warn('[ClaudeService] API call failed:', err.message);
        resolve(null);
      });

      req.on('timeout', () => {
        req.destroy();
        console.warn('[ClaudeService] API call timed out');
        resolve(null);
      });

      req.write(body);
      req.end();
    });
  }

  /**
   * Process rate limit info from a rate_limit_event (from task execution CLI events).
   * CLI events have utilization as 0-1 fraction. We convert to 0-100.
   */
  private processRateLimitInfo(info: any): void {
    const key = info.rateLimitType || 'unknown';

    // CLI utilization is 0-1, convert to 0-100 for consistency
    let utilization: number | null = null;
    if (info.utilization !== undefined && info.utilization !== null) {
      utilization = typeof info.utilization === 'number'
        ? (info.utilization <= 1.5 ? info.utilization * 100 : info.utilization) // 0-1 → 0-100
        : null;
    }

    this.usageTracker.rateLimits.set(key, {
      status: info.status || 'unknown',
      resetsAt: info.resetsAt ?? null,
      utilization,
    });

    if (info.overageStatus !== undefined) {
      this.usageTracker.overage = {
        overageStatus: info.overageStatus || 'unknown',
        isUsingOverage: !!info.isUsingOverage,
        overageDisabledReason: info.overageDisabledReason || null,
      };
    }

    this.usageTracker.lastUpdatedAt = new Date().toISOString();

    console.log(
      `[ClaudeService] Rate limit (CLI) — type: ${key}, status: ${info.status}, ` +
      `utilization: ${utilization !== null ? utilization.toFixed(1) : 'N/A'}%, ` +
      `resetsAt: ${info.resetsAt ? new Date(info.resetsAt * 1000).toLocaleTimeString() : 'N/A'}`
    );
  }

  // ===== Local File Reading =====

  /**
   * Read Claude Code local files for account + stats data.
   * Cached for 30 seconds to avoid excessive disk reads.
   */
  refreshLocalFiles(): void {
    const now = Date.now();
    if (now - this.localFilesLastRead < 30_000) return;
    this.localFilesLastRead = now;

    this.readCredentials();
    this.readAuthStatus();
    this.readStatsCache();
  }

  private readCredentials(): void {
    try {
      if (!fs.existsSync(CREDENTIALS_PATH)) return;
      const raw = fs.readFileSync(CREDENTIALS_PATH, 'utf-8');
      const data = JSON.parse(raw);
      const oauth = data.claudeAiOauth;
      if (oauth) {
        this.accountInfo.subscriptionType = oauth.subscriptionType || null;
        this.accountInfo.rateLimitTier = oauth.rateLimitTier || null;
      }
    } catch (e: any) {
      console.warn('[ClaudeService] Failed to read credentials:', e.message);
    }
  }

  private readAuthStatus(): void {
    try {
      const raw = execSync('claude auth status', {
        encoding: 'utf-8',
        timeout: 10000,
        shell: true,
      }).trim();
      const data = JSON.parse(raw);
      this.accountInfo.email = data.email || null;
      this.accountInfo.orgId = data.orgId || null;
      this.accountInfo.orgName = data.orgName || null;
      this.accountInfo.authMethod = data.authMethod || null;
      if (data.subscriptionType) {
        this.accountInfo.subscriptionType = data.subscriptionType;
      }
    } catch (e: any) {
      console.warn('[ClaudeService] Failed to read auth status:', e.message);
    }
  }

  private readStatsCache(): void {
    try {
      if (!fs.existsSync(STATS_CACHE_PATH)) return;
      const raw = fs.readFileSync(STATS_CACHE_PATH, 'utf-8');
      const data = JSON.parse(raw);

      this.localStats.totalSessions = data.totalSessions || 0;
      this.localStats.totalMessages = data.totalMessages || 0;
      this.localStats.firstSessionDate = data.firstSessionDate || null;

      // Daily activity (last 14 days)
      if (Array.isArray(data.dailyActivity)) {
        this.localStats.dailyActivity = data.dailyActivity.slice(-14);
      }

      // Model usage
      if (data.modelUsage) {
        this.localStats.modelUsage = {};
        for (const [model, usage] of Object.entries(data.modelUsage)) {
          const u = usage as any;
          this.localStats.modelUsage[model] = {
            inputTokens: u.inputTokens || 0,
            outputTokens: u.outputTokens || 0,
            cacheReadInputTokens: u.cacheReadInputTokens || 0,
            cacheCreationInputTokens: u.cacheCreationInputTokens || 0,
            costUSD: u.costUSD || 0,
          };
        }
      }
    } catch (e: any) {
      console.warn('[ClaudeService] Failed to read stats-cache:', e.message);
    }
  }

  // ===== Real-time Event Tracking =====

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

      this.usageTracker.taskCosts.set(taskId, {
        costUsd,
        durationMs,
        timestamp: new Date().toISOString(),
      });

      // Recalculate totals from all tasks
      let totalCost = 0;
      let totalDuration = 0;
      for (const [, data] of this.usageTracker.taskCosts) {
        totalCost += data.costUsd;
        totalDuration += data.durationMs;
      }
      this.usageTracker.totalCostUsd = totalCost;
      this.usageTracker.totalDurationMs = totalDuration;
      this.usageTracker.lastUpdatedAt = new Date().toISOString();
    }
  }

  /**
   * Track task completion for usage stats.
   */
  trackTaskComplete(taskId: string, success: boolean): void {
    this.usageTracker.taskCount++;
    if (success) this.usageTracker.completedTasks++;
    else this.usageTracker.failedTasks++;
    this.usageTracker.lastUpdatedAt = new Date().toISOString();
  }

  /**
   * Check if Claude Code CLI is installed and user is logged in
   */
  checkStatus(): { installed: boolean; loggedIn: boolean; user: string | null; version: string | null } {
    try {
      const result = execSync('claude --version', {
        encoding: 'utf-8',
        timeout: 10000,
        shell: true,
      }).trim();
      console.log('[ClaudeService] CLI version:', result);

      // Also refresh local files on status check
      this.refreshLocalFiles();

      return {
        installed: true,
        loggedIn: true,
        user: this.accountInfo.email || 'Claude User',
        version: result,
      };
    } catch (e: any) {
      console.error('[ClaudeService] CLI not found:', e.message);
      return { installed: false, loggedIn: false, user: null, version: null };
    }
  }

  /**
   * Get full usage data: account + rate limits + local stats + clork stats.
   */
  getUsage(): UsageData {
    // Refresh local files (cached 30s)
    this.refreshLocalFiles();

    // Build rate limits list
    const rateLimits: RateLimitEntry[] = [];
    for (const [type, data] of this.usageTracker.rateLimits) {
      rateLimits.push({
        status: data.status,
        resetsAt: data.resetsAt,
        rateLimitType: type,
        utilization: data.utilization,
      });
    }

    // Build recent tasks list (last 50)
    const recentTasks: UsageData['clorkStats']['recentTasks'] = [];
    for (const [taskId, data] of this.usageTracker.taskCosts) {
      recentTasks.push({ taskId, ...data });
    }
    recentTasks.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return {
      account: { ...this.accountInfo },
      rateLimits,
      overage: { ...this.usageTracker.overage },
      localStats: { ...this.localStats },
      clorkStats: {
        totalCostUsd: this.usageTracker.totalCostUsd,
        taskCount: this.usageTracker.taskCount,
        completedTasks: this.usageTracker.completedTasks,
        failedTasks: this.usageTracker.failedTasks,
        totalDurationMs: this.usageTracker.totalDurationMs,
        recentTasks: recentTasks.slice(0, 50),
      },
      lastUpdatedAt: this.usageTracker.lastUpdatedAt,
    };
  }

  /**
   * Execute a Claude Code task.
   * Uses shell redirect + file polling to capture output (Windows pipe compatibility).
   */
  executeTask(
    taskId: string,
    options: ClaudeExecutionOptions,
    callbacks: ClaudeCallbacks
  ): void {
    // Build the command parts
    const promptEscaped = options.prompt
      .replace(/"/g, '\\"')
      .replace(/\n/g, ' ');

    let cmdParts = `claude -p "${promptEscaped}" --output-format stream-json --verbose`;

    if (options.model) {
      cmdParts += ` --model ${options.model}`;
    }

    if (options.permissionMode === 'full') {
      cmdParts += ' --dangerously-skip-permissions';
    }

    if (options.claudeSessionId) {
      cmdParts += ` --resume ${options.claudeSessionId}`;
    }

    // Create temp file for stdout
    const outFile = path.join(os.tmpdir(), `clork-task-${taskId}.jsonl`);
    this.outputFiles.set(taskId, outFile);

    // Ensure the file exists
    fs.writeFileSync(outFile, '', 'utf-8');

    const fullCmd = `${cmdParts} > "${outFile}" 2>&1`;

    console.log(`\n[ClaudeService] ========== Starting Task ==========`);
    console.log(`[ClaudeService] Task ID: ${taskId}`);
    console.log(`[ClaudeService] CWD: ${options.cwd}`);
    console.log(`[ClaudeService] Model: ${options.model}`);
    console.log(`[ClaudeService] Permission: ${options.permissionMode}`);
    console.log(`[ClaudeService] Prompt: ${options.prompt.substring(0, 100)}`);
    console.log(`[ClaudeService] Output file: ${outFile}`);
    console.log(`[ClaudeService] Command: ${fullCmd.substring(0, 200)}`);

    let proc: ChildProcess;
    try {
      proc = spawn(fullCmd, [], {
        cwd: options.cwd,
        shell: true,
        stdio: 'ignore',
        windowsHide: true,
        env: { ...Object.fromEntries(
          Object.entries(process.env).filter(([key]) => key !== 'CLAUDECODE')
        ), FORCE_COLOR: '0' },
      });
    } catch (spawnErr: any) {
      console.error(`[ClaudeService] Failed to spawn process:`, spawnErr.message);
      callbacks.onError({ error: `Failed to spawn claude: ${spawnErr.message}` });
      return;
    }

    console.log(`[ClaudeService] Process spawned, PID: ${proc.pid}`);
    this.processes.set(taskId, proc);

    let lastPos = 0;
    let sessionId: string | null = null;
    let hasReceivedData = false;
    let lineBuffer = '';

    // Poll the output file for new data
    const poll = setInterval(() => {
      try {
        if (!fs.existsSync(outFile)) return;
        const stat = fs.statSync(outFile);
        if (stat.size <= lastPos) return;

        const buf = Buffer.alloc(stat.size - lastPos);
        const fd = fs.openSync(outFile, 'r');
        fs.readSync(fd, buf, 0, buf.length, lastPos);
        fs.closeSync(fd);
        lastPos = stat.size;

        const text = buf.toString('utf-8');
        lineBuffer += text;
        const lines = lineBuffer.split('\n');
        lineBuffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          hasReceivedData = true;
          console.log(`[ClaudeService] [out] ${trimmed.substring(0, 200)}`);

          try {
            const event: ClaudeStreamEvent = JSON.parse(trimmed);

            // Capture session ID
            if (event.type === 'system' && event.subtype === 'init' && event.session_id) {
              sessionId = event.session_id;
              console.log(`[ClaudeService] Session ID captured: ${sessionId}`);
            }

            // Check for human-in-the-loop
            if (this.isHumanInputNeeded(event)) {
              console.log(`[ClaudeService] Human input needed!`);
              callbacks.onHumanInput(event);
            } else {
              callbacks.onData(event);
            }
          } catch {
            // Non-JSON output (e.g., error messages)
            console.log(`[ClaudeService] [raw] ${trimmed.substring(0, 200)}`);
            if (this.looksLikePermissionPrompt(trimmed)) {
              callbacks.onHumanInput({ type: 'permission_request', text: trimmed });
            } else {
              callbacks.onData({ type: 'raw', text: trimmed });
            }
          }
        }
      } catch (e: any) {
        // Ignore file read errors during polling
      }
    }, 150);

    this.pollIntervals.set(taskId, poll);

    proc.on('error', (err) => {
      console.error(`[ClaudeService] Process error:`, err.message);
      this.cleanup(taskId);
      callbacks.onData({ type: 'error', text: `Process error: ${err.message}` });
      callbacks.onError({ error: err.message, sessionId });
    });

    proc.on('close', (code, signal) => {
      console.log(`\n[ClaudeService] ========== Task Completed ==========`);
      console.log(`[ClaudeService] Task ID: ${taskId}`);
      console.log(`[ClaudeService] Exit code: ${code}, Signal: ${signal}`);
      console.log(`[ClaudeService] Received data: ${hasReceivedData}`);

      // Stop polling and do one final read
      clearInterval(poll);
      this.pollIntervals.delete(taskId);

      // Final read of remaining data
      try {
        if (fs.existsSync(outFile)) {
          const stat = fs.statSync(outFile);
          if (stat.size > lastPos) {
            const buf = Buffer.alloc(stat.size - lastPos);
            const fd = fs.openSync(outFile, 'r');
            fs.readSync(fd, buf, 0, buf.length, lastPos);
            fs.closeSync(fd);

            const text = buf.toString('utf-8');
            lineBuffer += text;
          }

          // Process remaining lines
          if (lineBuffer.trim()) {
            const lines = lineBuffer.split('\n');
            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed) continue;
              hasReceivedData = true;

              try {
                const event = JSON.parse(trimmed);
                if (event.type === 'system' && event.subtype === 'init' && event.session_id) {
                  sessionId = event.session_id;
                }
                callbacks.onData(event);
              } catch {
                callbacks.onData({ type: 'raw', text: trimmed });
              }
            }
          }

          // Read full file for analysis
          const fullContent = fs.readFileSync(outFile, 'utf-8');
          console.log(`[ClaudeService] Total output length: ${fullContent.length}`);

          // Check if result event was received
          if (!fullContent.includes('"type":"result"') && !fullContent.includes('"type": "result"')) {
            console.log(`[ClaudeService] No result event in output, creating synthetic result`);
            callbacks.onData({
              type: 'result',
              subtype: code === 0 ? 'success' : 'error',
              result: hasReceivedData
                ? '(Task completed - see event log for details)'
                : '(Task completed with no output)',
            });
          }
        }
      } catch (e: any) {
        console.error(`[ClaudeService] Error reading final output:`, e.message);
      }

      this.cleanup(taskId);

      if (code === 0) {
        callbacks.onComplete({ exitCode: code, sessionId });
      } else if (signal === 'SIGTERM' || signal === 'SIGKILL' || code === null) {
        callbacks.onData({ type: 'aborted', text: 'Task was aborted by user' });
        callbacks.onError({ exitCode: code ?? -1, aborted: true, sessionId });
      } else {
        callbacks.onData({ type: 'error', text: `Process exited with code ${code}` });
        callbacks.onError({ exitCode: code, error: `Process exited with code ${code}`, sessionId });
      }
    });

    // Safety timeout: log if no data received after 30 seconds
    setTimeout(() => {
      if (!hasReceivedData && this.processes.has(taskId)) {
        console.warn(`[ClaudeService] WARNING: No data received after 30s for task ${taskId}`);
        callbacks.onData({
          type: 'system',
          text: 'Claude Code가 아직 응답하지 않고 있습니다... 잠시 기다려주세요.',
        });
      }
    }, 30000);
  }

  /**
   * Clean up resources for a task
   */
  private cleanup(taskId: string): void {
    this.processes.delete(taskId);

    const poll = this.pollIntervals.get(taskId);
    if (poll) {
      clearInterval(poll);
      this.pollIntervals.delete(taskId);
    }

    const outFile = this.outputFiles.get(taskId);
    if (outFile) {
      try { fs.unlinkSync(outFile); } catch {}
      this.outputFiles.delete(taskId);
    }
  }

  /**
   * Abort a running task
   */
  abort(taskId: string): boolean {
    const proc = this.processes.get(taskId);
    if (proc) {
      console.log(`[ClaudeService] Aborting task ${taskId}, PID: ${proc.pid}`);
      if (process.platform === 'win32') {
        try {
          execSync(`taskkill /pid ${proc.pid} /T /F`, { shell: true, stdio: 'ignore' });
        } catch {
          proc.kill('SIGTERM');
        }
      } else {
        proc.kill('SIGTERM');
      }
      this.cleanup(taskId);
      return true;
    }
    return false;
  }

  /**
   * Send input to a running task (for human-in-the-loop)
   * Note: With file redirect approach, stdin is not connected.
   * We need a different approach for HITL.
   */
  sendInput(taskId: string, input: string): boolean {
    console.log(`[ClaudeService] sendInput not supported with file redirect approach`);
    return false;
  }

  private isHumanInputNeeded(event: ClaudeStreamEvent): boolean {
    if (event.type === 'permission_request') return true;
    if (event.type === 'input_request') return true;
    if (event.type === 'system' && event.subtype === 'permission') return true;
    return false;
  }

  private looksLikePermissionPrompt(text: string): boolean {
    const patterns = [/do you want to/i, /allow.*tool/i, /permission/i, /\(y\/n\)/i, /\[y\/N\]/i, /approve/i];
    return patterns.some((p) => p.test(text));
  }

  hasRunningTasks(): boolean {
    return this.processes.size > 0;
  }

  getRunningTaskIds(): string[] {
    return Array.from(this.processes.keys());
  }
}

export const claudeService = new ClaudeService();
