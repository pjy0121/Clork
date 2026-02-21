import { useState, useEffect } from 'react';
import { X, Save } from 'lucide-react';
import type { Session } from '../types';
import { useTranslation } from 'react-i18next';

interface EditSessionModalProps {
  isOpen: boolean;
  onClose: () => void;
  session: Session | null;
  onSave: (id: string, data: { name: string; model?: string }) => void;
}

const AVAILABLE_MODELS = [
  { value: '', labelKey: 'sidebar.projectDefaultModel' },
  { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
  { value: 'claude-opus-4-20250514', label: 'Claude Opus 4' },
  { value: 'claude-haiku-3-5-20241022', label: 'Claude Haiku 3.5' },
];

export default function EditSessionModal({
  isOpen,
  onClose,
  session,
  onSave,
}: EditSessionModalProps) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [model, setModel] = useState('');

  useEffect(() => {
    if (session) {
      setName(session.name);
      setModel(session.model || '');
    }
  }, [session]);

  if (!isOpen || !session) return null;

  const handleSave = () => {
    if (!name.trim()) return;
    onSave(session.id, {
      name: name.trim(),
      model: model || undefined,
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="dashboard-panel p-7 w-full max-w-md mx-4 animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold">{t('sidebar.editSession')}</h2>
          <button onClick={onClose} className="btn-icon">
            <X size={16} />
          </button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="label">{t('sidebar.sessionName')}</label>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('sidebar.sessionName')}
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            />
          </div>
          <div>
            <label className="label">{t('projects.model')}</label>
            <select
              className="input"
              value={model}
              onChange={(e) => setModel(e.target.value)}
            >
              {AVAILABLE_MODELS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.labelKey ? t(m.labelKey) : m.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center justify-end gap-2">
            <button onClick={onClose} className="btn-secondary">{t('common.cancel')}</button>
            <button
              onClick={handleSave}
              disabled={!name.trim()}
              className="btn-primary inline-flex items-center gap-1.5"
            >
              <Save size={13} />
              {t('common.save')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
