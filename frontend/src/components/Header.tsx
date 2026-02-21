import { Settings, Sun, Moon, ChevronRight, Terminal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();

  return (
    <header className="h-20 border-b border-slate-200 dark:border-[#8492c4]/10 bg-white dark:bg-[#1a223f] flex items-center px-8 gap-8 shrink-0 z-40 relative shadow-sm">
      {/* Logo */}
      <div className="flex items-center gap-4 shrink-0">
        <div className="w-10 h-10 rounded-2xl bg-indigo-500 flex items-center justify-center shadow-[0_4px_12px_rgba(99,102,241,0.4)]">
          <Terminal size={22} className="text-white" />
        </div>
        <span className="font-extrabold text-xl tracking-wide text-slate-900 dark:text-white">Clork</span>
      </div>

      {/* Breadcrumb */}
      {activeProject && (
        <nav className="flex items-center gap-2 text-base font-semibold text-slate-500 dark:text-[#8492c4] min-w-0 ml-4">
          <ChevronRight size={18} className="text-slate-400 dark:text-[#8492c4] shrink-0 opacity-50" />
          <button
            onClick={() => setActiveSession(null)}
            className="hover:text-slate-900 dark:hover:text-white transition-colors truncate max-w-[200px]"
            title={activeProject.name}
          >
            {activeProject.name}
          </button>
          {activeSession && (
            <>
              <ChevronRight size={18} className="text-slate-400 dark:text-[#8492c4] shrink-0 opacity-50" />
              <span className="text-indigo-500 dark:text-indigo-400 font-bold truncate max-w-[200px]">
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
      <div className="flex items-center gap-4 shrink-0 border-l border-slate-300 dark:border-[#8492c4]/20 pl-8">
        <button
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="btn-icon p-3"
          title={theme === 'dark' ? t('header.lightMode') : t('header.darkMode')}
        >
          {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
        </button>
        <button onClick={() => setSettingsOpen(true)} className="btn-icon p-3" title={t('common.settings')}>
          <Settings size={20} />
        </button>
      </div>
    </header>
  );
}
