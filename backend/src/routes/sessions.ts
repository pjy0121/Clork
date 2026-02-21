import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { sessionOps, taskOps } from '../database';
import { Session, Task } from '../types';
import { taskRunner } from '../services/taskRunner';

const router = Router();

// GET /api/sessions?projectId=xxx - Get sessions for a project
router.get('/', (req: Request, res: Response) => {
  try {
    const { projectId } = req.query;
    if (!projectId) {
      return res.status(400).json({ error: 'projectId is required' });
    }
    const sessions = sessionOps.getByProject.all(projectId as string);
    res.json(sessions);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/sessions/:id - Get a session
router.get('/:id', (req: Request, res: Response) => {
  try {
    const session = sessionOps.getById.get(req.params.id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    res.json(session);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/sessions - Create a session
router.post('/', (req: Request, res: Response) => {
  try {
    const { projectId, name, model, prompt } = req.body;
    if (!projectId || !name) {
      return res.status(400).json({ error: 'projectId and name are required' });
    }
    const id = randomUUID();
    const maxOrder = (sessionOps.getMaxOrder.get(projectId) as any)?.maxOrder ?? -1;
    sessionOps.create.run(id, projectId, name, model || null, 'idle', maxOrder + 1);

    // If prompt is provided, auto-create a task in the session's todo
    if (prompt && prompt.trim()) {
      const taskId = randomUUID();
      const taskOrder = 0;
      taskOps.create.run(taskId, projectId, id, prompt.trim(), 'pending', 'todo', taskOrder);
    }

    const session = sessionOps.getById.get(id);
    res.status(201).json(session);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/sessions/:id - Update a session
router.put('/:id', (req: Request, res: Response) => {
  try {
    const existing = sessionOps.getById.get(req.params.id) as Session | undefined;
    if (!existing) {
      return res.status(404).json({ error: 'Session not found' });
    }
    if (req.body.name !== undefined) {
      sessionOps.updateName.run(req.body.name, req.params.id);
    }
    if (req.body.sessionOrder !== undefined) {
      sessionOps.updateOrder.run(req.body.sessionOrder, req.params.id);
    }
    if (req.body.status !== undefined) {
      sessionOps.updateStatus.run(req.body.status, req.params.id);
    }
    if (req.body.nextSessionId !== undefined) {
      // Clear any existing pointers to the target session first (1:1 chain)
      if (req.body.nextSessionId) {
        sessionOps.clearNextSessionPointers.run(req.body.nextSessionId);
      }
      sessionOps.updateNextSession.run(req.body.nextSessionId, req.params.id);
    }
    const session = sessionOps.getById.get(req.params.id);
    res.json(session);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/sessions/:id/start - Start a session
router.post('/:id/start', (req: Request, res: Response) => {
  try {
    const session = sessionOps.getById.get(req.params.id) as Session | undefined;
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    if (session.status === 'running') {
      return res.status(400).json({ error: 'Session is already running' });
    }
    // Reset completed sessions so they can be restarted with new tasks
    if (session.status === 'completed') {
      const pendingTasks = taskOps.getTodo.all(session.id) as Task[];
      if (pendingTasks.length === 0) {
        return res.status(400).json({ error: 'No pending tasks in this session' });
      }
      sessionOps.updateStatus.run('idle', session.id);
    }
    taskRunner.processSession(session.id);
    const updated = sessionOps.getById.get(req.params.id);
    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/sessions/:id/reorder - Reorder sessions
router.post('/reorder', (req: Request, res: Response) => {
  try {
    const { sessionOrders } = req.body; // Array of { id, sessionOrder }
    if (!Array.isArray(sessionOrders)) {
      return res.status(400).json({ error: 'sessionOrders array is required' });
    }
    for (const item of sessionOrders) {
      sessionOps.updateOrder.run(item.sessionOrder, item.id);
    }
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/sessions/:id - Delete a session
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const session = sessionOps.getById.get(req.params.id) as Session | undefined;
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    if (session.status === 'running') {
      // Abort any running task first
      const runningTaskId = taskRunner.getRunningTaskForSession(session.id);
      if (runningTaskId) {
        taskRunner.abortTask(runningTaskId);
      }
    }
    // Clear any nextSessionId pointers to this session
    sessionOps.clearNextSessionPointers.run(req.params.id);
    sessionOps.delete.run(req.params.id);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
