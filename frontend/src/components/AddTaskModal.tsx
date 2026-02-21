import { useState, useEffect } from 'react';
import { X, Plus } from 'lucide-react';

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
  const [prompt, setPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setPrompt('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleAdd = async () => {
    if (!prompt.trim()) return;
    setIsLoading(true);
    try {
      await onAdd(prompt.trim());
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

  const title = location === 'todo' ? '대기열에 작업 추가' : '백로그에 작업 추가';
  const placeholder = location === 'todo'
    ? '수행할 작업을 자세히 설명해주세요...'
    : '나중에 수행할 아이디어나 작업을 설명해주세요...';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="card p-7 w-full max-w-xl mx-4 animate-fade-in"
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
            <label className="label">프롬프트</label>
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
              Ctrl+Enter로 빠르게 추가
            </p>
          </div>
          <div className="flex items-center justify-end gap-2">
            <button onClick={onClose} className="btn-secondary">취소</button>
            <button
              onClick={handleAdd}
              disabled={!prompt.trim() || isLoading}
              className="btn-primary inline-flex items-center gap-1.5"
            >
              <Plus size={13} />
              {isLoading ? '추가 중...' : '추가'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
