import { useState, useEffect, useRef, useMemo } from 'react';
import {
  Plus,
  ChevronDown,
  ChevronRight,
  Loader2,
  Square,
  Code,
  FileText,
  Archive,
  CheckCheck,
  Zap,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  useDroppable,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { useStore } from '../store';
import TaskCard from './TaskCard';
import HumanInTheLoop from './HumanInTheLoop';
import AddTaskModal from './AddTaskModal';
import EditTaskModal from './EditTaskModal';
import type { Task, TaskEvent, ParsedEventData } from '../types';
import toast from 'react-hot-toast';

export default function SessionView() {
  const activeSessionId = useStore((s) => s.activeSessionId);
  const activeProjectId = useStore((s) => s.activeProjectId);
  const sessions = useStore((s) => s.sessions);
  const tasks = useStore((s) => s.tasks);
  const taskEvents = useStore((s) => s.taskEvents);
  const humanInputTasks = useStore((s) => s.humanInputTasks);
  const createTask = useStore((s) => s.createTask);
  const moveTask = useStore((s) => s.moveTask);
  const reorderTasks = useStore((s) => s.reorderTasks);
  const fetchTaskEvents = useStore((s) => s.fetchTaskEvents);
  const fetchTasks = useStore((s) => s.fetchTasks);
  const fetchSessions = useStore((s) => s.fetchSessions);
  const activeTaskId = useStore((s) => s.activeTaskId);
  const setActiveTaskId = useStore((s) => s.setActiveTaskId);
  const abortTask = useStore((s) => s.abortTask);
  const updateTask = useStore((s) => s.updateTask);

  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [backlogExpanded, setBacklogExpanded] = useState(true);
  const [doneExpanded, setDoneExpanded] = useState(true);
  const [showEventLog, setShowEventLog] = useState(false);
  const [newPrompt, setNewPrompt] = useState('');
  const outputRef = useRef<HTMLDivElement>(null);

  const session = sessions.find((s) => s.id === activeSessionId);

  // ===== Polling =====
  useEffect(() => {
    if (!activeProjectId || !activeSessionId) return;
    if (!session || session.status !== 'running') return;

    const interval = setInterval(() => {
      fetchTasks(activeProjectId);
      fetchSessions(activeProjectId);
    }, 3000);

    return () => clearInterval(interval);
  }, [activeProjectId, activeSessionId, session?.status]);

  // ===== Task categorization =====
  const sessionTasks = useMemo(
    () => tasks.filter((t) => t.sessionId === activeSessionId),
    [tasks, activeSessionId]
  );

  const todoTasks = useMemo(
    () =>
      sessionTasks
        .filter((t) => t.location === 'todo' && t.status === 'pending')
        .sort((a, b) => a.taskOrder - b.taskOrder),
    [sessionTasks]
  );

  const backlogTasks = useMemo(
    () =>
      sessionTasks
        .filter((t) => t.location === 'backlog' && t.status === 'pending')
        .sort((a, b) => a.taskOrder - b.taskOrder),
    [sessionTasks]
  );

  const runningTask = useMemo(
    () => sessionTasks.find((t) => t.status === 'running'),
    [sessionTasks]
  );

  const doneTasks = useMemo(
    () =>
      sessionTasks
        .filter((t) => t.location === 'done')
        .sort((a, b) => {
          const ta = a.completedAt || a.createdAt;
          const tb = b.completedAt || b.createdAt;
          return new Date(tb).getTime() - new Date(ta).getTime();
        }),
    [sessionTasks]
  );

  // ===== Active task =====
  const displayTask = useMemo(() => {
    // 사용자가 명시적으로 선택한 task가 있으면 그것을 우선 표시
    if (activeTaskId) {
      const t = sessionTasks.find((t) => t.id === activeTaskId);
      if (t) return t;
    }
    // 선택된 것이 없으면 실행 중인 task 표시
    if (runningTask) return runningTask;
    // 그것도 없으면 가장 최근 완료된 task 표시
    if (doneTasks.length > 0) return doneTasks[0];
    return null;
  }, [activeTaskId, sessionTasks, runningTask, doneTasks]);

  const displayEvents = displayTask ? taskEvents[displayTask.id] || [] : [];

  useEffect(() => {
    if (displayTask && !taskEvents[displayTask.id]) {
      fetchTaskEvents(displayTask.id);
    }
  }, [displayTask?.id]);

  const nextTaskId = todoTasks.length > 0 ? todoTasks[0].id : null;

  // Extract result from events
  const extractResult = (events: TaskEvent[]): string => {
    // First check for a complete result event
    const resultEvent = events.find(e => {
      try {
        const data = JSON.parse(e.data);
        return data.type === 'result' && data.result;
      } catch {
        return false;
      }
    });

    if (resultEvent) {
      const data = JSON.parse(resultEvent.data);
      return data.result || '';
    }

    // Otherwise, accumulate all assistant message text blocks
    // Claude streams responses, so we need to collect all text pieces
    const allTextBlocks: string[] = [];

    events.forEach(e => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === 'assistant' && data.message?.content) {
          data.message.content.forEach((block: any) => {
            if (block.type === 'text' && block.text) {
              allTextBlocks.push(block.text);
            }
          });
        }
      } catch { }
    });

    // Join all text blocks to form the complete response
    return allTextBlocks.join('');
  };

  const displayResult = displayTask ? extractResult(displayEvents) : '';

  // Auto-scroll event log
  useEffect(() => {
    if (outputRef.current && showEventLog) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [displayEvents.length, showEventLog]);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor)
  );

  const handleAddTask = async (prompt: string, location: string = 'backlog') => {
    if (!activeProjectId || !activeSessionId) return;
    await createTask({
      projectId: activeProjectId,
      sessionId: activeSessionId,
      prompt: prompt,
      location,
    });
    await fetchTasks(activeProjectId);
    await fetchSessions(activeProjectId);
  };

  const handleMoveToTodo = async (taskId: string) => {
    try {
      await moveTask(taskId, { location: 'todo', sessionId: activeSessionId! });
      if (activeProjectId) await fetchTasks(activeProjectId);
      toast.success('대기열로 이동되었습니다');
    } catch (err: any) { toast.error(err.message); }
  };

  const handleMoveToBacklog = async (taskId: string) => {
    try {
      await moveTask(taskId, { location: 'backlog', sessionId: activeSessionId! });
      if (activeProjectId) await fetchTasks(activeProjectId);
      toast.success('백로그로 이동되었습니다');
    } catch (err: any) { toast.error(err.message); }
  };

  const handleSelectTask = (taskId: string) => {
    setActiveTaskId(taskId);
    setShowEventLog(false);
    if (!taskEvents[taskId]) {
      fetchTaskEvents(taskId);
    }
  };

  const handleEditTask = async (taskId: string, prompt: string) => {
    await updateTask(taskId, { prompt });
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    const isFromTodo = todoTasks.some(t => t.id === activeId);
    const isFromBacklog = backlogTasks.some(t => t.id === activeId);
    if (!isFromTodo && !isFromBacklog) return;

    const sourceContainer = isFromTodo ? 'todo' : 'backlog';

    let targetContainer: 'todo' | 'backlog';
    if (overId === 'droppable-todo') {
      targetContainer = 'todo';
    } else if (overId === 'droppable-backlog') {
      targetContainer = 'backlog';
    } else if (todoTasks.some(t => t.id === overId)) {
      targetContainer = 'todo';
    } else if (backlogTasks.some(t => t.id === overId)) {
      targetContainer = 'backlog';
    } else {
      return;
    }

    if (sourceContainer === targetContainer) {
      if (activeId === overId) return;
      const list = sourceContainer === 'todo' ? todoTasks : backlogTasks;
      const oldIndex = list.findIndex(t => t.id === activeId);
      const newIndex = list.findIndex(t => t.id === overId);
      if (oldIndex === -1 || newIndex === -1) return;
      const reordered = arrayMove(list, oldIndex, newIndex);
      const taskOrders = reordered.map((t, i) => ({ id: t.id, taskOrder: i }));
      await reorderTasks(taskOrders);
    } else {
      try {
        if (targetContainer === 'todo') {
          await handleMoveToTodo(activeId);
        } else {
          await handleMoveToBacklog(activeId);
        }
      } catch (err: any) {
        toast.error(err.message);
      }
    }
  };

  if (!session) return null;

  const isDisplayTaskRunning = displayTask?.status === 'running';

  return (
    <div className="h-full flex overflow-hidden">
      {/* ===== LEFT: Task Queue Panel ===== */}
      <div className="w-[320px] shrink-0 border-r border-gray-200 dark:border-gray-800 flex flex-col bg-gray-50/70 dark:bg-gray-950 overflow-hidden">
        {/* Session Header */}
        <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shrink-0">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-sm text-gray-900 dark:text-gray-100 truncate flex-1">{session.name}</h2>
            <SessionStatusBadge status={session.status} />
          </div>
        </div>

        {/* Task List */}
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <div className="p-3 space-y-5">
              {/* 실행 중 */}
              {runningTask && (
                <div>
                  <SectionLabel icon={<Loader2 size={11} className="animate-spin text-blue-500" />} label="실행 중" />
                  <div
                    className={`cursor-pointer rounded-lg transition-all ${displayTask?.id === runningTask.id ? 'ring-2 ring-primary-400' : ''}`}
                    onClick={() => handleSelectTask(runningTask.id)}
                  >
                    <TaskCard
                      task={runningTask}
                      onEdit={(t) => { setEditingTask(t); setShowEditModal(true); }}
                    />
                  </div>
                </div>
              )}

              {/* 대기열 */}
              <DroppableSection id="droppable-todo">
                <SectionLabel
                  icon={<Zap size={11} className="text-amber-500" />}
                  label={`대기열 (${todoTasks.length})`}
                  extra={nextTaskId && !runningTask ? (
                    <span className="badge-next text-xs px-1.5 py-0.5">다음</span>
                  ) : undefined}
                />
                <SortableContext items={todoTasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-1">
                    {todoTasks.map((task) => (
                      <div
                        key={task.id}
                        className={`cursor-pointer rounded-lg transition-all ${displayTask?.id === task.id ? 'ring-2 ring-primary-400' : ''}`}
                        onClick={() => handleSelectTask(task.id)}
                      >
                        <TaskCard
                          task={task}
                          isNext={task.id === nextTaskId && !runningTask}
                          onEdit={(t) => { setEditingTask(t); setShowEditModal(true); }}
                        />
                      </div>
                    ))}
                  </div>
                </SortableContext>
                {todoTasks.length === 0 && (
                  <EmptySlot label={runningTask ? '대기 중인 작업 없음' : '백로그에서 드래그하세요'} />
                )}
              </DroppableSection>

              {/* 백로그 */}
              <DroppableSection id="droppable-backlog">
                <button
                  onClick={() => setBacklogExpanded(!backlogExpanded)}
                  className="flex items-center gap-1.5 w-full text-left mb-2 group"
                >
                  {backlogExpanded ? <ChevronDown size={12} className="text-gray-400" /> : <ChevronRight size={12} className="text-gray-400" />}
                  <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    백로그 ({backlogTasks.length})
                  </span>
                  <Archive size={11} className="text-gray-400 ml-0.5" />
                </button>
                {backlogExpanded && (
                  <>
                    <SortableContext items={backlogTasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
                      <div className="space-y-1">
                        {backlogTasks.map((task) => (
                          <div
                            key={task.id}
                            className={`cursor-pointer rounded-lg transition-all ${displayTask?.id === task.id ? 'ring-2 ring-primary-400' : ''}`}
                            onClick={() => handleSelectTask(task.id)}
                          >
                            <TaskCard
                              task={task}
                              onEdit={(t) => { setEditingTask(t); setShowEditModal(true); }}
                            />
                          </div>
                        ))}
                      </div>
                    </SortableContext>
                    {backlogTasks.length === 0 && (
                      <EmptySlot label="비어 있음" />
                    )}
                  </>
                )}
              </DroppableSection>

              {/* 완료됨 */}
              {doneTasks.length > 0 && (
                <div>
                  <button
                    onClick={() => setDoneExpanded(!doneExpanded)}
                    className="flex items-center gap-1.5 w-full text-left mb-2"
                  >
                    {doneExpanded ? <ChevronDown size={12} className="text-gray-400" /> : <ChevronRight size={12} className="text-gray-400" />}
                    <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      완료됨 ({doneTasks.length})
                    </span>
                    <CheckCheck size={11} className="text-gray-400 ml-0.5" />
                  </button>
                  {doneExpanded && (
                    <div className="space-y-1">
                      {doneTasks.map((task) => (
                        <div
                          key={task.id}
                          className={`cursor-pointer rounded-lg transition-all ${displayTask?.id === task.id ? 'ring-2 ring-primary-400' : ''}`}
                          onClick={() => handleSelectTask(task.id)}
                        >
                          <TaskCard task={task} isDone />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </DndContext>
        </div>

        {/* Add Task Input */}
        <div className="shrink-0 border-t border-gray-200 dark:border-gray-800 p-3 bg-white dark:bg-gray-900">
          <div className="flex gap-1.5">
            <textarea
              className="input resize-none text-xs py-2 flex-1"
              rows={2}
              placeholder="새 작업 입력... (Ctrl+Enter)"
              value={newPrompt}
              onChange={(e) => setNewPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  if (newPrompt.trim()) {
                    handleAddTask(newPrompt, 'backlog');
                    setNewPrompt('');
                  }
                }
              }}
            />
            <div className="flex flex-col gap-1 shrink-0 self-end">
              <button
                onClick={() => {
                  if (newPrompt.trim()) {
                    handleAddTask(newPrompt, 'backlog');
                    setNewPrompt('');
                  }
                }}
                disabled={!newPrompt.trim()}
                className="btn-primary !px-2.5 !py-1.5"
                title="백로그에 추가"
              >
                <Plus size={14} />
              </button>
              <button
                onClick={() => setShowAddModal(true)}
                className="btn-secondary !px-2.5 !py-1.5 text-xs"
                title="팝업으로 추가"
              >
                <Plus size={12} />+
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ===== RIGHT: Task Detail / Output Panel ===== */}
      <div className="flex-1 overflow-y-auto scrollbar-thin bg-white dark:bg-gray-950">
        {displayTask ? (
          <div className="h-full flex flex-col">
            {/* Task Header */}
            <div className={`px-6 py-4 border-b shrink-0 flex items-center justify-between ${
              isDisplayTaskRunning
                ? 'bg-blue-50 dark:bg-blue-900/10 border-blue-100 dark:border-blue-900/30'
                : displayTask.status === 'completed'
                  ? 'bg-green-50 dark:bg-green-900/10 border-green-100 dark:border-green-900/30'
                  : displayTask.status === 'failed'
                    ? 'bg-red-50 dark:bg-red-900/10 border-red-100 dark:border-red-900/30'
                    : displayTask.status === 'aborted'
                      ? 'bg-orange-50 dark:bg-orange-900/10 border-orange-100 dark:border-orange-900/30'
                      : 'bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-800'
            }`}>
              <div className="flex items-center gap-2 min-w-0">
                {isDisplayTaskRunning ? (
                  <Loader2 size={13} className="animate-spin text-blue-500 shrink-0" />
                ) : (
                  <div className={`w-2 h-2 rounded-full shrink-0 ${
                    displayTask.status === 'completed' ? 'bg-green-500'
                      : displayTask.status === 'failed' ? 'bg-red-500'
                        : displayTask.status === 'aborted' ? 'bg-orange-500'
                          : 'bg-gray-400'
                  }`} />
                )}
                <span className={`text-xs font-semibold ${
                  isDisplayTaskRunning ? 'text-blue-700 dark:text-blue-300'
                    : displayTask.status === 'completed' ? 'text-green-700 dark:text-green-300'
                      : displayTask.status === 'failed' ? 'text-red-700 dark:text-red-300'
                        : displayTask.status === 'aborted' ? 'text-orange-700 dark:text-orange-300'
                          : 'text-gray-600 dark:text-gray-400'
                }`}>
                  {isDisplayTaskRunning ? '실행 중'
                    : displayTask.status === 'completed' ? '완료'
                      : displayTask.status === 'failed' ? '실패'
                        : displayTask.status === 'aborted' ? '중단됨'
                          : '대기 중'}
                </span>
              </div>
              {isDisplayTaskRunning && (
                <button
                  onClick={() => abortTask(displayTask.id)}
                  className="btn-icon text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 shrink-0"
                  title="중단"
                >
                  <Square size={13} />
                </button>
              )}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto scrollbar-thin p-6 space-y-6">
              {/* Prompt */}
              <div>
                <div className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">프롬프트</div>
                <p className="text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-800/60 px-5 py-4 rounded-xl leading-relaxed border border-gray-100 dark:border-gray-700/50">
                  {displayTask.prompt}
                </p>
              </div>

              {/* Result */}
              {(displayResult || !isDisplayTaskRunning) && (
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <FileText size={13} className="text-gray-400" />
                    <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">결과</span>
                  </div>
                  <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
                    {displayResult ? (
                      <div className="prose prose-sm prose-gray dark:prose-invert max-w-none
                          prose-pre:bg-gray-100 dark:prose-pre:bg-gray-950
                          prose-code:text-blue-600 dark:prose-code:text-blue-400
                          prose-code:bg-gray-100 dark:prose-code:bg-gray-800
                          prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs
                          prose-headings:font-semibold
                          prose-a:text-blue-600 dark:prose-a:text-blue-400">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {displayResult}
                        </ReactMarkdown>
                      </div>
                    ) : (
                      <div className="text-gray-400 dark:text-gray-500 text-center py-6 text-sm">
                        {isDisplayTaskRunning ? 'Claude가 응답을 생성 중입니다...' : '결과가 없습니다.'}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Human in the loop */}
              {displayTask && humanInputTasks[displayTask.id] && (
                <HumanInTheLoop
                  taskId={displayTask.id}
                  prompt={humanInputTasks[displayTask.id]}
                />
              )}

              {/* Event Log Toggle */}
              <div>
                <button
                  onClick={() => setShowEventLog(!showEventLog)}
                  className="flex items-center gap-1.5 text-xs font-semibold text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 uppercase tracking-wider transition-colors"
                >
                  <Code size={13} />
                  이벤트 로그 ({displayEvents.length})
                  {showEventLog ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                </button>

                {showEventLog && (
                  <div
                    ref={outputRef}
                    className="mt-3 bg-gray-950 rounded-xl p-5 max-h-[32rem] overflow-y-auto scrollbar-thin font-mono text-xs leading-relaxed"
                  >
                    {displayEvents.length === 0 && isDisplayTaskRunning && (
                      <div className="text-gray-500 flex items-center gap-2">
                        <Loader2 size={12} className="animate-spin" />
                        Claude 응답 대기 중...
                      </div>
                    )}
                    {displayEvents.length === 0 && !isDisplayTaskRunning && (
                      <div className="text-gray-500">이벤트 로그가 없습니다.</div>
                    )}
                    {displayEvents.map((evt) => (
                      <EventLine key={evt.id} event={evt} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <div className="w-12 h-12 mx-auto mb-4 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                <FileText size={20} className="text-gray-400" />
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400">작업을 선택하면 결과가 표시됩니다</p>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      <AddTaskModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onAdd={handleAddTask}
        location="backlog"
      />

      <EditTaskModal
        isOpen={showEditModal}
        onClose={() => {
          setShowEditModal(false);
          setEditingTask(null);
        }}
        task={editingTask}
        onSave={handleEditTask}
      />
    </div>
  );
}

// ===== Session Status Badge =====
function SessionStatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string }> = {
    idle: { label: '대기', className: 'badge-idle' },
    queued: { label: '큐 대기', className: 'badge-next' },
    running: { label: '실행 중', className: 'badge-running' },
    completed: { label: '완료', className: 'badge-completed' },
    paused: { label: '일시정지', className: 'badge-idle' },
  };
  const c = config[status] || config.idle;
  return (
    <span className={c.className}>
      {status === 'running' && <Loader2 size={10} className="mr-1 animate-spin" />}
      {c.label}
    </span>
  );
}

// ===== Section Label =====
function SectionLabel({ icon, label, extra }: { icon?: React.ReactNode; label: string; extra?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 mb-2">
      {icon}
      <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider flex-1">{label}</span>
      {extra}
    </div>
  );
}

// ===== Empty Slot =====
function EmptySlot({ label }: { label: string }) {
  return (
    <div className="text-center py-4 text-xs text-gray-400 dark:text-gray-500 border border-dashed border-gray-200 dark:border-gray-700 rounded-lg">
      {label}
    </div>
  );
}

// ===== DroppableSection =====
function DroppableSection({ id, children }: { id: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={`rounded-lg transition-all ${isOver ? 'bg-primary-50/50 dark:bg-primary-900/10 ring-1 ring-primary-300 dark:ring-primary-800 p-1' : ''}`}
    >
      {children}
    </div>
  );
}

// ===== Event Line =====
function EventLine({ event }: { event: TaskEvent }) {
  let data: ParsedEventData;
  try {
    data = JSON.parse(event.data);
  } catch {
    return (
      <div className="text-gray-400 mb-1">
        [raw] {event.data?.substring(0, 300)}
      </div>
    );
  }

  if (data.type === 'system' && data.subtype === 'init') {
    return (
      <div className="text-gray-500 mb-1">
        ▶ [시스템] 세션 시작 — 모델: {data.model || 'unknown'}
      </div>
    );
  }

  if (data.type === 'task_started') {
    return (
      <div className="text-green-400 mb-1">
        ▶ [시작] {(data.prompt as string)?.substring(0, 150)}
      </div>
    );
  }

  if (data.type === 'task_completed') {
    return (
      <div className="text-emerald-400 mb-1 border-t border-gray-800 pt-1.5 mt-1.5">
        ✓ [완료] exit code: {data.exitCode}
      </div>
    );
  }

  if (data.type === 'system' && data.text) {
    return <div className="text-gray-500 mb-1">ℹ {data.text}</div>;
  }

  if (data.type === 'rate_limit_event') {
    const info = data.rate_limit_info;
    if (info?.status === 'allowed') return null;
    return (
      <div className="text-yellow-400 mb-1">
        ⚠ [속도 제한] {info?.status || 'unknown'}
      </div>
    );
  }

  if (data.type === 'assistant' && data.message?.content) {
    return (
      <>
        {data.message.content.map((block: any, i: number) => {
          if (block.type === 'thinking') {
            return (
              <details key={i} className="mb-1">
                <summary className="text-gray-500 cursor-pointer hover:text-gray-400">
                  💭 사고 과정
                </summary>
                <div className="text-gray-500 ml-3 mt-1 whitespace-pre-wrap">
                  {block.thinking?.substring(0, 1000)}
                  {(block.thinking?.length || 0) > 1000 && '...'}
                </div>
              </details>
            );
          }
          if (block.type === 'text') {
            return (
              <div key={i} className="text-green-300 mb-2">
                <div className="prose prose-invert prose-xs max-w-none
                  prose-pre:bg-gray-900 prose-pre:text-gray-300
                  prose-code:text-cyan-400 prose-code:bg-gray-900
                  prose-code:px-0.5 prose-code:rounded
                  prose-a:text-blue-400 prose-headings:text-green-300
                  prose-p:mb-1 prose-ul:my-1 prose-li:my-0">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {block.text}
                  </ReactMarkdown>
                </div>
              </div>
            );
          }
          if (block.type === 'tool_use') {
            return (
              <div key={i} className="text-yellow-400 mb-1">
                🔧 [{block.name}] {JSON.stringify(block.input).substring(0, 300)}
              </div>
            );
          }
          return (
            <div key={i} className="text-gray-400 mb-1">
              [{block.type}] {JSON.stringify(block).substring(0, 200)}
            </div>
          );
        })}
      </>
    );
  }

  if (data.type === 'tool') {
    const content =
      typeof data.content === 'string'
        ? data.content.substring(0, 500)
        : JSON.stringify(data.content).substring(0, 500);
    return (
      <div className="text-cyan-400 mb-1 whitespace-pre-wrap">
        ← [도구 결과] {content}
      </div>
    );
  }

  if (data.type === 'result') {
    const cost = data.total_cost_usd ?? data.cost_usd;
    return (
      <div className="text-emerald-400 mb-2 border-t border-gray-800 pt-1.5 mt-1.5">
        <div>✓ [결과]</div>
        <div className="prose prose-invert prose-xs max-w-none mt-1
          prose-pre:bg-gray-900 prose-pre:text-gray-300
          prose-code:text-cyan-400 prose-code:bg-gray-900
          prose-code:px-0.5 prose-code:rounded
          prose-a:text-blue-400 prose-headings:text-emerald-400
          prose-p:mb-1 prose-ul:my-1 prose-li:my-0">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {data.result || '(결과 없음)'}
          </ReactMarkdown>
        </div>
        {(cost !== undefined || data.duration_ms !== undefined) && (
          <div className="text-gray-500 mt-1">
            {cost !== undefined && `💰 $${Number(cost).toFixed(4)}`}
            {data.duration_ms !== undefined && ` | ⏱ ${(data.duration_ms / 1000).toFixed(1)}s`}
            {data.num_turns !== undefined && ` | 🔄 ${data.num_turns}턴`}
          </div>
        )}
      </div>
    );
  }

  if (data.type === 'error') {
    return (
      <div className="text-red-400 mb-1">
        ✗ [오류] {data.text || data.error || JSON.stringify(data).substring(0, 300)}
      </div>
    );
  }

  if (data.type === 'stderr') {
    return <div className="text-red-300 mb-1">⚠ [stderr] {data.text || ''}</div>;
  }

  if (data.type === 'raw') {
    return <div className="text-gray-300 mb-1">{data.text || ''}</div>;
  }

  if (data.type === 'human_input' || data.type === 'permission_request' || data.type === 'input_request') {
    return (
      <div className="text-purple-400 mb-1 animate-pulse">
        🖐 [응답 필요] {data.text || '사용자 입력을 기다리고 있습니다...'}
      </div>
    );
  }

  if (data.type === 'aborted') {
    return (
      <div className="text-orange-400 mb-1 border-t border-gray-800 pt-1.5 mt-1.5">
        ⏹ [중단] {data.text || '사용자에 의해 작업이 중단되었습니다'}
      </div>
    );
  }

  return (
    <div className="text-gray-500 mb-1">
      [{data.type || event.eventType || 'unknown'}] {JSON.stringify(data).substring(0, 200)}
    </div>
  );
}
