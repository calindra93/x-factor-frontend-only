/**
 * tourHistoryModel.js
 * Pure helpers for past tour recap, grading, and comparison.
 * No side effects, no API calls.
 */

// ─── Grade thresholds ─────────────────────────────────────────────────────────

const GRADE_THRESHOLDS = [
  { min: 90, grade: 'S', label: 'Legendary',    color: '#fbbf24' },
  { min: 75, grade: 'A', label: 'Excellent',    color: '#34d399' },
  { min: 60, grade: 'B', label: 'Good',         color: '#60a5fa' },
  { min: 40, grade: 'C', label: 'Average',      color: '#a78bfa' },
  { min: 20, grade: 'D', label: 'Disappointing',color: '#f97316' },
  { min:  0, grade: 'F', label: 'Disaster',     color: '#f87171' },
];

/**
 * Grade a tour by its review score or derived metrics.
 *
 * @param {number} score - 0–100
 * @returns {{ grade: string, label: string, color: string, score: number }}
 */
export function gradeTour(score) {
  const s = Math.max(0, Math.min(100, Number(score) || 0));
  const threshold = GRADE_THRESHOLDS.find((t) => s >= t.min) || GRADE_THRESHOLDS[GRADE_THRESHOLDS.length - 1];
  return { grade: threshold.grade, label: threshold.label, color: threshold.color, score: s };
}

// ─── Revenue efficiency ───────────────────────────────────────────────────────

/**
 * Compute revenue efficiency: net revenue per show.
 *
 * @param {object} tour - Tour record
 * @returns {number}
 */
export function computeRevenueEfficiency(tour) {
  if (!tour) return 0;
  const shows = Number(tour.completed_stops ?? tour.total_stops ?? tour.shows_completed ?? 0);
  const revenue = Number(tour.total_net_revenue ?? tour.actual_revenue ?? 0);
  if (shows <= 0) return 0;
  return Math.round(revenue / shows);
}

// ─── buildPastTourComparison ──────────────────────────────────────────────────

/**
 * Compare a selected tour against the average of all completed tours.
 * Excludes the selected tour itself from the baseline average.
 *
 * @param {object} opts
 * @param {object}   opts.selectedTour    - The tour to compare
 * @param {object[]} opts.completedTours  - All completed tours (including selected)
 * @returns {{
 *   revenueDeltaVsAverage: number,
 *   revenueDeltaPct: number,
 *   attendanceDeltaVsAverage: number,
 *   attendanceDeltaPct: number,
 *   revenueEfficiency: number,
 *   avgRevenueEfficiency: number,
 *   grade: object,
 *   crewNote: string|null,
 *   partnerOutcome: string|null,
 *   topRegion: string|null,
 *   tourMode: string,
 *   totalRevenue: number,
 *   totalAttendance: number,
 *   shows: number,
 * }}
 */
export function buildPastTourComparison({ selectedTour, completedTours = [] } = {}) {
  if (!selectedTour) {
    return {
      revenueDeltaVsAverage: 0, revenueDeltaPct: 0,
      attendanceDeltaVsAverage: 0, attendanceDeltaPct: 0,
      revenueEfficiency: 0, avgRevenueEfficiency: 0,
      grade: gradeTour(0),
      crewNote: null, partnerOutcome: null, topRegion: null,
      tourMode: 'solo', totalRevenue: 0, totalAttendance: 0, shows: 0,
    };
  }

  const selectedRevenue    = Number(selectedTour.total_net_revenue ?? selectedTour.actual_revenue ?? 0);
  const selectedAttendance = Number(selectedTour.total_attendance ?? 0);
  const selectedShows      = Number(selectedTour.completed_stops ?? selectedTour.total_stops ?? selectedTour.shows_completed ?? 0);

  // Baseline: other completed tours (exclude the selected one)
  const others = completedTours.filter((t) => t && t.id !== selectedTour.id);

  let avgRevenue    = 0;
  let avgAttendance = 0;

  if (others.length > 0) {
    avgRevenue    = others.reduce((s, t) => s + Number(t.total_net_revenue ?? t.actual_revenue ?? 0), 0) / others.length;
    avgAttendance = others.reduce((s, t) => s + Number(t.total_attendance ?? 0), 0) / others.length;
  }

  const revenueDeltaVsAverage    = others.length > 0 ? Math.round(selectedRevenue - avgRevenue) : 0;
  const attendanceDeltaVsAverage = others.length > 0 ? Math.round(selectedAttendance - avgAttendance) : 0;

  const revenueDeltaPct = (others.length > 0 && avgRevenue > 0)
    ? Math.round(((selectedRevenue - avgRevenue) / avgRevenue) * 100)
    : 0;
  const attendanceDeltaPct = (others.length > 0 && avgAttendance > 0)
    ? Math.round(((selectedAttendance - avgAttendance) / avgAttendance) * 100)
    : 0;

  // Efficiency (net per show)
  const revenueEfficiency = computeRevenueEfficiency(selectedTour);
  const avgRevenueEfficiency = others.length > 0
    ? Math.round(others.reduce((s, t) => s + computeRevenueEfficiency(t), 0) / others.length)
    : 0;

  // Grade from stored review score or derived
  const rawScore = Number(selectedTour.tour_review_score ?? selectedTour.quality_score ?? 0);
  const derivedScore = rawScore > 0 ? rawScore : Math.min(100, Math.round(
    (selectedShows > 0 ? Math.min(1, selectedAttendance / (selectedShows * 500)) : 0) * 60 +
    (revenueDeltaPct > 0 ? Math.min(40, revenueDeltaPct / 2) : 0)
  ));
  const grade = gradeTour(derivedScore);

  // Crew note
  const crewMorale = Number(selectedTour.crew_morale ?? 0);
  const crewNote = crewMorale > 0
    ? crewMorale >= 70 ? 'Crew morale was high — strong team performance'
    : crewMorale >= 40 ? 'Crew had mixed morale — some friction on the road'
    : 'Crew morale was low — consider better crew management next time'
    : null;

  // Partner outcome (tourMode framing)
  const tourMode = selectedTour.strategy?.tourMode ?? selectedTour.tour_mode ?? 'solo';
  const partnerOutcome =
    tourMode === 'equal_coheadliner' ? 'Co-headliner deal — revenue split 50/50, boosted reach'
    : tourMode === 'partner_led'     ? 'Partner-led deal — you took 30% but gained major exposure'
    : null;

  // Top region
  const topRegion = selectedTour.region ?? null;

  return {
    revenueDeltaVsAverage,
    revenueDeltaPct,
    attendanceDeltaVsAverage,
    attendanceDeltaPct,
    revenueEfficiency,
    avgRevenueEfficiency,
    grade,
    crewNote,
    partnerOutcome,
    topRegion,
    tourMode,
    totalRevenue: selectedRevenue,
    totalAttendance: selectedAttendance,
    shows: selectedShows,
  };
}

// ─── buildTourHistorySummary ──────────────────────────────────────────────────

/**
 * Aggregate summary stats across all completed tours.
 *
 * @param {object[]} completedTours
 * @returns {{
 *   totalRevenue: number,
 *   totalAttendance: number,
 *   totalShows: number,
 *   tourCount: number,
 *   avgRevenuePerTour: number,
 *   bestTour: object|null,
 *   worstTour: object|null,
 *   avgGrade: object,
 * }}
 */
export function buildTourHistorySummary(completedTours = []) {
  const safe = Array.isArray(completedTours) ? completedTours.filter(Boolean) : [];
  if (safe.length === 0) {
    return {
      totalRevenue: 0, totalAttendance: 0, totalShows: 0,
      tourCount: 0, avgRevenuePerTour: 0,
      bestTour: null, worstTour: null, avgGrade: gradeTour(0),
    };
  }

  const totalRevenue    = safe.reduce((s, t) => s + Number(t.total_net_revenue ?? t.actual_revenue ?? 0), 0);
  const totalAttendance = safe.reduce((s, t) => s + Number(t.total_attendance ?? 0), 0);
  const totalShows      = safe.reduce((s, t) => s + Number(t.completed_stops ?? t.total_stops ?? 0), 0);

  const sorted = [...safe].sort(
    (a, b) => Number(b.total_net_revenue ?? 0) - Number(a.total_net_revenue ?? 0)
  );

  const avgScore = safe.reduce((s, t) => s + Number(t.tour_review_score ?? t.quality_score ?? 0), 0) / safe.length;

  return {
    totalRevenue: Math.round(totalRevenue),
    totalAttendance: Math.round(totalAttendance),
    totalShows,
    tourCount: safe.length,
    avgRevenuePerTour: Math.round(totalRevenue / safe.length),
    bestTour: sorted[0] || null,
    worstTour: sorted[sorted.length - 1] || null,
    avgGrade: gradeTour(Math.round(avgScore)),
  };
}
