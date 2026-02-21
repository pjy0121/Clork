import { useState } from 'react';
import {
  Plus,
  Play,
  Circle,
  CheckCircle2,
  Loader2,
  Pause,
  GripVertical,
  ChevronRight,
  AlertCircle,
  Trash2,
  Power,
} from 'lucide-react';
import { useStore } from '../store';
import type { Session, SessionStatus } from '../types';
import toast from 'react-hot-toast';

const STATUS_CONFIG: Record<SessionStatus, { icon: any; color: string; label: string }> = {
  idle: { icon: Circle, color: 'text-gray-400', label: '대기' },
  queued: { icon: Pause, color: 'text-amber-500', label: '큐 대기' },
  running: { icon: Loader2, color: 'text-blue-500', label: '실행 중' },
  completed: { icon: CheckCircle2, color: 'text-green-500', label: '완료' },
  paused: { icon: Pause, color: 'text-orange-500', label: '일시정지' },
};

export default function SessionSidebar() {
  const {
    sessions,
    activeSessionId,
    activeProjectId,
    setActiveSession,
    createSession,
    deleteSession,
    toggleSession,
    tasks,
    humanInputTasks,
  } = useStore();

  const [newSessionName, setNewSessionName] = useState('');
  const [showNew, setShowNew] = useState(false);

  // Debug: 세션 데이터 확인
  console.log('SessionSidebar - sessions:', sessions);
  console.log('SessionSidebar - activeProjectId:', activeProjectId);

  // Find the next session to run (first idle/queued session)
  const nextSessionId = sessions.find(
    (s) => s.status === 'idle' || s.status === 'queued'
  )?.id;

  const handleCreate = async () => {
    if (!newSessionName.trim() || !activeProjectId) return;
    try {
      const session = await createSession(activeProjectId, newSessionName.trim());
      setActiveSession(session.id);
      setNewSessionName('');
      setShowNew(false);
      toast.success('세션이 생성되었습니다');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (confirm('세션을 삭제하시겠습니까?')) {
      try {
        await deleteSession(id);
        toast.success('세션이 삭제되었습니다');
      } catch (err: any) {
        toast.error(err.message);
      }
    }
  };

  const handleToggle = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await toggleSession(id);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const getSessionTaskCounts = (sessionId: string) => {
    const sessionTasks = tasks.filter((t) => t.sessionId === sessionId);
    const todo = sessionTasks.filter((t) => t.location === 'todo' && t.status === 'pending').length;
    const running = sessionTasks.filter((t) => t.status === 'running').length;
    const done = sessionTasks.filter((t) => t.location === 'done').length;
    return { todo, running, done };
  };

  const hasHumanInput = (sessionId: string) => {
    return tasks.some(
      (t) => t.sessionId === sessionId && t.status === 'running' && humanInputTasks[t.id]
    );
  };

  return (
    <div className="sidebar w-64 shrink-0">
      {/* Header */}
      <div className="p-3 border-b flex items-center justify-between">
        <h2 className="font-semibold text-sm text-gray-500 dark:text-gray-400 uppercase tracking-wider">
          세션
        </h2>
        <button
          onClick={() => setShowNew(!showNew)}
          className="btn-icon !p-1"
          title="새 세션"
        >
          <Plus size={16} />
        </button>
      </div>

      {/* New session input */}
      {showNew && (
        <div className="p-2 border-b">
          <div className="flex gap-1">
            <input
              className="input !py-1.5 text-sm"
              placeholder="세션 이름"
              value={newSessionName}
              onChange={(e) => setNewSessionName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              autoFocus
            />
            <button onClick={handleCreate} className="btn-primary !px-3 !py-1.5 text-sm">
              추가
            </button>
          </div>
        </div>
      )}

      {/* Session list */}
      <div className="flex-1 overflow-y-auto scrollbar-thin p-2 space-y-2">
        {!activeProjectId ? (
          <div className="text-center py-8 text-sm text-gray-400 dark:text-gray-500">
            프로젝트를 선택해주세요
          </div>
        ) : sessions.length === 0 ? (
          <div className="text-center py-8">
            <div className="text-sm text-gray-400 dark:text-gray-500 mb-4">
              세션이 없습니다
            </div>
            <div className="text-xs text-gray-400 dark:text-gray-500">
              상단의 + 버튼을 눌러 새 세션을 만드세요
            </div>
          </div>
        ) : null}
        {sessions.map((session) => {
          const config = STATUS_CONFIG[session.status];
          const Icon = config.icon;
          const isActive = session.id === activeSessionId;
          const isNext = session.id === nextSessionId && session.status !== 'running';
          const counts = getSessionTaskCounts(session.id);
          const needsInput = hasHumanInput(session.id);

          return (
            <div
              key={session.id}
              className={`w-full rounded-lg transition-all ${
                isActive
                  ? 'bg-primary-50 dark:bg-primary-900/20 ring-1 ring-primary-200 dark:ring-primary-800'
                  : ''
              }`}
            >
              <button
                onClick={() => setActiveSession(session.id)}
                className={`w-full text-left p-2.5 rounded-t-lg transition-all group ${
                  !isActive ? 'hover:bg-gray-50 dark:hover:bg-gray-800/50' : ''
                }`}
              >
                <div className="flex items-center gap-2">
                  <Icon
                    size={16}
                    className={`${config.color} shrink-0 ${
                      session.status === 'running' ? 'animate-spin' : ''
                    }`}
                  />
                  <span className="text-sm font-medium truncate flex-1">{session.name}</span>
                  <button
                    onClick={(e) => handleDelete(e, session.id)}
                    className="p-0.5 hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                    title="삭제"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>

                {/* Badges */}
                <div className="flex items-center gap-1.5 mt-1.5 ml-6">
                  {isNext && <span className="badge-next">NEXT</span>}
                  {needsInput && <span className="badge-human">🖐 응답 필요</span>}
                  {counts.running > 0 && (
                    <span className="badge-running">실행 {counts.running}</span>
                  )}
                  {counts.todo > 0 && (
                    <span className="badge-idle">대기 {counts.todo}</span>
                  )}
                  {counts.done > 0 && (
                    <span className="badge-completed">완료 {counts.done}</span>
                  )}
                </div>
              </button>

              {/* Toggle Button - Always visible */}
              <button
                onClick={(e) => handleToggle(e, session.id)}
                className={`w-full p-3 rounded-b-lg transition-colors flex items-center justify-center gap-2 border-t ${
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
        })}
      </div>
    </div>
  );
}
