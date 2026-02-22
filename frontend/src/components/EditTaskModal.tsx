import { useState, useEffect } from 'react';
import { X, Save } from 'lucide-react';
import type { Task } from '../types';
import { useTranslation } from 'react-i18next';
import ImageUpload, { UploadedImage } from './ImageUpload';

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
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (task) {
      // Extract text prompt and existing image paths from the task prompt
      const lines = task.prompt.split('\n');
      const imagePattern = /^Image #\d+: (.+)$/;
      const textLines: string[] = [];
      const existingImages: UploadedImage[] = [];

      let inImageSection = false;
      for (const line of lines) {
        const imageMatch = line.match(imagePattern);
        if (imageMatch) {
          inImageSection = true;
          // Parse existing image reference
          const numberMatch = line.match(/Image #(\d+)/);
          if (numberMatch) {
            existingImages.push({
              name: `Image #${numberMatch[1]}`,
              path: imageMatch[1],
              number: parseInt(numberMatch[1]),
              size: 0,
              mimetype: 'image/unknown',
              previewUrl: `http://localhost:3001/api/uploads/image/${numberMatch[1]}`
            });
          }
        } else if (!inImageSection || line.trim() !== '') {
          textLines.push(line);
        }
      }

      setPrompt(textLines.join('\n').trim());
      setImages(existingImages);
    }
  }, [task]);

  if (!isOpen || !task) return null;

  const handleSave = async () => {
    if (!prompt.trim()) return;
    setIsLoading(true);
    try {
      let finalPrompt = prompt.trim();

      // Append image paths to the prompt if there are images
      if (images.length > 0) {
        const imagePaths = images.map(img => `${img.name}: ${img.path}`).join('\n');
        finalPrompt = `${finalPrompt}\n\n${imagePaths}`;
      }

      await onSave(task.id, finalPrompt);
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
          <ImageUpload
            images={images}
            onImagesChange={setImages}
            maxImages={5}
          />
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
