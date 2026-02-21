import { spawn, ChildProcess, execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { ClaudeExecutionOptions, ClaudeStreamEvent } from '../../types';
import type { ClaudeCallbacks } from './types';

/** Check if a stream event indicates human input is needed */
export function isHumanInputNeeded(event: ClaudeStreamEvent): boolean {
  if (event.type === 'permission_request') return true;
  if (event.type === 'input_request') return true;
  if (event.type === 'system' && event.subtype === 'permission') return true;
  return false;
}

/** Check if raw text looks like a permission prompt */
export function looksLikePermissionPrompt(text: string): boolean {
  const patterns = [/do you want to/i, /allow.*tool/i, /permission/i, /\(y\/n\)/i, /\[y\/N\]/i, /approve/i];
  return patterns.some((p) => p.test(text));
}

/**
 * Strip code blocks (``` ... ```) from text to avoid false positives
 * from question marks or patterns inside code.
 */
function stripCodeBlocks(text: string): string {
  return text.replace(/```[\s\S]*?```/g, '');
}

/** Polite closing patterns that should NOT trigger HITL */
const POLITE_CLOSING_PATTERNS = [
  /궁금한\s*점이\s*있으시면/,
  /도움이\s*필요하시면/,
  /다른\s*질문이\s*있으면/,
  /추가\s*질문이\s*있으시면/,
  /문의.*있으시면/,
  /필요한.*있으시면/,
  /if you have any questions/i,
  /feel free to ask/i,
  /let me know if you need/i,
  /don'?t hesitate to ask/i,
];

/** Korean question patterns that indicate Claude is asking the user */
const KOREAN_QUESTION_PATTERNS = [
  /할까요\s*\?/,
  /하시겠습니까\s*\?/,
  /선택해\s*주세요/,
  /선택해주세요/,
  /알려\s*주세요/,
  /알려주세요/,
  /진행할까요\s*\?/,
  /원하시나요\s*\?/,
  /괜찮을까요\s*\?/,
  /될까요\s*\?/,
  /드릴까요\s*\?/,
  /줄까요\s*\?/,
  /어떤.*좋을까요\s*\?/,
  /어떻게.*할까요\s*\?/,
  /맞을까요\s*\?/,
  /싶으신가요\s*\?/,
];

/** English question patterns that indicate Claude is asking the user */
const ENGLISH_QUESTION_PATTERNS = [
  /\bshould I\b/i,
  /\bwould you like\b/i,
  /\bwhich (approach|option|method|way|one)\b/i,
  /\bdo you want\b/i,
  /\bplease (choose|select|pick|decide)\b/i,
  /\blet me know\b/i,
  /\bwhat would you prefer\b/i,
  /\bshall I\b/i,
  /\bwould you prefer\b/i,
];

/**
 * Detect if Claude's result text contains a question directed at the user.
 * Used to trigger Human-in-the-Loop flow when running in non-interactive mode (-p).
 */
export function detectQuestionInResult(text: string): boolean {
  if (!text || !text.trim()) return false;

  // Strip code blocks to avoid false positives
  const stripped = stripCodeBlocks(text);

  // Check for polite closing patterns first — these are NOT questions
  for (const pattern of POLITE_CLOSING_PATTERNS) {
    if (pattern.test(stripped)) return false;
  }

  // Check Korean question patterns
  for (const pattern of KOREAN_QUESTION_PATTERNS) {
    if (pattern.test(stripped)) return true;
  }

  // Check English question patterns
  for (const pattern of ENGLISH_QUESTION_PATTERNS) {
    if (pattern.test(stripped)) return true;
  }

  return false;
}

export class TaskExecutor {
  private processes: Map<string, ChildProcess> = new Map();
  private pollIntervals: Map<string, ReturnType<typeof setInterval>> = new Map();
  private outputFiles: Map<string, string> = new Map();

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

    console.log(`[TaskExecutor] Starting task ${taskId} (model: ${options.model})`);

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
      console.error(`[TaskExecutor] Failed to spawn process:`, spawnErr.message);
      callbacks.onError({ error: `Failed to spawn claude: ${spawnErr.message}` });
      return;
    }

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

          try {
            const event: ClaudeStreamEvent = JSON.parse(trimmed);

            // Capture session ID
            if (event.type === 'system' && event.subtype === 'init' && event.session_id) {
              sessionId = event.session_id;
            }

            // Check for human-in-the-loop
            if (isHumanInputNeeded(event)) {
              callbacks.onHumanInput(event);
            } else {
              callbacks.onData(event);
            }
          } catch {
            // Non-JSON output (e.g., error messages)
            if (looksLikePermissionPrompt(trimmed)) {
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
      console.error(`[TaskExecutor] Process error:`, err.message);
      this.cleanup(taskId);
      callbacks.onData({ type: 'error', text: `Process error: ${err.message}` });
      callbacks.onError({ error: err.message, sessionId });
    });

    proc.on('close', (code, signal) => {
      console.log(`[TaskExecutor] Task ${taskId} exited (code: ${code})`);

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

          // Check if result event was received
          if (!fullContent.includes('"type":"result"') && !fullContent.includes('"type": "result"')) {
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
        console.error(`[TaskExecutor] Error reading final output:`, e.message);
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
        console.warn(`[TaskExecutor] WARNING: No data received after 30s for task ${taskId}`);
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
      if (process.platform === 'win32') {
        try {
          execSync(`taskkill /pid ${proc.pid} /T /F`, { shell: true as any, stdio: 'ignore' });
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
   */
  sendInput(taskId: string, input: string): boolean {
    return false;
  }

  hasRunningTasks(): boolean {
    return this.processes.size > 0;
  }

  getRunningTaskIds(): string[] {
    return Array.from(this.processes.keys());
  }
}
