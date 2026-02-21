import { Router, Request, Response } from 'express';
import { settingsOps } from '../database';
import { claudeService } from '../services/claudeService';

const router = Router();

// GET /api/settings - Get all settings
router.get('/', (_req: Request, res: Response) => {
  try {
    const theme = (settingsOps.get.get('theme') as any)?.value || 'dark';
    res.json({ theme });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/settings - Update settings
router.put('/', (req: Request, res: Response) => {
  try {
    const { theme } = req.body;
    if (theme) {
      settingsOps.set.run('theme', theme);
    }
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/settings/claude-status - Check Claude Code status
router.get('/claude-status', (_req: Request, res: Response) => {
  try {
    const status = claudeService.checkStatus();
    res.json(status);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/settings/claude-usage - Get Claude Code usage statistics
router.get('/claude-usage', (_req: Request, res: Response) => {
  try {
    const usage = claudeService.getUsage();
    res.json(usage);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/settings/claude-usage/refresh - Force a live usage poll
router.post('/claude-usage/refresh', async (_req: Request, res: Response) => {
  try {
    await claudeService.pollUsageLive();
    const usage = claudeService.getUsage();
    res.json(usage);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
