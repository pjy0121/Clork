import { X, User, Monitor, Sun, Moon, RefreshCw, CheckCircle2, XCircle, Languages } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../store';

export default function SettingsModal() {
  const {
    settingsOpen,
    setSettingsOpen,
    theme,
    setTheme,
    language,
    setLanguage,
    claudeInstalled,
    claudeLoggedIn,
    claudeUser,
    fetchClaudeStatus,
  } = useStore();

  const { t, i18n } = useTranslation();

  const handleLanguageChange = (lng: 'en' | 'ko') => {
    setLanguage(lng);
    i18n.changeLanguage(lng);
  };

  if (!settingsOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={() => setSettingsOpen(false)}
    >
      <div
        className="dashboard-panel p-7 w-full max-w-md mx-4 animate-fade-in max-h-[88vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold">{t('settings.title')}</h2>
          <button onClick={() => setSettingsOpen(false)} className="btn-icon">
            <X size={16} />
          </button>
        </div>

        {/* Theme and Language Row */}
        <div className="grid grid-cols-2 gap-6 mb-5">
          <div>
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">{t('settings.theme')}</h3>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setTheme('light')}
                className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium transition-all ${theme === 'light'
                  ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/15 text-primary-700 dark:text-primary-300'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 text-gray-600 dark:text-gray-400'
                  }`}
              >
                <Sun size={15} />
                {t('settings.light')}
              </button>
              <button
                onClick={() => setTheme('dark')}
                className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium transition-all ${theme === 'dark'
                  ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/15 text-primary-700 dark:text-primary-300'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 text-gray-600 dark:text-gray-400'
                  }`}
              >
                <Moon size={15} />
                {t('settings.dark')}
              </button>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">{t('settings.language')}</h3>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => handleLanguageChange('ko')}
                className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium transition-all ${language === 'ko'
                  ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/15 text-primary-700 dark:text-primary-300'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 text-gray-600 dark:text-gray-400'
                  }`}
              >
                <Languages size={15} />
                한국어
              </button>
              <button
                onClick={() => handleLanguageChange('en')}
                className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium transition-all ${language === 'en'
                  ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/15 text-primary-700 dark:text-primary-300'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 text-gray-600 dark:text-gray-400'
                  }`}
              >
                <Languages size={15} />
                English
              </button>
            </div>
          </div>
        </div>

        {/* Claude Status */}
        <div className="mb-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('settings.claudeStatus')}</h3>
            <button
              onClick={fetchClaudeStatus}
              className="btn-ghost inline-flex items-center gap-1 text-xs"
            >
              <RefreshCw size={12} />
              {t('settings.refresh')}
            </button>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between px-3 py-2.5 bg-gray-50 dark:bg-gray-800/60 rounded-lg border border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                <Monitor size={14} />
                {t('settings.cliInstalled')}
              </div>
              {claudeInstalled ? (
                <span className="inline-flex items-center gap-1 text-green-600 dark:text-green-400 text-xs font-medium">
                  <CheckCircle2 size={13} />{t('settings.installed')}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400 text-xs font-medium">
                  <XCircle size={13} />{t('settings.notInstalled')}
                </span>
              )}
            </div>

            <div className="flex items-center justify-between px-3 py-2.5 bg-gray-50 dark:bg-gray-800/60 rounded-lg border border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                <User size={14} />
                {t('settings.loginStatus')}
              </div>
              {claudeLoggedIn ? (
                <span className="inline-flex items-center gap-1 text-green-600 dark:text-green-400 text-xs font-medium">
                  <CheckCircle2 size={13} />{t('settings.loggedIn')}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400 text-xs font-medium">
                  <XCircle size={13} />{t('settings.notLoggedIn')}
                </span>
              )}
            </div>

            {claudeUser && (
              <div className="flex items-center justify-between px-3 py-2.5 bg-gray-50 dark:bg-gray-800/60 rounded-lg border border-gray-200 dark:border-gray-700">
                <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                  <User size={14} />
                  {t('settings.user')}
                </div>
                <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{claudeUser}</span>
              </div>
            )}
          </div>
        </div>

        {/* About */}
        <div className="pt-4 border-t border-gray-200 dark:border-gray-800 text-center">
          <div className="flex items-center justify-center gap-2 mb-1.5">
            <div className="w-6 h-6 rounded bg-primary-600 flex items-center justify-center">
              <span className="text-white font-bold text-xs">C</span>
            </div>
            <span className="font-semibold text-sm">Clork</span>
          </div>
          <p className="text-xs text-gray-400 dark:text-gray-500">{t('settings.aboutTxt1')}</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">v1.0.0</p>
        </div>
      </div>
    </div>
  );
}
