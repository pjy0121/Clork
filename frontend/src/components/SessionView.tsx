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
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation();
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
    <div className="h-full flex gap-1 p-0 overflow-hidden bg-transparent">
      {/* ===== LEFT: Task Queue Panel ===== */}
      <div className="w-[480px] shrink-0 flex flex-col bg-slate-50 dark:bg-[#111936] border-r border-slate-200 dark:border-[#8492c4]/10 z-10 shadow-lg">
        {/* Session Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-[#8492c4]/10 bg-slate-50 dark:bg-[#111936] shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="font-bold text-base tracking-tight text-slate-900 dark:text-white truncate flex-1">{session.name}</h2>
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
            <div className="p-4 space-y-6">
              {/* 실행 중 */}
              {runningTask && (
                <div>
                  <SectionLabel icon={<Loader2 size={16} className="animate-spin text-indigo-400" />} label="Running" />
                  <div
                    className={`cursor-pointer transition-all mt-3 ${displayTask?.id === runningTask.id ? 'ring-2 ring-indigo-500 shadow-lg rounded-xl z-10 relative bg-white dark:bg-[#1a223f]' : ''}`}
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
                  icon={<Zap size={16} className="text-amber-500" />}
                  label={`Queue [${todoTasks.length}]`}
                  extra={nextTaskId && !runningTask ? (
                    <span className="badge-next">Next</span>
                  ) : undefined}
                />
                <SortableContext items={todoTasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-2 mt-3">
                    {todoTasks.map((task) => (
                      <div
                        key={task.id}
                        className={`cursor-pointer transition-all rounded-xl ${displayTask?.id === task.id ? 'ring-2 ring-indigo-500 shadow-lg z-10 relative bg-white dark:bg-[#1a223f]' : ''}`}
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
                  <EmptySlot label={runningTask ? t('sessions.noQueuedTasks') : t('sessions.dragFromBacklog')} />
                )}
              </DroppableSection>

              {/* 백로그 */}
              <DroppableSection id="droppable-backlog">
                <button
                  onClick={() => setBacklogExpanded(!backlogExpanded)}
                  className="flex items-center gap-2 w-full text-left mb-4 group hover:bg-white dark:bg-[#1a223f] p-2 rounded-xl transition-colors border border-transparent hover:border-slate-200 dark:border-[#8492c4]/10"
                >
                  {backlogExpanded ? <ChevronDown size={16} className="text-slate-500 dark:text-[#8492c4]" /> : <ChevronRight size={16} className="text-slate-500 dark:text-[#8492c4]" />}
                  <span className="text-sm font-semibold text-slate-500 dark:text-[#8492c4] flex-1">
                    {t('sessions.backlog')} [{backlogTasks.length}]
                  </span>
                  <Archive size={16} className="text-slate-900 dark:text-[#d7dcec]" />
                </button>
                {backlogExpanded && (
                  <>
                    <SortableContext items={backlogTasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
                      <div className="space-y-2">
                        {backlogTasks.map((task) => (
                          <div
                            key={task.id}
                            className={`cursor-pointer transition-all rounded-xl ${displayTask?.id === task.id ? 'ring-2 ring-indigo-500 shadow-lg z-10 relative bg-white dark:bg-[#1a223f]' : ''}`}
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
                      <EmptySlot label={t('sessions.empty')} />
                    )}
                  </>
                )}
              </DroppableSection>

              {/* 완료됨 */}
              {doneTasks.length > 0 && (
                <div className="pt-2">
                  <button
                    onClick={() => setDoneExpanded(!doneExpanded)}
                    className="flex items-center gap-2 w-full text-left mb-4 group hover:bg-white dark:bg-[#1a223f] p-2 rounded-xl transition-colors border border-transparent hover:border-slate-200 dark:border-[#8492c4]/10"
                  >
                    {doneExpanded ? <ChevronDown size={16} className="text-emerald-500" /> : <ChevronRight size={16} className="text-emerald-500" />}
                    <span className="text-sm font-semibold text-slate-500 dark:text-[#8492c4] flex-1">
                      {t('sessions.completed')} [{doneTasks.length}]
                    </span>
                    <CheckCheck size={16} className="text-emerald-500" />
                  </button>
                  {doneExpanded && (
                    <div className="space-y-2">
                      {doneTasks.map((task) => (
                        <div
                          key={task.id}
                          className={`cursor-pointer transition-all rounded-xl ${displayTask?.id === task.id ? 'ring-2 ring-indigo-500 shadow-lg z-10 relative bg-white dark:bg-[#1a223f]' : ''}`}
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
        <div className="shrink-0 border-t border-slate-200 dark:border-[#8492c4]/10 p-4 bg-slate-50 dark:bg-[#111936]">
          <div className="flex gap-2">
            <textarea
              className="input resize-none py-3 flex-1 bg-white dark:bg-[#1a223f] placeholder-[#8492c4] focus:border-indigo-500 focus:bg-slate-50 dark:bg-[#111936] text-sm"
              rows={2}
              placeholder={t('sessions.newTaskPrompt')}
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
                className="btn-primary !px-3 !py-2 border-r-0 border-t-0"
                title="ADD_TO_BACKLOG"
              >
                <Plus size={14} />
              </button>
              <button
                onClick={() => setShowAddModal(true)}
                className="btn-secondary !px-3 !py-2 text-[10px]"
                title="ADVANCED_ADD"
              >
                [+]
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ===== RIGHT: Task Detail / Output Panel ===== */}
      <div className="flex-1 overflow-y-auto scrollbar-thin flex flex-col bg-transparent border-y-0 border-r-0">
        {displayTask ? (
          <div className="h-full flex flex-col">
            {/* Task Header */}
            <div className={`px-6 py-4 border-b shrink-0 flex items-center justify-between transition-colors ${isDisplayTaskRunning
              ? 'bg-indigo-500/10 border-indigo-500/20'
              : displayTask.status === 'completed'
                ? 'bg-emerald-500/10 border-emerald-500/20'
                : displayTask.status === 'failed'
                  ? 'bg-rose-500/10 border-rose-500/20'
                  : displayTask.status === 'aborted'
                    ? 'bg-amber-500/10 border-amber-500/20'
                    : 'bg-slate-50 dark:bg-[#111936] border-slate-200 dark:border-[#8492c4]/10'
              }`}>
              <div className="flex items-center gap-3 min-w-0 font-semibold text-sm">
                {isDisplayTaskRunning ? (
                  <Loader2 size={16} className="animate-spin text-indigo-400 shrink-0" />
                ) : (
                  <div className={`w-2 h-2 rounded-full shrink-0 ${displayTask.status === 'completed' ? 'bg-emerald-400'
                    : displayTask.status === 'failed' ? 'bg-rose-400'
                      : displayTask.status === 'aborted' ? 'bg-amber-400'
                        : 'bg-[#8492c4]'
                    }`} />
                )}
                <span className={`${isDisplayTaskRunning ? 'text-indigo-400'
                  : displayTask.status === 'completed' ? 'text-emerald-400'
                    : displayTask.status === 'failed' ? 'text-rose-400'
                      : displayTask.status === 'aborted' ? 'text-amber-400'
                        : 'text-slate-500 dark:text-[#8492c4]'
                  }`}>
                  {isDisplayTaskRunning ? t('sessions.status.running')
                    : displayTask.status === 'completed' ? t('sessions.status.completed')
                      : displayTask.status === 'failed' ? t('sessions.status.failed')
                        : displayTask.status === 'aborted' ? t('sessions.status.aborted')
                          : t('sessions.status.idle')}
                </span>
              </div>
              {isDisplayTaskRunning && (
                <button
                  onClick={() => abortTask(displayTask.id)}
                  className="btn-danger !px-3 !py-1 !text-xs"
                  title="ABORT_SYSTEM"
                >
                  <Square size={10} className="inline-block mr-1" /> {t('tasks.abort')}
                </button>
              )}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto scrollbar-thin p-8 space-y-8 bg-transparent">
              {/* Prompt */}
              <div>
                <div className="text-sm font-bold text-slate-500 dark:text-[#8492c4] mb-3 flex items-center gap-2">
                  <FileText size={16} />
                  {t('sessions.prompt')}
                </div>
                <div className="dashboard-panel text-sm text-slate-900 dark:text-[#d7dcec] bg-slate-50 dark:bg-[#111936] px-6 py-6 border border-slate-200 dark:border-[#8492c4]/10 leading-relaxed whitespace-pre-wrap">
                  {displayTask.prompt}
                </div>
              </div>

              {/* Result */}
              {(displayResult || !isDisplayTaskRunning) && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <CheckCheck size={16} className="text-emerald-400" />
                    <span className="text-sm font-bold text-emerald-400">{t('sessions.result')}</span>
                  </div>
                  <div className="dashboard-panel bg-slate-50 dark:bg-[#111936] border border-slate-200 dark:border-[#8492c4]/10 p-6 shadow-sm overflow-hidden">
                    {displayResult ? (
                      <div className="prose prose-sm dark:prose-invert max-w-none
                          prose-pre:bg-slate-50 dark:prose-pre:bg-[#1a223f] prose-pre:border-slate-200 dark:prose-pre:border-[#8492c4]/10 prose-pre:border
                          prose-code:text-indigo-600 dark:prose-code:text-indigo-300
                          prose-code:bg-slate-50 dark:prose-code:bg-[#1a223f] prose-code:border prose-code:border-slate-200 dark:prose-code:border-[#8492c4]/10
                          prose-code:px-1.5 prose-code:py-0.5 prose-code:text-sm prose-code:rounded
                          prose-headings:text-slate-900 dark:prose-headings:text-white
                          prose-a:text-indigo-600 dark:prose-a:text-indigo-400">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {displayResult}
                        </ReactMarkdown>
                      </div>
                    ) : (
                      <div className="text-slate-500 dark:text-[#8492c4] font-medium text-center py-8 text-sm">
                        {isDisplayTaskRunning ? t('sessions.awaitingResponse') : t('sessions.noOutput')}
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
                  className="flex items-center gap-2 text-sm font-bold text-indigo-400 hover:text-indigo-300 transition-colors mb-3"
                >
                  <Code size={16} />
                  {t('sessions.systemLogs')} [{displayEvents.length}]
                  {showEventLog ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </button>

                {showEventLog && (
                  <div
                    ref={outputRef}
                    className="dashboard-panel bg-slate-900/40 dark:bg-[#0b0f19] border border-slate-200 dark:border-[#8492c4]/10 p-6 max-h-[40rem] overflow-y-auto scrollbar-thin text-sm text-slate-300 shadow-inner"
                  >
                    {displayEvents.length === 0 && isDisplayTaskRunning && (
                      <div className="text-indigo-400 flex items-center gap-2 font-medium">
                        <Loader2 size={14} className="animate-spin" />
                        {t('sessions.fetchingLogs')}
                      </div>
                    )}
                    {displayEvents.length === 0 && !isDisplayTaskRunning && (
                      <div className="text-slate-500 dark:text-[#8492c4] font-medium">{t('sessions.noLogs')}</div>
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
          <div className="h-full flex items-center justify-center bg-transparent">
            <div className="text-center dashboard-panel p-10 mx-4 max-w-sm">
              <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shadow-inner">
                <FileText size={24} className="text-indigo-400" />
              </div>
              <p className="text-lg font-bold text-slate-900 dark:text-white mb-2">{t('sessions.noTaskSelected')}</p>
              <p className="text-sm font-medium text-slate-500 dark:text-[#8492c4]">
                {t('sessions.selectTaskMsg')}
              </p>
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
  const { t } = useTranslation();
  const config: Record<string, { label: string; className: string }> = {
    idle: { label: t('sessions.status.idle'), className: 'badge-idle' },
    queued: { label: t('sessions.status.queued'), className: 'badge-next' },
    running: { label: t('sessions.status.running'), className: 'badge-running' },
    completed: { label: t('sessions.status.completed'), className: 'badge-completed' },
    paused: { label: t('sessions.status.paused'), className: 'badge-idle' },
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
    <div className="flex items-center gap-2 mb-2">
      {icon}
      <span className="text-xs font-bold text-slate-500 dark:text-[#8492c4] uppercase flex-1">{label}</span>
      {extra}
    </div>
  );
}

// ===== Empty Slot =====
function EmptySlot({ label }: { label: string }) {
  return (
    <div className="text-center py-6 text-sm font-medium text-slate-500 dark:text-[#8492c4] border border-dashed border-slate-300 dark:border-[#8492c4]/20 bg-white dark:bg-[#1a223f]/50 rounded-xl">
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
      className={`transition-all rounded-xl ${isOver ? 'bg-indigo-500/10 ring-2 ring-indigo-500/50 p-2 -m-2' : ''}`}
    >
      {children}
    </div>
  );
}

// ===== Event Line =====
function EventLine({ event }: { event: TaskEvent }) {
  const { t } = useTranslation();
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
        {t('sessions.event.systemInit', { model: data.model || 'unknown' })}
      </div>
    );
  }

  if (data.type === 'task_started') {
    return (
      <div className="text-green-400 mb-1">
        {t('sessions.event.taskStarted', { prompt: (data.prompt as string)?.substring(0, 150) })}
      </div>
    );
  }

  if (data.type === 'task_completed') {
    return (
      <div className="text-emerald-400 mb-1 border-t border-gray-800 pt-1.5 mt-1.5">
        {t('sessions.event.taskCompleted', { exitCode: data.exitCode })}
      </div>
    );
  }

  if (data.type === 'system' && data.text) {
    return <div className="text-gray-500 mb-1">{t('sessions.event.system', { text: data.text })}</div>;
  }

  if (data.type === 'rate_limit_event') {
    const info = data.rate_limit_info;
    if (info?.status === 'allowed') return null;
    return (
      <div className="text-yellow-400 mb-1">
        {t('sessions.event.rateLimit', { status: info?.status || 'unknown' })}
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
                  {t('sessions.event.thinking')}
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
                <div className="prose dark:prose-invert prose-xs max-w-none
                  prose-pre:bg-slate-100 dark:prose-pre:bg-gray-900 prose-pre:text-slate-800 dark:prose-pre:text-gray-300
                  prose-code:text-cyan-700 dark:prose-code:text-cyan-400 prose-code:bg-slate-100 dark:prose-code:bg-gray-900
                  prose-code:px-0.5 prose-code:rounded
                  prose-a:text-blue-600 dark:prose-a:text-blue-400 prose-headings:text-green-700 dark:prose-headings:text-green-300
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
        {t('sessions.event.toolResult', { content })}
      </div>
    );
  }

  if (data.type === 'result') {
    const cost = data.total_cost_usd ?? data.cost_usd;
    return (
      <div className="text-emerald-400 mb-2 border-t border-gray-800 pt-1.5 mt-1.5">
        <div>✓ [{t('sessions.event.resultLabel')}]</div>
        <div className="prose dark:prose-invert prose-xs max-w-none mt-1
          prose-pre:bg-slate-100 dark:prose-pre:bg-gray-900 prose-pre:text-slate-800 dark:prose-pre:text-gray-300
          prose-code:text-cyan-700 dark:prose-code:text-cyan-400 prose-code:bg-slate-100 dark:prose-code:bg-gray-900
          prose-code:px-0.5 prose-code:rounded
          prose-a:text-blue-600 dark:prose-a:text-blue-400 prose-headings:text-emerald-600 dark:prose-headings:text-emerald-400
          prose-p:mb-1 prose-ul:my-1 prose-li:my-0">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {data.result || t('sessions.event.noResult')}
          </ReactMarkdown>
        </div>
        {(cost !== undefined || data.duration_ms !== undefined) && (
          <div className="text-gray-500 mt-1">
            {cost !== undefined && `💰 $${Number(cost).toFixed(4)}`}
            {data.duration_ms !== undefined && ` | ⏱ ${(data.duration_ms / 1000).toFixed(1)}s`}
            {data.num_turns !== undefined && t('sessions.event.turns', { count: data.num_turns })}
          </div>
        )}
      </div>
    );
  }

  if (data.type === 'error') {
    return (
      <div className="text-red-400 mb-1">
        ✗ [{t('sessions.event.errorLabel')}] {data.text || data.error || JSON.stringify(data).substring(0, 300)}
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
        🖐 [{t('hitl.inputNeeded')}] {data.text || t('sessions.event.awaitingUserInput')}
      </div>
    );
  }

  if (data.type === 'aborted') {
    return (
      <div className="text-orange-400 mb-1 border-t border-gray-800 pt-1.5 mt-1.5">
        ⏹ [{t('sessions.event.abortedLabel')}] {data.text || t('sessions.event.abortedByUser')}
      </div>
    );
  }

  return (
    <div className="text-gray-500 mb-1">
      [{data.type || event.eventType || 'unknown'}] {JSON.stringify(data).substring(0, 200)}
    </div>
  );
}
