import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const TEST_DB_DIR = path.join(__dirname, '..', '..', 'data');
let db: Database.Database;
let dbPath: string;

function createTestDb() {
  // Use unique file per test to avoid Windows file locking
  dbPath = path.join(TEST_DB_DIR, `test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);

  if (!fs.existsSync(TEST_DB_DIR)) {
    fs.mkdirSync(TEST_DB_DIR, { recursive: true });
  }

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      rootDirectory TEXT NOT NULL,
      defaultModel TEXT DEFAULT 'claude-sonnet-4-20250514',
      permissionMode TEXT DEFAULT 'default',
      createdAt TEXT DEFAULT (datetime('now')),
      updatedAt TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE sessions (
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

    CREATE TABLE tasks (
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
  `);

  return db;
}

describe('Database Schema', () => {
  beforeEach(() => {
    createTestDb();
  });

  afterEach(() => {
    try { db.close(); } catch {}
    try { if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath); } catch {}
    try { if (fs.existsSync(dbPath + '-wal')) fs.unlinkSync(dbPath + '-wal'); } catch {}
    try { if (fs.existsSync(dbPath + '-shm')) fs.unlinkSync(dbPath + '-shm'); } catch {}
  });

  it('should create a project', () => {
    db.prepare('INSERT INTO projects (id, name, rootDirectory) VALUES (?, ?, ?)').run(
      'p1', 'Test Project', '/tmp/test'
    );
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get('p1') as any;
    expect(project).toBeDefined();
    expect(project.name).toBe('Test Project');
    expect(project.defaultModel).toBe('claude-sonnet-4-20250514');
  });

  it('should create a session with model override', () => {
    db.prepare('INSERT INTO projects (id, name, rootDirectory) VALUES (?, ?, ?)').run('p1', 'Test', '/tmp');
    db.prepare('INSERT INTO sessions (id, projectId, name, model, status, sessionOrder) VALUES (?, ?, ?, ?, ?, ?)').run(
      's1', 'p1', '#1', 'claude-opus-4-20250514', 'idle', 0
    );
    const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get('s1') as any;
    expect(session.model).toBe('claude-opus-4-20250514');
    expect(session.name).toBe('#1');
  });

  it('should cascade delete sessions when project is deleted', () => {
    db.prepare('INSERT INTO projects (id, name, rootDirectory) VALUES (?, ?, ?)').run('p1', 'Test', '/tmp');
    db.prepare('INSERT INTO sessions (id, projectId, name, status, sessionOrder) VALUES (?, ?, ?, ?, ?)').run('s1', 'p1', '#1', 'idle', 0);
    db.prepare('DELETE FROM projects WHERE id = ?').run('p1');
    const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get('s1');
    expect(session).toBeUndefined();
  });

  it('should create tasks in backlog with ordering', () => {
    db.prepare('INSERT INTO projects (id, name, rootDirectory) VALUES (?, ?, ?)').run('p1', 'Test', '/tmp');
    db.prepare('INSERT INTO tasks (id, projectId, prompt, location, taskOrder) VALUES (?, ?, ?, ?, ?)').run('t1', 'p1', 'Task 1', 'backlog', 0);
    db.prepare('INSERT INTO tasks (id, projectId, prompt, location, taskOrder) VALUES (?, ?, ?, ?, ?)').run('t2', 'p1', 'Task 2', 'backlog', 1);

    const tasks = db.prepare('SELECT * FROM tasks WHERE projectId = ? ORDER BY taskOrder').all('p1') as any[];
    expect(tasks).toHaveLength(2);
    expect(tasks[0].prompt).toBe('Task 1');
    expect(tasks[1].prompt).toBe('Task 2');
  });

  it('should move task from backlog to todo', () => {
    db.prepare('INSERT INTO projects (id, name, rootDirectory) VALUES (?, ?, ?)').run('p1', 'Test', '/tmp');
    db.prepare('INSERT INTO sessions (id, projectId, name, status, sessionOrder) VALUES (?, ?, ?, ?, ?)').run('s1', 'p1', '#1', 'idle', 0);
    db.prepare('INSERT INTO tasks (id, projectId, prompt, location, taskOrder) VALUES (?, ?, ?, ?, ?)').run('t1', 'p1', 'Do something', 'backlog', 0);

    db.prepare('UPDATE tasks SET location = ?, sessionId = ?, taskOrder = ? WHERE id = ?').run('todo', 's1', 0, 't1');

    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get('t1') as any;
    expect(task.location).toBe('todo');
    expect(task.sessionId).toBe('s1');
  });
});
