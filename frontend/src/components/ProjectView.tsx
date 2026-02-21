import { useState, useMemo } from 'react';
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

const STATUS_CONFIG: Record<SessionStatus, { icon: any; color: string; label: string }> = {
  idle: { icon: Circle, color: 'text-gray-400', label: '대기' },
  queued: { icon: Pause, color: 'text-amber-500', label: '큐 대기' },
  running: { icon: Loader2, color: 'text-blue-500', label: '실행 중' },
  completed: { icon: CheckCircle2, color: 'text-green-500', label: '완료' },
  paused: { icon: Pause, color: 'text-orange-500', label: '일시정지' },
};

function DraggableSessionCard({ session, tasks }: { session: Session; tasks: Task[] }) {
  const { setActiveSession, startSession } = useStore();

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
    ? { label: '실행 중', prompt: runningTask.prompt, labelClass: 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-300 border border-blue-100 dark:border-blue-800/40' }
    : nextTask
      ? { label: '다음 작업', prompt: nextTask.prompt, labelClass: 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-300 border border-amber-100 dark:border-amber-800/40' }
      : { label: '비어 있음', prompt: '작업이 없습니다', labelClass: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400 border border-gray-200 dark:border-gray-700' };

  const config = STATUS_CONFIG[session.status];
  const Icon = config.icon;

  const handleStart = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await startSession(session.id);
      toast.success('세션이 시작되었습니다');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  return (
    <div
      ref={setDroppableRef}
      className={`rounded-xl transition-all h-full ${isOver ? 'ring-2 ring-primary-500 bg-primary-50/30 dark:bg-primary-900/10' : ''}`}
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
          className={`p-4 rounded-xl bg-white dark:bg-gray-900 border ${
          isDragging ? 'border-primary-400' : 'border-gray-200 dark:border-gray-800'
        } hover:border-primary-400 dark:hover:border-primary-600 transition-all cursor-pointer group flex gap-3 h-full shadow-subtle hover:shadow-md`}
      >
        {/* Drag handle */}
        <div
          {...attributes}
          {...listeners}
          className="cursor-grab hover:bg-gray-100 dark:hover:bg-gray-700 rounded self-start mt-0.5 p-1 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
        >
          <GripVertical size={14} />
        </div>

        <div className="flex-1 min-w-0 flex flex-col">
          {/* Session name + status */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-1.5 max-w-[75%]">
              <Icon
                size={14}
                className={`${config.color} shrink-0 ${session.status === 'running' ? 'animate-spin' : ''}`}
              />
              <h3 className="font-semibold text-sm truncate">{session.name}</h3>
            </div>
            {(session.status === 'idle' || session.status === 'queued') && (
              <button
                onClick={handleStart}
                className="btn-icon text-gray-400 hover:text-green-500 hover:bg-green-50 dark:hover:bg-green-900/20"
                title="세션 시작"
              >
                <Play size={14} />
              </button>
            )}
          </div>

          {/* Task preview */}
          <div className="flex-1 flex flex-col gap-2">
            <span className={`self-start text-xs font-medium px-2 py-0.5 rounded-md ${displayPrompt.labelClass}`}>
              {displayPrompt.label}
            </span>
            <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-3 leading-relaxed flex-1">
              {displayPrompt.prompt}
            </p>
          </div>

          {/* Task counts */}
          {(todoTasks.length > 0 || runningTask) && (
            <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-100 dark:border-gray-800">
              {runningTask && (
                <span className="text-xs text-blue-500 font-medium">실행 1</span>
              )}
              {todoTasks.length > 0 && (
                <span className="text-xs text-gray-400">대기 {todoTasks.length}</span>
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

  const handleUnlink = async (e: React.MouseEvent, sessionId: string, parentId: string) => {
    e.stopPropagation();
    try {
      const self = chain.sessions.find(s => s.id === sessionId);
      await updateSession(parentId, { nextSessionId: self?.nextSessionId || null } as any);
      await updateSession(sessionId, { nextSessionId: null } as any);
      if (self?.projectId) await fetchSessions(self.projectId);
      toast.success('체인에서 분리되었습니다');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const isMulti = chain.sessions.length > 1;

  return (
    <div className={`relative rounded-xl transition-colors ${
      isMulti
        ? 'p-3 bg-gray-50 dark:bg-gray-800/30 border border-gray-200/60 dark:border-gray-700/40'
        : ''
    }`}>
      {isMulti && (
        <div className="mb-2.5 flex items-center gap-1.5">
          <span className="text-xs font-medium text-gray-400 dark:text-gray-500">체인 {index + 1}</span>
          <div className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
        </div>
      )}

      <div className="flex flex-col gap-3">
        {chain.sessions.map((session, i) => (
          <div key={session.id} className="relative">
            {i > 0 && (
              <div className="flex justify-center -mt-2 mb-1">
                <div className="w-px h-3.5 bg-gray-300 dark:bg-gray-600" />
              </div>
            )}
            <div className="flex items-center gap-1.5">
              <div className="flex-1">
                <DraggableSessionCard session={session} tasks={tasks} />
              </div>
              {i > 0 && (
                <button
                  onClick={(e) => handleUnlink(e, session.id, chain.sessions[i - 1].id)}
                  className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg shrink-0"
                  title="체인 분리"
                >
                  <Unlink size={13} />
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
        toast.success(`'${tail.name}' 뒤에 연결되었습니다`);
      } else if (overId === 'root-drop') {
        const oldParent = projectSessions.find(s => s.nextSessionId === draggedId);
        if (oldParent) {
          await updateSession(oldParent.id, { nextSessionId: draggedSession.nextSessionId || null } as any);
          await updateSession(draggedId, { nextSessionId: null } as any);
          toast.success('체인에서 독립했습니다');
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
    <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-950">
      {/* Project Header */}
      <div className="px-7 py-5 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{activeProject.name}</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              <span className="font-mono bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded text-xs border border-gray-200 dark:border-gray-700">
                {activeProject.rootDirectory}
              </span>
            </p>
          </div>
          <button
            onClick={() => setProjectSettingsOpen(true)}
            className="btn-secondary inline-flex items-center gap-1.5"
          >
            <Settings2 size={13} />
            설정
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
            <div className="flex-1 flex items-center justify-center p-8 h-full">
              <div className="text-center max-w-xs">
                <div className="w-12 h-12 mx-auto mb-4 rounded-xl bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex items-center justify-center">
                  <Play className="text-gray-300 dark:text-gray-600" size={22} />
                </div>
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">세션이 없습니다</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                  좌측 사이드바에서 [+] 버튼으로 새 세션을 만들어보세요.
                </p>
              </div>
            </div>
          ) : (
            <div
              className={`p-6 grid gap-5 items-start self-start ${
                sidebarOpen
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

  return (
    <div
      ref={setNodeRef}
      className={`flex-1 overflow-y-auto scrollbar-thin transition-colors min-h-0 ${
        isOver ? 'bg-red-50/30 dark:bg-red-900/5' : ''
      }`}
    >
      {isOver && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 px-5 py-2 rounded-lg font-medium shadow-lg flex items-center gap-2 text-sm border border-red-200 dark:border-red-800">
          <Unlink size={14} />
          여기에 놓으면 체인에서 독립됩니다
        </div>
      )}
      {children}
    </div>
  );
}
