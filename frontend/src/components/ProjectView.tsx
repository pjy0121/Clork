import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Pencil,
  Play,
  Loader2,
  Circle,
  Pause,
  CheckCircle2,
  Unlink,
  GripVertical,
  Settings2,
} from 'lucide-react';
import { useStore } from '../store';
import { buildChains, type SessionChain } from '../utils/sessionUtils';
import type { Session, Task, SessionStatus } from '../types';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  DragStartEvent,
  DragEndEvent,
  useDraggable,
  useDroppable,
} from '@dnd-kit/core';
import toast from 'react-hot-toast';

const STATUS_CONFIG: Record<SessionStatus, { icon: any; color: string; labelKey: string }> = {
  idle: { icon: Circle, color: 'text-gray-400', labelKey: 'sidebar.status.idle' },
  queued: { icon: Pause, color: 'text-amber-500', labelKey: 'sidebar.status.queued' },
  running: { icon: Loader2, color: 'text-blue-500', labelKey: 'sidebar.status.running' },
  completed: { icon: CheckCircle2, color: 'text-green-500', labelKey: 'sidebar.status.completed' },
  paused: { icon: Pause, color: 'text-orange-500', labelKey: 'sidebar.status.paused' },
};

function DraggableSessionCard({ session, tasks }: { session: Session; tasks: Task[] }) {
  const { setActiveSession, startSession } = useStore();
  const { t } = useTranslation();

  const { attributes, listeners, setNodeRef: setDraggableRef, transform, isDragging } = useDraggable({
    id: session.id,
    data: { type: 'session', session },
  });

  const { setNodeRef: setDroppableRef, isOver } = useDroppable({
    id: `card-drop-${session.id}`,
    data: { type: 'session-drop', sessionId: session.id },
  });

  const sessionTasks = tasks.filter(t => t.sessionId === session.id);
  const runningTask = sessionTasks.find(t => t.status === 'running');
  const todoTasks = sessionTasks.filter(t => t.location === 'todo' && t.status === 'pending').sort((a, b) => a.taskOrder - b.taskOrder);
  const nextTask = todoTasks[0];

  const displayPrompt = runningTask
    ? { label: t('projects.running'), prompt: runningTask.prompt, labelClass: 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-semibold text-[10px] tracking-wider uppercase rounded-md' }
    : nextTask
      ? { label: t('projects.next'), prompt: nextTask.prompt, labelClass: 'bg-amber-500/10 text-amber-500 border border-amber-500/20 font-semibold text-[10px] tracking-wider uppercase rounded-md' }
      : { label: t('projects.idle'), prompt: t('projects.noActiveTasks'), labelClass: 'bg-slate-50 dark:bg-[#111936] text-slate-500 dark:text-[#8492c4] border border-slate-300 dark:border-[#8492c4]/20 font-semibold text-[10px] tracking-wider uppercase rounded-md' };

  const config = STATUS_CONFIG[session.status];
  const Icon = config.icon;

  const handleStart = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await startSession(session.id);
      toast.success(t('projects.sessionStarted'));
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  return (
    <div
      ref={setDroppableRef}
      className={`transition-all h-full ${isOver ? 'ring-2 ring-indigo-500 bg-indigo-500/10 rounded-2xl' : ''}`}
    >
      <div
        ref={setDraggableRef}
        style={{
          opacity: isDragging ? 0.4 : 1,
          transform: transform ? `translate(${transform.x}px, ${transform.y}px)` : undefined,
          position: isDragging ? 'relative' : 'static',
          zIndex: isDragging ? 50 : 'auto',
        }}
        onClick={() => setActiveSession(session.id)}
        className={`dashboard-panel p-6 bg-white dark:bg-[#1a223f] border ${isDragging ? 'border-indigo-400 shadow-2xl scale-[1.02] z-50 ring-1 ring-indigo-500/50' : 'border-slate-200 dark:border-[#8492c4]/10'
          } hover:border-indigo-500/50 hover:bg-slate-100 dark:bg-[#212946] transition-all duration-300 cursor-pointer group flex gap-4 h-full relative overflow-hidden`}
      >
        {/* Drag handle */}
        <div
          {...attributes}
          {...listeners}
          className="cursor-grab hover:text-indigo-400 absolute left-0 top-0 bottom-0 w-6 flex items-center justify-center bg-slate-50 dark:bg-[#111936]/50 text-slate-500 dark:text-[#8492c4] opacity-0 group-hover:opacity-100 transition-opacity border-r border-slate-200 dark:border-[#8492c4]/10"
        >
          <GripVertical size={14} />
        </div>

        <div className="flex-1 min-w-0 flex flex-col pl-4">
          {/* Session name + status */}
          <div className="flex items-center justify-between mb-6 border-b border-slate-200 dark:border-[#8492c4]/10 pb-4">
            <div className="flex items-center gap-3 max-w-[75%]">
              <Icon
                size={18}
                className={`${config.color} shrink-0 ${session.status === 'running' ? 'animate-spin' : ''}`}
                title={t(config.labelKey)}
              />
              <h3 className="font-bold text-base text-slate-900 dark:text-white truncate">{session.name}</h3>
            </div>
            {(session.status === 'idle' || session.status === 'queued') && (
              <button
                onClick={handleStart}
                className="btn-primary !px-2 !py-1"
                title="Run Session"
              >
                <Play size={14} />
              </button>
            )}
          </div>

          {/* Task preview */}
          <div className="flex-1 flex flex-col gap-3">
            <span className={`self-start px-2 py-1 ${displayPrompt.labelClass}`}>
              {displayPrompt.label}
            </span>
            <p className="text-sm text-slate-900 dark:text-[#d7dcec] line-clamp-3 leading-relaxed flex-1">
              {displayPrompt.prompt}
            </p>
          </div>

          {/* Task counts */}
          {(todoTasks.length > 0 || runningTask) && (
            <div className="flex items-center gap-2 mt-4 pt-4 border-t border-slate-200 dark:border-[#8492c4]/10 text-xs font-semibold">
              {runningTask && (
                <span className="text-indigo-400 flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> RUNNING</span>
              )}
              {todoTasks.length > 0 && (
                <span className="text-slate-500 dark:text-[#8492c4]">• QUEUE: {todoTasks.length}</span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DroppableChain({ chain, index, tasks }: { chain: SessionChain; index: number; tasks: Task[] }) {
  const { updateSession, fetchSessions } = useStore();
  const { t } = useTranslation();

  const handleUnlink = async (e: React.MouseEvent, sessionId: string, parentId: string) => {
    e.stopPropagation();
    try {
      const self = chain.sessions.find(s => s.id === sessionId);
      await updateSession(parentId, { nextSessionId: self?.nextSessionId || null } as any);
      await updateSession(sessionId, { nextSessionId: null } as any);
      if (self?.projectId) await fetchSessions(self.projectId);
      toast.success(t('projects.unlinked'));
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const isMulti = chain.sessions.length > 1;

  return (
    <div className={`relative transition-colors rounded-2xl ${isMulti
      ? 'p-6 bg-slate-50 dark:bg-[#111936] border border-slate-300 dark:border-[#8492c4]/20 shadow-inner'
      : ''
      }`}>
      {isMulti && (
        <div className="mb-4 flex items-center gap-3 px-2">
          <span className="text-xs font-bold text-slate-500 dark:text-[#8492c4] uppercase">{t('projects.linkedChain')} {index + 1}</span>
          <div className="h-px flex-1 bg-gradient-to-r from-[#8492c4]/20 to-transparent" />
        </div>
      )}

      <div className="flex flex-col gap-3">
        {chain.sessions.map((session, i) => (
          <div key={session.id} className="relative">
            {i > 0 && (
              <div className="flex justify-center -mt-2 mb-1">
                <div className="w-px h-3 bg-[#8492c4]/20" />
              </div>
            )}
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <DraggableSessionCard session={session} tasks={tasks} />
              </div>
              {i > 0 && (
                <button
                  onClick={(e) => handleUnlink(e, session.id, chain.sessions[i - 1].id)}
                  className="p-2 text-slate-500 dark:text-[#8492c4] hover:text-rose-400 hover:bg-rose-500/10 shrink-0 border border-transparent hover:border-rose-500/30 rounded-xl transition-colors"
                  title="Unlink"
                >
                  <Unlink size={14} />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ProjectView() {
  const {
    activeProjectId,
    projects,
    tasks,
    sessionsByProject,
    setProjectSettingsOpen,
    updateSession,
    fetchSessions,
    sidebarOpen,
  } = useStore();
  const { t } = useTranslation();

  const [draggingSessionId, setDraggingSessionId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const activeProject = useMemo(
    () => projects.find((p) => p.id === activeProjectId),
    [projects, activeProjectId]
  );

  const projectSessions = sessionsByProject[activeProjectId || ''] || [];

  const chains = useMemo(() => {
    return buildChains(projectSessions.slice().sort((a, b) => a.sessionOrder - b.sessionOrder));
  }, [projectSessions]);

  const handleDragStart = (event: DragStartEvent) => {
    setDraggingSessionId(event.active.id as string);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const draggedId = draggingSessionId;
    setDraggingSessionId(null);

    const { over } = event;
    if (!over || !draggedId) return;

    let targetSessionId: string | null = null;
    const overId = over.id as string;

    if (overId.startsWith('card-drop-')) {
      targetSessionId = overId.replace('card-drop-', '');
    }

    const draggedSession = projectSessions.find((s) => s.id === draggedId);
    if (!draggedSession) return;

    try {
      if (targetSessionId) {
        const targetChain = chains.find(c => c.sessions.some(s => s.id === targetSessionId));
        if (!targetChain) return;
        const tail = targetChain.sessions[targetChain.sessions.length - 1];

        if (targetChain.sessions.some(s => s.id === draggedId)) return;

        const oldParent = projectSessions.find(s => s.nextSessionId === draggedId);
        if (oldParent) {
          await updateSession(oldParent.id, { nextSessionId: draggedSession.nextSessionId || null } as any);
        }

        await updateSession(tail.id, { nextSessionId: draggedId } as any);
        toast.success(t('projects.linkedBehind', { name: tail.name }));
      } else if (overId === 'root-drop') {
        const oldParent = projectSessions.find(s => s.nextSessionId === draggedId);
        if (oldParent) {
          await updateSession(oldParent.id, { nextSessionId: draggedSession.nextSessionId || null } as any);
          await updateSession(draggedId, { nextSessionId: null } as any);
          toast.success(t('projects.independent'));
        }
      }

      if (activeProjectId) {
        await fetchSessions(activeProjectId);
      }
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const draggedSessionData = projectSessions.find(s => s.id === draggingSessionId);

  if (!activeProject) return null;

  return (
    <div className="h-full flex flex-col bg-transparent">
      {/* Project Header */}
      <div className="px-8 py-6 border-b border-slate-200 dark:border-[#8492c4]/10 bg-slate-50 dark:bg-[#111936] shrink-0 z-10 transition-colors relative">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2 tracking-tight">{activeProject.name}</h1>
            <p className="text-sm font-medium text-slate-500 dark:text-[#8492c4]">
              {activeProject.rootDirectory}
            </p>
          </div>
          <button
            onClick={() => setProjectSettingsOpen(true)}
            className="btn-secondary inline-flex items-center gap-2 px-4 py-2"
          >
            <Settings2 size={16} />
            {t('common.settings')}
          </button>
        </div>
      </div>

      {/* Board */}
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <RootDroppable>
          {chains.length === 0 ? (
            <div className="flex-1 flex items-center justify-center p-8 h-full bg-transparent">
              <div className="text-center max-w-sm dashboard-panel p-10 mx-4">
                <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shadow-inner">
                  <Play className="text-indigo-400" size={24} />
                </div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">{t('projects.noActiveSessions')}</h3>
                <p className="text-sm font-medium text-slate-500 dark:text-[#8492c4] leading-relaxed">
                  {t('projects.initSession')}
                </p>
              </div>
            </div>
          ) : (
            <div
              className={`p-6 grid gap-5 items-start self-start ${sidebarOpen
                ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
                : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6'
                }`}
            >
              {chains.map((chain, idx) => (
                <DroppableChain
                  key={chain.id}
                  chain={chain}
                  index={idx}
                  tasks={tasks}
                />
              ))}
            </div>
          )}
        </RootDroppable>

        <DragOverlay>
          {draggedSessionData ? (
            <div className="opacity-90 shadow-2xl scale-105 pointer-events-none w-72">
              <DraggableSessionCard session={draggedSessionData} tasks={tasks} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

function RootDroppable({ children }: { children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'root-drop' });
  const { t } = useTranslation();

  return (
    <div
      ref={setNodeRef}
      className={`flex-1 overflow-y-auto scrollbar-thin transition-colors min-h-0 bg-transparent ${isOver ? 'bg-indigo-500/5' : ''
        }`}
    >
      {isOver && (
        <div className="fixed top-32 left-1/2 -translate-x-1/2 z-50 bg-white dark:bg-[#1a223f] text-indigo-400 px-6 py-3 font-semibold text-sm shadow-xl rounded-full flex items-center gap-2 border border-indigo-500/30">
          <Unlink size={16} />
          {t('projects.isolateChain')}
        </div>
      )}
      {children}
    </div>
  );
}
