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

interface TaskCardProps {
  task: Task;
  isNext?: boolean;
  showActions?: boolean;
  isDone?: boolean;
  onEdit?: (task: Task) => void;
}

const STATUS_ICON: Record<string, any> = {
  pending:   Clock,
  running:   Loader2,
  completed: CheckCircle2,
  failed:    XCircle,
  aborted:   AlertTriangle,
};

const STATUS_STYLE: Record<string, string> = {
  pending:   'text-gray-400',
  running:   'text-blue-500',
  completed: 'text-green-500',
  failed:    'text-red-500',
  aborted:   'text-orange-500',
};

export default function TaskCard({ task, isNext, showActions = true, isDone, onEdit }: TaskCardProps) {
  const { abortTask, deleteTask, createTask, setTaskDetailId, humanInputTasks, activeSessionId, moveTask } =
    useStore();

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
        className={`group relative bg-white dark:bg-gray-900 border rounded-xl px-4 py-3 transition-all ${
          isDragging
            ? 'shadow-soft-md ring-2 ring-primary-500 border-primary-300'
            : 'border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700 hover:shadow-soft'
        } ${
          needsInput
            ? 'ring-1 ring-purple-400 dark:ring-purple-500 border-purple-200 dark:border-purple-800'
            : ''
        } ${
          isNext
            ? 'ring-1 ring-amber-400 dark:ring-amber-500 border-amber-200 dark:border-amber-800/50 bg-amber-50/40 dark:bg-amber-900/5'
            : ''
        }`}
      >
        <div className="flex items-start gap-2.5">
          {/* Drag handle */}
          {!isDone && task.status !== 'running' && (
            <button
              className="mt-0.5 cursor-grab active:cursor-grabbing text-gray-300 dark:text-gray-700 hover:text-gray-500 dark:hover:text-gray-400 shrink-0"
              {...attributes}
              {...listeners}
            >
              <GripVertical size={15} />
            </button>
          )}

          {/* Status icon */}
          <Icon
            size={15}
            className={`mt-0.5 shrink-0 ${STATUS_STYLE[task.status]} ${task.status === 'running' ? 'animate-spin' : ''}`}
          />

          {/* Content */}
          <div className="flex-1 min-w-0">
            <p className="text-sm leading-relaxed break-words line-clamp-2 text-gray-800 dark:text-gray-200">
              {task.prompt}
            </p>

            {/* Badges */}
            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
              {isNext && <span className="badge-next">다음</span>}
              {task.status === 'running' && <span className="badge-running">실행 중</span>}
              {needsInput && (
                <span className="badge-human">
                  <Hand size={10} className="mr-1" />응답 필요
                </span>
              )}
              {isDone && task.status === 'completed' && <span className="badge-completed">완료</span>}
              {isDone && task.status === 'failed'    && <span className="badge-failed">실패</span>}
              {isDone && task.status === 'aborted'   && <span className="badge-aborted">중단됨</span>}
              {task.completedAt && (
                <span className="text-xs text-gray-400 dark:text-gray-500">
                  {new Date(task.completedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </div>
          </div>

          {/* Actions */}
          {showActions && (
            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
              {task.status === 'running' && (
                <button
                  onClick={(e) => { e.stopPropagation(); abortTask(task.id); }}
                  className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 rounded-lg transition-colors"
                  title="중단"
                >
                  <Square size={13} />
                </button>
              )}
              {isDone && (
                <>
                  <button
                    onClick={(e) => { e.stopPropagation(); setTaskDetailId(task.id); }}
                    className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 rounded-lg transition-colors"
                    title="상세보기"
                  >
                    <Eye size={13} />
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
                        toast.success('백로그에 복사되었습니다');
                      } catch (err: any) { toast.error(err.message); }
                    }}
                    className="p-1.5 hover:bg-green-50 dark:hover:bg-green-900/20 text-green-600 rounded-lg transition-colors"
                    title="백로그에 복사"
                  >
                    <Copy size={13} />
                  </button>
                </>
              )}
              {task.status === 'pending' && !isDone && task.location === 'todo' && (
                <button
                  onClick={async (e) => {
                    e.stopPropagation();
                    try {
                      await moveTask(task.id, { location: 'backlog', sessionId: activeSessionId! });
                      toast.success('백로그로 이동되었습니다');
                    } catch (err: any) { toast.error(err.message); }
                  }}
                  className="p-1.5 hover:bg-orange-50 dark:hover:bg-orange-900/20 text-orange-500 rounded-lg transition-colors"
                  title="백로그로 이동"
                >
                  <ArrowDown size={13} />
                </button>
              )}
              {task.status === 'pending' && !isDone && task.location === 'backlog' && (
                <button
                  onClick={async (e) => {
                    e.stopPropagation();
                    try {
                      await moveTask(task.id, { location: 'todo', sessionId: activeSessionId! });
                      toast.success('대기열로 이동되었습니다');
                    } catch (err: any) { toast.error(err.message); }
                  }}
                  className="p-1.5 hover:bg-green-50 dark:hover:bg-green-900/20 text-green-600 rounded-lg transition-colors"
                  title="대기열로 이동"
                >
                  <ArrowUp size={13} />
                </button>
              )}
              {task.status === 'pending' && !isDone && onEdit && (
                <button
                  onClick={(e) => { e.stopPropagation(); onEdit(task); }}
                  className="p-1.5 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-500 rounded-lg transition-colors"
                  title="수정"
                >
                  <Pencil size={13} />
                </button>
              )}
              {task.status !== 'running' && (
                <button
                  onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(true); }}
                  className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 rounded-lg transition-colors"
                  title="삭제"
                >
                  <Trash2 size={13} />
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
            toast.success('작업이 삭제되었습니다');
          } catch (err: any) { toast.error(err.message); }
        }}
        title="작업 삭제"
        message={`"${task.prompt.substring(0, 60)}${task.prompt.length > 60 ? '...' : ''}" 작업을 삭제하시겠습니까?`}
        type="danger"
        confirmText="삭제"
        cancelText="취소"
      />
    </>
  );
}
