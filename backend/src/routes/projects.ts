import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { projectOps, sessionOps, taskOps } from '../database';
import { Project } from '../types';

const router = Router();

// GET /api/projects - Get all projects
router.get('/', (_req: Request, res: Response) => {
  try {
    const projects = projectOps.getAll.all();
    res.json(projects);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/projects/:id - Get a project
router.get('/:id', (req: Request, res: Response) => {
  try {
    const project = projectOps.getById.get(req.params.id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    res.json(project);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/projects - Create a project
router.post('/', (req: Request, res: Response) => {
  try {
    const { name, rootDirectory, defaultModel, permissionMode } = req.body;
    if (!name || !rootDirectory) {
      return res.status(400).json({ error: 'name and rootDirectory are required' });
    }
    const id = randomUUID();
    projectOps.create.run(
      id,
      name,
      rootDirectory,
      defaultModel || 'claude-sonnet-4-20250514',
      permissionMode || 'default'
    );
    const project = projectOps.getById.get(id);
    res.status(201).json(project);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/projects/:id - Update a project
router.put('/:id', (req: Request, res: Response) => {
  try {
    const existing = projectOps.getById.get(req.params.id) as Project | undefined;
    if (!existing) {
      return res.status(404).json({ error: 'Project not found' });
    }
    const { name, rootDirectory, defaultModel, permissionMode, autoProcessBacklog, maxTasksPerSession } = req.body;
    projectOps.update.run(
      name || existing.name,
      rootDirectory || existing.rootDirectory,
      defaultModel || existing.defaultModel,
      permissionMode || existing.permissionMode,
      autoProcessBacklog !== undefined ? (autoProcessBacklog ? 1 : 0) : (existing.autoProcessBacklog ? 1 : 0),
      maxTasksPerSession || existing.maxTasksPerSession,
      req.params.id
    );
    const project = projectOps.getById.get(req.params.id);
    res.json(project);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/projects/:id - Delete a project
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const existing = projectOps.getById.get(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Project not found' });
    }
    projectOps.delete.run(req.params.id);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
