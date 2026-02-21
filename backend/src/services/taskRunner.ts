import { randomUUID } from 'crypto';
import { Server as SocketServer } from 'socket.io';
import { sessionOps, taskOps, eventOps, projectOps } from '../database';
import { claudeService } from './claudeService';
import { Task, Session, TaskEvent, Project } from '../types';

class TaskRunner {
  private io: SocketServer | null = null;
  private runningTasks: Map<string, string> = new Map(); // taskId -> sessionId

  setIO(io: SocketServer) {
    this.io = io;
  }

  /**
   * Try to start the next task in a session
   */
  async processSession(sessionId: string): Promise<void> {
    try {
      console.log(`\n[TaskRunner] processSession: ${sessionId}`);

      const session = sessionOps.getById.get(sessionId) as Session | undefined;
      if (!session) {
        console.log(`[TaskRunner] Session not found: ${sessionId}`);
        return;
      }

      // Check if there's already a running task in this session
      const runningTask = taskOps.getRunning.get(sessionId) as Task | undefined;
      if (runningTask) {
        console.log(`[TaskRunner] Session ${sessionId} already has running task: ${runningTask.id}`);

        // Check if the task is actually still running (not stuck)
        const isActuallyRunning = this.runningTasks.has(runningTask.id);
        if (!isActuallyRunning) {
          console.log(`[TaskRunner] Task ${runningTask.id} is marked as running but not in runningTasks map - marking as failed`);
          taskOps.updateCompleted.run('failed', runningTask.id);
          const failedTask = taskOps.getById.get(runningTask.id) as Task;
          this.io?.emit('task:failed', {
            taskId: runningTask.id,
            sessionId: sessionId,
            task: failedTask,
            error: 'Task was stuck in running state',
          });
        } else {
          return;
        }
      }

      // Get next pending todo task
      const pendingTasks = taskOps.getTodo.all(sessionId) as Task[];
      console.log(`[TaskRunner] Session ${sessionId} has ${pendingTasks.length} pending tasks`);

      if (pendingTasks.length === 0) {
        // No more tasks - mark session as completed
        if (session.status === 'running') {
          console.log(`[TaskRunner] Session ${sessionId} completed (no more tasks)`);
          sessionOps.updateStatus.run('completed', sessionId);
          const updatedSession = sessionOps.getById.get(sessionId) as Session;
          this.io?.emit('session:updated', updatedSession);
          // Check if there's a chained next session
          await this.processChainedSession(sessionId);
        }
        return;
      }

      // Ensure session is in running state (multiple sessions can run concurrently)
      if (session.status !== 'running') {
        console.log(`[TaskRunner] Session ${sessionId} set to running`);
        sessionOps.updateStatus.run('running', sessionId);
        const updatedSession = sessionOps.getById.get(sessionId) as Session;
        this.io?.emit('session:updated', updatedSession);
      }

      // Start the first pending task
      const task = pendingTasks[0];
      console.log(`[TaskRunner] Starting task: ${task.id} (prompt: "${task.prompt.substring(0, 60)}...")`);
      this.startTask(task, session);
    } catch (err: any) {
      console.error(`[TaskRunner] Error in processSession:`, err);
    }
  }

  /**
   * Start executing a task
   */
  private startTask(task: Task, session: Session): void {
    const project = projectOps.getById.get(session.projectId) as Project | undefined;
    if (!project) {
      console.error(`[TaskRunner] Project not found for session ${session.id}`);
      return;
    }

    // Update task status to running
    taskOps.updateStarted.run(task.id);
    this.runningTasks.set(task.id, session.id);

    // Read updated task from DB for the frontend
    const updatedTask = taskOps.getById.get(task.id) as Task;
    console.log(`[TaskRunner] Task ${task.id} status updated to: running`);

    // Emit task started with the full task data
    this.io?.emit('task:started', {
      taskId: task.id,
      sessionId: session.id,
      task: updatedTask,
    });

    // Use session model if set, otherwise fall back to project default
    const model = session.model || project.defaultModel;

    // Create initial event
    const initEventId = randomUUID();
    const initData = { type: 'task_started', prompt: task.prompt, model };
    eventOps.create.run(initEventId, task.id, 'system', JSON.stringify(initData));

    const initEvent: TaskEvent = {
      id: initEventId,
      taskId: task.id,
      eventType: 'system',
      data: JSON.stringify(initData),
      timestamp: new Date().toISOString(),
    };
    this.io?.emit('task:progress', { taskId: task.id, event: initEvent });

    // Execute with Claude Code
    claudeService.executeTask(
      task.id,
      {
        prompt: task.prompt,
        model,
        cwd: project.rootDirectory,
        permissionMode: project.permissionMode,
        claudeSessionId: session.claudeSessionId,
      },
      {
        onData: (event) => {
          const eventId = randomUUID();
          const eventType = event.type || 'raw';
          const eventData = JSON.stringify(event);
          eventOps.create.run(eventId, task.id, eventType, eventData);

          const taskEvent: TaskEvent = {
            id: eventId,
            taskId: task.id,
            eventType: eventType as any,
            data: eventData,
            timestamp: new Date().toISOString(),
          };
          this.io?.emit('task:progress', { taskId: task.id, event: taskEvent });

          // Track usage from events
          claudeService.trackEvent(task.id, event);

          // Broadcast usage update on rate_limit or result events
          if (event.type === 'rate_limit_event' || event.type === 'result') {
            this.io?.emit('usage:updated', claudeService.getUsage());
          }

          // Capture Claude session ID from init event
          if (event.type === 'system' && event.subtype === 'init' && event.session_id) {
            sessionOps.updateClaudeSessionId.run(event.session_id, session.id);
          }
        },

        onComplete: (result) => {
          console.log(`[TaskRunner] Task ${task.id} completed successfully`);
          claudeService.trackTaskComplete(task.id, true);

          const eventId = randomUUID();
          const completionData = { type: 'task_completed', ...result };
          eventOps.create.run(eventId, task.id, 'result', JSON.stringify(completionData));

          // Emit the completion event
          const completionEvent: TaskEvent = {
            id: eventId,
            taskId: task.id,
            eventType: 'result',
            data: JSON.stringify(completionData),
            timestamp: new Date().toISOString(),
          };
          this.io?.emit('task:progress', { taskId: task.id, event: completionEvent });

          // Update DB: move to done
          const updateResult = taskOps.updateCompleted.run('completed', task.id);
          console.log(`[TaskRunner] DB update result: changes=${updateResult.changes}`);
          this.runningTasks.delete(task.id);

          if (result.sessionId) {
            sessionOps.updateClaudeSessionId.run(result.sessionId, session.id);
          }

          // Verify DB update
          const doneTask = taskOps.getById.get(task.id) as Task;
          console.log(`[TaskRunner] Task after update: status=${doneTask?.status}, location=${doneTask?.location}`);

          // Emit task completed with updated task data
          this.io?.emit('task:completed', {
            taskId: task.id,
            sessionId: session.id,
            task: doneTask,
            result,
          });

          // Process next task in this session
          console.log(`[TaskRunner] Scheduling next task check for session ${session.id}`);
          setTimeout(() => {
            console.log(`[TaskRunner] Running scheduled processSession for ${session.id}`);
            this.processSession(session.id);
          }, 500);
        },

        onError: (error) => {
          const status = error.aborted ? 'aborted' : 'failed';
          console.log(`[TaskRunner] Task ${task.id} ${status}:`, error);
          claudeService.trackTaskComplete(task.id, false);

          const eventId = randomUUID();
          const eventType = error.aborted ? 'aborted' : 'error';
          const errorData = { type: eventType, ...error };
          eventOps.create.run(eventId, task.id, eventType, JSON.stringify(errorData));

          const errorEvent: TaskEvent = {
            id: eventId,
            taskId: task.id,
            eventType: eventType as any,
            data: JSON.stringify(errorData),
            timestamp: new Date().toISOString(),
          };
          this.io?.emit('task:progress', { taskId: task.id, event: errorEvent });

          taskOps.updateCompleted.run(status, task.id);
          this.runningTasks.delete(task.id);

          if (error.sessionId) {
            sessionOps.updateClaudeSessionId.run(error.sessionId, session.id);
          }

          const failedTask = taskOps.getById.get(task.id) as Task;
          this.io?.emit(error.aborted ? 'task:aborted' : 'task:failed', {
            taskId: task.id,
            sessionId: session.id,
            task: failedTask,
            error: error.error || `Exit code: ${error.exitCode}`,
          });

          // Continue to next task after a short delay regardless of failure type
          setTimeout(() => {
            console.log(`[TaskRunner] Processing next task after ${status} for session ${session.id}`);
            this.processSession(session.id);
          }, 500);
        },

        onHumanInput: (data) => {
          console.log(`[TaskRunner] Task ${task.id} needs human input`);
          const eventId = randomUUID();
          eventOps.create.run(eventId, task.id, 'human_input', JSON.stringify(data));

          const taskEvent: TaskEvent = {
            id: eventId,
            taskId: task.id,
            eventType: 'human_input',
            data: JSON.stringify(data),
            timestamp: new Date().toISOString(),
          };
          this.io?.emit('task:progress', { taskId: task.id, event: taskEvent });

          this.io?.emit('task:humanInput', {
            taskId: task.id,
            sessionId: session.id,
            prompt: data.text || JSON.stringify(data),
          });
        },
      }
    );
  }

  /**
   * Abort a running task
   */
  abortTask(taskId: string): boolean {
    console.log(`[TaskRunner] Aborting task ${taskId}`);
    const success = claudeService.abort(taskId);
    if (success) {
      taskOps.updateCompleted.run('aborted', taskId);
      const sessionId = this.runningTasks.get(taskId);
      this.runningTasks.delete(taskId);
      if (sessionId) {
        const abortedTask = taskOps.getById.get(taskId) as Task;
        this.io?.emit('task:aborted', { taskId, sessionId, task: abortedTask });

        // Continue processing the session after abort
        setTimeout(() => {
          console.log(`[TaskRunner] Processing next task after abort for session ${sessionId}`);
          this.processSession(sessionId);
        }, 500);
      }
    }
    return success;
  }

  /**
   * Send human response to a running task
   */
  sendHumanResponse(taskId: string, response: string): boolean {
    return claudeService.sendInput(taskId, response);
  }

  isTaskRunning(taskId: string): boolean {
    return this.runningTasks.has(taskId);
  }

  getRunningTaskForSession(sessionId: string): string | null {
    for (const [taskId, sId] of this.runningTasks) {
      if (sId === sessionId) return taskId;
    }
    return null;
  }

  /**
   * Process the chained next session after current session completes
   */
  async processChainedSession(completedSessionId: string): Promise<void> {
    const completedSession = sessionOps.getById.get(completedSessionId) as Session | undefined;
    if (!completedSession?.nextSessionId) {
      console.log(`[TaskRunner] No chained session for ${completedSessionId}`);
      return;
    }

    console.log(`[TaskRunner] Looking for chained session: ${completedSession.nextSessionId}`);
    const nextSession = sessionOps.getChainedSession.get(completedSession.nextSessionId) as Session | undefined;
    if (!nextSession) {
      console.log(`[TaskRunner] Chained session not found: ${completedSession.nextSessionId}`);
      return;
    }

    if (nextSession.status !== 'idle') {
      console.log(`[TaskRunner] Chained session ${nextSession.id} is not idle (status: ${nextSession.status}), skipping`);
      return;
    }

    const pendingTasks = taskOps.getTodo.all(nextSession.id) as Task[];
    if (pendingTasks.length === 0) {
      console.log(`[TaskRunner] Chained session ${nextSession.id} has no tasks, marking completed`);
      sessionOps.updateStatus.run('completed', nextSession.id);
      const updatedSession = sessionOps.getById.get(nextSession.id) as Session;
      this.io?.emit('session:updated', updatedSession);
      // Continue chain
      await this.processChainedSession(nextSession.id);
      return;
    }

    console.log(`[TaskRunner] Starting chained session: ${nextSession.id} (${nextSession.name})`);
    this.processSession(nextSession.id);
  }
}

export const taskRunner = new TaskRunner();
