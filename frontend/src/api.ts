import type { Project, Session, Task, TaskEvent, ClaudeUsage } from './types';

const API = '/api';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

// ===== Projects =====
export const projectsApi = {
  getAll: () => request<Project[]>('/projects'),
  get: (id: string) => request<Project>(`/projects/${id}`),
  create: (data: Partial<Project>) =>
    request<Project>('/projects', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<Project>) =>
    request<Project>(`/projects/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) =>
    request<{ success: boolean }>(`/projects/${id}`, { method: 'DELETE' }),
};

// ===== Sessions =====
export const sessionsApi = {
  getByProject: (projectId: string) =>
    request<Session[]>(`/sessions?projectId=${projectId}`),
  get: (id: string) => request<Session>(`/sessions/${id}`),
  create: (data: { projectId: string; name: string; model?: string; prompt?: string }) =>
    request<Session>('/sessions', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<Session>) =>
    request<Session>(`/sessions/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  start: (id: string) =>
    request<Session>(`/sessions/${id}/start`, { method: 'POST' }),
  toggle: (id: string) =>
    request<Session>(`/sessions/${id}/toggle`, { method: 'POST' }),
  reorder: (sessionOrders: { id: string; sessionOrder: number }[]) =>
    request<{ success: boolean }>('/sessions/reorder', {
      method: 'POST',
      body: JSON.stringify({ sessionOrders }),
    }),
  delete: (id: string) =>
    request<{ success: boolean }>(`/sessions/${id}`, { method: 'DELETE' }),
};

// ===== Tasks =====
export const tasksApi = {
  getByProject: (projectId: string) =>
    request<Task[]>(`/tasks?projectId=${projectId}`),
  getBacklog: (projectId: string) =>
    request<Task[]>(`/tasks?projectId=${projectId}&location=backlog`),
  getBySession: (sessionId: string) =>
    request<Task[]>(`/tasks?sessionId=${sessionId}`),
  getTodo: (sessionId: string) =>
    request<Task[]>(`/tasks?sessionId=${sessionId}&location=todo`),
  getDone: (sessionId: string) =>
    request<Task[]>(`/tasks?sessionId=${sessionId}&location=done`),
  get: (id: string) => request<Task>(`/tasks/${id}`),
  getEvents: (id: string) => request<TaskEvent[]>(`/tasks/${id}/events`),
  create: (data: { projectId: string; sessionId?: string; prompt: string; location?: string }) =>
    request<Task>('/tasks', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<Task>) =>
    request<Task>(`/tasks/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  move: (id: string, data: { location: string; sessionId?: string; taskOrder?: number }) =>
    request<Task>(`/tasks/${id}/move`, { method: 'POST', body: JSON.stringify(data) }),
  abort: (id: string) =>
    request<Task>(`/tasks/${id}/abort`, { method: 'POST' }),
  reorder: (taskOrders: Array<{ id: string; taskOrder: number }>) =>
    request<{ success: boolean }>('/tasks/reorder', {
      method: 'POST',
      body: JSON.stringify({ taskOrders }),
    }),
  humanResponse: (id: string, response: string) =>
    request<{ success: boolean }>(`/tasks/${id}/human-response`, {
      method: 'POST',
      body: JSON.stringify({ response }),
    }),
  delete: (id: string) =>
    request<{ success: boolean }>(`/tasks/${id}`, { method: 'DELETE' }),
};

// ===== Settings =====
export const settingsApi = {
  get: () => request<{ theme: string }>('/settings'),
  update: (data: { theme?: string }) =>
    request<{ success: boolean }>('/settings', { method: 'PUT', body: JSON.stringify(data) }),
  claudeStatus: () =>
    request<{ installed: boolean; loggedIn: boolean; user: string | null }>('/settings/claude-status'),
  claudeUsage: () =>
    request<ClaudeUsage>('/settings/claude-usage'),
  refreshClaudeUsage: () =>
    request<ClaudeUsage>('/settings/claude-usage/refresh', { method: 'POST' }),
};
