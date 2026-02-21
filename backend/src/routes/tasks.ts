import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { taskOps, eventOps, sessionOps } from '../database';
import { Task, Session } from '../types';
import { taskRunner } from '../services/taskRunner';

const router = Router();

// GET /api/tasks?projectId=xxx - Get all tasks for a project
router.get('/', (req: Request, res: Response) => {
  try {
    const { projectId, sessionId, location } = req.query;
    if (sessionId) {
      if (location === 'todo') {
        const tasks = taskOps.getTodo.all(sessionId as string);
        return res.json(tasks);
      }
      if (location === 'done') {
        const tasks = taskOps.getDone.all(sessionId as string);
        return res.json(tasks);
      }
      const tasks = taskOps.getBySession.all(sessionId as string);
      return res.json(tasks);
    }
    if (projectId) {
      if (location === 'backlog') {
        const tasks = taskOps.getBacklog.all(projectId as string);
        return res.json(tasks);
      }
      const tasks = taskOps.getByProject.all(projectId as string);
      return res.json(tasks);
    }
    return res.status(400).json({ error: 'projectId or sessionId is required' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/tasks/:id - Get a task
router.get('/:id', (req: Request, res: Response) => {
  try {
    const task = taskOps.getById.get(req.params.id);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    res.json(task);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/tasks/:id/events - Get events for a task
router.get('/:id/events', (req: Request, res: Response) => {
  try {
    const events = eventOps.getByTask.all(req.params.id);
    res.json(events);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/tasks - Create a task
router.post('/', (req: Request, res: Response) => {
  try {
    const { projectId, sessionId, prompt, location } = req.body;
    if (!projectId || !prompt) {
      return res.status(400).json({ error: 'projectId and prompt are required' });
    }

    const id = randomUUID();
    const taskLocation = location || (sessionId ? 'todo' : 'backlog');

    let taskOrder: number;
    if (taskLocation === 'backlog') {
      taskOrder = ((taskOps.getMaxBacklogOrder.get(projectId) as any)?.maxOrder ?? -1) + 1;
    } else {
      taskOrder = ((taskOps.getMaxTodoOrder.get(sessionId) as any)?.maxOrder ?? -1) + 1;
    }

    taskOps.create.run(id, projectId, sessionId || null, prompt, 'pending', taskLocation, taskOrder);
    const task = taskOps.getById.get(id);

    res.status(201).json(task);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/tasks/:id - Update a task
router.put('/:id', (req: Request, res: Response) => {
  try {
    const existing = taskOps.getById.get(req.params.id) as Task | undefined;
    if (!existing) {
      return res.status(404).json({ error: 'Task not found' });
    }

    if (req.body.prompt !== undefined) {
      taskOps.updatePrompt.run(req.body.prompt, req.params.id);
    }
    if (req.body.taskOrder !== undefined) {
      taskOps.updateOrder.run(req.body.taskOrder, req.params.id);
    }

    const task = taskOps.getById.get(req.params.id);
    res.json(task);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/tasks/:id/move - Move a task between backlog/todo
router.post('/:id/move', (req: Request, res: Response) => {
  try {
    const existing = taskOps.getById.get(req.params.id) as Task | undefined;
    if (!existing) {
      return res.status(404).json({ error: 'Task not found' });
    }
    if (existing.status === 'running') {
      return res.status(400).json({ error: 'Cannot move a running task' });
    }

    const { location, sessionId, taskOrder } = req.body;
    if (!location) {
      return res.status(400).json({ error: 'location is required' });
    }

    // For backlog: keep sessionId if provided (session-level backlog), or null for project-level
    const newSessionId = location === 'queue' ? null : (sessionId !== undefined ? (sessionId || null) : existing.sessionId);
    let newOrder = taskOrder;
    if (newOrder === undefined) {
      if (location === 'backlog') {
        newOrder = ((taskOps.getMaxBacklogOrder.get(existing.projectId) as any)?.maxOrder ?? -1) + 1;
      } else if (location === 'queue') {
        newOrder = ((taskOps.getMaxQueueOrder.get(existing.projectId) as any)?.maxOrder ?? -1) + 1;
      } else if (newSessionId) {
        newOrder = ((taskOps.getMaxTodoOrder.get(newSessionId) as any)?.maxOrder ?? -1) + 1;
      }
    }

    taskOps.updateLocation.run(location, newSessionId, newOrder, req.params.id);

    // Reset status if moved to todo
    if (location === 'todo' && (existing.status === 'completed' || existing.status === 'failed' || existing.status === 'aborted')) {
      taskOps.updateStatus.run('pending', req.params.id);
    }

    const task = taskOps.getById.get(req.params.id);

    // Auto-start: if moved to todo and session is active, process next task
    if (location === 'todo' && newSessionId) {
      const session = sessionOps.getById.get(newSessionId) as any;
      if (session && session.isActive) {
        // Only process if session is active
        taskRunner.processSession(newSessionId);
      }
    }

    res.json(task);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/tasks/:id/abort - Abort a running task
router.post('/:id/abort', (req: Request, res: Response) => {
  try {
    const existing = taskOps.getById.get(req.params.id) as Task | undefined;
    if (!existing) {
      return res.status(404).json({ error: 'Task not found' });
    }
    if (existing.status !== 'running') {
      return res.status(400).json({ error: 'Task is not running' });
    }

    const success = taskRunner.abortTask(req.params.id);
    if (!success) {
      return res.status(500).json({ error: 'Failed to abort task' });
    }

    const task = taskOps.getById.get(req.params.id);
    res.json(task);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});


// POST /api/tasks/:id/human-response - Send human response
router.post('/:id/human-response', (req: Request, res: Response) => {
  try {
    const { response } = req.body;
    if (!response) {
      return res.status(400).json({ error: 'response is required' });
    }

    const success = taskRunner.sendHumanResponse(req.params.id, response);
    if (!success) {
      return res.status(400).json({ error: 'Task is not waiting for input' });
    }

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/tasks/reorder - Reorder tasks
router.post('/reorder', (req: Request, res: Response) => {
  try {
    const { taskOrders } = req.body; // Array of { id, taskOrder }
    if (!Array.isArray(taskOrders)) {
      return res.status(400).json({ error: 'taskOrders array is required' });
    }
    for (const item of taskOrders) {
      taskOps.updateOrder.run(item.taskOrder, item.id);
    }
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/tasks/:id - Delete a task
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const existing = taskOps.getById.get(req.params.id) as Task | undefined;
    if (!existing) {
      return res.status(404).json({ error: 'Task not found' });
    }
    const sessionId = existing.sessionId;

    if (existing.status === 'running') {
      taskRunner.abortTask(req.params.id);
    }
    taskOps.delete.run(req.params.id);

    // If the task was in a session, process the session to continue with next tasks
    if (sessionId && existing.location === 'todo') {
      taskRunner.processSession(sessionId);
    }

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
