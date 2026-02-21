import { useState, useEffect } from 'react';
import {
  Plus,
  Circle,
  CheckCircle2,
  Loader2,
  Pause,
  Trash2,
  FolderOpen,
  X,
  Pencil,
  ChevronRight,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  Play,
  GripVertical,
  Link2,
  Unlink,
  Power,
} from 'lucide-react';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  DragOverEvent,
} from '@dnd-kit/core';
import { useDroppable, useDraggable } from '@dnd-kit/core';
import { useStore } from '../store';
import type { Session, SessionStatus } from '../types';
import { buildChains, type SessionChain } from '../utils/sessionUtils';
import toast from 'react-hot-toast';
import EditSessionModal from './EditSessionModal';
import ConfirmModal from './ConfirmModal';

const STATUS_CONFIG: Record<SessionStatus, { icon: any; color: string; label: string }> = {
  idle: { icon: Circle, color: 'text-gray-400', label: '대기' },
  queued: { icon: Pause, color: 'text-amber-500', label: '큐 대기' },
  running: { icon: Loader2, color: 'text-blue-500', label: '실행 중' },
  completed: { icon: CheckCircle2, color: 'text-green-500', label: '완료' },
  paused: { icon: Pause, color: 'text-orange-500', label: '일시정지' },
};

const AVAILABLE_MODELS = [
  { value: '', label: '프로젝트 기본 모델' },
  { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
  { value: 'claude-opus-4-20250514', label: 'Claude Opus 4' },
  { value: 'claude-haiku-3-5-20241022', label: 'Claude Haiku 3.5' },
];

export default function UnifiedSidebar() {
  const {
    projects, sessions, sessionsByProject, tasks,
    activeProjectId, activeSessionId, sidebarOpen, toggleSidebar,
    humanInputTasks, expandedProjects, toggleProjectExpanded,
    setActiveProject, setActiveSession,
    createProject, deleteProject, createSession, updateSession,
    startSession, toggleSession, deleteSession, reorderSessions,
    setProjectSettingsOpen, fetchAllSessions, fetchTasks, fetchSessions,
  } = useStore();

  const [showNewProject, setShowNewProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDir, setNewProjectDir] = useState('');
  const [newProjectModel, setNewProjectModel] = useState('claude-3-5-sonnet-20241022');
  const [newProjectPermission, setNewProjectPermission] = useState('default');
  const [showNewSessionPrompt, setShowNewSessionPrompt] = useState(false);
  const [newSessionPrompt, setNewSessionPrompt] = useState('');
  const [selectedProjectForNewSession, setSelectedProjectForNewSession] = useState<string | null>(null);
  const [editingSession, setEditingSession] = useState<string | null>(null);
  const [showDeleteSessionConfirm, setShowDeleteSessionConfirm] = useState<{ id: string; name: string; isRunning: boolean } | null>(null);
  const [showDeleteProjectConfirm, setShowDeleteProjectConfirm] = useState<{ id: string; name: string } | null>(null);

  // DnD state
  const [draggingSessionId, setDraggingSessionId] = useState<string | null>(null);
  const [overChainId, setOverChainId] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  useEffect(() => {
    if (projects.length > 0) fetchAllSessions();
  }, [projects.length, fetchAllSessions]);

  const getSessionTaskCounts = (sessionId: string) => {
    const st = tasks.filter((t) => t.sessionId === sessionId);
    return {
      todo: st.filter((t) => t.location === 'todo' && t.status === 'pending').length,
      running: st.filter((t) => t.status === 'running').length,
      done: st.filter((t) => t.location === 'done').length,
    };
  };

  const hasHumanInput = (sessionId: string) =>
    tasks.some((t) => t.sessionId === sessionId && t.status === 'running' && humanInputTasks[t.id]);

  // ===== Handlers =====
  const handleCreateProject = async () => {
    if (!newProjectName.trim() || !newProjectDir.trim()) {
      toast.error('프로젝트 이름과 디렉토리를 입력해주세요');
      return;
    }
    try {
      const project = await createProject({
        name: newProjectName.trim(),
        rootDirectory: newProjectDir.trim(),
        defaultModel: newProjectModel,
        permissionMode: newProjectPermission as any,
      });
      setActiveProject(project.id);
      setNewProjectName('');
      setNewProjectDir('');
      setShowNewProject(false);
      toast.success('프로젝트가 생성되었습니다');
    } catch (err: any) { toast.error(err.message); }
  };

  const handleDeleteProject = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const project = projects.find((p) => p.id === id);
    if (!project) return;
    setShowDeleteProjectConfirm({ id, name: project.name });
  };

  const confirmDeleteProject = async () => {
    if (!showDeleteProjectConfirm) return;
    try {
      await deleteProject(showDeleteProjectConfirm.id);
      toast.success('프로젝트가 삭제되었습니다');
      setShowDeleteProjectConfirm(null);
    } catch (err: any) { toast.error(err.message); }
  };

  const openNewSessionModal = (projectId: string) => {
    setSelectedProjectForNewSession(projectId);
    setNewSessionPrompt('');
    setShowNewSessionPrompt(true);
  };

  const handleCreateSessionWithPrompt = async () => {
    if (!newSessionPrompt.trim() || !selectedProjectForNewSession) return;
    try {
      const ps = sessionsByProject[selectedProjectForNewSession] || [];
      const nums = ps.map((s) => { const m = s.name.match(/^#(\d+)/); return m ? parseInt(m[1], 10) : 0; }).filter(n => n > 0);
      const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
      const session = await createSession(selectedProjectForNewSession, `#${next}`, undefined, newSessionPrompt.trim());
      setActiveProject(selectedProjectForNewSession);
      setActiveSession(session.id);
      setNewSessionPrompt('');
      setShowNewSessionPrompt(false);
      setSelectedProjectForNewSession(null);
      await fetchSessions(selectedProjectForNewSession);
      await fetchTasks(selectedProjectForNewSession);
      toast.success('세션이 생성되었습니다');
    } catch (err: any) { toast.error(err.message); }
  };

  const handleStartSession = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    try {
      await startSession(sessionId);
      toast.success('세션이 시작되었습니다');
    } catch (err: any) { toast.error(err.message); }
  };

  const handleToggleSession = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    try {
      await toggleSession(sessionId);
    } catch (err: any) { toast.error(err.message); }
  };

  const handleDeleteSession = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const session = sessions.find(s => s.id === id);
    if (!session) return;
    setShowDeleteSessionConfirm({ id, name: session.name, isRunning: session.status === 'running' });
  };

  const confirmDeleteSession = async () => {
    if (!showDeleteSessionConfirm) return;
    try {
      await deleteSession(showDeleteSessionConfirm.id);
      toast.success('세션이 삭제되었습니다');
      setShowDeleteSessionConfirm(null);
    } catch (err: any) { toast.error(err.message); }
  };

  const handleRemoveFromGroup = async (e: React.MouseEvent, sessionId: string, projectSessions: Session[]) => {
    e.stopPropagation();
    const parent = projectSessions.find(s => s.nextSessionId === sessionId);
    const self = projectSessions.find(s => s.id === sessionId);
    if (!parent || !self) return;
    try {
      await updateSession(parent.id, { nextSessionId: self.nextSessionId || null } as any);
      await updateSession(sessionId, { nextSessionId: null } as any);
      if (self.projectId) await fetchSessions(self.projectId);
      toast.success('체인에서 분리되었습니다');
    } catch (err: any) { toast.error(err.message); }
  };

  const handleMoveChain = async (projectId: string, chainId: string, direction: 'up' | 'down') => {
    const projectSessions = (sessionsByProject[projectId] || []).slice().sort((a, b) => a.sessionOrder - b.sessionOrder);
    const chains = buildChains(projectSessions);
    const idx = chains.findIndex(c => c.id === chainId);
    if (idx === -1) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= chains.length) return;

    const newChains = [...chains];
    [newChains[idx], newChains[swapIdx]] = [newChains[swapIdx], newChains[idx]];

    const sessionOrders: { id: string; sessionOrder: number }[] = [];
    let order = 0;
    for (const c of newChains) {
      for (const s of c.sessions) { sessionOrders.push({ id: s.id, sessionOrder: order++ }); }
    }

    try {
      await reorderSessions(sessionOrders);
      await fetchSessions(projectId);
    } catch (err: any) { toast.error(err.message); }
  };

  // ===== DnD =====
  const handleDragStart = (event: DragStartEvent) => {
    setDraggingSessionId(event.active.id as string);
    setOverChainId(null);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const overId = event.over?.id as string | undefined;
    if (overId?.startsWith('chain-drop-')) {
      setOverChainId(overId.replace('chain-drop-', ''));
    } else {
      setOverChainId(null);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const draggedId = draggingSessionId;
    setDraggingSessionId(null);
    setOverChainId(null);

    const { over } = event;
    if (!over || !draggedId) return;

    const overId = over.id as string;
    if (!overId.startsWith('chain-drop-')) return;

    const targetChainId = overId.replace('chain-drop-', '');
    const draggedSession = sessions.find(s => s.id === draggedId);
    const targetSession = sessions.find(s => s.id === targetChainId);
    if (!draggedSession || !targetSession) return;
    if (draggedSession.projectId !== targetSession.projectId) return;

    const projectSessions = (sessionsByProject[draggedSession.projectId] || []);
    const chains = buildChains(projectSessions);
    const draggedChain = chains.find(c => c.sessions.some(s => s.id === draggedId));
    const targetChain = chains.find(c => c.id === targetChainId);
    if (!draggedChain || !targetChain) return;
    if (draggedChain.id === targetChain.id) return;

    const lastInTarget = targetChain.sessions[targetChain.sessions.length - 1];

    try {
      if (draggedChain.sessions.length > 1) {
        const srcIdx = draggedChain.sessions.findIndex(s => s.id === draggedId);
        if (srcIdx > 0) {
          const prevSession = draggedChain.sessions[srcIdx - 1];
          const selfSession = draggedChain.sessions[srcIdx];
          await updateSession(prevSession.id, { nextSessionId: selfSession.nextSessionId || null } as any);
        }
        if (draggedSession.nextSessionId) {
          await updateSession(draggedId, { nextSessionId: null } as any);
        }
      }
      await updateSession(lastInTarget.id, { nextSessionId: draggedId } as any);
      await fetchSessions(draggedSession.projectId);
      toast.success(`${draggedSession.name}이(가) 체인에 합류했습니다`);
    } catch (err: any) { toast.error(err.message); }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleCreateSessionWithPrompt();
  };

  if (!sidebarOpen) return null;

  return (
    <div className="sidebar flex-1 flex flex-col sidebar-enter relative">
      {/* Collapse Button */}
      <button
        onClick={toggleSidebar}
        className="absolute top-1/2 -translate-y-1/2 -right-7 z-50 w-7 h-16 flex items-center justify-center bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-r-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-all shadow-sm border border-l-0 border-gray-200 dark:border-gray-800 group backdrop-blur"
        title="사이드바 닫기"
      >
        <ChevronLeft size={14} className="transition-transform group-hover:-translate-x-0.5" />
      </button>

      {/* Projects and Sessions */}
      <div className="flex-1 overflow-y-scroll overflow-x-hidden scrollbar-thin">
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
          {projects.map((project) => {
            const isActive = project.id === activeProjectId;
            const isExpanded = expandedProjects.has(project.id);
            const projectSessions = (sessionsByProject[project.id] || []).slice().sort((a, b) => a.sessionOrder - b.sessionOrder);
            const chains = buildChains(projectSessions);

            return (
              <div key={project.id} className="border-b border-gray-100 dark:border-gray-800/80">
                {/* Project Header */}
                <div className={`group flex items-center h-11 transition-all border-l-2 ${
                  isActive
                    ? 'bg-primary-50 dark:bg-primary-900/15 border-primary-500'
                    : 'border-transparent hover:bg-gray-50 dark:hover:bg-gray-800/40'
                }`}>
                  <button
                    onClick={() => toggleProjectExpanded(project.id)}
                    className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors ml-2 shrink-0"
                  >
                    {isExpanded
                      ? <ChevronDown size={14} className="text-gray-400" />
                      : <ChevronRight size={14} className="text-gray-400" />}
                  </button>
                  <div
                    onClick={() => {
                      setActiveProject(project.id);
                      setActiveSession(null);
                    }}
                    className="flex-1 text-left py-1 px-2 flex items-center gap-2 min-w-0 h-full cursor-pointer"
                  >
                    <FolderOpen size={14} className={isActive ? 'text-primary-500 shrink-0' : 'text-gray-400 shrink-0'} />
                    <span className={`text-sm font-medium truncate ${isActive ? 'text-primary-700 dark:text-primary-300' : 'text-gray-700 dark:text-gray-300'}`}>
                      {project.name}
                    </span>
                  </div>
                  <div className={`flex items-center gap-0.5 pr-2 shrink-0 transition-opacity ${isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                    <button
                      onClick={(e) => { e.stopPropagation(); openNewSessionModal(project.id); }}
                      className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                      title="새 세션"
                    >
                      <Plus size={13} className="text-gray-500" />
                    </button>
                    {isActive && (
                      <button
                        onClick={() => setProjectSettingsOpen(true)}
                        className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                        title="프로젝트 설정"
                      >
                        <Pencil size={12} className="text-gray-500" />
                      </button>
                    )}
                    <button
                      onClick={(e) => handleDeleteProject(e, project.id)}
                      className="p-1 hover:bg-red-50 dark:hover:bg-red-900/20 text-red-400 hover:text-red-500 rounded transition-colors"
                      title="삭제"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>

                {/* Chains */}
                {isExpanded && (
                  <div className="pl-3 pr-2 py-3 space-y-3 bg-gray-50/60 dark:bg-gray-900/30">
                    {chains.map((chain, chainIdx) => (
                      <ChainCard
                        key={chain.id}
                        chain={chain}
                        chainIndex={chainIdx}
                        totalChains={chains.length}
                        projectId={project.id}
                        activeSessionId={activeSessionId}
                        draggingSessionId={draggingSessionId}
                        isOverTarget={overChainId === chain.id}
                        onSelectSession={(sessionId) => {
                          if (project.id !== activeProjectId) setActiveProject(project.id);
                          setActiveSession(sessionId);
                        }}
                        onStartSession={handleStartSession}
                        onToggleSession={handleToggleSession}
                        onEditSession={(e, id) => { e.stopPropagation(); setEditingSession(id); }}
                        onDeleteSession={handleDeleteSession}
                        onRemoveFromChain={(e, sid) => handleRemoveFromGroup(e, sid, projectSessions)}
                        onMoveChain={(dir) => handleMoveChain(project.id, chain.id, dir)}
                        getTaskCounts={getSessionTaskCounts}
                        hasHumanInput={hasHumanInput}
                      />
                    ))}
                    {projectSessions.length === 0 && (
                      <div className="text-center py-3 text-xs text-gray-400 dark:text-gray-500">세션이 없습니다</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          <DragOverlay>
            {draggingSessionId && (() => {
              const s = sessions.find(ss => ss.id === draggingSessionId);
              if (!s) return null;
              return (
                <div className="px-3 py-2 rounded-lg bg-white dark:bg-gray-800 shadow-xl ring-2 ring-primary-400 opacity-90">
                  <span className="text-sm font-medium">{s.name}</span>
                </div>
              );
            })()}
          </DragOverlay>
        </DndContext>

        {projects.length === 0 && (
          <div className="text-center py-8 text-sm text-gray-400 dark:text-gray-500">프로젝트가 없습니다</div>
        )}
      </div>

      {/* Bottom CTA */}
      <div className="shrink-0 p-4 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        <button
          onClick={() => setShowNewProject(true)}
          className="btn-primary w-full inline-flex items-center justify-center gap-2"
        >
          <Plus size={14} />
          새 프로젝트
        </button>
      </div>

      {/* New Project Modal */}
      {showNewProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setShowNewProject(false)}>
          <div className="card p-7 w-full max-w-md mx-4 animate-fade-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-base font-semibold">새 프로젝트</h2>
              <button onClick={() => setShowNewProject(false)} className="btn-icon"><X size={16} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="label">프로젝트 이름</label>
                <input
                  className="input"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="My Project"
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateProject()}
                />
              </div>
              <div>
                <label className="label">루트 디렉토리</label>
                <input
                  className="input font-mono text-xs"
                  value={newProjectDir}
                  onChange={(e) => setNewProjectDir(e.target.value)}
                  placeholder="C:\Users\username\projects\my-project"
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateProject()}
                />
              </div>
              <div>
                <label className="label">기본 모델</label>
                <select className="input" value={newProjectModel} onChange={(e) => setNewProjectModel(e.target.value)}>
                  <option value="claude-3-5-sonnet-20241022">Claude 3.5 Sonnet</option>
                  <option value="claude-3-5-haiku-20241022">Claude 3.5 Haiku</option>
                  <option value="claude-sonnet-4-20250514">Claude Sonnet 4</option>
                  <option value="claude-opus-4-20250514">Claude Opus 4</option>
                </select>
              </div>
              <div>
                <label className="label">권한 모드</label>
                <select className="input" value={newProjectPermission} onChange={(e) => setNewProjectPermission(e.target.value)}>
                  <option value="plan">읽기 전용 (Plan)</option>
                  <option value="default">기본 (Default)</option>
                  <option value="full">전체 허용 (Full)</option>
                </select>
              </div>
              <div className="flex gap-2 justify-end pt-1">
                <button onClick={() => setShowNewProject(false)} className="btn-secondary">취소</button>
                <button onClick={handleCreateProject} className="btn-primary">생성</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* New Session Modal */}
      {showNewSessionPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setShowNewSessionPrompt(false)}>
          <div className="card p-7 w-full max-w-xl mx-4 animate-fade-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-base font-semibold">새 세션</h2>
              <button onClick={() => setShowNewSessionPrompt(false)} className="btn-icon"><X size={16} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="label">프롬프트</label>
                <textarea
                  className="input resize-none"
                  rows={5}
                  value={newSessionPrompt}
                  onChange={(e) => setNewSessionPrompt(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="수행할 작업을 자세히 설명해주세요..."
                  autoFocus
                />
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Ctrl+Enter로 생성</p>
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setShowNewSessionPrompt(false)} className="btn-secondary">취소</button>
                <button
                  onClick={handleCreateSessionWithPrompt}
                  disabled={!newSessionPrompt.trim()}
                  className="btn-primary"
                >
                  세션 생성
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <EditSessionModal
        isOpen={!!editingSession}
        onClose={() => setEditingSession(null)}
        session={sessions.find(s => s.id === editingSession) || null}
        onSave={async (id, data) => {
          try {
            await updateSession(id, data);
            toast.success('수정되었습니다');
            setEditingSession(null);
          } catch (err: any) { toast.error(err.message); }
        }}
      />

      {/* Delete Session Confirm */}
      <ConfirmModal
        isOpen={!!showDeleteSessionConfirm}
        onClose={() => setShowDeleteSessionConfirm(null)}
        onConfirm={confirmDeleteSession}
        title={showDeleteSessionConfirm?.isRunning ? '실행 중인 세션 삭제' : '세션 삭제'}
        message={showDeleteSessionConfirm?.isRunning
          ? `실행 중인 세션 "${showDeleteSessionConfirm.name}"을(를) 삭제하시겠습니까?`
          : `세션 "${showDeleteSessionConfirm?.name}"을(를) 삭제하시겠습니까?`}
        type={showDeleteSessionConfirm?.isRunning ? 'danger' : 'warning'}
        confirmText="삭제"
        cancelText="취소"
      />

      {/* Delete Project Confirm */}
      <ConfirmModal
        isOpen={!!showDeleteProjectConfirm}
        onClose={() => setShowDeleteProjectConfirm(null)}
        onConfirm={confirmDeleteProject}
        title="프로젝트 삭제"
        message={`프로젝트 "${showDeleteProjectConfirm?.name}"을(를) 삭제하시겠습니까? 모든 세션과 작업이 삭제됩니다.`}
        type="danger"
        confirmText="삭제"
        cancelText="취소"
      />
    </div>
  );
}

// ===== Draggable Session Item =====
function DraggableSession({
  session, isActive, isDragging: isAnyDragging,
  onSelect, onStart, onToggle, onEdit, onDelete, onRemoveFromChain, isMulti,
  counts, needsInput, modelLabel,
}: {
  session: Session;
  isActive: boolean;
  isDragging: boolean;
  onSelect: () => void;
  onStart: (e: React.MouseEvent) => void;
  onToggle: (e: React.MouseEvent) => void;
  onEdit: (e: React.MouseEvent) => void;
  onDelete: (e: React.MouseEvent) => void;
  onRemoveFromChain: (e: React.MouseEvent) => void;
  isMulti: boolean;
  counts: { todo: number; running: number; done: number };
  needsInput: boolean;
  modelLabel: string | null;
}) {
  const config = STATUS_CONFIG[session.status];
  const Icon = config.icon;

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: session.id });

  const style: React.CSSProperties = {
    transform: transform ? `translate(${transform.x}px, ${transform.y}px)` : undefined,
    opacity: isDragging ? 0.3 : undefined,
    position: isDragging ? 'relative' as const : undefined,
    zIndex: isDragging ? 50 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`w-full ${
        isActive
          ? 'bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800/50'
          : 'border border-transparent'
      } rounded-xl overflow-hidden`}
    >
      {/* Main content area */}
      <div
        onClick={onSelect}
        className={`px-3 py-2.5 cursor-pointer group transition-colors ${
          !isActive ? 'hover:bg-gray-100 dark:hover:bg-gray-800/60' : ''
        }`}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          {/* Drag handle */}
          <button
            className="cursor-grab active:cursor-grabbing text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400 shrink-0"
            title="드래그하여 체인 연결"
            {...attributes}
            {...listeners}
          >
            <GripVertical size={12} />
          </button>

          <Icon size={13} className={`${config.color} shrink-0 ${session.status === 'running' ? 'animate-spin' : ''}`} />
          <span className="text-sm font-medium truncate flex-1 min-w-0">{session.name}</span>

          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all shrink-0">
            {isMulti && (
              <button
                onClick={onRemoveFromChain}
                className="p-1 hover:bg-orange-50 dark:hover:bg-orange-900/20 text-orange-500 rounded transition-all"
                title="체인에서 분리"
              >
                <Unlink size={11} />
              </button>
            )}
            <button
              onClick={onEdit}
              className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 rounded transition-all"
              title="수정"
            >
              <Pencil size={11} />
            </button>
            <button
              onClick={onDelete}
              className="p-1 hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 rounded transition-all"
              title="삭제"
            >
              <Trash2 size={11} />
            </button>
          </div>
        </div>

        {/* Task count badges */}
        <div className="flex items-center gap-1.5 mt-2 ml-7 flex-wrap">
          {modelLabel && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
              {modelLabel}
            </span>
          )}
          {needsInput && <span className="badge-human">응답 필요</span>}
          {counts.running > 0 && <span className="badge-running">실행 {counts.running}</span>}
          {counts.todo > 0 && <span className="badge-idle">대기 {counts.todo}</span>}
          {counts.done > 0 && <span className="badge-completed">완료 {counts.done}</span>}
        </div>
      </div>

      {/* Toggle button at bottom */}
      <button
        onClick={onToggle}
        className={`w-full p-3 transition-colors flex items-center justify-center gap-2 border-t ${
          session.status === 'running'
            ? 'bg-orange-500 text-white hover:bg-orange-600 border-orange-600'
            : 'bg-green-500 text-white hover:bg-green-600 border-green-600'
        }`}
        title={session.status === 'running' ? '세션 중단' : '세션 활성화'}
      >
        <Power size={20} />
        <span className="text-sm font-semibold">
          {session.status === 'running' ? '중단' : '활성화'}
        </span>
      </button>
    </div>
  );
}

// ===== Chain Card =====
function ChainCard({
  chain, chainIndex, totalChains, projectId, activeSessionId, draggingSessionId, isOverTarget,
  onSelectSession, onStartSession, onToggleSession, onEditSession, onDeleteSession, onRemoveFromChain, onMoveChain,
  getTaskCounts, hasHumanInput,
}: {
  chain: SessionChain;
  chainIndex: number;
  totalChains: number;
  projectId: string;
  activeSessionId: string | null;
  draggingSessionId: string | null;
  isOverTarget: boolean;
  onSelectSession: (id: string) => void;
  onStartSession: (e: React.MouseEvent, id: string) => void;
  onToggleSession: (e: React.MouseEvent, id: string) => void;
  onEditSession: (e: React.MouseEvent, id: string) => void;
  onDeleteSession: (e: React.MouseEvent, id: string) => void;
  onRemoveFromChain: (e: React.MouseEvent, id: string) => void;
  onMoveChain: (dir: 'up' | 'down') => void;
  getTaskCounts: (id: string) => { todo: number; running: number; done: number };
  hasHumanInput: (id: string) => boolean;
}) {
  const isMulti = chain.sessions.length > 1;
  const isDragSource = draggingSessionId !== null && chain.sessions.some(s => s.id === draggingSessionId);

  const { setNodeRef, isOver } = useDroppable({ id: `chain-drop-${chain.id}` });
  const showHighlight = (isOver || isOverTarget) && !isDragSource && draggingSessionId !== null;

  return (
    <div className="flex items-stretch gap-1">
      {/* Move buttons */}
      {totalChains > 1 && (
        <div className="flex flex-col items-center justify-center gap-0.5 shrink-0">
          <button
            onClick={() => onMoveChain('up')}
            disabled={chainIndex === 0}
            className="p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded disabled:opacity-20 disabled:cursor-not-allowed transition-all"
            title="위로"
          >
            <ChevronUp size={12} />
          </button>
          <button
            onClick={() => onMoveChain('down')}
            disabled={chainIndex === totalChains - 1}
            className="p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded disabled:opacity-20 disabled:cursor-not-allowed transition-all"
            title="아래로"
          >
            <ChevronDown size={12} />
          </button>
        </div>
      )}

      {/* Group content */}
      <div
        ref={setNodeRef}
        className={`flex-1 min-w-0 rounded-lg transition-all ${
          isMulti ? 'bg-white dark:bg-gray-800/60 ring-1 ring-gray-200 dark:ring-gray-700 p-1' : ''
        } ${showHighlight ? 'ring-2 ring-primary-400 bg-primary-50/30 dark:bg-primary-900/10' : ''}`}
      >
        {isMulti && (
          <div className="flex items-center gap-1 px-2 py-1 text-xs text-gray-400 dark:text-gray-500">
            <Link2 size={10} />
            <span>{chain.sessions.length}개 세션 체인</span>
          </div>
        )}

        {chain.sessions.map((session, idx) => {
          const modelLabel = session.model
            ? AVAILABLE_MODELS.find((m) => m.value === session.model)?.label || session.model
            : null;

          return (
            <div key={session.id}>
              {idx > 0 && (
                <div className="flex items-center justify-center py-0.5">
                  <ChevronDown size={12} className="text-amber-400 dark:text-amber-500" />
                </div>
              )}
              <DraggableSession
                session={session}
                isActive={session.id === activeSessionId}
                isDragging={draggingSessionId !== null}
                onSelect={() => onSelectSession(session.id)}
                onStart={(e) => onStartSession(e, session.id)}
                onToggle={(e) => onToggleSession(e, session.id)}
                onEdit={(e) => onEditSession(e, session.id)}
                onDelete={(e) => onDeleteSession(e, session.id)}
                onRemoveFromChain={(e) => onRemoveFromChain(e, session.id)}
                isMulti={isMulti}
                counts={getTaskCounts(session.id)}
                needsInput={hasHumanInput(session.id)}
                modelLabel={modelLabel}
              />
            </div>
          );
        })}

        {showHighlight && (
          <div className="mt-1 text-xs text-center py-1 text-primary-500 font-medium">
            여기에 놓아 체인에 합류
          </div>
        )}
      </div>
    </div>
  );
}
