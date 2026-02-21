import { useEffect, useState, useCallback } from 'react';
import { X, RefreshCw, Crown, Zap, Activity, Radio } from 'lucide-react';
import { useStore } from '../store';
import { settingsApi } from '../api';
import type { RateLimitEntry } from '../types';

/**
 * Usage modal that mirrors the claude.ai Settings > Usage page layout.
 * Reads data from:
 *   - Account info (credentials + auth status)
 *   - Rate limits (from rate_limit_event during task execution)
 *   - Local stats (from ~/.claude/stats-cache.json)
 *   - Clork stats (from in-memory task cost tracking)
 */
export default function UsageModal() {
  const usageModalOpen = useStore((s) => s.usageModalOpen);
  const setUsageModalOpen = useStore((s) => s.setUsageModalOpen);
  const claudeUsage = useStore((s) => s.claudeUsage);
  const fetchClaudeUsage = useStore((s) => s.fetchClaudeUsage);

  const [now, setNow] = useState(Date.now());
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Live countdown every second + fetch on open
  useEffect(() => {
    if (!usageModalOpen) return;
    fetchClaudeUsage();
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [usageModalOpen]);

  // Force a live poll from Claude API (not just cached data)
  const handleForceRefresh = useCallback(async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      const usage = await settingsApi.refreshClaudeUsage();
      useStore.getState().setClaudeUsage(usage);
    } catch (e) {
      console.error('Failed to refresh usage:', e);
    } finally {
      setIsRefreshing(false);
    }
  }, [isRefreshing]);

  if (!usageModalOpen) return null;

  const usage = claudeUsage;
  const account = usage?.account;
  const rateLimits = usage?.rateLimits ?? [];
  const overage = usage?.overage;
  const localStats = usage?.localStats;
  const clorkStats = usage?.clorkStats;
  const lastUpdatedAt = usage?.lastUpdatedAt;

  // Find the 3 known rate limit types
  const sessionLimit = rateLimits.find((r) => r.rateLimitType === 'five_hour') ?? null;
  const weeklyLimit = rateLimits.find((r) => r.rateLimitType === 'seven_day') ?? null;
  const sonnetLimit = rateLimits.find((r) => r.rateLimitType === 'seven_day_sonnet') ?? null;
  // Any other limits not covered above
  const knownTypes = new Set(['five_hour', 'seven_day', 'seven_day_sonnet']);
  const otherLimits = rateLimits.filter((r) => !knownTypes.has(r.rateLimitType));

  const timeSinceUpdate = lastUpdatedAt
    ? formatRelativeTime(new Date(lastUpdatedAt).getTime(), now)
    : null;

  const subscriptionLabel = getSubscriptionLabel(account?.subscriptionType);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={() => setUsageModalOpen(false)}
    >
      <div
        className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800
                    shadow-2xl w-full max-w-3xl mx-4 animate-fade-in max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ===== Header ===== */}
        <div className="px-6 pt-6 pb-1 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">사용량</h1>
            {account?.subscriptionType && (
              <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold
                ${account.subscriptionType === 'max' ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300' :
                  account.subscriptionType === 'pro' ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300' :
                  'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'}`}>
                <Crown size={11} />
                {subscriptionLabel}
              </span>
            )}
          </div>
          <button
            onClick={() => setUsageModalOpen(false)}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors
                       text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <X size={20} />
          </button>
        </div>

        {/* Account info */}
        {account?.email && (
          <div className="px-6 mt-2">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {account.email}
              {account.rateLimitTier && (
                <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">
                  ({account.rateLimitTier})
                </span>
              )}
            </p>
          </div>
        )}

        {/* ===== Scrollable content ===== */}
        <div className="overflow-y-auto scrollbar-thin px-6 pb-6">

          {/* ────── 플랜 사용량 한도 ────── */}
          <section className="mt-6">
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 border-b border-gray-200 dark:border-gray-800 pb-2.5">
              플랜 사용량 한도
            </h2>
            <div className="mt-5 space-y-5.5">
              {/* 현재 세션 (five_hour) */}
              <RateLimitRow
                label="현재 세션"
                sublabel="5시간"
                entry={sessionLimit}
                now={now}
              />
              {/* 주간 한도 (seven_day) */}
              <RateLimitRow
                label="주간 한도"
                entry={weeklyLimit}
                now={now}
              />
              {/* Sonnet 한도 (seven_day_sonnet) */}
              <RateLimitRow
                label="Sonnet 한도"
                entry={sonnetLimit}
                now={now}
              />
              {/* Other limits */}
              {otherLimits.map((entry) => (
                <RateLimitRow
                  key={entry.rateLimitType}
                  label={formatRateLimitLabel(entry.rateLimitType)}
                  entry={entry}
                  now={now}
                />
              ))}
            </div>
          </section>

          {/* ────── 마지막 업데이트 + 새로고침 ────── */}
          <div className="mt-4 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-gray-400 dark:text-gray-500">
              <Radio size={10} className="text-green-500 animate-pulse" />
              <span>마지막 업데이트: {timeSinceUpdate ?? '없음'}</span>
              <span className="text-gray-300 dark:text-gray-600">·</span>
              <span>30초마다 자동 갱신</span>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); handleForceRefresh(); }}
              disabled={isRefreshing}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-blue-600 dark:text-blue-400
                         hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors
                         disabled:opacity-50 disabled:cursor-not-allowed"
              title="Claude API를 호출하여 사용량을 즉시 확인합니다"
            >
              <RefreshCw size={12} className={isRefreshing ? 'animate-spin' : ''} />
              {isRefreshing ? '확인 중...' : '지금 확인'}
            </button>
          </div>

          {/* ────── 추가 사용량 ────── */}
          {overage && overage.overageStatus !== 'unknown' && (
            <section className="mt-6">
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 border-b border-gray-200 dark:border-gray-800 pb-2.5">
                추가 사용량
              </h2>
              <div className="mt-4">
                {!overage.isUsingOverage ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    한도에 도달했을 때 Claude를 계속 사용하려면 추가 사용량을 활성화하세요.
                    {overage.overageDisabledReason && (
                      <span className="block mt-1 text-xs text-gray-400">
                        비활성 사유: {overage.overageDisabledReason === 'org_level_disabled' ? '조직 레벨에서 비활성됨' : overage.overageDisabledReason}
                      </span>
                    )}
                  </p>
                ) : (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-700 dark:text-gray-300">추가 사용량</span>
                    <span className="text-sm font-semibold text-green-600 dark:text-green-400">활성</span>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* ────── Claude Code 활동 (from local stats-cache) ────── */}
          {localStats && localStats.totalMessages > 0 && (
            <section className="mt-6">
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 border-b border-gray-200 dark:border-gray-800 pb-2.5 flex items-center gap-2">
                <Activity size={16} />
                Claude Code 활동
              </h2>
              <div className="mt-4 space-y-4">
                {/* Stats grid */}
                <div className="grid grid-cols-3 gap-3">
                  <StatItem label="총 세션" value={`${localStats.totalSessions}개`} />
                  <StatItem label="총 메시지" value={formatNumber(localStats.totalMessages)} />
                  <StatItem
                    label="사용 시작"
                    value={localStats.firstSessionDate
                      ? new Date(localStats.firstSessionDate).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
                      : '-'}
                  />
                </div>

                {/* Model usage */}
                {Object.keys(localStats.modelUsage).length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">모델별 토큰 사용량</p>
                    <div className="space-y-2.5">
                      {Object.entries(localStats.modelUsage).map(([model, stats]) => {
                        const total = stats.inputTokens + stats.outputTokens;
                        return (
                          <div key={model} className="flex items-center justify-between text-sm p-2.5 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                            <span className="text-xs font-mono text-gray-600 dark:text-gray-400 truncate max-w-[200px]">
                              {formatModelName(model)}
                            </span>
                            <span className="text-xs font-medium text-gray-900 dark:text-gray-100 tabular-nums">
                              {formatTokenCount(total)} tokens
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Daily activity chart (simple bar) */}
                {localStats.dailyActivity.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">최근 활동</p>
                    <div className="flex items-end gap-1 h-16">
                      {localStats.dailyActivity.map((day) => {
                        const maxMsg = Math.max(...localStats.dailyActivity.map(d => d.messageCount), 1);
                        const height = Math.max(2, (day.messageCount / maxMsg) * 100);
                        return (
                          <div
                            key={day.date}
                            className="flex-1 bg-blue-400 dark:bg-blue-500 rounded-t-sm transition-all hover:bg-blue-500 dark:hover:bg-blue-400"
                            style={{ height: `${height}%` }}
                            title={`${day.date}: ${day.messageCount}개 메시지, ${day.sessionCount}개 세션`}
                          />
                        );
                      })}
                    </div>
                    <div className="flex justify-between mt-1">
                      <span className="text-[10px] text-gray-400">
                        {localStats.dailyActivity[0]?.date.slice(5)}
                      </span>
                      <span className="text-[10px] text-gray-400">
                        {localStats.dailyActivity[localStats.dailyActivity.length - 1]?.date.slice(5)}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* ────── Clork 사용 현황 ────── */}
          <section className="mt-6">
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 border-b border-gray-200 dark:border-gray-800 pb-2.5 flex items-center gap-2">
              <Zap size={16} />
              Clork 사용 현황
            </h2>
            <div className="mt-4 space-y-4">
              {clorkStats && clorkStats.taskCount > 0 ? (
                <>
                  {/* Cost bar */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <span className="font-semibold text-sm text-gray-900 dark:text-gray-100">
                          US${clorkStats.totalCostUsd.toFixed(2)}
                        </span>
                        <span className="text-sm text-gray-500 dark:text-gray-400 ml-1">사용</span>
                      </div>
                    </div>
                    <div className="w-full h-2.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-blue-500 transition-all duration-500"
                        style={{ width: clorkStats.totalCostUsd > 0 ? `${Math.min(100, Math.max(2, clorkStats.totalCostUsd * 10))}%` : '0%' }}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <StatItem label="실행 Task" value={`${clorkStats.taskCount}건`} />
                    <StatItem label="성공" value={`${clorkStats.completedTasks}건`} accent="text-green-600 dark:text-green-400" />
                    <StatItem label="실패/중단" value={`${clorkStats.failedTasks}건`} accent={clorkStats.failedTasks > 0 ? 'text-red-600 dark:text-red-400' : undefined} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <StatItem label="총 실행 시간" value={formatDuration(clorkStats.totalDurationMs)} />
                    <StatItem label="평균 Task 비용" value={clorkStats.taskCount > 0 ? `$${(clorkStats.totalCostUsd / clorkStats.taskCount).toFixed(4)}` : '-'} />
                  </div>

                  {/* Recent tasks */}
                  {clorkStats.recentTasks.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">최근 Task 비용</p>
                      <div className="space-y-1.5 max-h-36 overflow-y-auto scrollbar-thin">
                        {clorkStats.recentTasks.map((task, i) => (
                          <div
                            key={task.taskId}
                            className="flex items-center justify-between px-3 py-2 rounded-xl
                                       hover:bg-gray-50 dark:hover:bg-gray-800/50 text-xs"
                          >
                            <div className="flex items-center gap-3">
                              <span className="text-gray-400 w-3 text-right tabular-nums">{i + 1}</span>
                              <span className="font-mono text-gray-500 dark:text-gray-400">
                                {task.taskId.substring(0, 8)}…
                              </span>
                              <span className="text-gray-400 tabular-nums">{formatDuration(task.durationMs)}</span>
                            </div>
                            <span className="font-semibold text-gray-900 dark:text-gray-100 tabular-nums">
                              ${task.costUsd.toFixed(4)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-6">
                  <p className="text-sm text-gray-400 dark:text-gray-500">
                    아직 실행된 Task가 없습니다.
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                    Task를 실행하면 비용과 통계가 여기에 표시됩니다.
                  </p>
                </div>
              )}
            </div>
          </section>

          {/* Info footer */}
          <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-800">
            <p className="text-[11px] text-gray-400 dark:text-gray-500 text-center">
              사용량 데이터는 Claude Code CLI를 통해 Anthropic API에서 실시간으로 조회됩니다.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ===== Rate Limit Row (matches claude.ai style) ===== */
function RateLimitRow({
  label,
  sublabel,
  entry,
  now,
}: {
  label: string;
  sublabel?: string;
  entry: RateLimitEntry | null;
  now: number;
}) {
  if (!entry) {
    return (
      <div className="opacity-50">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-base text-gray-900 dark:text-gray-100">{label}</span>
            {sublabel && (
              <span className="text-xs text-gray-400 dark:text-gray-500">({sublabel})</span>
            )}
          </div>
          <span className="text-xs text-gray-400 dark:text-gray-500">—</span>
        </div>
        <div className="w-full h-3 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden" />
      </div>
    );
  }

  const isLimited = entry.status === 'limited' || entry.status === 'rejected';
  const pct = entry.utilization;
  const resetText = entry.resetsAt ? formatResetTime(entry.resetsAt, now) : null;

  // Determine effective percentage for display
  const effectivePct = pct !== null ? pct : (isLimited ? 100 : null);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-base text-gray-900 dark:text-gray-100">{label}</span>
            {sublabel && (
              <span className="text-xs text-gray-400 dark:text-gray-500">({sublabel})</span>
            )}
          </div>
          {resetText && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{resetText}</p>
          )}
        </div>
        <span className="text-base text-gray-600 dark:text-gray-300 font-medium tabular-nums">
          {effectivePct !== null ? (
            <span className={isLimited ? 'text-red-500 dark:text-red-400' : ''}>
              {Math.round(effectivePct)}% 사용됨
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${isLimited ? 'bg-red-500' : 'bg-green-500'}`} />
              {isLimited ? '한도 초과' : '사용 가능'}
            </span>
          )}
        </span>
      </div>
      {/* Progress bar */}
      <div className="w-full h-3 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
        {effectivePct !== null ? (
          <div
            className={`h-full rounded-full transition-all duration-500 ${effectivePct >= 90 ? 'bg-red-500' : effectivePct >= 70 ? 'bg-yellow-500' : 'bg-blue-500'}`}
            style={{ width: `${Math.min(100, effectivePct)}%` }}
          />
        ) : (
          <div
            className={`h-full rounded-full transition-all duration-500 ${isLimited ? 'bg-red-500' : 'bg-blue-500'}`}
            style={{ width: isLimited ? '100%' : '3%' }}
          />
        )}
      </div>
    </div>
  );
}

/* ===== Stat Item ===== */
function StatItem({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-800/50">
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-0.5">{label}</p>
      <p className={`text-base font-bold tabular-nums ${accent || 'text-gray-900 dark:text-gray-100'}`}>
        {value}
      </p>
    </div>
  );
}

/* ===== Helpers ===== */

function formatResetTime(resetsAt: number, now: number): string {
  const diff = resetsAt - now / 1000;
  if (diff <= 0) return '갱신됨';
  const hours = Math.floor(diff / 3600);
  const minutes = Math.floor((diff % 3600) / 60);
  if (hours > 0) return `${hours}시간 ${minutes}분 후 재설정`;
  return `${minutes}분 후 재설정`;
}

function formatRelativeTime(timestamp: number, now: number): string {
  const diff = (now - timestamp) / 1000;
  if (diff < 5) return '방금 전';
  if (diff < 60) return `${Math.floor(diff)}초 전`;
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  return `${Math.floor(diff / 3600)}시간 전`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}초`;
  const minutes = Math.floor(seconds / 60);
  const remainSecs = seconds % 60;
  if (minutes < 60) return `${minutes}분 ${remainSecs}초`;
  const hours = Math.floor(minutes / 60);
  const remainMins = minutes % 60;
  return `${hours}시간 ${remainMins}분`;
}

function formatRateLimitLabel(type: string): string {
  switch (type) {
    case 'five_hour': return '현재 세션';
    case 'seven_day_sonnet': return 'Sonnet 한도';
    case 'seven_day_opus': return 'Opus 한도';
    case 'seven_day': return '주간 한도';
    case 'weekly': return '주간 한도';
    case 'daily': return '일간 한도';
    default: return type;
  }
}

function getSubscriptionLabel(type: string | null | undefined): string {
  switch (type) {
    case 'max': return 'Max';
    case 'pro': return 'Pro';
    case 'team': return 'Team';
    case 'free': return 'Free';
    default: return type || '';
  }
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatTokenCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

function formatModelName(model: string): string {
  // Shorten model names for display
  return model
    .replace('claude-', '')
    .replace(/-\d{8}$/, '');
}
