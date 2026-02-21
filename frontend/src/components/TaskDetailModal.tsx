import { useEffect } from 'react';
import {
  X,
  Copy,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  DollarSign,
  Timer,
  FileText,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useStore } from '../store';
import type { TaskEvent, ParsedEventData } from '../types';
import toast from 'react-hot-toast';

export default function TaskDetailModal() {
  const {
    taskDetailId,
    setTaskDetailId,
    tasks,
    taskEvents,
    fetchTaskEvents,
    createTask,
    activeProjectId,
  } = useStore();

  const task = tasks.find((t) => t.id === taskDetailId);
  const events = taskDetailId ? taskEvents[taskDetailId] || [] : [];

  useEffect(() => {
    if (taskDetailId && !taskEvents[taskDetailId]) {
      fetchTaskEvents(taskDetailId);
    }
  }, [taskDetailId]);

  if (!taskDetailId || !task) return null;

  const statusConfig = {
    pending: { icon: Clock, color: 'text-gray-500', label: '대기' },
    running: { icon: Loader2, color: 'text-blue-500', label: '실행 중' },
    completed: { icon: CheckCircle2, color: 'text-green-500', label: '완료' },
    failed: { icon: XCircle, color: 'text-red-500', label: '실패' },
    aborted: { icon: AlertTriangle, color: 'text-orange-500', label: '중단됨' },
  };

  const config = statusConfig[task.status as keyof typeof statusConfig] || statusConfig.pending;
  const StatusIcon = config.icon;

  // Extract cost/duration from result events
  const resultEvent = events.find((e) => e.eventType === 'result');
  let resultData: ParsedEventData | null = null;
  if (resultEvent) {
    try {
      resultData = JSON.parse(resultEvent.data);
    } catch {}
  }

  const handleCopyToBacklog = async () => {
    try {
      await createTask({
        projectId: task.projectId,
        prompt: task.prompt,
        location: 'backlog',
      });
      setTaskDetailId(null);
      toast.success('백로그에 복사되었습니다');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={() => setTaskDetailId(null)}
    >
      <div
        className="card w-full max-w-3xl mx-4 max-h-[90vh] flex flex-col animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
          <div className="px-6 py-5 border-b border-gray-200 dark:border-gray-800 flex items-start justify-between shrink-0">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <StatusIcon size={15} className={config.color} />
              <span className={`badge-${task.status}`}>{config.label}</span>
            </div>
            <h2 className="text-sm font-medium text-gray-800 dark:text-gray-200 break-words leading-relaxed">{task.prompt}</h2>
          </div>
          <button onClick={() => setTaskDetailId(null)} className="btn-icon shrink-0 ml-3">
            <X size={15} />
          </button>
        </div>

        {/* Meta */}
          <div className="px-6 py-3 border-b border-gray-200 dark:border-gray-800 flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400 flex-wrap shrink-0 bg-gray-50 dark:bg-gray-800/40">
          <div className="flex items-center gap-1.5">
            <Clock size={12} />
            생성: {new Date(task.createdAt).toLocaleString('ko-KR')}
          </div>
          {task.startedAt && (
            <div className="flex items-center gap-1.5">
              <Timer size={12} />
              시작: {new Date(task.startedAt).toLocaleString('ko-KR')}
            </div>
          )}
          {task.completedAt && (
            <div className="flex items-center gap-1.5">
              <CheckCircle2 size={12} />
              종료: {new Date(task.completedAt).toLocaleString('ko-KR')}
            </div>
          )}
          {(resultData?.total_cost_usd !== undefined || resultData?.cost_usd !== undefined) && (
            <div className="flex items-center gap-1.5">
              <DollarSign size={12} />
              비용: ${Number(resultData!.total_cost_usd ?? resultData!.cost_usd).toFixed(4)}
            </div>
          )}
          {resultData?.duration_ms !== undefined && (
            <div className="flex items-center gap-1.5">
              <Timer size={12} />
              소요: {(resultData.duration_ms / 1000).toFixed(1)}s
            </div>
          )}
        </div>

        {/* Event Log */}
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          <div className="px-6 py-5">
            <div className="flex items-center gap-1.5 mb-3">
              <FileText size={13} className="text-gray-400" />
              <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                실행 로그 ({events.length}개)
              </span>
            </div>

            {events.length === 0 ? (
              <div className="text-center py-8 text-sm text-gray-400">
                이벤트 로그가 없습니다
              </div>
            ) : (
              <div className="bg-gray-950 rounded-lg p-4 font-mono text-xs leading-relaxed max-h-[26rem] overflow-y-auto scrollbar-thin">
                {events.map((evt) => (
                  <DetailEventLine key={evt.id} event={evt} />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
          <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-800 flex items-center justify-end gap-2 shrink-0">
          <button onClick={() => setTaskDetailId(null)} className="btn-secondary">
            닫기
          </button>
          <button
            onClick={handleCopyToBacklog}
            className="btn-primary inline-flex items-center gap-1.5"
          >
            <Copy size={13} />
            백로그에 복사
          </button>
        </div>
      </div>
    </div>
  );
}

function DetailEventLine({ event }: { event: TaskEvent }) {
  let data: ParsedEventData;
  try {
    data = JSON.parse(event.data);
  } catch {
    return null;
  }

  const time = new Date(event.timestamp).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const prefix = <span className="text-gray-600 mr-2">[{time}]</span>;

  if (data.type === 'system' && data.subtype === 'init') {
    return (
      <div className="text-gray-500 mb-1">
        {prefix}[시스템] 세션 초기화 — 모델: {data.model}
      </div>
    );
  }

  if (data.type === 'task_started') {
    return (
      <div className="text-green-400 mb-1">
        {prefix}[시작] 프롬프트 실행 시작
      </div>
    );
  }

  if (data.type === 'assistant' && data.message?.content) {
    return (
      <>
        {data.message.content.map((block: any, i: number) => {
          if (block.type === 'text') {
            return (
              <div key={i} className="text-green-300 mb-2">
                {prefix}
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
                {prefix}[도구] {block.name}({JSON.stringify(block.input).substring(0, 300)})
              </div>
            );
          }
          return null;
        })}
      </>
    );
  }

  if (data.type === 'tool') {
    const content = typeof data.content === 'string'
      ? data.content.substring(0, 500)
      : JSON.stringify(data.content).substring(0, 500);
    return (
      <div className="text-cyan-400 mb-1 whitespace-pre-wrap">
        {prefix}[결과] {content}
      </div>
    );
  }

  if (data.type === 'result') {
    return (
      <div className="text-emerald-400 mb-2 border-t border-gray-800 pt-1.5 mt-1.5">
        {prefix}[완료]
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
        {data.cost_usd !== undefined && (
          <div className="text-gray-500 mt-1">
            비용: ${data.cost_usd?.toFixed(4)} | 시간: {((data.duration_ms || 0) / 1000).toFixed(1)}s
          </div>
        )}
      </div>
    );
  }

  if (data.type === 'error' || data.type === 'stderr') {
    return (
      <div className="text-red-400 mb-1">
        {prefix}[오류] {data.text || data.error || JSON.stringify(data)}
      </div>
    );
  }

  if (data.type === 'aborted') {
    return (
      <div className="text-orange-400 mb-1">
        {prefix}[중단] 사용자에 의해 작업이 중단되었습니다
      </div>
    );
  }

  if (data.type === 'raw') {
    return (
      <div className="text-gray-400 mb-1">
        {prefix}{data.text}
      </div>
    );
  }

  if (data.type === 'human_input' || data.type === 'permission_request') {
    return (
      <div className="text-purple-400 mb-1">
        {prefix}[응답 요청] {data.text}
      </div>
    );
  }

  return null;
}
