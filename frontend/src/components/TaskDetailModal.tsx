import { useEffect, useState } from 'react';
import {
  X,
  ArrowUp,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  DollarSign,
  Cpu,
  Eye,
  Pencil,
  FileText,
  Timer,
  Wrench,
  Terminal,
  ChevronDown,
  ChevronRight,
  Info,
  Layout,
  MessageSquare,
  Code2,
  Settings,
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
    activeSessionId,
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

  const handleCopyToQueue = async () => {
    try {
      await createTask({
        projectId: task.projectId,
        prompt: task.prompt,
        location: 'todo',
        sessionId: activeSessionId || undefined,
      });
      setTaskDetailId(null);
      toast.success(t('tasks.copiedToQueue'));
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
            onClick={handleCopyToQueue}
            className="btn-primary inline-flex items-center gap-2 px-6 py-2 text-sm font-semibold"
          >
            <ArrowUp size={16} />
            {t('sessions.copyToQueue')}
          </button>
        </div>
      </div>
    </div>
  );
}

function DetailEventLine({ event }: { event: TaskEvent }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showRaw, setShowRaw] = useState(false);

  let data: ParsedEventData;
  try {
    data = JSON.parse(event.data);
  } catch {
    return null;
  }

  const time = new Date(event.timestamp).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const prefix = <span className="text-slate-500 dark:text-[#8492c4]/50 mr-3 font-mono text-[10px] shrink-0">[{time}]</span>;

  const renderRawToggle = () => (
    <button
      onClick={(e) => { e.stopPropagation(); setShowRaw(!showRaw); }}
      className="ml-auto text-[10px] text-slate-400 hover:text-indigo-400 transition-colors opacity-0 group-hover:opacity-100 uppercase tracking-tighter"
    >
      {showRaw ? '{JSON}' : '{...}'}
    </button>
  );

  if (showRaw) {
    return (
      <div className="group flex items-start gap-1 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-white/5 transition-colors border border-transparent hover:border-slate-200 dark:hover:border-white/10 mb-2">
        {prefix}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-bold text-slate-500 uppercase">Raw Event: {data.type || event.eventType}</span>
            {renderRawToggle()}
          </div>
          <pre className="text-[10px] text-slate-400 overflow-x-auto bg-slate-100 dark:bg-black/20 p-2 rounded border border-slate-200 dark:border-white/5 scrollbar-thin">
            {JSON.stringify(data, null, 2)}
          </pre>
        </div>
      </div>
    );
  }

  // Specialized Renderers
  if (data.type === 'system' && data.subtype === 'init') {
    return (
      <div className="group flex items-center gap-3 py-2 border-b border-slate-100 dark:border-white/5 mb-2">
        <Settings size={14} className="text-slate-400 shrink-0" />
        <span className="text-[11px] font-bold text-slate-500 dark:text-[#8492c4] uppercase tracking-wider">
          {prefix} Session Initialized — {data.model}
        </span>
        {renderRawToggle()}
      </div>
    );
  }

  if (data.type === 'task_started') {
    return (
      <div className="group flex items-center gap-3 py-3 border-b border-slate-200 dark:border-white/10 mb-4 bg-emerald-500/5 -mx-2 px-2 rounded-lg">
        <Terminal size={14} className="text-emerald-500 shrink-0" />
        <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-widest">
          {prefix} Execution Started
        </span>
        {renderRawToggle()}
      </div>
    );
  }

  if (data.type === 'assistant') {
    return (
      <div className="mb-4">
        {data.message?.content?.map((block: any, i: number) => {
          if (block.type === 'thinking') {
            return (
              <div key={i} className="group mb-2 border-l-2 border-slate-200 dark:border-[#8492c4]/20 pl-4 py-1">
                <button
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="flex items-center gap-2 text-[10px] font-bold text-slate-400 hover:text-slate-300 transition-colors uppercase tracking-widest"
                >
                  {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  <MessageSquare size={12} />
                  Claude is thinking...
                </button>
                {isExpanded && (
                  <div className="mt-2 text-[11px] text-slate-500 dark:text-[#8492c4]/70 leading-relaxed italic whitespace-pre-wrap">
                    {block.thinking}
                  </div>
                )}
              </div>
            );
          }
          if (block.type === 'text') {
            return (
              <div key={i} className="group flex items-start gap-3 mb-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-tighter">Assistant Response</span>
                    {renderRawToggle()}
                  </div>
                  <div className="prose prose-sm dark:prose-invert max-w-none text-slate-700 dark:text-indigo-100/90
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
              </div>
            );
          }
          if (block.type === 'tool_use') {
            // Summarize inputs
            const inputKeys = Object.keys(block.input || {});
            const summary = inputKeys.length > 0
              ? `— ${block.input.path || block.input.filePath || block.input.query || block.input.command || inputKeys[0]}`
              : '';

            return (
              <div key={i} className="group mb-3 border border-amber-500/20 bg-amber-500/5 rounded-xl p-3">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-6 h-6 rounded-lg bg-amber-500/20 flex items-center justify-center">
                    <Wrench size={14} className="text-amber-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-amber-500 uppercase tracking-wider">
                        Using Tool: <span className="text-amber-400/80 lowercase italic font-mono">{block.name}</span> {summary}
                      </span>
                      {renderRawToggle()}
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="flex items-center gap-1.5 text-[10px] text-amber-500/60 hover:text-amber-500 transition-colors font-mono mb-2"
                >
                  {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  {isExpanded ? 'Hide Inputs' : 'View Inputs'}
                </button>

                {isExpanded && (
                  <pre className="text-[10px] bg-black/30 p-2 rounded-lg border border-white/5 text-amber-200/70 overflow-x-auto scrollbar-thin">
                    {JSON.stringify(block.input, null, 2)}
                  </pre>
                )}
              </div>
            );
          }
          return null;
        })}
      </div>
    );
  }

  if (data.type === 'tool') {
    const isError = data.isError;
    const content = typeof data.content === 'string' ? data.content : JSON.stringify(data.content, null, 2);
    const summary = content.length > 100 ? content.substring(0, 100) + '...' : content;

    return (
      <div className={`group mb-4 border rounded-xl p-3 ${isError ? 'border-rose-500/20 bg-rose-500/5' : 'border-cyan-500/20 bg-cyan-500/5'}`}>
        <div className="flex items-center gap-2 mb-2">
          <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${isError ? 'bg-rose-500/20' : 'bg-cyan-500/20'}`}>
            {isError ? <AlertTriangle size={14} className="text-rose-500" /> : <Layout size={14} className="text-cyan-500" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <span className={`text-[11px] font-bold uppercase tracking-wider ${isError ? 'text-rose-500' : 'text-cyan-500'}`}>
                Tool Result {isError ? '(Failed)' : ''}
              </span>
              {renderRawToggle()}
            </div>
          </div>
        </div>

        <div className="text-[11px] font-mono leading-relaxed overflow-hidden">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className={`w-full text-left p-2 rounded-lg transition-colors ${isExpanded ? 'bg-black/20' : 'hover:bg-black/10'}`}
          >
            <div className="flex items-start gap-2">
              <div className="mt-1 shrink-0">
                {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              </div>
              <div className={`whitespace-pre-wrap break-all ${isExpanded ? '' : 'line-clamp-2'} ${isError ? 'text-rose-300/80' : 'text-cyan-100/80'}`}>
                {content}
              </div>
            </div>
          </button>
        </div>
      </div>
    );
  }

  if (data.type === 'result') {
    return (
      <div className="group mb-4 border border-emerald-500/30 bg-emerald-500/5 rounded-2xl p-6 relative overflow-hidden shadow-lg shadow-emerald-500/5">
        <div className="absolute top-0 right-0 p-4 opacity-5">
          <CheckCircle2 size={120} className="text-emerald-500" />
        </div>

        <div className="flex items-center gap-3 mb-4 relative z-10">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center">
            <CheckCircle2 size={24} className="text-emerald-500" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-emerald-500 uppercase tracking-[0.2em]">Final Completion</h3>
                <div className="text-[10px] text-slate-400 font-mono tracking-tighter">SUCCESSFUL_TASK_END</div>
              </div>
              {renderRawToggle()}
            </div>
          </div>
        </div>

        <div className="prose prose-sm dark:prose-invert max-w-none text-slate-700 dark:text-emerald-50/90 relative z-10
          prose-pre:bg-slate-50 dark:prose-pre:bg-[#1a223f] prose-pre:border-slate-200 dark:prose-pre:border-[#8492c4]/10 prose-pre:border
          prose-code:text-emerald-600 dark:prose-code:text-emerald-300 prose-code:bg-slate-50 dark:prose-code:bg-[#1a223f] prose-code:border prose-code:border-slate-200 dark:prose-code:border-[#8492c4]/10
          prose-code:px-1.5 prose-code:py-0.5 prose-code:text-xs prose-code:rounded font-mono
          prose-a:text-emerald-600 dark:prose-a:text-emerald-400 prose-headings:text-emerald-600 dark:prose-headings:text-emerald-400
          prose-p:mb-2 prose-ul:my-2 prose-li:my-1">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {data.result || '(NO_RESULT)'}
          </ReactMarkdown>
        </div>

        {data.cost_usd !== undefined && (
          <div className="flex items-center gap-4 mt-6 pt-4 border-t border-emerald-500/20 text-xs font-bold font-mono tracking-widest text-emerald-500/60 relative z-10">
            <div className="flex items-center gap-1.5">
              <DollarSign size={14} /> {data.cost_usd?.toFixed(4)}
            </div>
            <div className="flex items-center gap-1.5">
              <Clock size={14} /> {((data.duration_ms || 0) / 1000).toFixed(1)}s
            </div>
          </div>
        )}
      </div>
    );
  }

  if (data.type === 'task_completed') {
    // Skip rendering task_completed events as they duplicate the result event
    return null;
  }

  if (data.type === 'error' || data.type === 'stderr') {
    return (
      <div className="group mb-4 border border-rose-500 bg-rose-500/5 rounded-xl p-4 flex items-start gap-4">
        <div className="w-10 h-10 rounded-xl bg-rose-500/20 flex items-center justify-center shrink-0">
          <XCircle size={24} className="text-rose-500" />
        </div>
        <div className="flex-1 min-w-0 pt-1">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-bold text-rose-500 uppercase tracking-widest">Execution Failure</span>
            {renderRawToggle()}
          </div>
          <div className="text-xs font-mono text-rose-300 break-all whitespace-pre-wrap">
            {data.text || data.error || JSON.stringify(data)}
          </div>
        </div>
      </div>
    );
  }

  if (data.type === 'human_input' || data.type === 'permission_request') {
    return (
      <div className="group mb-4 border-2 border-fuchsia-500 bg-fuchsia-500/10 rounded-2xl p-5 shadow-lg shadow-fuchsia-500/10 animate-pulse">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 rounded-lg bg-fuchsia-500 flex items-center justify-center">
            <Info size={18} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-fuchsia-500 uppercase tracking-widest">Action Required</span>
              {renderRawToggle()}
            </div>
          </div>
        </div>
        <div className="text-sm font-semibold text-fuchsia-100 italic pl-11">
          {data.text}
        </div>
      </div>
    );
  }

  return (
    <div className="group flex items-start gap-2 py-1 text-[10px] text-slate-500 dark:text-[#8492c4]/40 hover:text-slate-400 transition-colors">
      {prefix}
      <span className="flex-1 truncate">{data.text || JSON.stringify(data)}</span>
      {renderRawToggle()}
    </div>
  );
}

