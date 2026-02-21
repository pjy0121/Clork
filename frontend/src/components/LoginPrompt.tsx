import { AlertTriangle, Terminal, RefreshCw } from 'lucide-react';
import { useStore } from '../store';

export default function LoginPrompt() {
  const { fetchClaudeStatus, claudeInstalled } = useStore();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 p-4">
      <div className="card p-9 max-w-sm w-full text-center">
        <div className="w-12 h-12 mx-auto mb-5 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 flex items-center justify-center">
          <AlertTriangle className="w-6 h-6 text-amber-500" />
        </div>
        <h1 className="text-base font-semibold mb-2">Claude Code 로그인 필요</h1>
        {!claudeInstalled ? (
          <>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-5 leading-relaxed">
              Claude Code CLI가 설치되어 있지 않습니다. 먼저 설치해주세요.
            </p>
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 mb-5 text-left">
              <div className="flex items-center gap-2 mb-2 text-xs font-medium text-gray-500 dark:text-gray-400">
                <Terminal size={13} />
                터미널에서 실행
              </div>
              <code className="text-xs text-primary-600 dark:text-primary-400 font-mono">
                npm install -g @anthropic-ai/claude-code
              </code>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-5 leading-relaxed">
              Claude Code에 로그인되어 있지 않습니다. 터미널에서 로그인해주세요.
            </p>
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 mb-5 text-left">
              <div className="flex items-center gap-2 mb-2 text-xs font-medium text-gray-500 dark:text-gray-400">
                <Terminal size={13} />
                터미널에서 실행
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
          상태 다시 확인
        </button>
      </div>
    </div>
  );
}
