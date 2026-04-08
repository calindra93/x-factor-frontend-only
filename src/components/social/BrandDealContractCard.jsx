import React from 'react';
import { statusBadgeConfig, normalizeBrandDealStatus } from './brandDealStatus';

const LOYALTY_LABELS = {
  cold: 'Cold',
  neutral: 'Neutral',
  warm: 'Warm',
  favored: 'Favored',
  elite: 'Elite',
};

const LOYALTY_BADGE_CLASS = {
  cold: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
  neutral: 'bg-gray-500/20 text-gray-300 border-gray-500/30',
  warm: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  favored: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
  elite: 'bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/30',
};

const TIER_BADGE = {
  local:    { label: 'Local',    className: 'bg-zinc-600/30 text-zinc-300 border-zinc-500/30' },
  regional: { label: 'Regional', className: 'bg-sky-600/20 text-sky-300 border-sky-500/30' },
  national: { label: 'National', className: 'bg-emerald-600/20 text-emerald-300 border-emerald-500/30' },
  global:   { label: 'Global',   className: 'bg-amber-600/20 text-amber-200 border-amber-500/30' },
  luxury:   { label: 'Luxury',   className: 'bg-fuchsia-600/20 text-fuchsia-200 border-fuchsia-400/30' },
};

const KPI_LABELS = {
  required_posts: 'Posts',
  required_engagement_rate: 'Engagement',
  required_reach: 'Reach',
};

const PLATFORM_BADGE = {
  looptok:        { label: 'LoopTok',      className: 'bg-purple-500/20 text-purple-300 border-purple-500/30' },
  instavibe:      { label: 'InstaVibe',    className: 'bg-pink-500/20 text-pink-300 border-pink-500/30' },
  vidwave:        { label: 'VidWave',      className: 'bg-red-500/20 text-red-300 border-red-500/30' },
  cross_platform: { label: 'All Platforms', className: 'bg-gray-500/20 text-gray-300 border-gray-500/30' },
};

function formatKpiValue(key, value) {
  const numericValue = Number(value) || 0;
  if (key === 'required_engagement_rate') return `${numericValue.toFixed(1)}%`;
  return numericValue.toLocaleString();
}

function buildKpiSummary(kpis, kpiProgress) {
  const safeKpis = kpis || {};
  const safeProgress = kpiProgress || {};
  return Object.entries(safeKpis)
    .map(([key, required]) => ({
      key,
      required: Number(required) || 0,
      current: Number(safeProgress[key]) || 0,
    }))
    .filter((entry) => entry.required > 0)
    .map((entry) => ({
      ...entry,
      met: entry.current >= entry.required,
    }));
}

function PrestigeStars({ score }) {
  if (!score || score <= 0) return null;
  const filled = Math.min(Math.round(score / 2), 5); // 1-10 → 1-5 stars
  return (
    <span className="text-[8px] text-amber-400/80 tracking-tight" title={`Prestige: ${score}/10`}>
      {'★'.repeat(filled)}{'☆'.repeat(5 - filled)}
    </span>
  );
}

export default function BrandDealContractCard({
  brandName,
  tier,
  status,
  deliverablesRemaining,
  turnsRemaining,
  personaFitText,
  showAccrualHelper = false,
  action,
  subtext,
  loyaltyTier,
  brandPrestige,
  kpis,
  kpiProgress,
  platformScope,
  signingBonus,
  perTurnFee,
  performanceBonus,
}) {
  const badge = statusBadgeConfig(status);
  const normalizedStatus = normalizeBrandDealStatus(status);
  const hasEnded = (normalizedStatus === 'active' || normalizedStatus === 'offered')
    ? Number(turnsRemaining || 0) <= 0
    : true;
  const normalizedLoyalty = String(loyaltyTier || '').toLowerCase();
  const loyaltyLabel = LOYALTY_LABELS[normalizedLoyalty];
  const termLabel = normalizedStatus === 'offered'
    ? `Offer expires in ${Math.max(0, Number(turnsRemaining || 0))} turn${Math.max(0, Number(turnsRemaining || 0)) === 1 ? '' : 's'}`
    : hasEnded
      ? 'Ended'
      : `Ends in ${Math.max(0, Number(turnsRemaining || 0))} turns`;
  const kpiSummary = buildKpiSummary(kpis, kpiProgress);
  const platformBadge = platformScope ? PLATFORM_BADGE[platformScope] : null;
  const showPlatformBadge = platformBadge && (normalizedStatus === 'active' || normalizedStatus === 'offered');
  const numDeliv = Number(deliverablesRemaining || 0);
  const numTurns = Number(turnsRemaining || 0);
  const showAtRiskWarning = numDeliv > numTurns && numTurns > 0 && normalizedStatus === 'active';
  const signingBonusVal = Number(signingBonus || 0);
  const perTurnFeeVal = Number(perTurnFee || 0);
  const performanceBonusVal = Number(performanceBonus || 0);
  const hasPayoutInfo = signingBonusVal > 0 || perTurnFeeVal > 0 || performanceBonusVal > 0;

  return (
    <div className="py-2 border-b border-white/[0.04] last:border-0">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-gray-100 text-sm font-semibold">{brandName}</p>
            {tier && TIER_BADGE[tier] && (
              <span className={`text-[11px] font-semibold border rounded-full px-2 py-0.5 ${TIER_BADGE[tier].className}`}>
                {TIER_BADGE[tier].label}
              </span>
            )}
            {!TIER_BADGE[tier] && tier && (
              <span className="text-[11px] text-gray-400">{tier}</span>
            )}
            <PrestigeStars score={brandPrestige} />
            {showPlatformBadge && (
              <span className={`text-[11px] font-semibold border rounded-full px-2 py-0.5 ${platformBadge.className}`}>
                {platformBadge.label}
              </span>
            )}
            {!!loyaltyLabel && (
              <span className={`text-[11px] font-semibold border rounded-full px-2 py-0.5 ${LOYALTY_BADGE_CLASS[normalizedLoyalty] || LOYALTY_BADGE_CLASS.neutral}`}>
                {loyaltyLabel}
              </span>
            )}
            <span className={`text-[11px] font-semibold border rounded-full px-2 py-0.5 ${badge.className}`}>{badge.label}</span>
          </div>
          {!!loyaltyLabel && <p className="text-gray-500 text-[10px] mt-0.5">Brand loyalty affects future offers.</p>}
          <p className="text-gray-400 text-[11px] mt-1">
            Deliverables remaining: {Math.max(0, Number(deliverablesRemaining || 0))} · {termLabel}
          </p>
          {!!subtext && <p className="text-gray-400 text-[11px] mt-0.5">{subtext}</p>}
          {!!personaFitText && <p className="text-gray-500 text-[10px] mt-0.5">{personaFitText}</p>}
          {kpiSummary.length > 0 && (
            <div className="mt-2 rounded-xl border border-white/[0.06] bg-white/[0.03] px-2.5 py-2">
              {kpiSummary.map((kpi) => (
                <div key={kpi.key} className="flex items-center justify-between gap-3 py-0.5 text-[10px]">
                  <span className="text-gray-400">{KPI_LABELS[kpi.key] || kpi.key.replace(/_/g, ' ')}</span>
                  <span className={kpi.met ? 'text-emerald-300' : 'text-gray-300'}>
                    {formatKpiValue(kpi.key, kpi.current)} / {formatKpiValue(kpi.key, kpi.required)}
                  </span>
                </div>
              ))}
            </div>
          )}
          {showAtRiskWarning && (
            <p className="text-amber-400 text-[10px] mt-0.5">⚠ {numDeliv} posts needed in {numTurns} turns — at risk</p>
          )}
          {hasPayoutInfo && (
            <p className="text-[11px] text-gray-400 mt-1">
              Payout:{' '}
              {signingBonusVal > 0 && <span>Signing ${signingBonusVal.toLocaleString()}</span>}
              {signingBonusVal > 0 && (perTurnFeeVal > 0 || performanceBonusVal > 0) && ' · '}
              {perTurnFeeVal > 0 && <span>+${perTurnFeeVal.toLocaleString()}/turn</span>}
              {perTurnFeeVal > 0 && performanceBonusVal > 0 && ' · '}
              {performanceBonusVal > 0 && <span>Bonus ${performanceBonusVal.toLocaleString()} if met</span>}
            </p>
          )}
          {showAccrualHelper && normalizedStatus === 'active' && (
            <p className="text-gray-500 text-[10px] mt-0.5">Payouts accrue over turns.</p>
          )}
          {normalizedStatus === 'breached' && (
            <p className="text-red-300 text-[10px] mt-0.5">This contract was breached; performance bonus is forfeited.</p>
          )}
        </div>
        {action}
      </div>
    </div>
  );
}
