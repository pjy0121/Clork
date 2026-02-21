import { create } from 'zustand';
import type { Project, Session, Task, TaskEvent, ClaudeUsage } from './types';
import { projectsApi, sessionsApi, tasksApi, settingsApi } from './api';

interface AppState {
  // ===== Theme =====
  theme: 'light' | 'dark';
  setTheme: (t: 'light' | 'dark') => void;

  // ===== Claude Status =====
  claudeInstalled: boolean;
  claudeLoggedIn: boolean;
  claudeUser: string | null;
  setClaudeStatus: (installed: boolean, loggedIn: boolean, user: string | null) => void;
  fetchClaudeStatus: () => Promise<void>;

  // ===== Claude Usage =====
  claudeUsage: ClaudeUsage | null;
  usageModalOpen: boolean;
  fetchClaudeUsage: () => Promise<void>;
  refreshClaudeUsage: () => Promise<void>; // Force live API poll
  setClaudeUsage: (usage: ClaudeUsage) => void;
  setUsageModalOpen: (open: boolean) => void;

  // ===== UI State =====
  activeProjectId: string | null;
  activeSessionId: string | null;
  sidebarOpen: boolean;
  settingsOpen: boolean;
  projectSettingsOpen: boolean;
  taskDetailId: string | null;
  expandedProjects: Set<string>; // 프로젝트별 펼침/접힘 상태
  setActiveProject: (id: string | null) => void;
  setActiveSession: (id: string | null) => void;
  toggleSidebar: () => void;
  setSidebarOpen: (v: boolean) => void;
  setSettingsOpen: (v: boolean) => void;
  setProjectSettingsOpen: (v: boolean) => void;
  setTaskDetailId: (id: string | null) => void;
  toggleProjectExpanded: (projectId: string) => void;

  // ===== Projects =====
  projects: Project[];
  fetchProjects: () => Promise<void>;
  createProject: (data: Partial<Project>) => Promise<Project>;
  updateProject: (id: string, data: Partial<Project>) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;

  // ===== Sessions =====
  sessions: Session[];
  sessionsByProject: Record<string, Session[]>; // projectId -> sessions
  fetchSessions: (projectId: string) => Promise<void>;
  fetchAllSessions: () => Promise<void>; // 모든 프로젝트의 세션을 가져오기
  createSession: (projectId: string, name: string, model?: string, prompt?: string) => Promise<Session>;
  updateSession: (id: string, data: Partial<Session>) => Promise<void>;
  startSession: (id: string) => Promise<void>;
  toggleSession: (id: string) => Promise<void>;
  deleteSession: (id: string) => Promise<void>;
  reorderSessions: (sessionOrders: Array<{ id: string; sessionOrder: number }>) => Promise<void>;
  updateSessionLocal: (session: Session) => void;

  // ===== Tasks =====
  tasks: Task[];
  fetchTasks: (projectId: string) => Promise<void>;
  createTask: (data: { projectId: string; sessionId?: string; prompt: string; location?: string }) => Promise<Task>;
  updateTask: (id: string, data: Partial<Task>) => Promise<void>;
  moveTask: (id: string, data: { location: string; sessionId?: string; taskOrder?: number }) => Promise<void>;
  abortTask: (id: string) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  reorderTasks: (taskOrders: Array<{ id: string; taskOrder: number }>) => Promise<void>;
  updateTaskLocal: (task: Task) => void;
  upsertTaskLocal: (task: Task) => void;

  // ===== Task Events =====
  taskEvents: Record<string, TaskEvent[]>;
  fetchTaskEvents: (taskId: string) => Promise<void>;
  addTaskEvent: (taskId: string, event: TaskEvent) => void;

  // ===== Human In The Loop =====
  humanInputTasks: Record<string, string>; // taskId -> prompt
  setHumanInput: (taskId: string, prompt: string | null) => void;

  // ===== Active Task Tracking =====
  activeTaskId: string | null; // Currently active (running or most recently run) task
  setActiveTaskId: (id: string | null) => void;
}

// Helper function to safely access localStorage
const getLocalStorage = (key: string, defaultValue: any) => {
  try {
    const item = window.localStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue;
  } catch {
    return defaultValue;
  }
};

const setLocalStorage = (key: string, value: any) => {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore errors
  }
};

export const useStore = create<AppState>((set, get) => ({
  // ===== Theme =====
  theme: 'dark',
  setTheme: (t) => {
    set({ theme: t });
    settingsApi.update({ theme: t }).catch(() => { });
    if (t === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  },

  // ===== Claude Status =====
  claudeInstalled: false,
  claudeLoggedIn: false,
  claudeUser: null,
  setClaudeStatus: (installed, loggedIn, user) =>
    set({ claudeInstalled: installed, claudeLoggedIn: loggedIn, claudeUser: user }),
  fetchClaudeStatus: async () => {
    try {
      const s = await settingsApi.claudeStatus();
      set({ claudeInstalled: s.installed, claudeLoggedIn: s.loggedIn, claudeUser: s.user });
    } catch {
      set({ claudeInstalled: false, claudeLoggedIn: false, claudeUser: null });
    }
  },

  // ===== Claude Usage =====
  claudeUsage: null,
  usageModalOpen: false,
  fetchClaudeUsage: async () => {
    try {
      const usage = await settingsApi.claudeUsage();
      set({ claudeUsage: usage });
    } catch {
      // Don't clear usage on fetch error - keep last known data
    }
  },
  refreshClaudeUsage: async () => {
    try {
      const usage = await settingsApi.refreshClaudeUsage();
      set({ claudeUsage: usage });
    } catch {
      // Don't clear usage on fetch error
    }
  },
  setClaudeUsage: (usage) => set({ claudeUsage: usage }),
  setUsageModalOpen: (open) => set({ usageModalOpen: open }),

  // ===== UI State =====
  activeProjectId: getLocalStorage('activeProjectId', null),
  activeSessionId: getLocalStorage('activeSessionId', null),
  sidebarOpen: getLocalStorage('sidebarOpen', true),
  settingsOpen: false,
  projectSettingsOpen: false,
  taskDetailId: null,
  expandedProjects: new Set(getLocalStorage('expandedProjects', [])),
  setActiveProject: (id) => {
    if (get().activeProjectId === id) return; // Prevent unnecessary re-renders and jitter
    set({ activeProjectId: id, activeSessionId: null, tasks: [], taskEvents: {}, activeTaskId: null });
    setLocalStorage('activeProjectId', id);
    if (id) {
      get().fetchSessions(id);
      get().fetchTasks(id);
    }
  },
  setActiveSession: (id) => {
    set({ activeSessionId: id, activeTaskId: null });
    setLocalStorage('activeSessionId', id);
  },
  toggleSidebar: () => {
    const next = !get().sidebarOpen;
    set({ sidebarOpen: next });
    setLocalStorage('sidebarOpen', next);
  },
  setSidebarOpen: (v) => {
    set({ sidebarOpen: v });
    setLocalStorage('sidebarOpen', v);
  },
  setSettingsOpen: (v) => set({ settingsOpen: v }),
  setProjectSettingsOpen: (v) => set({ projectSettingsOpen: v }),
  setTaskDetailId: (id) => set({ taskDetailId: id }),
  toggleProjectExpanded: (projectId) => {
    set((s) => {
      const newExpanded = new Set(s.expandedProjects);
      if (newExpanded.has(projectId)) {
        newExpanded.delete(projectId);
      } else {
        newExpanded.add(projectId);
      }
      setLocalStorage('expandedProjects', Array.from(newExpanded));
      return { expandedProjects: newExpanded };
    });
  },

  // ===== Projects =====
  projects: [],
  fetchProjects: async () => {
    const projects = await projectsApi.getAll();
    set({ projects });
  },
  createProject: async (data) => {
    const project = await projectsApi.create(data);
    set((s) => {
      const newExpanded = new Set(s.expandedProjects);
      newExpanded.add(project.id); // 새 프로젝트는 기본적으로 펼쳐진 상태
      setLocalStorage('expandedProjects', Array.from(newExpanded));
      return {
        projects: [project, ...s.projects],
        expandedProjects: newExpanded
      };
    });
    return project;
  },
  updateProject: async (id, data) => {
    const project = await projectsApi.update(id, data);
    set((s) => ({ projects: s.projects.map((p) => (p.id === id ? project : p)) }));
  },
  deleteProject: async (id) => {
    await projectsApi.delete(id);
    set((s) => ({
      projects: s.projects.filter((p) => p.id !== id),
      activeProjectId: s.activeProjectId === id ? null : s.activeProjectId,
    }));
  },

  // ===== Sessions =====
  sessions: [],
  sessionsByProject: {},
  fetchSessions: async (projectId) => {
    const sessions = await sessionsApi.getByProject(projectId);
    set((s) => ({
      sessions,
      sessionsByProject: { ...s.sessionsByProject, [projectId]: sessions }
    }));
  },
  fetchAllSessions: async () => {
    const projects = get().projects;
    const allSessionsByProject: Record<string, Session[]> = {};

    for (const project of projects) {
      const sessions = await sessionsApi.getByProject(project.id);
      allSessionsByProject[project.id] = sessions;
    }

    set({ sessionsByProject: allSessionsByProject });
  },
  createSession: async (projectId, name, model?, prompt?) => {
    const session = await sessionsApi.create({ projectId, name, model, prompt });
    set((s) => ({
      sessions: [...s.sessions, session],
      sessionsByProject: {
        ...s.sessionsByProject,
        [projectId]: [...(s.sessionsByProject[projectId] || []), session]
      }
    }));
    // Refetch tasks to include the auto-created task
    if (prompt) {
      get().fetchTasks(projectId);
    }
    return session;
  },
  updateSession: async (id, data) => {
    const session = await sessionsApi.update(id, data);
    set((s) => {
      const updatedSessions = s.sessions.map((ss) => (ss.id === id ? session : ss));
      const updatedSessionsByProject = { ...s.sessionsByProject };
      if (session.projectId && updatedSessionsByProject[session.projectId]) {
        updatedSessionsByProject[session.projectId] = updatedSessionsByProject[session.projectId].map((ss) => (ss.id === id ? session : ss));
      }
      return { sessions: updatedSessions, sessionsByProject: updatedSessionsByProject };
    });
  },
  startSession: async (id) => {
    const session = await sessionsApi.start(id);
    set((s) => {
      const updatedSessions = s.sessions.map((ss) => (ss.id === id ? session : ss));
      const updatedSessionsByProject = { ...s.sessionsByProject };
      if (session.projectId && updatedSessionsByProject[session.projectId]) {
        updatedSessionsByProject[session.projectId] = updatedSessionsByProject[session.projectId].map((ss) => (ss.id === id ? session : ss));
      }
      return { sessions: updatedSessions, sessionsByProject: updatedSessionsByProject };
    });
  },
  toggleSession: async (id) => {
    const session = await sessionsApi.toggle(id);
    set((s) => {
      const updatedSessions = s.sessions.map((ss) => (ss.id === id ? session : ss));
      const updatedSessionsByProject = { ...s.sessionsByProject };
      if (session.projectId && updatedSessionsByProject[session.projectId]) {
        updatedSessionsByProject[session.projectId] = updatedSessionsByProject[session.projectId].map((ss) => (ss.id === id ? session : ss));
      }
      return { sessions: updatedSessions, sessionsByProject: updatedSessionsByProject };
    });
  },
  deleteSession: async (id) => {
    await sessionsApi.delete(id);
    set((s) => {
      const deletedSession = s.sessions.find(ss => ss.id === id);
      const updatedSessions = s.sessions.filter((ss) => ss.id !== id);
      const updatedSessionsByProject = { ...s.sessionsByProject };

      if (deletedSession?.projectId && updatedSessionsByProject[deletedSession.projectId]) {
        updatedSessionsByProject[deletedSession.projectId] = updatedSessionsByProject[deletedSession.projectId].filter((ss) => ss.id !== id);
      }

      return {
        sessions: updatedSessions,
        sessionsByProject: updatedSessionsByProject,
        activeSessionId: s.activeSessionId === id ? null : s.activeSessionId,
      };
    });
  },
  reorderSessions: async (sessionOrders) => {
    await sessionsApi.reorder(sessionOrders);
    set((s) => {
      const updatedSessions = s.sessions
        .map((ss) => {
          const order = sessionOrders.find((o) => o.id === ss.id);
          return order ? { ...ss, sessionOrder: order.sessionOrder } : ss;
        })
        .sort((a, b) => a.sessionOrder - b.sessionOrder);

      // Also update sessionsByProject
      const updatedByProject = { ...s.sessionsByProject };
      for (const projectId of Object.keys(updatedByProject)) {
        updatedByProject[projectId] = updatedByProject[projectId]
          .map((ss) => {
            const order = sessionOrders.find((o) => o.id === ss.id);
            return order ? { ...ss, sessionOrder: order.sessionOrder } : ss;
          })
          .sort((a, b) => a.sessionOrder - b.sessionOrder);
      }

      return { sessions: updatedSessions, sessionsByProject: updatedByProject };
    });
  },
  updateSessionLocal: (session) => {
    set((s) => {
      const exists = s.sessions.some((ss) => ss.id === session.id);
      const updatedSessions = exists
        ? s.sessions.map((ss) => (ss.id === session.id ? session : ss))
        : [...s.sessions, session];

      const updatedSessionsByProject = { ...s.sessionsByProject };
      if (session.projectId) {
        const projectSessions = updatedSessionsByProject[session.projectId] || [];
        const existsInProject = projectSessions.some((ss) => ss.id === session.id);

        updatedSessionsByProject[session.projectId] = existsInProject
          ? projectSessions.map((ss) => (ss.id === session.id ? session : ss))
          : [...projectSessions, session];
      }

      return { sessions: updatedSessions, sessionsByProject: updatedSessionsByProject };
    });
  },

  // ===== Tasks =====
  tasks: [],
  fetchTasks: async (projectId) => {
    const tasks = await tasksApi.getByProject(projectId);
    set({ tasks });
  },
  createTask: async (data) => {
    const task = await tasksApi.create(data);
    set((s) => ({ tasks: [...s.tasks, task] }));
    return task;
  },
  updateTask: async (id, data) => {
    const task = await tasksApi.update(id, data);
    set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? task : t)) }));
  },
  moveTask: async (id, data) => {
    const task = await tasksApi.move(id, data);
    set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? task : t)) }));
  },
  abortTask: async (id) => {
    const task = await tasksApi.abort(id);
    set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? task : t)) }));
  },
  deleteTask: async (id) => {
    await tasksApi.delete(id);
    set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) }));
  },
  reorderTasks: async (taskOrders) => {
    await tasksApi.reorder(taskOrders);
    set((s) => ({
      tasks: s.tasks.map((t) => {
        const order = taskOrders.find((o) => o.id === t.id);
        return order ? { ...t, taskOrder: order.taskOrder } : t;
      }),
    }));
  },
  updateTaskLocal: (task) => {
    set((s) => ({
      tasks: s.tasks.map((t) => (t.id === task.id ? task : t)),
    }));
  },
  upsertTaskLocal: (task) => {
    set((s) => {
      const exists = s.tasks.some((t) => t.id === task.id);
      return {
        tasks: exists
          ? s.tasks.map((t) => (t.id === task.id ? task : t))
          : [...s.tasks, task],
      };
    });
  },

  // ===== Task Events =====
  taskEvents: {},
  fetchTaskEvents: async (taskId) => {
    const events = await tasksApi.getEvents(taskId);
    set((s) => ({ taskEvents: { ...s.taskEvents, [taskId]: events } }));
  },
  addTaskEvent: (taskId, event) => {
    set((s) => ({
      taskEvents: {
        ...s.taskEvents,
        [taskId]: [...(s.taskEvents[taskId] || []), event],
      },
    }));
  },

  // ===== Human In The Loop =====
  humanInputTasks: {},
  setHumanInput: (taskId, prompt) => {
    set((s) => {
      const next = { ...s.humanInputTasks };
      if (prompt === null) {
        delete next[taskId];
      } else {
        next[taskId] = prompt;
      }
      return { humanInputTasks: next };
    });
  },

  // ===== Active Task Tracking =====
  activeTaskId: null,
  setActiveTaskId: (id) => set({ activeTaskId: id }),
}));
