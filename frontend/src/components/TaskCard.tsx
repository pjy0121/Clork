import { useState } from 'react';
import {
  GripVertical,
  Square,
  Trash2,
  Copy,
  Eye,
  CheckCircle2,
  XCircle,
  Clock,
  Hand,
  ArrowUp,
  ArrowDown,
  Pencil,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Task } from '../types';
import { useStore } from '../store';
import toast from 'react-hot-toast';
import ConfirmModal from './ConfirmModal';
import { useTranslation } from 'react-i18next';

interface TaskCardProps {
  task: Task;
  isNext?: boolean;
  showActions?: boolean;
  isDone?: boolean;
  onEdit?: (task: Task) => void;
}

const STATUS_ICON: Record<string, any> = {
  pending: Clock,
  running: Loader2,
  completed: CheckCircle2,
  failed: XCircle,
  aborted: AlertTriangle,
};

const STATUS_STYLE: Record<string, string> = {
  pending: 'text-slate-500 dark:text-[#8492c4]',
  running: 'text-indigo-400',
  completed: 'text-emerald-400',
  failed: 'text-rose-400',
  aborted: 'text-amber-400',
};

export default function TaskCard({ task, isNext, showActions = true, isDone, onEdit }: TaskCardProps) {
  const { abortTask, deleteTask, createTask, setTaskDetailId, humanInputTasks, activeSessionId, moveTask } =
    useStore();
  const { t } = useTranslation();

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: task.id,
    data: { task },
    disabled: task.status === 'running',
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const Icon = STATUS_ICON[task.status] || Clock;
  const needsInput = humanInputTasks[task.id];

  return (
    <>
      <div
        ref={setNodeRef}
        style={style}
        className={`dashboard-panel group relative bg-white dark:bg-[#1a223f] border-l-[3px] p-4 transition-all duration-300 cursor-pointer ${isDragging
          ? 'shadow-xl border-l-indigo-400 scale-[1.02] z-50'
          : 'border-l-transparent border-slate-200 dark:border-[#8492c4]/10 hover:border-l-indigo-400/50 hover:bg-slate-100 dark:bg-[#212946]'
          } ${needsInput
            ? 'ring-1 ring-fuchsia-500/30 border-l-fuchsia-500 bg-fuchsia-500/5'
            : ''
          } ${isNext
            ? 'ring-1 ring-amber-500/30 border-l-amber-500 bg-amber-500/5'
            : ''
          } ${isDone && task.status === 'completed'
            ? 'border-l-emerald-500/50'
            : ''
          } ${isDone && task.status === 'failed'
            ? 'border-l-rose-500/50'
            : ''
          }`}
      >
        <div className="flex items-start gap-5">
          {/* Drag handle */}
          {!isDone && task.status !== 'running' && (
            <button
              className="mt-1 cursor-grab active:cursor-grabbing text-slate-500 dark:text-[#8492c4] hover:text-slate-900 dark:text-[#d7dcec] shrink-0"
              {...attributes}
              {...listeners}
            >
              <GripVertical size={20} />
            </button>
          )}

          {/* Status icon */}
          <Icon
            size={18}
            className={`mt-1 shrink-0 ${STATUS_STYLE[task.status]} ${task.status === 'running' ? 'animate-spin' : ''}`}
          />

          {/* Content */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium leading-relaxed break-words line-clamp-4 text-slate-900 dark:text-[#d7dcec]">
              {task.prompt}
            </p>

            {/* Badges */}
            <div className="flex items-center gap-2 mt-4 flex-wrap">
              {isNext && <span className="badge-next">{t('tasks.next')}</span>}
              {task.status === 'running' && <span className="badge-running">{t('tasks.running')}</span>}
              {needsInput && (
                <span className="badge-human">
                  <Hand size={12} className="mr-1 inline-block" /> {t('tasks.inputReq')}
                </span>
              )}
              {isDone && task.status === 'completed' && <span className="badge-completed">{t('tasks.done')}</span>}
              {isDone && task.status === 'failed' && <span className="badge-failed">{t('tasks.error')}</span>}
              {isDone && task.status === 'aborted' && <span className="badge-aborted">{t('tasks.abort')}</span>}
              {task.completedAt && (
                <span className="text-[10px] font-semibold text-slate-500 dark:text-[#8492c4] flex items-center gap-1 uppercase tracking-wider">
                  <Clock size={10} />
                  {new Date(task.completedAt).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              )}
            </div>
          </div>

          {/* Actions */}
          {showActions && (
            <div className="flex flex-col items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 border-l border-slate-200 dark:border-[#8492c4]/10 pl-2 ml-2">
              {task.status === 'running' && (
                <button
                  onClick={(e) => { e.stopPropagation(); abortTask(task.id); }}
                  className="p-1.5 rounded-lg text-rose-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                  title="Abort"
                >
                  <Square size={16} />
                </button>
              )}
              {isDone && (
                <>
                  <button
                    onClick={(e) => { e.stopPropagation(); setTaskDetailId(task.id); }}
                    className="p-1.5 rounded-lg text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10 transition-colors"
                    title="View Logs"
                  >
                    <Eye size={16} />
                  </button>
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      try {
                        await createTask({
                          projectId: task.projectId,
                          sessionId: activeSessionId || undefined,
                          prompt: task.prompt,
                          location: 'backlog',
                        });
                        toast.success(t('tasks.copiedToBacklog'));
                      } catch (err: any) { toast.error(err.message); }
                    }}
                    className="p-1.5 rounded-lg text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors"
                    title="Copy"
                  >
                    <Copy size={16} />
                  </button>
                </>
              )}
              {task.status === 'pending' && !isDone && task.location === 'todo' && (
                <button
                  onClick={async (e) => {
                    e.stopPropagation();
                    try {
                      await moveTask(task.id, { location: 'backlog', sessionId: activeSessionId! });
                      toast.success(t('tasks.movedToBacklog'));
                    } catch (err: any) { toast.error(err.message); }
                  }}
                  className="p-1.5 rounded-lg text-amber-500 hover:text-amber-400 hover:bg-amber-500/10 transition-colors"
                  title="Demote"
                >
                  <ArrowDown size={16} />
                </button>
              )}
              {task.status === 'pending' && !isDone && task.location === 'backlog' && (
                <button
                  onClick={async (e) => {
                    e.stopPropagation();
                    try {
                      await moveTask(task.id, { location: 'todo', sessionId: activeSessionId! });
                      toast.success(t('tasks.movedToQueue'));
                    } catch (err: any) { toast.error(err.message); }
                  }}
                  className="p-1.5 rounded-lg text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors"
                  title="Promote"
                >
                  <ArrowUp size={16} />
                </button>
              )}
              {task.status === 'pending' && !isDone && onEdit && (
                <button
                  onClick={(e) => { e.stopPropagation(); onEdit(task); }}
                  className="p-1.5 rounded-lg text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10 transition-colors"
                  title="Edit"
                >
                  <Pencil size={16} />
                </button>
              )}
              {task.status !== 'running' && (
                <button
                  onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(true); }}
                  className="p-1.5 rounded-lg text-slate-500 dark:text-[#8492c4] hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                  title="Delete"
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <ConfirmModal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={async () => {
          try {
            await deleteTask(task.id);
            toast.success(t('tasks.taskDeleted'));
          } catch (err: any) { toast.error(err.message); }
        }}
        title={t('tasks.deleteTask')}
        message={t('tasks.deleteTaskConfirm', { prompt: `${task.prompt.substring(0, 60)}${task.prompt.length > 60 ? '...' : ''}` })}
        type="danger"
        confirmText={t('tasks.delete')}
        cancelText={t('tasks.cancel')}
      />
    </>
  );
}
