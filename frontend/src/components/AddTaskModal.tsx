import { useState, useEffect } from 'react';
import { X, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import ImageUpload, { UploadedImage } from './ImageUpload';

interface AddTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (prompt: string) => Promise<void>;
  location: 'todo' | 'backlog';
}

export default function AddTaskModal({
  isOpen,
  onClose,
  onAdd,
  location,
}: AddTaskModalProps) {
  const { t } = useTranslation();
  const [prompt, setPrompt] = useState('');
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setPrompt('');
      setImages([]);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleAdd = async () => {
    if (!prompt.trim()) return;
    setIsLoading(true);
    try {
      let finalPrompt = prompt.trim();

      // Append image paths to the prompt if there are images
      if (images.length > 0) {
        const imagePaths = images.map(img => `${img.name}: ${img.path}`).join('\n');
        finalPrompt = `${finalPrompt}\n\n${imagePaths}`;
      }

      await onAdd(finalPrompt);
      onClose();
    } catch {
      // 오류는 부모 컴포넌트에서 처리
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      handleAdd();
    }
  };

  const title = location === 'todo' ? t('tasks.addTitleQueue') : t('tasks.addTitleBacklog');
  const placeholder = location === 'todo'
    ? t('tasks.placeholderQueue')
    : t('tasks.placeholderBacklog');

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="dashboard-panel p-7 w-full max-w-xl mx-4 animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold">{title}</h2>
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
              placeholder={placeholder}
              autoFocus
            />
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5">
              {t('tasks.quickAddHint')}
            </p>
          </div>
          <ImageUpload
            images={images}
            onImagesChange={setImages}
            maxImages={5}
          />
          <div className="flex items-center justify-end gap-2">
            <button onClick={onClose} className="btn-secondary">{t('common.cancel')}</button>
            <button
              onClick={handleAdd}
              disabled={!prompt.trim() || isLoading}
              className="btn-primary inline-flex items-center gap-1.5"
            >
              <Plus size={13} />
              {isLoading ? t('tasks.adding') : t('common.add')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
