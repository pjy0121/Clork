import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'clork.db');
const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ========== Schema Setup ==========
db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    rootDirectory TEXT NOT NULL,
    defaultModel TEXT DEFAULT 'claude-sonnet-4-20250514',
    permissionMode TEXT DEFAULT 'default',
    createdAt TEXT DEFAULT (datetime('now')),
    updatedAt TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    projectId TEXT NOT NULL,
    name TEXT NOT NULL,
    model TEXT,
    status TEXT DEFAULT 'idle',
    sessionOrder INTEGER NOT NULL,
    claudeSessionId TEXT,
    createdAt TEXT DEFAULT (datetime('now')),
    updatedAt TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (projectId) REFERENCES projects(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    projectId TEXT NOT NULL,
    sessionId TEXT,
    prompt TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    location TEXT DEFAULT 'backlog',
    taskOrder INTEGER NOT NULL,
    createdAt TEXT DEFAULT (datetime('now')),
    updatedAt TEXT DEFAULT (datetime('now')),
    startedAt TEXT,
    completedAt TEXT,
    FOREIGN KEY (projectId) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (sessionId) REFERENCES sessions(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS task_events (
    id TEXT PRIMARY KEY,
    taskId TEXT NOT NULL,
    eventType TEXT NOT NULL,
    data TEXT NOT NULL,
    timestamp TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (taskId) REFERENCES tasks(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

// ========== Migrations ==========
try {
  db.exec(`ALTER TABLE sessions ADD COLUMN model TEXT`);
} catch {
  // Column already exists
}

// Add autoProcessBacklog and maxTasksPerSession to projects
try {
  db.exec(`ALTER TABLE projects ADD COLUMN autoProcessBacklog INTEGER DEFAULT 0`);
} catch {
  // Column already exists
}

try {
  db.exec(`ALTER TABLE projects ADD COLUMN maxTasksPerSession INTEGER DEFAULT 10`);
} catch {
  // Column already exists
}

// Add nextSessionId to sessions for sequential execution chaining
try {
  db.exec(`ALTER TABLE sessions ADD COLUMN nextSessionId TEXT REFERENCES sessions(id) ON DELETE SET NULL`);
} catch {
  // Column already exists
}

// Add isActive to sessions for activation state (separate from running status)
try {
  db.exec(`ALTER TABLE sessions ADD COLUMN isActive INTEGER DEFAULT 0`);
} catch {
  // Column already exists
}

// ========== Project Operations ==========
export const projectOps = {
  getAll: db.prepare('SELECT * FROM projects ORDER BY createdAt DESC'),
  getById: db.prepare('SELECT * FROM projects WHERE id = ?'),
  create: db.prepare(
    'INSERT INTO projects (id, name, rootDirectory, defaultModel, permissionMode) VALUES (?, ?, ?, ?, ?)'
  ),
  update: db.prepare(
    'UPDATE projects SET name = ?, rootDirectory = ?, defaultModel = ?, permissionMode = ?, autoProcessBacklog = ?, maxTasksPerSession = ?, updatedAt = datetime(\'now\') WHERE id = ?'
  ),
  delete: db.prepare('DELETE FROM projects WHERE id = ?'),
};

// ========== Session Operations ==========
export const sessionOps = {
  getByProject: db.prepare('SELECT * FROM sessions WHERE projectId = ? ORDER BY sessionOrder ASC'),
  getById: db.prepare('SELECT * FROM sessions WHERE id = ?'),
  create: db.prepare(
    'INSERT INTO sessions (id, projectId, name, model, status, isActive, sessionOrder) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ),
  updateStatus: db.prepare(
    'UPDATE sessions SET status = ?, updatedAt = datetime(\'now\') WHERE id = ?'
  ),
  updateIsActive: db.prepare(
    'UPDATE sessions SET isActive = ?, updatedAt = datetime(\'now\') WHERE id = ?'
  ),
  updateName: db.prepare(
    'UPDATE sessions SET name = ?, updatedAt = datetime(\'now\') WHERE id = ?'
  ),
  updateOrder: db.prepare(
    'UPDATE sessions SET sessionOrder = ?, updatedAt = datetime(\'now\') WHERE id = ?'
  ),
  updateClaudeSessionId: db.prepare(
    'UPDATE sessions SET claudeSessionId = ?, updatedAt = datetime(\'now\') WHERE id = ?'
  ),
  delete: db.prepare('DELETE FROM sessions WHERE id = ?'),
  getMaxOrder: db.prepare('SELECT COALESCE(MAX(sessionOrder), -1) as maxOrder FROM sessions WHERE projectId = ?'),
  getNextQueued: db.prepare(
    'SELECT * FROM sessions WHERE projectId = ? AND status IN (\'idle\', \'queued\') ORDER BY sessionOrder ASC LIMIT 1'
  ),
  getRunning: db.prepare(
    'SELECT * FROM sessions WHERE projectId = ? AND status = \'running\' LIMIT 1'
  ),
  updateNextSession: db.prepare(
    'UPDATE sessions SET nextSessionId = ?, updatedAt = datetime(\'now\') WHERE id = ?'
  ),
  getChainedSession: db.prepare(
    'SELECT * FROM sessions WHERE id = ?'
  ),
  clearNextSessionPointers: db.prepare(
    'UPDATE sessions SET nextSessionId = NULL WHERE nextSessionId = ?'
  ),
};

// ========== Task Operations ==========
export const taskOps = {
  getByProject: db.prepare('SELECT * FROM tasks WHERE projectId = ? ORDER BY taskOrder ASC'),
  getBySession: db.prepare('SELECT * FROM tasks WHERE sessionId = ? ORDER BY taskOrder ASC'),
  getBacklog: db.prepare(
    'SELECT * FROM tasks WHERE projectId = ? AND location = \'backlog\' ORDER BY taskOrder ASC'
  ),
  getQueue: db.prepare(
    'SELECT * FROM tasks WHERE projectId = ? AND location = \'queue\' ORDER BY taskOrder ASC'
  ),
  getTodo: db.prepare(
    'SELECT * FROM tasks WHERE sessionId = ? AND location = \'todo\' AND status = \'pending\' ORDER BY taskOrder ASC'
  ),
  getDone: db.prepare(
    'SELECT * FROM tasks WHERE sessionId = ? AND location = \'done\' ORDER BY completedAt DESC'
  ),
  getById: db.prepare('SELECT * FROM tasks WHERE id = ?'),
  getRunning: db.prepare(
    'SELECT * FROM tasks WHERE sessionId = ? AND status = \'running\' LIMIT 1'
  ),
  create: db.prepare(
    'INSERT INTO tasks (id, projectId, sessionId, prompt, status, location, taskOrder) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ),
  updateStatus: db.prepare(
    'UPDATE tasks SET status = ?, updatedAt = datetime(\'now\') WHERE id = ?'
  ),
  updateStarted: db.prepare(
    'UPDATE tasks SET status = \'running\', startedAt = datetime(\'now\') WHERE id = ?'
  ),
  updateCompleted: db.prepare(
    'UPDATE tasks SET status = ?, location = \'done\', completedAt = datetime(\'now\') WHERE id = ?'
  ),
  updateLocation: db.prepare(
    'UPDATE tasks SET location = ?, sessionId = ?, taskOrder = ? WHERE id = ?'
  ),
  updateOrder: db.prepare('UPDATE tasks SET taskOrder = ? WHERE id = ?'),
  updatePrompt: db.prepare('UPDATE tasks SET prompt = ? WHERE id = ?'),
  delete: db.prepare('DELETE FROM tasks WHERE id = ?'),
  getMaxBacklogOrder: db.prepare(
    'SELECT COALESCE(MAX(taskOrder), -1) as maxOrder FROM tasks WHERE projectId = ? AND location = \'backlog\''
  ),
  getMaxQueueOrder: db.prepare(
    'SELECT COALESCE(MAX(taskOrder), -1) as maxOrder FROM tasks WHERE projectId = ? AND location = \'queue\''
  ),
  getMaxTodoOrder: db.prepare(
    'SELECT COALESCE(MAX(taskOrder), -1) as maxOrder FROM tasks WHERE sessionId = ? AND location = \'todo\''
  ),
};

// ========== Task Event Operations ==========
export const eventOps = {
  getByTask: db.prepare('SELECT * FROM task_events WHERE taskId = ? ORDER BY timestamp ASC'),
  create: db.prepare(
    'INSERT INTO task_events (id, taskId, eventType, data) VALUES (?, ?, ?, ?)'
  ),
  deleteByTask: db.prepare('DELETE FROM task_events WHERE taskId = ?'),
};

// ========== Settings Operations ==========
export const settingsOps = {
  get: db.prepare('SELECT value FROM settings WHERE key = ?'),
  set: db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)'),
};

// Initialize image counter if not exists
const imageCounterRow = settingsOps.get.get('imageCounter');
if (!imageCounterRow) {
  settingsOps.set.run('imageCounter', '0');
}

export default db;
