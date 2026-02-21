import express from 'express';
import cors from 'cors';
import http from 'http';
import path from 'path';
import { Server as SocketServer } from 'socket.io';
import projectRoutes from './routes/projects';
import sessionRoutes from './routes/sessions';
import taskRoutes from './routes/tasks';
import settingsRoutes from './routes/settings';
import { taskRunner } from './services/taskRunner';
import { claudeService } from './services/claudeService';

const PORT = process.env.PORT || 3001;

const app = express();
const server = http.createServer(app);

// Socket.IO setup
const io = new SocketServer(server, {
  cors: {
    origin: ['http://localhost:5173', 'http://localhost:3001'],
    methods: ['GET', 'POST'],
  },
});

// Middleware
app.use(cors());
app.use(express.json());

// API Routes
app.use('/api/projects', projectRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/settings', settingsRoutes);

// Serve frontend in production
const frontendPath = path.join(__dirname, '..', '..', 'frontend', 'dist');
app.use(express.static(frontendPath));
app.get('*', (_req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// Initialize task runner with Socket.IO
taskRunner.setIO(io);

// Initialize claude service with Socket.IO (starts live usage polling)
claudeService.setIO(io);

// Socket.IO event handlers
io.on('connection', (socket) => {
  console.log(`[Socket] Client connected: ${socket.id}`);

  // Send Claude status on connect
  const status = claudeService.checkStatus();
  socket.emit('claude:status', {
    loggedIn: status.loggedIn,
    user: status.user || undefined,
  });

  // Handle task abort
  socket.on('task:abort', (data: { taskId: string }) => {
    console.log(`[Socket] Abort task: ${data.taskId}`);
    taskRunner.abortTask(data.taskId);
  });

  // Handle human response
  socket.on('task:humanResponse', (data: { taskId: string; response: string }) => {
    console.log(`[Socket] Human response for task: ${data.taskId}`);
    taskRunner.sendHumanResponse(data.taskId, data.response);
  });

  // Handle session start
  socket.on('session:start', (data: { sessionId: string }) => {
    console.log(`[Socket] Start session: ${data.sessionId}`);
    taskRunner.processSession(data.sessionId);
  });

  socket.on('disconnect', () => {
    console.log(`[Socket] Client disconnected: ${socket.id}`);
  });
});

// Start server
server.listen(PORT, () => {
  console.log(`
  ╔═══════════════════════════════════════╗
  ║                                       ║
  ║   🔧 Clork Server Running            ║
  ║   Claude + Work Task Manager          ║
  ║                                       ║
  ║   API: http://localhost:${PORT}          ║
  ║                                       ║
  ╚═══════════════════════════════════════╝
  `);

  // Check Claude status on startup
  const status = claudeService.checkStatus();
  if (status.installed) {
    console.log(`  ✅ Claude Code CLI detected`);
    if (status.loggedIn) {
      console.log(`  ✅ Logged in as: ${status.user}`);
    } else {
      console.log(`  ⚠️  Not logged in. Run 'claude login' to authenticate.`);
    }
  } else {
    console.log(`  ❌ Claude Code CLI not found. Install with: npm install -g @anthropic-ai/claude-code`);
  }
});

export default server;
