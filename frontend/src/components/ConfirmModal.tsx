import { AlertTriangle, Info, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  type?: 'danger' | 'warning' | 'info';
  confirmText?: string;
  cancelText?: string;
}

export default function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  type = 'warning',
  confirmText,
  cancelText,
}: ConfirmModalProps) {
  const { t } = useTranslation();
  const finalConfirmText = confirmText || t('common.confirm');
  const finalCancelText = cancelText || t('common.cancel');

  if (!isOpen) return null;

  const typeConfig = {
    danger: {
      icon: AlertTriangle,
      iconColor: 'text-rose-400',
      iconBg: 'bg-rose-500/10',
      confirmClass: 'btn-danger',
    },
    warning: {
      icon: AlertTriangle,
      iconColor: 'text-amber-400',
      iconBg: 'bg-amber-500/10',
      confirmClass: 'px-3.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-semibold text-sm transition-all duration-150 shadow-sm',
    },
    info: {
      icon: Info,
      iconColor: 'text-indigo-400',
      iconBg: 'bg-indigo-500/10',
      confirmClass: 'btn-primary',
    },
  };

  const config = typeConfig[type];
  const Icon = config.icon;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 dark:bg-[#0b0f19]/80 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="dashboard-panel p-7 w-full max-w-sm mx-4 animate-fade-in shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start gap-3 mb-4">
          <div className={`p-2.5 rounded-xl ${config.iconBg} shrink-0`}>
            <Icon size={20} className={config.iconColor} />
          </div>
          <div className="flex-1 min-w-0 pt-0.5">
            <h3 className="text-base font-bold text-white tracking-tight">
              {title}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="btn-icon shrink-0"
          >
            <X size={14} />
          </button>
        </div>

        {/* Content */}
        <p className="text-sm text-slate-500 dark:text-[#8492c4] font-medium leading-relaxed mb-6">
          {message}
        </p>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="btn-secondary"
          >
            {finalCancelText}
          </button>
          <button
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className={config.confirmClass}
          >
            {finalConfirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
