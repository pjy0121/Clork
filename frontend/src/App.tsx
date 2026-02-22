import { useEffect, useCallback } from 'react';
import { Toaster } from 'react-hot-toast';
import { ChevronRight, PanelLeftOpen } from 'lucide-react';
import { useStore } from './store';
import { useTranslation } from 'react-i18next';
import { getSocket } from './socket';
import Header from './components/Header';
import SessionView from './components/SessionView';
import ProjectView from './components/ProjectView';
import UnifiedSidebar from './components/UnifiedSidebar';
import SettingsModal from './components/SettingsModal';
import ProjectSettingsModal from './components/ProjectSettingsModal';
import TaskDetailModal from './components/TaskDetailModal';
import LoginPrompt from './components/LoginPrompt';
import type { Session, Task, TaskEvent, ClaudeUsage } from './types';
import UsageModal from './components/UsageModal';

export default function App() {
  const { t } = useTranslation();
  const theme = useStore((s) => s.theme);
  const activeProjectId = useStore((s) => s.activeProjectId);
  const activeSessionId = useStore((s) => s.activeSessionId);
  const claudeLoggedIn = useStore((s) => s.claudeLoggedIn);
  const claudeInstalled = useStore((s) => s.claudeInstalled);
  const fetchProjects = useStore((s) => s.fetchProjects);
  const fetchClaudeStatus = useStore((s) => s.fetchClaudeStatus);
  const fetchTasks = useStore((s) => s.fetchTasks);

  // Init theme
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  const fetchClaudeUsage = useStore((s) => s.fetchClaudeUsage);

  // Fetch initial data
  useEffect(() => {
    fetchProjects();
    fetchClaudeStatus();
    fetchClaudeUsage();

    // If we have a stored active project, fetch its sessions and tasks
    if (activeProjectId) {
      useStore.getState().fetchSessions(activeProjectId);
      useStore.getState().fetchTasks(activeProjectId);
    }
  }, []);

  // Setup socket listeners - use store.getState() to avoid stale closures
  useEffect(() => {
    const socket = getSocket();

    socket.on('claude:status', (data: { loggedIn: boolean; user?: string }) => {
      console.log('[Socket] claude:status', data);
      useStore.getState().setClaudeStatus(true, data.loggedIn, data.user || null);
    });

    socket.on('task:started', (data: { taskId: string; sessionId: string; task?: Task }) => {
      console.log('[Socket] task:started', data.taskId);
      // Update the task in store immediately if task data is provided
      if (data.task) {
        useStore.getState().upsertTaskLocal(data.task);
      }
      // Set as active task
      useStore.getState().setActiveTaskId(data.taskId);
      // Also re-fetch all tasks and sessions to get the latest state
      const projectId = useStore.getState().activeProjectId;
      if (projectId) {
        useStore.getState().fetchTasks(projectId);
        useStore.getState().fetchSessions(projectId);
      }
    });

    socket.on('task:progress', (data: { taskId: string; event: TaskEvent }) => {
      // Add event to the task's event list
      useStore.getState().addTaskEvent(data.taskId, data.event);
    });

    socket.on('task:completed', (data: { taskId: string; sessionId: string; task?: Task; result?: any }) => {
      console.log('[Socket] task:completed', data.taskId, 'task data:', data.task?.status, data.task?.location);
      if (data.task) {
        useStore.getState().upsertTaskLocal(data.task);
      }
      // Re-fetch tasks AND sessions to get updated state
      const projectId = useStore.getState().activeProjectId;
      if (projectId) {
        useStore.getState().fetchTasks(projectId);
        useStore.getState().fetchSessions(projectId);
      }
    });

    socket.on('task:failed', (data: { taskId: string; sessionId: string; task?: Task; error?: string }) => {
      console.log('[Socket] task:failed', data.taskId, data.error);
      if (data.task) {
        useStore.getState().upsertTaskLocal(data.task);
      }
      const projectId = useStore.getState().activeProjectId;
      if (projectId) {
        useStore.getState().fetchTasks(projectId);
      }
    });

    socket.on('task:aborted', (data: { taskId: string; sessionId: string; task?: Task }) => {
      console.log('[Socket] task:aborted', data.taskId);
      if (data.task) {
        useStore.getState().upsertTaskLocal(data.task);
      }
      useStore.getState().setHumanInput(data.taskId, null);
      const projectId = useStore.getState().activeProjectId;
      if (projectId) {
        useStore.getState().fetchTasks(projectId);
      }
    });

    socket.on('task:humanInput', (data: { taskId: string; sessionId: string; prompt: string }) => {
      console.log('[Socket] task:humanInput', data.taskId);
      useStore.getState().setHumanInput(data.taskId, data.prompt);
    });

    socket.on('task:humanInputCleared', (data: { taskId: string; sessionId: string }) => {
      console.log('[Socket] task:humanInputCleared', data.taskId);
      useStore.getState().setHumanInput(data.taskId, null);
    });

    socket.on('task:created', (data: { task: Task; sessionId: string; projectId: string }) => {
      console.log('[Socket] task:created', data.task.id);
      useStore.getState().upsertTaskLocal(data.task);
      // Also re-fetch tasks to keep list in sync
      const projectId = useStore.getState().activeProjectId;
      if (projectId) {
        useStore.getState().fetchTasks(projectId);
      }
    });

    socket.on('session:updated', (session: Session) => {
      console.log('[Socket] session:updated', session.id, session.status);
      useStore.getState().updateSessionLocal(session);
    });

    socket.on('usage:updated', (usage: ClaudeUsage) => {
      useStore.getState().setClaudeUsage(usage);
    });

    socket.on('connect', () => {
      console.log('[Socket] Connected');
      // Re-fetch data on reconnect to sync any missed events
      const projectId = useStore.getState().activeProjectId;
      if (projectId) {
        useStore.getState().fetchTasks(projectId);
        useStore.getState().fetchSessions(projectId);
      }
    });

    socket.on('disconnect', (reason) => {
      console.log('[Socket] Disconnected:', reason);
    });

    socket.on('reconnect', () => {
      console.log('[Socket] Reconnected');
      const projectId = useStore.getState().activeProjectId;
      if (projectId) {
        useStore.getState().fetchTasks(projectId);
        useStore.getState().fetchSessions(projectId);
      }
    });

    return () => {
      socket.off('claude:status');
      socket.off('task:started');
      socket.off('task:progress');
      socket.off('task:completed');
      socket.off('task:failed');
      socket.off('task:aborted');
      socket.off('task:humanInput');
      socket.off('task:humanInputCleared');
      socket.off('task:created');
      socket.off('session:updated');
      socket.off('usage:updated');
      socket.off('connect');
      socket.off('disconnect');
      socket.off('reconnect');
    };
  }, []); // Empty dependency - use getState() for latest values

  // Show login prompt if not logged in
  if (claudeInstalled && !claudeLoggedIn) {
    return (
      <div className={theme === 'dark' ? 'dark' : ''}>
        <LoginPrompt />
        <Toaster position="bottom-right" />
      </div>
    );
  }

  const sidebarOpen = useStore((s) => s.sidebarOpen);
  const toggleSidebar = useStore((s) => s.toggleSidebar);

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-slate-50 dark:bg-[#111936] text-slate-900 dark:text-[#d7dcec] transition-colors">
      <Header />
      <div className="flex flex-1 overflow-hidden relative">
        <div
          className={`flex-none flex flex-col h-full transition-all duration-300 ease-out ${sidebarOpen
            ? 'w-[22rem] min-w-[20rem] max-w-[24rem] md:w-[22rem] md:min-w-[20rem] max-md:w-[19rem] max-md:min-w-[18rem] border-r border-slate-200 dark:border-[#8492c4]/10 overflow-hidden'
            : 'w-0 min-w-0 max-w-0 border-r-0 overflow-hidden'
            }`}
        >
          <UnifiedSidebar />
        </div>

        {/* Sidebar Expansion Button (Visible when sidebar is closed) */}
        {!sidebarOpen && (
          <button
            onClick={toggleSidebar}
            className="absolute top-1/2 -translate-y-1/2 left-0 z-50 w-7 h-16 flex items-center justify-center bg-white dark:bg-[#1a223f] hover:bg-slate-100 dark:bg-[#212946] rounded-r-xl text-slate-500 dark:text-[#8492c4] hover:text-white transition-all shadow-md border border-l-0 border-slate-300 dark:border-[#8492c4]/20 group"
            title="Open Sidebar"
          >
            <ChevronRight size={14} className="transition-transform group-hover:translate-x-0.5" />
          </button>
        )}

        <main className="flex-1 overflow-hidden">
          {activeProjectId && activeSessionId ? (
            <SessionView />
          ) : activeProjectId ? (
            <ProjectView />
          ) : (
            <EmptyState message={t('app.selectProject')} />
          )}
        </main>
      </div>
      <SettingsModal />
      <ProjectSettingsModal />
      <TaskDetailModal />
      <UsageModal />
      <Toaster
        position="bottom-right"
        toastOptions={{
          className: '!bg-white dark:!bg-gray-800 !text-gray-900 dark:!text-gray-100 !shadow-lg',
        }}
      />
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="h-full flex items-center justify-center bg-transparent">
      <div className="text-center max-w-sm w-full p-10 dashboard-panel mx-4">
        <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shadow-inner">
          <svg className="w-8 h-8 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <h3 className="text-xl font-bold text-white mb-2">Welcome to Clork</h3>
        <p className="text-sm text-slate-500 dark:text-[#8492c4] font-medium leading-relaxed">{message}</p>
      </div>
    </div>
  );
}
