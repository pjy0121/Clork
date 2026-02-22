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
import ImageUpload, { UploadedImage } from './ImageUpload';
import { useTranslation } from 'react-i18next';

const STATUS_CONFIG: Record<SessionStatus, { icon: any; color: string; labelKey: string }> = {
  idle: { icon: Circle, color: 'text-gray-400', labelKey: 'sidebar.status.idle' },
  queued: { icon: Pause, color: 'text-amber-500', labelKey: 'sidebar.status.queued' },
  running: { icon: Loader2, color: 'text-blue-500', labelKey: 'sidebar.status.running' },
  completed: { icon: CheckCircle2, color: 'text-green-500', labelKey: 'sidebar.status.completed' },
  paused: { icon: Pause, color: 'text-orange-500', labelKey: 'sidebar.status.paused' },
};

const AVAILABLE_MODELS = [
  { value: '', labelKey: 'sidebar.projectDefaultModel' },
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
  const { t } = useTranslation();

  const [showNewProject, setShowNewProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDir, setNewProjectDir] = useState('');
  const [newProjectModel, setNewProjectModel] = useState('claude-3-5-sonnet-20241022');
  const [newProjectPermission, setNewProjectPermission] = useState('default');
  const [showNewSessionPrompt, setShowNewSessionPrompt] = useState(false);
  const [newSessionPrompt, setNewSessionPrompt] = useState('');
  const [newSessionImages, setNewSessionImages] = useState<UploadedImage[]>([]);
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
      toast.error(t('sidebar.errorInputTitleDir')); // Note: Added this key to my head, need to ensure it's in JSON
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
      toast.success(t('sidebar.projectCreated'));
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
      toast.success(t('sidebar.projectDeleted'));
      setShowDeleteProjectConfirm(null);
    } catch (err: any) { toast.error(err.message); }
  };

  const openNewSessionModal = (projectId: string) => {
    setSelectedProjectForNewSession(projectId);
    setNewSessionPrompt('');
    setNewSessionImages([]);
    setShowNewSessionPrompt(true);
  };

  const handleCreateSessionWithPrompt = async () => {
    if (!newSessionPrompt.trim() || !selectedProjectForNewSession) return;
    try {
      const ps = sessionsByProject[selectedProjectForNewSession] || [];
      const nums = ps.map((s) => { const m = s.name.match(/^#(\d+)/); return m ? parseInt(m[1], 10) : 0; }).filter(n => n > 0);
      const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;

      // Build the final prompt with images
      let finalPrompt = newSessionPrompt.trim();
      if (newSessionImages.length > 0) {
        const imagePaths = newSessionImages.map(img => `${img.name}: ${img.path}`).join('\n');
        finalPrompt = `${finalPrompt}\n\n${imagePaths}`;
      }

      const session = await createSession(selectedProjectForNewSession, `#${next}`, undefined, finalPrompt);
      setActiveProject(selectedProjectForNewSession);
      setActiveSession(session.id);
      setNewSessionPrompt('');
      setNewSessionImages([]);
      setShowNewSessionPrompt(false);
      setSelectedProjectForNewSession(null);
      await fetchSessions(selectedProjectForNewSession);
      await fetchTasks(selectedProjectForNewSession);
      toast.success(t('sidebar.sessionCreated'));
    } catch (err: any) { toast.error(err.message); }
  };

  const handleStartSession = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    try {
      await startSession(sessionId);
      toast.success(t('projects.sessionStarted'));
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
      toast.success(t('sidebar.sessionDeleted'));
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
      toast.success(t('projects.unlinked'));
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
      toast.success(t('sidebar.joinedChain', { name: draggedSession.name }));
    } catch (err: any) { toast.error(err.message); }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleCreateSessionWithPrompt();
  };

  if (!sidebarOpen) return null;

  return (
    <div className="sidebar h-full flex-1 flex flex-col sidebar-enter w-80 relative bg-slate-50 dark:bg-[#111936] border-r border-slate-200 dark:border-[#8492c4]/10 group/sidebar transition-all duration-300">
      {/* Collapse Button */}
      <button
        onClick={toggleSidebar}
        className="absolute top-1/2 -translate-y-1/2 -right-6 z-50 w-6 h-16 flex items-center justify-center bg-white dark:bg-[#1a223f] hover:bg-slate-100 dark:bg-[#212946] border border-l-0 border-slate-300 dark:border-[#8492c4]/20 text-slate-500 dark:text-[#8492c4] hover:text-slate-900 dark:text-[#d7dcec] transition-all shadow-md rounded-r-xl"
        title={t('sidebar.closeSidebar')}
      >
        <ChevronLeft size={16} className="transition-transform group-hover/sidebar:-translate-x-1" />
      </button>

      {/* Projects and Sessions */}
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden scrollbar-thin">
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
          {projects.map((project) => {
            const isActive = project.id === activeProjectId;
            const isExpanded = expandedProjects.has(project.id);
            const projectSessions = (sessionsByProject[project.id] || []).slice().sort((a, b) => a.sessionOrder - b.sessionOrder);
            const chains = buildChains(projectSessions);

            return (
              <div key={project.id} className="border-b border-white/5">
                {/* Project Header */}
                <div className={`group flex items-center h-14 transition-all rounded-xl mx-2 my-1 ${isActive
                  ? 'bg-indigo-500/10 text-indigo-400'
                  : 'hover:bg-white dark:bg-[#1a223f] text-slate-500 dark:text-[#8492c4] hover:text-slate-900 dark:text-[#d7dcec]'
                  }`}>
                  <button
                    onClick={() => toggleProjectExpanded(project.id)}
                    className="p-2 hover:bg-slate-100 dark:bg-[#212946] rounded-xl transition-colors ml-2 shrink-0"
                  >
                    {isExpanded
                      ? <ChevronDown size={16} className="text-current" />
                      : <ChevronRight size={16} className="text-current" />}
                  </button>
                  <div
                    onClick={() => {
                      setActiveProject(project.id);
                      setActiveSession(null);
                    }}
                    className="flex-1 text-left py-2 px-2 flex items-center gap-2.5 min-w-0 h-full cursor-pointer"
                  >
                    <FolderOpen size={16} className={isActive ? 'text-indigo-400 shrink-0' : 'text-current shrink-0'} />
                    <span className={`text-sm font-semibold truncate transition-colors ${isActive ? 'text-indigo-400' : 'text-current'}`}>
                      {project.name}
                    </span>
                  </div>
                  <div className={`flex items-center gap-1 pr-3 shrink-0 transition-opacity ${isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                    <button
                      onClick={(e) => { e.stopPropagation(); openNewSessionModal(project.id); }}
                      className="p-2 hover:bg-white/10 rounded-xl transition-colors"
                      title={t('sidebar.newSession')}
                    >
                      <Plus size={18} className="text-gray-400 hover:text-white" />
                    </button>
                    {isActive && (
                      <button
                        onClick={() => setProjectSettingsOpen(true)}
                        className="p-2 hover:bg-white/10 rounded-xl transition-colors"
                        title={t('common.settings')}
                      >
                        <Pencil size={16} className="text-gray-400 hover:text-white" />
                      </button>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteProject(e, project.id); }}
                      className="p-2 hover:bg-rose-500/20 text-rose-400 hover:text-rose-500 rounded-xl transition-colors"
                      title={t('common.delete')}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                {/* Chains */}
                {isExpanded && (
                  <div className="pl-3 pr-2 py-3 space-y-3 bg-slate-50 dark:bg-[#111936] border-y border-slate-200 dark:border-[#8492c4]/10 shadow-inner">
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
                      <div className="text-center py-3 text-xs text-gray-400 dark:text-gray-500">{t('sidebar.noSessions')}</div>
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
                <div className="px-3 py-2 rounded-none bg-[#06060a] border border-cyan-500 shadow-[0_0_20px_rgba(6,182,212,0.3)] opacity-90 font-mono text-xs text-white">
                  {s.name}
                </div>
              );
            })()}
          </DragOverlay>
        </DndContext>

        {projects.length === 0 && (
          <div className="text-center py-8 text-sm text-gray-400 dark:text-gray-500">{t('sidebar.noProjects')}</div>
        )}
      </div>

      {/* Bottom CTA */}
      <div className="shrink-0 p-4 border-t border-slate-200 dark:border-[#8492c4]/10 bg-slate-50 dark:bg-[#111936]">
        <button
          onClick={() => setShowNewProject(true)}
          className="btn-primary w-full inline-flex items-center justify-center gap-2"
        >
          <Plus size={16} />
          {t('sidebar.newProject')}
        </button>
      </div>

      {/* New Project Modal */}
      {showNewProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 dark:bg-[#0b0f19]/80 backdrop-blur-sm p-4" onClick={() => setShowNewProject(false)}>
          <div className="dashboard-panel p-8 w-full max-w-md mx-4 animate-fade-in shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-xl font-bold text-white tracking-tight">{t('sidebar.newProject')}</h2>
              <button onClick={() => setShowNewProject(false)} className="btn-icon"><X size={20} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="label">{t('sidebar.projectName')}</label>
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
                <label className="label">{t('sidebar.rootDirectory')}</label>
                <input
                  className="input font-mono text-xs"
                  value={newProjectDir}
                  onChange={(e) => setNewProjectDir(e.target.value)}
                  placeholder="C:\Users\username\projects\my-project"
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateProject()}
                />
              </div>
              <div>
                <label className="label">{t('sidebar.defaultModel')}</label>
                <select className="input" value={newProjectModel} onChange={(e) => setNewProjectModel(e.target.value)}>
                  <option value="claude-3-5-sonnet-20241022">Claude 3.5 Sonnet</option>
                  <option value="claude-3-5-haiku-20241022">Claude 3.5 Haiku</option>
                  <option value="claude-sonnet-4-20250514">Claude Sonnet 4</option>
                  <option value="claude-opus-4-20250514">Claude Opus 4</option>
                </select>
              </div>
              <div>
                <label className="label">{t('sidebar.permissionMode')}</label>
                <select className="input" value={newProjectPermission} onChange={(e) => setNewProjectPermission(e.target.value)}>
                  <option value="plan">{t('sidebar.readonly')}</option>
                  <option value="default">{t('sidebar.default')}</option>
                  <option value="full">{t('sidebar.full')}</option>
                </select>
              </div>
              <div className="flex gap-3 justify-end pt-4 mt-2">
                <button onClick={() => setShowNewProject(false)} className="btn-secondary">{t('common.cancel')}</button>
                <button onClick={handleCreateProject} className="btn-primary">{t('sidebar.create')}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* New Session Modal */}
      {showNewSessionPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 dark:bg-[#0b0f19]/80 backdrop-blur-sm p-4" onClick={() => setShowNewSessionPrompt(false)}>
          <div className="dashboard-panel p-8 w-full max-w-xl mx-4 animate-fade-in shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-xl font-bold text-white tracking-tight">{t('sidebar.newSession')}</h2>
              <button onClick={() => setShowNewSessionPrompt(false)} className="btn-icon"><X size={20} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="label">{t('sessions.prompt')}</label>
                <textarea
                  className="input resize-none"
                  rows={5}
                  value={newSessionPrompt}
                  onChange={(e) => setNewSessionPrompt(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={t('sidebar.promptPlaceholder')}
                  autoFocus
                />
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{t('sidebar.ctrlEnterToCreate')}</p>
              </div>
              <ImageUpload
                images={newSessionImages}
                onImagesChange={setNewSessionImages}
                maxImages={5}
              />
              <div className="flex gap-3 justify-end pt-4 mt-2">
                <button onClick={() => setShowNewSessionPrompt(false)} className="btn-secondary">{t('common.cancel')}</button>
                <button
                  onClick={handleCreateSessionWithPrompt}
                  disabled={!newSessionPrompt.trim()}
                  className="btn-primary"
                >
                  {t('sidebar.newSession')}
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
            toast.success(t('sidebar.modified'));
            setEditingSession(null);
          } catch (err: any) { toast.error(err.message); }
        }}
      />

      {/* Delete Session Confirm */}
      <ConfirmModal
        isOpen={!!showDeleteSessionConfirm}
        onClose={() => setShowDeleteSessionConfirm(null)}
        onConfirm={confirmDeleteSession}
        title={showDeleteSessionConfirm?.isRunning ? t('sidebar.deleteRunningSession') : t('sidebar.deleteSession')}
        message={showDeleteSessionConfirm?.isRunning
          ? t('sidebar.deleteRunningSessionMsg', { name: showDeleteSessionConfirm.name })
          : t('sidebar.deleteSessionMsg', { name: showDeleteSessionConfirm?.name })}
        type={showDeleteSessionConfirm?.isRunning ? 'danger' : 'warning'}
        confirmText={t('common.delete')}
        cancelText={t('common.cancel')}
      />

      {/* Delete Project Confirm */}
      <ConfirmModal
        isOpen={!!showDeleteProjectConfirm}
        onClose={() => setShowDeleteProjectConfirm(null)}
        onConfirm={confirmDeleteProject}
        title={t('sidebar.deleteProject')}
        message={t('sidebar.deleteProjectMsg', { name: showDeleteProjectConfirm?.name })}
        type="danger"
        confirmText={t('common.delete')}
        cancelText={t('common.cancel')}
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
  const { t } = useTranslation();
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
      className={`w-full ${isActive
        ? 'bg-indigo-500/10 border border-indigo-500/30 shadow-md transform scale-[1.02] z-10'
        : 'bg-white dark:bg-[#1a223f] border border-slate-300 dark:border-[#8492c4]/20 hover:border-indigo-400/50 shadow-sm hover:shadow active:scale-[0.98]'
        } rounded-xl overflow-hidden transition-all duration-200 relative`}
    >
      {/* Main content area */}
      <div
        onClick={onSelect}
        className={`px-4 py-3.5 cursor-pointer group transition-colors ${!isActive ? 'hover:bg-slate-100 dark:bg-[#212946]' : ''
          }`}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          {/* Drag handle */}
          <button
            className="cursor-grab active:cursor-grabbing text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400 shrink-0"
            title={t('sidebar.dragToLink')}
            {...attributes}
            {...listeners}
          >
            <GripVertical size={12} />
          </button>

          <Icon size={13} className={`${config.color} shrink-0 ${session.status === 'running' ? 'animate-spin' : ''}`} />
          <span className="text-sm font-semibold text-slate-900 dark:text-[#d7dcec] truncate flex-1 min-w-0" title={t(config.labelKey)}>
            {session.name}
          </span>

          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all shrink-0">
            {isMulti && (
              <button
                onClick={onRemoveFromChain}
                className="p-1 hover:bg-orange-50 dark:hover:bg-orange-900/20 text-orange-500 rounded transition-all"
                title={t('sidebar.unlinkFromChain')}
              >
                <Unlink size={11} />
              </button>
            )}
            <button
              onClick={onEdit}
              className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 rounded transition-all"
              title={t('common.edit')}
            >
              <Pencil size={11} />
            </button>
            <button
              onClick={onDelete}
              className="p-1 hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 rounded transition-all"
              title={t('common.delete')}
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
          {needsInput && <span className="badge-human">{t('sidebar.inputRequiredBadge')}</span>}
          {counts.running > 0 && <span className="badge-running">{t('sidebar.runningBadge', { count: counts.running })}</span>}
          {counts.todo > 0 && <span className="badge-idle">{t('sidebar.waitingBadge', { count: counts.todo })}</span>}
          {counts.done > 0 && <span className="badge-completed">{t('sidebar.completedBadge', { count: counts.done })}</span>}
        </div>
      </div>

      {/* Toggle button at bottom */}
      <button
        onClick={onToggle}
        className={`w-full p-2 mt-2 transition-colors flex items-center justify-center gap-2 text-xs font-semibold cursor-pointer ${session.isActive
          ? 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
          : 'bg-slate-50 dark:bg-[#111936] text-slate-500 dark:text-[#8492c4] hover:bg-slate-100 dark:bg-[#212946] hover:text-slate-900 dark:text-[#d7dcec]'
          }`}
        title={session.isActive ? t('sidebar.offline') : t('sidebar.active')}
      >
        <Power size={14} className={session.isActive ? '' : 'opacity-60'} />
        <span>
          {session.isActive ? t('sidebar.active') : t('sidebar.offline')}
        </span>
      </button>
    </div >
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
  const { t } = useTranslation();
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
            title={t('sidebar.moveUp')}
          >
            <ChevronUp size={12} />
          </button>
          <button
            onClick={() => onMoveChain('down')}
            disabled={chainIndex === totalChains - 1}
            className="p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded disabled:opacity-20 disabled:cursor-not-allowed transition-all"
            title={t('sidebar.moveDown')}
          >
            <ChevronDown size={12} />
          </button>
        </div>
      )}

      {/* Group content */}
      <div
        ref={setNodeRef}
        className={`flex-1 min-w-0 transition-all rounded-xl ${isMulti ? 'bg-slate-50 dark:bg-[#111936] border border-slate-300 dark:border-[#8492c4]/20 p-2' : ''
          } ${showHighlight ? 'border-dashed border-2 border-indigo-500 bg-indigo-500/10' : ''}`}
      >
        {isMulti && (
          <div className="flex items-center gap-1 px-2 py-1 text-xs text-gray-400 dark:text-gray-500">
            <Link2 size={10} />
            <span>{t('sidebar.sessionChain', { count: chain.sessions.length })}</span>
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
            {t('sidebar.joinChain')}
          </div>
        )}
      </div>
    </div>
  );
}
