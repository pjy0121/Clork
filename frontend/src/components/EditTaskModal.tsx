import { useState, useEffect } from 'react';
import { X, Save } from 'lucide-react';
import type { Task } from '../types';
import { useTranslation } from 'react-i18next';

interface EditTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  task: Task | null;
  onSave: (id: string, prompt: string) => Promise<void>;
}

export default function EditTaskModal({
  isOpen,
  onClose,
  task,
  onSave,
}: EditTaskModalProps) {
  const { t } = useTranslation();
  const [prompt, setPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (task) {
      setPrompt(task.prompt);
    }
  }, [task]);

  if (!isOpen || !task) return null;

  const handleSave = async () => {
    if (!prompt.trim()) return;
    setIsLoading(true);
    try {
      await onSave(task.id, prompt.trim());
      onClose();
    } catch {
      // 오류는 부모 컴포넌트에서 처리
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      handleSave();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="dashboard-panel p-7 w-full max-w-xl mx-4 animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold">{t('tasks.editTask')}</h2>
          <button onClick={onClose} className="btn-icon">
            <X size={16} />
          </button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="label">{t('tasks.prompt')}</label>
            <textarea
              className="input resize-none"
              rows={5}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t('tasks.promptPlaceholder')}
              autoFocus
            />
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5">
              {t('tasks.quickSaveHint')}
            </p>
          </div>
          <div className="flex items-center justify-end gap-2">
            <button onClick={onClose} className="btn-secondary">{t('common.cancel')}</button>
            <button
              onClick={handleSave}
              disabled={!prompt.trim() || isLoading}
              className="btn-primary inline-flex items-center gap-1.5"
            >
              <Save size={13} />
              {isLoading ? t('tasks.saving') : t('common.save')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
