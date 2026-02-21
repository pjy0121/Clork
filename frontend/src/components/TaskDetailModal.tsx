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
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation();

  const task = tasks.find((t) => t.id === taskDetailId);
  const events = taskDetailId ? taskEvents[taskDetailId] || [] : [];

  useEffect(() => {
    if (taskDetailId && !taskEvents[taskDetailId]) {
      fetchTaskEvents(taskDetailId);
    }
  }, [taskDetailId]);

  if (!taskDetailId || !task) return null;

  const statusConfig = {
    pending: { icon: Clock, color: 'text-slate-500 dark:text-[#8492c4]', label: t('sessions.status.idle') },
    running: { icon: Loader2, color: 'text-indigo-400', label: t('sessions.status.running') },
    completed: { icon: CheckCircle2, color: 'text-emerald-400', label: t('sessions.status.completed') },
    failed: { icon: XCircle, color: 'text-rose-400', label: t('sessions.status.failed') },
    aborted: { icon: AlertTriangle, color: 'text-amber-400', label: t('sessions.status.aborted') },
  };

  const config = statusConfig[task.status as keyof typeof statusConfig] || statusConfig.pending;
  const StatusIcon = config.icon;

  // Extract cost/duration from result events
  const resultEvent = events.find((e) => e.eventType === 'result');
  let resultData: ParsedEventData | null = null;
  if (resultEvent) {
    try {
      resultData = JSON.parse(resultEvent.data);
    } catch { }
  }

  const handleCopyToBacklog = async () => {
    try {
      await createTask({
        projectId: task.projectId,
        prompt: task.prompt,
        location: 'backlog',
      });
      setTaskDetailId(null);
      toast.success(t('tasks.copiedToBacklog'));
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 dark:bg-[#0b0f19]/80 backdrop-blur-sm p-4"
      onClick={() => setTaskDetailId(null)}
    >
      <div
        className="dashboard-panel w-full max-w-5xl max-h-[90vh] flex flex-col animate-fade-in bg-white dark:bg-[#1a223f] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-8 py-6 border-b border-slate-200 dark:border-[#8492c4]/10 flex items-start justify-between shrink-0 bg-slate-50 dark:bg-[#111936]">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-4">
              <StatusIcon size={20} className={config.color} />
              <span className={`text-xs font-bold uppercase tracking-wider ${config.color} border border-current rounded-md px-2 py-1 bg-current/10`}>{config.label}</span>
            </div>
            <h2 className="text-base font-medium text-slate-900 dark:text-white break-words leading-relaxed tracking-wide shadow-none">{task.prompt}</h2>
          </div>
          <button onClick={() => setTaskDetailId(null)} className="btn-icon shrink-0 ml-8 hover:bg-slate-200 dark:hover:bg-[#212946] hover:text-slate-900 dark:hover:text-white p-2 border border-transparent hover:border-slate-300 dark:hover:border-[#8492c4]/20 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Meta */}
        <div className="px-8 py-3 border-b border-slate-200 dark:border-[#8492c4]/10 flex items-center gap-6 text-xs font-semibold text-slate-500 dark:text-[#8492c4] flex-wrap shrink-0 bg-white dark:bg-[#1a223f] uppercase tracking-wider">
          <div className="flex items-center gap-2">
            <Clock size={12} className="text-slate-600" />
            {t('sessions.init')}: {new Date(task.createdAt).toLocaleString('en-US', { hour12: false })}
          </div>
          {task.startedAt && (
            <div className="flex items-center gap-2">
              <Timer size={12} className="text-cyan-600" />
              {t('sessions.start')}: {new Date(task.startedAt).toLocaleString('en-US', { hour12: false })}
            </div>
          )}
          {task.completedAt && (
            <div className="flex items-center gap-2">
              <CheckCircle2 size={12} className="text-emerald-600" />
              {t('sessions.end')}: {new Date(task.completedAt).toLocaleString('en-US', { hour12: false })}
            </div>
          )}
          {(resultData?.total_cost_usd !== undefined || resultData?.cost_usd !== undefined) && (
            <div className="flex items-center gap-2">
              <DollarSign size={12} className="text-amber-600" />
              {t('sessions.cost')}: ${Number(resultData!.total_cost_usd ?? resultData!.cost_usd).toFixed(4)}
            </div>
          )}
          {resultData?.duration_ms !== undefined && (
            <div className="flex items-center gap-2">
              <Timer size={12} className="text-purple-600" />
              {t('sessions.duration')}: {(resultData.duration_ms / 1000).toFixed(1)}s
            </div>
          )}
        </div>

        {/* Event Log */}
        <div className="flex-1 overflow-y-auto scrollbar-thin bg-transparent">
          <div className="px-8 py-6">
            <div className="flex items-center gap-2 mb-4">
              <FileText size={16} className="text-slate-500 dark:text-[#8492c4]" />
              <span className="text-sm font-bold text-slate-500 dark:text-[#8492c4]">
                {t('sessions.systemLogs')} [{events.length}]
              </span>
            </div>

            {events.length === 0 ? (
              <div className="text-center py-12 text-sm font-medium text-slate-500 dark:text-[#8492c4] uppercase border border-dashed border-slate-300 dark:border-[#8492c4]/20 bg-slate-50 dark:bg-[#111936] rounded-xl">
                {t('sessions.noLogs')}
              </div>
            ) : (
              <div className="bg-slate-900/40 dark:bg-[#0b0f19] border border-slate-200 dark:border-[#8492c4]/10 rounded-xl p-6 font-mono text-[11px] leading-loose max-h-[40rem] overflow-y-auto scrollbar-thin shadow-inner">
                {events.map((evt) => (
                  <DetailEventLine key={evt.id} event={evt} />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="px-8 py-6 border-t border-slate-200 dark:border-[#8492c4]/10 flex items-center justify-end gap-4 shrink-0 bg-slate-50 dark:bg-[#111936]">
          <button onClick={() => setTaskDetailId(null)} className="btn-secondary px-6 py-2 text-sm font-semibold">
            {t('common.close')}
          </button>
          <button
            onClick={handleCopyToBacklog}
            className="btn-primary inline-flex items-center gap-2 px-6 py-2 text-sm font-semibold"
          >
            <Copy size={16} />
            {t('sessions.copyToBacklog')}
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

  const time = new Date(event.timestamp).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const prefix = <span className="text-slate-600 mr-2">[{time}]</span>;

  if (data.type === 'system' && data.subtype === 'init') {
    return (
      <div className="text-slate-500 mb-1">
        {prefix}[SYS] SESSION_INIT — MDL: {data.model}
      </div>
    );
  }

  if (data.type === 'task_started') {
    return (
      <div className="text-emerald-400 mb-1">
        {prefix}[EXEC] START_PROMPT_EXECUTION
      </div>
    );
  }

  if (data.type === 'assistant' && data.message?.content) {
    return (
      <>
        {data.message.content.map((block: any, i: number) => {
          if (block.type === 'text') {
            return (
              <div key={i} className="text-indigo-300 mb-2">
                {prefix}
                <div className="prose prose-sm dark:prose-invert max-w-none
                  prose-pre:bg-slate-50 dark:prose-pre:bg-[#1a223f] prose-pre:border-slate-200 dark:prose-pre:border-[#8492c4]/10 prose-pre:border
                  prose-code:text-indigo-600 dark:prose-code:text-indigo-300 prose-code:bg-slate-50 dark:prose-code:bg-[#1a223f] prose-code:border prose-code:border-slate-200 dark:prose-code:border-[#8492c4]/10
                  prose-code:px-1.5 prose-code:py-0.5 prose-code:text-xs prose-code:rounded font-mono
                  prose-a:text-indigo-600 dark:prose-a:text-indigo-400 prose-headings:text-slate-900 dark:prose-headings:text-white
                  prose-p:mb-2 prose-ul:my-2 prose-li:my-1">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {block.text}
                  </ReactMarkdown>
                </div>
              </div>
            );
          }
          if (block.type === 'tool_use') {
            return (
              <div key={i} className="text-amber-400 mb-1">
                {prefix}[TOOL] {block.name}({JSON.stringify(block.input).substring(0, 300)})
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
      <div className="text-cyan-600 mb-1 whitespace-pre-wrap">
        {prefix}[RES] {content}
      </div>
    );
  }

  if (data.type === 'result') {
    return (
      <div className="text-emerald-400 mb-2 border-t border-slate-200 dark:border-[#8492c4]/10 pt-1.5 mt-1.5">
        {prefix}[FINAL_OK]
        <div className="prose prose-sm dark:prose-invert max-w-none mt-1
          prose-pre:bg-slate-50 dark:prose-pre:bg-[#1a223f] prose-pre:border-slate-200 dark:prose-pre:border-[#8492c4]/10 prose-pre:border
          prose-code:text-indigo-600 dark:prose-code:text-indigo-300 prose-code:bg-slate-50 dark:prose-code:bg-[#1a223f] prose-code:border prose-code:border-slate-200 dark:prose-code:border-[#8492c4]/10
          prose-code:px-1.5 prose-code:py-0.5 prose-code:text-xs prose-code:rounded font-mono
          prose-a:text-indigo-600 dark:prose-a:text-indigo-400 prose-headings:text-emerald-600 dark:prose-headings:text-emerald-400
          prose-p:mb-1 prose-ul:my-1 prose-li:my-0">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {data.result || '(NO_RESULT)'}
          </ReactMarkdown>
        </div>
        {data.cost_usd !== undefined && (
          <div className="text-slate-500 dark:text-[#8492c4] mt-1 font-semibold tracking-wider">
            COST: ${data.cost_usd?.toFixed(4)} | DUR: {((data.duration_ms || 0) / 1000).toFixed(1)}s
          </div>
        )}
      </div>
    );
  }

  if (data.type === 'error' || data.type === 'stderr') {
    return (
      <div className="text-rose-500 mb-1">
        {prefix}[ERR] {data.text || data.error || JSON.stringify(data)}
      </div>
    );
  }

  if (data.type === 'aborted') {
    return (
      <div className="text-amber-500 mb-1">
        {prefix}[ABORT] OPERATION_ABORTED_BY_USER
      </div>
    );
  }

  if (data.type === 'raw') {
    return (
      <div className="text-slate-500 mb-1">
        {prefix}{data.text}
      </div>
    );
  }

  if (data.type === 'human_input' || data.type === 'permission_request') {
    return (
      <div className="text-fuchsia-500 mb-1 bg-fuchsia-950/20 px-2 py-1 border-l-2 border-fuchsia-500 inline-block">
        {prefix}[INPUT_REQ] {data.text}
      </div>
    );
  }

  return null;
}
