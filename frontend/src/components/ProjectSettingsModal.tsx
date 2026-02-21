import { useState, useEffect } from 'react';
import { X, Trash2, Save, FolderOpen, Shield, Cpu } from 'lucide-react';
import { useStore } from '../store';
import toast from 'react-hot-toast';
import ConfirmModal from './ConfirmModal';

const MODELS = [
  { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
  { value: 'claude-opus-4-20250514', label: 'Claude Opus 4' },
  { value: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet' },
  { value: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku' },
];

const PERMISSIONS = [
  { value: 'plan', label: '읽기 전용 (Plan)', desc: '파일 읽기만 허용' },
  { value: 'default', label: '기본 (Default)', desc: '권한 요청 시 사용자에게 확인' },
  { value: 'full', label: '전체 허용 (Full)', desc: '모든 권한 자동 승인 (주의!)' },
];

export default function ProjectSettingsModal() {
  const {
    projectSettingsOpen,
    setProjectSettingsOpen,
    activeProjectId,
    projects,
    updateProject,
    deleteProject,
  } = useStore();

  const project = projects.find((p) => p.id === activeProjectId);

  const [name, setName] = useState('');
  const [rootDirectory, setRootDirectory] = useState('');
  const [defaultModel, setDefaultModel] = useState('');
  const [permissionMode, setPermissionMode] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    if (project) {
      setName(project.name);
      setRootDirectory(project.rootDirectory);
      setDefaultModel(project.defaultModel);
      setPermissionMode(project.permissionMode);
    }
  }, [project]);

  if (!projectSettingsOpen || !project) return null;

  const handleSave = async () => {
    try {
      await updateProject(project.id, {
        name: name.trim(),
        rootDirectory: rootDirectory.trim(),
        defaultModel,
        permissionMode: permissionMode as any,
      });
      toast.success('프로젝트 설정이 저장되었습니다');
      setProjectSettingsOpen(false);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleDelete = async () => {
    try {
      await deleteProject(project.id);
      setProjectSettingsOpen(false);
      toast.success('프로젝트가 삭제되었습니다');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
        onClick={() => setProjectSettingsOpen(false)}
      >
        <div
          className="card p-7 w-full max-w-xl mx-4 animate-fade-in"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-base font-semibold">프로젝트 설정</h2>
            <button onClick={() => setProjectSettingsOpen(false)} className="btn-icon">
              <X size={16} />
            </button>
          </div>

          <div className="space-y-4">
            {/* Name */}
            <div>
              <label className="label">프로젝트 이름</label>
              <input
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            {/* Root Directory */}
            <div>
              <label className="label flex items-center gap-1.5">
                <FolderOpen size={13} />
                루트 디렉토리
              </label>
              <input
                className="input font-mono text-xs"
                value={rootDirectory}
                onChange={(e) => setRootDirectory(e.target.value)}
              />
            </div>

            {/* Model */}
            <div>
              <label className="label flex items-center gap-1.5">
                <Cpu size={13} />
                기본 모델
              </label>
              <select
                className="input"
                value={defaultModel}
                onChange={(e) => setDefaultModel(e.target.value)}
              >
                {MODELS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Permission Mode */}
            <div>
              <label className="label flex items-center gap-1.5">
                <Shield size={13} />
                권한 모드
              </label>
              <div className="space-y-2">
                {PERMISSIONS.map((p) => (
                  <label
                    key={p.value}
                    className={`flex items-start gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-all ${
                      permissionMode === p.value
                        ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/15'
                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                    }`}
                  >
                    <input
                      type="radio"
                      name="permission"
                      value={p.value}
                      checked={permissionMode === p.value}
                      onChange={(e) => setPermissionMode(e.target.value)}
                      className="mt-0.5 accent-primary-600"
                    />
                    <div>
                      <div className="text-sm font-medium">{p.label}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{p.desc}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between mt-5 pt-4 border-t border-gray-200 dark:border-gray-800">
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="btn-danger inline-flex items-center gap-1.5"
            >
              <Trash2 size={13} />
              프로젝트 삭제
            </button>
            <div className="flex gap-2">
              <button onClick={() => setProjectSettingsOpen(false)} className="btn-secondary">
                취소
              </button>
              <button onClick={handleSave} className="btn-primary inline-flex items-center gap-1.5">
                <Save size={13} />
                저장
              </button>
            </div>
          </div>
        </div>
      </div>

      <ConfirmModal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDelete}
        title="프로젝트 삭제"
        message={`프로젝트 "${project.name}"을(를) 삭제하시겠습니까? 모든 세션과 작업이 삭제됩니다.`}
        type="danger"
        confirmText="삭제"
        cancelText="취소"
      />
    </>
  );
}
