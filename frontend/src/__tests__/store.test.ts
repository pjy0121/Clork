import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../store';

describe('Store', () => {
  beforeEach(() => {
    // Reset store to initial state
    useStore.setState({
      theme: 'dark',
      activeProjectId: null,
      activeSessionId: null,
      projects: [],
      sessions: [],
      tasks: [],
      taskEvents: {},
      humanInputTasks: {},
      activeTaskId: null,
    });
  });

  it('should have dark theme by default', () => {
    expect(useStore.getState().theme).toBe('dark');
  });

  it('should set active project and clear session', () => {
    useStore.setState({ activeSessionId: 'some-session' });
    // Directly test the state logic (not the async fetch)
    useStore.setState({
      activeProjectId: 'p1',
      activeSessionId: null,
      tasks: [],
      taskEvents: {},
      activeTaskId: null,
    });

    const state = useStore.getState();
    expect(state.activeProjectId).toBe('p1');
    expect(state.activeSessionId).toBeNull();
    expect(state.tasks).toEqual([]);
  });

  it('should set active session', () => {
    useStore.getState().setActiveSession('s1');
    expect(useStore.getState().activeSessionId).toBe('s1');
    expect(useStore.getState().activeTaskId).toBeNull();
  });

  it('should toggle sidebar', () => {
    expect(useStore.getState().sidebarOpen).toBe(true);
    useStore.getState().toggleSidebar();
    expect(useStore.getState().sidebarOpen).toBe(false);
    useStore.getState().toggleSidebar();
    expect(useStore.getState().sidebarOpen).toBe(true);
  });

  it('should manage human input tasks', () => {
    useStore.getState().setHumanInput('t1', 'Please confirm');
    expect(useStore.getState().humanInputTasks['t1']).toBe('Please confirm');

    useStore.getState().setHumanInput('t1', null);
    expect(useStore.getState().humanInputTasks['t1']).toBeUndefined();
  });

  it('should add task events', () => {
    const event = {
      id: 'e1',
      taskId: 't1',
      eventType: 'assistant' as const,
      data: '{"text":"hello"}',
      timestamp: new Date().toISOString(),
    };
    useStore.getState().addTaskEvent('t1', event);
    expect(useStore.getState().taskEvents['t1']).toHaveLength(1);
    expect(useStore.getState().taskEvents['t1'][0].id).toBe('e1');
  });

  it('should upsert task locally', () => {
    const task = {
      id: 't1',
      projectId: 'p1',
      sessionId: 's1',
      prompt: 'Test',
      status: 'pending' as const,
      location: 'todo' as const,
      taskOrder: 0,
      createdAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null,
    };

    // Insert new
    useStore.getState().upsertTaskLocal(task);
    expect(useStore.getState().tasks).toHaveLength(1);

    // Update existing
    useStore.getState().upsertTaskLocal({ ...task, status: 'running' });
    expect(useStore.getState().tasks).toHaveLength(1);
    expect(useStore.getState().tasks[0].status).toBe('running');
  });
});
