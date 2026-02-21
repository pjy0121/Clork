import { Settings, Sun, Moon, ChevronRight } from 'lucide-react';
import { useStore } from '../store';
import UsageMiniBar from './UsageMiniBar';

export default function Header() {
  const {
    theme,
    setTheme,
    setSettingsOpen,
    projects,
    sessions,
    activeProjectId,
    activeSessionId,
    setActiveProject,
    setActiveSession,
  } = useStore();

  const activeProject = projects.find((p) => p.id === activeProjectId);
  const activeSession = sessions.find((s) => s.id === activeSessionId);

  return (
    <header className="h-13 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex items-center px-5 gap-4 shrink-0" style={{ height: '52px' }}>
      {/* Logo */}
      <div className="flex items-center gap-2 shrink-0">
        <div className="w-7 h-7 rounded-lg bg-primary-600 flex items-center justify-center shadow-sm">
          <span className="text-white font-bold text-sm">C</span>
        </div>
        <span className="font-semibold text-base tracking-tight text-gray-900 dark:text-gray-100">Clork</span>
      </div>

      {/* Breadcrumb */}
      {activeProject && (
        <nav className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 min-w-0">
          <ChevronRight size={14} className="text-gray-300 dark:text-gray-600 shrink-0" />
          <button
            onClick={() => {
              setActiveSession(null);
            }}
            className="hover:text-gray-900 dark:hover:text-gray-100 transition-colors truncate max-w-[180px] font-medium text-sm"
            title={activeProject.name}
          >
            {activeProject.name}
          </button>
          {activeSession && (
            <>
              <ChevronRight size={14} className="text-gray-300 dark:text-gray-600 shrink-0" />
              <span className="text-gray-700 dark:text-gray-300 font-medium truncate max-w-[120px]">
                {activeSession.name}
              </span>
            </>
          )}
        </nav>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Usage Mini Bar */}
      <UsageMiniBar />

      {/* Right actions */}
      <div className="flex items-center gap-0.5 shrink-0">
        <button
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="btn-icon"
          title={theme === 'dark' ? '라이트 모드' : '다크 모드'}
        >
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
        <button onClick={() => setSettingsOpen(true)} className="btn-icon" title="설정">
          <Settings size={16} />
        </button>
      </div>
    </header>
  );
}
