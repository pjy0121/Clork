import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Send, MessageSquare, AlertCircle } from 'lucide-react';
import { useStore } from '../store';
import { tasksApi } from '../api';
import toast from 'react-hot-toast';

interface Props {
  taskId: string;
  prompt: string;
}

export default function HumanInTheLoop({ taskId, prompt }: Props) {
  const [response, setResponse] = useState('');
  const [sending, setSending] = useState(false);
  const { setHumanInput, fetchTasks, activeProjectId } = useStore();
  const { t } = useTranslation();

  const handleSend = async () => {
    if (!response.trim()) return;
    setSending(true);
    try {
      await tasksApi.humanResponse(taskId, response.trim());
      setHumanInput(taskId, null);
      setResponse('');
      toast.success(t('hitl.responseSent'));
      // Fetch tasks to show the new follow-up task immediately
      if (activeProjectId) {
        fetchTasks(activeProjectId);
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="rounded-lg bg-purple-50 dark:bg-purple-900/10 border border-purple-200 dark:border-purple-800/50 animate-fade-in overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3 border-b border-purple-100 dark:border-purple-800/50 flex items-center gap-2">
        <MessageSquare size={13} className="text-purple-500 dark:text-purple-400" />
        <span className="text-xs font-semibold text-purple-700 dark:text-purple-300">{t('hitl.inputNeeded')}</span>
      </div>

      {/* Prompt */}
      <div className="px-5 py-4">
        <div className="flex items-start gap-2 mb-3">
          <AlertCircle size={13} className="text-purple-400 mt-0.5 shrink-0" />
          <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">{prompt}</p>
        </div>

        {/* Input */}
        <div className="flex gap-2">
          <input
            className="input flex-1 text-sm"
            placeholder={t('hitl.inputPlaceholder')}
            value={response}
            onChange={(e) => setResponse(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            disabled={sending}
            autoFocus
          />
          <button
            onClick={handleSend}
            disabled={!response.trim() || sending}
            className="btn-primary inline-flex items-center gap-1.5 shrink-0"
          >
            <Send size={13} />
            {t('hitl.send')}
          </button>
        </div>
      </div>
    </div>
  );
}
