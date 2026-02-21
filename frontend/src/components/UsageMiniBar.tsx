import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../store';
import type { RateLimitEntry } from '../types';

/**
 * Compact usage indicator for the Header bar.
 * Shows subscription badge + 3 mini progress bars (세션/주간/Sonnet) + cost + reset countdown.
 * Clicking opens the full UsageModal.
 */
export default function UsageMiniBar() {
  const claudeUsage = useStore((s) => s.claudeUsage);
  const setUsageModalOpen = useStore((s) => s.setUsageModalOpen);
  const fetchClaudeUsage = useStore((s) => s.fetchClaudeUsage);
  const { t, i18n } = useTranslation();

  const [now, setNow] = useState(Date.now());

  // Periodic refresh
  useEffect(() => {
    const i1 = setInterval(fetchClaudeUsage, 30_000);
    const i2 = setInterval(() => setNow(Date.now()), 1000);
    return () => { clearInterval(i1); clearInterval(i2); };
  }, [fetchClaudeUsage]);

  const account = claudeUsage?.account;
  const rateLimits = claudeUsage?.rateLimits ?? [];
  const clorkStats = claudeUsage?.clorkStats;
  const cost = clorkStats?.totalCostUsd ?? 0;
  const taskCount = clorkStats?.taskCount ?? 0;

  // Find the 3 rate limit types
  const sessionLimit = rateLimits.find((r) => r.rateLimitType === 'five_hour') ?? null;
  const weeklyLimit = rateLimits.find((r) => r.rateLimitType === 'seven_day') ?? null;
  const sonnetLimit = rateLimits.find((r) => r.rateLimitType === 'seven_day_sonnet') ?? null;

  const hasData = rateLimits.length > 0 || taskCount > 0 || !!account?.subscriptionType;

  // Earliest reset time across all limits
  const limitEntries: Array<{ entry: RateLimitEntry; type: string }> = [
    sessionLimit ? { entry: sessionLimit, type: 'five_hour' } : null,
    weeklyLimit ? { entry: weeklyLimit, type: 'seven_day' } : null,
    sonnetLimit ? { entry: sonnetLimit, type: 'seven_day_sonnet' } : null,
  ].filter((e): e is { entry: RateLimitEntry; type: string } => e !== null && e.entry.resetsAt !== null);

  const earliest = limitEntries.length > 0
    ? limitEntries.reduce((a, b) => a.entry.resetsAt! < b.entry.resetsAt! ? a : b)
    : null;

  // Reset text: countdown for session, day+time for weekly
  const getResetText = () => {
    if (!earliest) return null;
    const diff = earliest.entry.resetsAt! - now / 1000;
    if (diff <= 0) return null;

    const isWeekly = earliest.type === 'seven_day'
      || earliest.type === 'seven_day_sonnet'
      || earliest.type === 'seven_day_opus';

    if (isWeekly) {
      const d = new Date(earliest.entry.resetsAt! * 1000);
      const isKo = i18n.language === 'ko';
      const day = d.toLocaleDateString(isKo ? 'ko-KR' : 'en-US', { weekday: 'short' });
      const time = d.toLocaleTimeString(isKo ? 'ko-KR' : 'en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
      return `${day} ${time}`;
    }

    const h = Math.floor(diff / 3600);
    const m = Math.floor((diff % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };

  const resetText = getResetText();

  // Subscription badge
  const subType = account?.subscriptionType;
  const subBadge = subType
    ? subType === 'max' ? 'MAX' : subType === 'pro' ? 'PRO' : subType.toUpperCase()
    : null;
  const subColor = subType === 'max'
    ? 'bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300'
    : subType === 'pro'
      ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300'
      : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400';

  return (
    <button
      onClick={() => setUsageModalOpen(true)}
      className="flex items-center gap-3 px-3 py-1.5 rounded-lg
                 hover:bg-gray-100 dark:hover:bg-gray-800
                 transition-all duration-150 group"
      title={t('usage.claudeUsageTitle')}
    >
      {/* Subscription badge */}
      {subBadge && (
        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${subColor}`}>
          {subBadge}
        </span>
      )}

      {/* 3 Mini progress bars: Session / Weekly / Sonnet */}
      <div className="flex items-center gap-2.5">
        <MiniLimitBar label={t('usage.sessionLabel')} entry={sessionLimit} t={t} />
        <MiniLimitBar label={t('usage.weeklyLabel')} entry={weeklyLimit} t={t} />
        <MiniLimitBar label="Sonnet" entry={sonnetLimit} t={t} />
      </div>

      {/* Cost */}
      {taskCount > 0 && (
        <span className="text-sm font-semibold text-gray-600 dark:text-gray-400 tabular-nums">
          ${cost.toFixed(2)}
        </span>
      )}

      {/* Reset */}
      {resetText && (
        <span className="text-xs text-gray-400 dark:text-gray-500 tabular-nums">
          {resetText}
        </span>
      )}

      {/* No data placeholder */}
      {!hasData && (
        <span className="text-sm text-gray-400 dark:text-gray-500">{t('usage.noData')}</span>
      )}
    </button>
  );
}

/**
 * Mini progress bar for a single rate limit type.
 * Shows: label + colored dot + thin bar
 */
function MiniLimitBar({
  label,
  entry,
  t
}: {
  label: string;
  entry: RateLimitEntry | null;
  t: any;
}) {
  const isLimited = entry?.status === 'limited' || entry?.status === 'rejected';
  const utilization = entry?.utilization;
  const effectivePct = utilization !== null && utilization !== undefined
    ? utilization
    : (isLimited ? 100 : null);

  // Color logic
  const barColor = isLimited || (effectivePct !== null && effectivePct >= 90)
    ? 'bg-red-500'
    : effectivePct !== null && effectivePct >= 70
      ? 'bg-yellow-500'
      : 'bg-blue-500';

  const dotColor = isLimited
    ? 'bg-red-500 animate-pulse'
    : entry
      ? 'bg-green-500'
      : 'bg-gray-400';

  return (
    <div className="flex items-center gap-1" title={
      entry
        ? `${label}: ${effectivePct !== null ? `${Math.round(effectivePct)}% ${t('usage.usedShort')}` : isLimited ? t('usage.overLimit') : t('usage.available')}`
        : `${label}: ${t('usage.dataNotFound')}`
    }>
      <span className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 w-8 text-right leading-none">
        {label}
      </span>
      <div className={`w-1.5 h-1.5 rounded-full ${dotColor} shrink-0`} />
      <div className="w-12 h-2 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
        {effectivePct !== null ? (
          <div
            className={`h-full rounded-full transition-all duration-500 ${barColor}`}
            style={{ width: `${Math.min(100, effectivePct)}%` }}
          />
        ) : entry ? (
          <div
            className={`h-full rounded-full ${barColor} transition-all duration-500`}
            style={{ width: isLimited ? '100%' : '4%' }}
          />
        ) : (
          <div className="h-full rounded-full bg-gray-300 dark:bg-gray-600" style={{ width: '0%' }} />
        )}
      </div>
      {effectivePct !== null && (
        <span className={`text-[10px] tabular-nums font-semibold leading-none ${isLimited ? 'text-red-500 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'
          }`}>
          {Math.round(effectivePct)}%
        </span>
      )}
    </div>
  );
}
