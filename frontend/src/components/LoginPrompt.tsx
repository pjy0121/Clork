import { AlertTriangle, Terminal, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../store';

export default function LoginPrompt() {
  const { fetchClaudeStatus, claudeInstalled } = useStore();
  const { t } = useTranslation();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 p-4">
      <div className="dashboard-panel p-9 max-w-sm w-full text-center">
        <div className="w-12 h-12 mx-auto mb-5 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 flex items-center justify-center">
          <AlertTriangle className="w-6 h-6 text-amber-500" />
        </div>
        <h1 className="text-base font-semibold mb-2">{t('login.title')}</h1>
        {!claudeInstalled ? (
          <>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-5 leading-relaxed">
              {t('login.cliNotInstalled')}
            </p>
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 mb-5 text-left">
              <div className="flex items-center gap-2 mb-2 text-xs font-medium text-gray-500 dark:text-gray-400">
                <Terminal size={13} />
                {t('login.runInTerminal')}
              </div>
              <code className="text-xs text-primary-600 dark:text-primary-400 font-mono">
                npm install -g @anthropic-ai/claude-code
              </code>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-5 leading-relaxed">
              {t('login.notLoggedIn')}
            </p>
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 mb-5 text-left">
              <div className="flex items-center gap-2 mb-2 text-xs font-medium text-gray-500 dark:text-gray-400">
                <Terminal size={13} />
                {t('login.runInTerminal')}
              </div>
              <code className="text-xs text-primary-600 dark:text-primary-400 font-mono">
                claude login
              </code>
            </div>
          </>
        )}
        <button
          onClick={() => fetchClaudeStatus()}
          className="btn-primary w-full inline-flex items-center justify-center gap-2"
        >
          <RefreshCw size={13} />
          {t('login.checkAgain')}
        </button>
      </div>
    </div>
  );
}
