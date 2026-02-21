import { AlertTriangle, Info, X } from 'lucide-react';

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
  confirmText = '확인',
  cancelText = '취소',
}: ConfirmModalProps) {
  if (!isOpen) return null;

  const typeConfig = {
    danger: {
      icon: AlertTriangle,
      iconColor: 'text-red-500',
      iconBg: 'bg-red-50 dark:bg-red-900/20',
      confirmClass: 'btn-danger',
    },
    warning: {
      icon: AlertTriangle,
      iconColor: 'text-amber-500',
      iconBg: 'bg-amber-50 dark:bg-amber-900/20',
      confirmClass: 'px-3.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-md font-medium text-sm transition-all duration-150',
    },
    info: {
      icon: Info,
      iconColor: 'text-blue-500',
      iconBg: 'bg-blue-50 dark:bg-blue-900/20',
      confirmClass: 'btn-primary',
    },
  };

  const config = typeConfig[type];
  const Icon = config.icon;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="card p-7 w-full max-w-sm mx-4 animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start gap-3 mb-4">
          <div className={`p-2.5 rounded-xl ${config.iconBg} shrink-0`}>
            <Icon size={20} className={config.iconColor} />
          </div>
          <div className="flex-1 min-w-0 pt-0.5">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
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
        <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed mb-6">
          {message}
        </p>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="btn-secondary"
          >
            {cancelText}
          </button>
          <button
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className={config.confirmClass}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
