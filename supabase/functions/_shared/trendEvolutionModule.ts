/**
 * TREND EVOLUTION MODULE
 * Evolves the `trends` table each global turn:
 *  - Applies mood-driven heat growth to emerging/rising trends
 *  - Applies natural decay to all non-emerging trends
 *  - Transitions status based on heat_score thresholds
 *  - Seeds new NPC-driven trends every 14 turns
 *  - Marks dead trends as inactive
 *
 * Heat thresholds:
 *   emerging → rising: heat >= 20 AND adoption_count >= 3
 *   rising   → peak:   heat >= 60
 *   peak     → fading: heat < 45
 *   fading   → dead:   heat <= 5
 *
 * Called once per turn in turnEngine.ts global post-player section.
 * Non-fatal — errors are caught and logged.
 */

import { AlgorithmMood } from './algorithmMoodModule.ts';
import { getGenreTrait } from './genreTraits.ts';

// Mood → which trend categories receive a heat growth boost this turn
const MOOD_TREND_AFFINITY: Record<AlgorithmMood, string[]> = {
  beef_season:      ['beef', 'meme'],
  nostalgic:        ['sound', 'aesthetic'],
  experimental:     ['sound', 'genre_wave'],
  underground:      ['genre_wave', 'aesthetic'],
  mainstream:       ['challenge', 'meme'],
  messy:            ['meme', 'beef', 'challenge'],
  collab_season:    ['sound', 'aesthetic', 'genre_wave'], // Cross-genre collabs surface new sounds + scene looks
  hype_cycle:       ['challenge', 'meme', 'sound'],       // Rollout teasers create challenge + sound moments
  viral_spiral:     ['challenge', 'meme'],                // Meme_drops + dance_challenges dominate
  industry_exposed: ['beef', 'meme'],                     // Receipts and tea = beef + meme content
  tour_season:      ['genre_wave', 'aesthetic'],          // Live music surfaces niche genres + stage aesthetics
};

/**
 * NPC trend seeds — rotated on a 14-turn cycle.
 * 36 entries = 6 per category, interleaved for diversity.
 * Full rotation: 36 × 14 = 504 turns (~1.4 in-game years).
 */
const TREND_SEED_POOL: Array<{
  name: string;
  category: string;
  platform_affinity: string | null;
}> = [
  // ── SOUND (6) ─────────────────────────────────────────────────────────────
  { name: 'Subway Freestyle',          category: 'sound',      platform_affinity: 'looptok'   },
  { name: 'Lo-Fi Nostalgia Beat',      category: 'sound',      platform_affinity: 'vidwave'   },
  { name: 'Open Verse Challenge',      category: 'sound',      platform_affinity: 'looptok'   },
  { name: 'Bedroom Pop Wave',          category: 'sound',      platform_affinity: 'instavibe' },
  { name: 'Sample Flip Season',        category: 'sound',      platform_affinity: null        },
  { name: 'Amapiano Log Drum Era',     category: 'sound',      platform_affinity: null        },

  // ── AESTHETIC (6) ─────────────────────────────────────────────────────────
  { name: 'Vintage OOTD',              category: 'aesthetic',  platform_affinity: 'instavibe' },
  { name: 'Tour Diary Aesthetic',      category: 'aesthetic',  platform_affinity: 'vidwave'   },
  { name: 'Studio Session Glow',       category: 'aesthetic',  platform_affinity: 'instavibe' },
  { name: 'Street Cypher Fits',        category: 'aesthetic',  platform_affinity: 'looptok'   },
  { name: 'Festival Main Stage Look',  category: 'aesthetic',  platform_affinity: 'instavibe' },
  { name: 'Minimalist Drop Rollout',   category: 'aesthetic',  platform_affinity: 'instavibe' },

  // ── CHALLENGE (6) ─────────────────────────────────────────────────────────
  { name: '#RawSessions',              category: 'challenge',  platform_affinity: 'looptok'   },
  { name: '#ClearItOut Dance',         category: 'challenge',  platform_affinity: 'looptok'   },
  { name: '#DrillChallenge',           category: 'challenge',  platform_affinity: 'looptok'   },
  { name: '#StepOnIt',                 category: 'challenge',  platform_affinity: 'looptok'   },
  { name: '#SneakPeakChallenge',       category: 'challenge',  platform_affinity: 'looptok'   },
  { name: '#AmapianoDanceOff',         category: 'challenge',  platform_affinity: 'looptok'   },

  // ── MEME (6) ──────────────────────────────────────────────────────────────
  { name: 'POV: The Drop Hits',        category: 'meme',       platform_affinity: 'looptok'   },
  { name: 'Feature Season',            category: 'meme',       platform_affinity: null        },
  { name: 'Label Meeting POV',         category: 'meme',       platform_affinity: 'looptok'   },
  { name: 'Industry Plant Tea',        category: 'meme',       platform_affinity: null        },
  { name: 'Pre-Drop Silence Meme',     category: 'meme',       platform_affinity: 'looptok'   },
  { name: 'Receipts Drop Format',      category: 'meme',       platform_affinity: 'looptok'   },

  // ── BEEF (6) ──────────────────────────────────────────────────────────────
  { name: 'Industry Plant Receipts',   category: 'beef',       platform_affinity: null        },
  { name: 'Label Beef Exposed',        category: 'beef',       platform_affinity: null        },
  { name: 'Diss Season Open',          category: 'beef',       platform_affinity: 'looptok'   },
  { name: 'Fan War Scoreboard',        category: 'beef',       platform_affinity: 'instavibe' },
  { name: 'Response Track Wave',       category: 'beef',       platform_affinity: null        },
  { name: 'Stage Snipe Era',           category: 'beef',       platform_affinity: 'vidwave'   },

  // ── GENRE_WAVE (6) ────────────────────────────────────────────────────────
  { name: 'Cloud Rap Wave',            category: 'genre_wave', platform_affinity: null        },
  { name: 'Afrobeats Era',             category: 'genre_wave', platform_affinity: null        },
  { name: 'UK Drill Crossover',        category: 'genre_wave', platform_affinity: null        },
  { name: 'Melodic Rap Takeover',      category: 'genre_wave', platform_affinity: null        },
  { name: 'Reggaeton Global Surge',    category: 'genre_wave', platform_affinity: null        },
  { name: 'K-Pop Invasion Arc',        category: 'genre_wave', platform_affinity: 'instavibe' },
];

function nextStatus(current: string, heat: number, adoption: number): string {
  if (current === 'emerging' && heat >= 20 && adoption >= 3) return 'rising';
  if (current === 'rising'   && heat >= 60)                   return 'peak';
  if (current === 'peak'     && heat < 45)                    return 'fading';
  if (current === 'fading'   && heat <= 5)                    return 'dead';
  return current;
}

export async function processTrendsForTurn(
  supabase: any,
  globalTurnId: number,
  algorithmMood: AlgorithmMood,
): Promise<void> {
  try {
    const { data: activeTrends, error } = await supabase
      .from('trends')
      .select('id, category, status, heat_score, adoption_count, decay_rate')
      .eq('is_active', true)
      .neq('status', 'dead');

    if (error) throw error;

    const favoredCategories = MOOD_TREND_AFFINITY[algorithmMood] || [];

    await Promise.allSettled(
      (activeTrends || []).map(async (trend: any) => {
        const moodBoosted = favoredCategories.includes(trend.category);
        let heat = Number(trend.heat_score);
        let adoption = Number(trend.adoption_count);
        const decayRate = Number(trend.decay_rate) || 0.05;

        // Mood-driven growth (emerging/rising only)
        if ((trend.status === 'emerging' || trend.status === 'rising') && moodBoosted) {
          heat = heat + heat * 0.05 + 1; // +5% + flat +1
          adoption = adoption + 2;
        } else if (trend.status === 'emerging') {
          // Slow organic tick even without mood boost
          adoption = adoption + 1;
        }

        // Natural decay (all non-emerging)
        if (trend.status !== 'emerging') {
          heat = Math.max(0, heat - decayRate * heat * 0.08);
        }

        const newStatus = nextStatus(trend.status, heat, adoption);
        const isActive = newStatus !== 'dead';

        return supabase
          .from('trends')
          .update({
            heat_score:     Math.round(heat * 100) / 100,
            adoption_count: adoption,
            status:         newStatus,
            is_active:      isActive,
          })
          .eq('id', trend.id);
      })
    );

    // Seed a new NPC trend every 14 turns
    if (globalTurnId % 14 === 0) {
      const seed = TREND_SEED_POOL[Math.floor(globalTurnId / 14) % TREND_SEED_POOL.length];

      // Idempotent: skip if a trend with this name is already active
      const { data: existing } = await supabase
        .from('trends')
        .select('id')
        .eq('name', seed.name)
        .eq('is_active', true)
        .maybeSingle();

      if (!existing) {
        await supabase.from('trends').insert({
          name:              seed.name,
          category:          seed.category,
          platform_affinity: seed.platform_affinity,
          status:            'emerging',
          heat_score:        10 + Math.floor(Math.random() * 10),
          adoption_count:    1,
          tick_born:         globalTurnId,
          decay_rate:        0.04 + Math.random() * 0.06,
          expiration_turn:   globalTurnId + 365, // 1 year runway; floor safety prunes dead rows
        });
        console.log(`[TrendEvolution] Seeded new trend: "${seed.name}" (${seed.category})`);
      }
    }

    // Gap 6: Song performance → linked trend boost (bidirectional feedback)
    // Releases with linked_trend_id that streamed well this turn boost their linked trend
    try {
      const { data: linkedReleases } = await supabase
        .from('releases')
        .select('id, linked_trend_id, lifetime_streams')
        .not('linked_trend_id', 'is', null)
        .eq('status', 'released');

      if (linkedReleases?.length) {
        // Group by trend_id, sum stream velocity as proxy for performance
        const trendBoosts: Record<string, number> = {};
        for (const rel of linkedReleases as any[]) {
          const tid = rel.linked_trend_id;
          const streams = Number(rel.lifetime_streams) || 0;
          // Use log-scaled stream count as heat boost (prevents runaway)
          const boost = streams > 0 ? Math.min(5, Math.log10(Math.max(1, streams)) * 0.5) : 0;
          trendBoosts[tid] = (trendBoosts[tid] || 0) + boost;
        }

        // Apply boosts to active trends
        for (const [trendId, boost] of Object.entries(trendBoosts)) {
          if (boost <= 0) continue;
          const matchingTrend = (activeTrends || []).find((t: any) => t.id === trendId);
          if (matchingTrend) {
            await supabase.from('trends').update({
              heat_score: Math.round((Number(matchingTrend.heat_score) + boost) * 100) / 100,
              adoption_count: Number(matchingTrend.adoption_count) + 1,
            }).eq('id', trendId);
          }
        }
      }
    } catch (songTrendErr: any) {
      console.error(`[TrendEvolution] Song→trend boost error (non-fatal): ${songTrendErr?.message}`);
    }

    // Action→trend boost: non-LoopTok player actions from prev turn boost matching trend categories.
    // LoopTok-specific concept→trend boosts are handled in looptokHandler.ts.
    // This covers touring, collab, snippet/teaser, fandom receipts, festival, and sample actions.
    try {
      const { data: prevEvents } = await supabase
        .from('turn_event_log')
        .select('event_type, module')
        .eq('global_turn_id', globalTurnId - 1);

      if (prevEvents?.length) {
        // Rules: matchFn → category, heat boost magnitude, adoption boost magnitude
        const ACTION_TREND_BOOST_RULES: Array<{
          matchFn: (evtType: string, mod: string) => boolean;
          category: string;
          heatBoost: number;
          adoptionBoost: number;
        }> = [
          // Touring/gig → live music surfaces niche genres + stage aesthetics
          { matchFn: (e, m) => e.includes('tour') || e.includes('gig_performed') || m.includes('touring'),
            category: 'genre_wave', heatBoost: 1.5, adoptionBoost: 1 },
          { matchFn: (e, m) => e.includes('tour') || e.includes('gig_performed') || m.includes('touring'),
            category: 'aesthetic',  heatBoost: 1.0, adoptionBoost: 1 },
          // Collab/feature/duet/opening act → cross-genre sounds + scene aesthetics
          { matchFn: (e, _m) => e.includes('collab') || e.includes('feature') || e.includes('opening_act') || e.includes('duet'),
            category: 'sound',     heatBoost: 2.0, adoptionBoost: 2 },
          { matchFn: (e, _m) => e.includes('collab') || e.includes('feature') || e.includes('opening_act') || e.includes('duet'),
            category: 'aesthetic', heatBoost: 1.0, adoptionBoost: 1 },
          // Snippet/teaser/announcement → rollout hype feeds challenge + meme trends
          { matchFn: (e, _m) => e.includes('snippet') || e.includes('teaser') || e.includes('announcement'),
            category: 'challenge', heatBoost: 1.5, adoptionBoost: 1 },
          { matchFn: (e, _m) => e.includes('snippet') || e.includes('teaser') || e.includes('announcement'),
            category: 'meme',     heatBoost: 1.5, adoptionBoost: 1 },
          // Receipts/fandom exposé actions → beef + meme
          { matchFn: (e, _m) => e.includes('receipts') || e.includes('expose') || e.includes('stan_cta'),
            category: 'beef',     heatBoost: 2.0, adoptionBoost: 2 },
          { matchFn: (e, _m) => e.includes('receipts') || e.includes('expose') || e.includes('stan_cta'),
            category: 'meme',     heatBoost: 1.0, adoptionBoost: 1 },
          // Festival/stage snipe actions → genre_wave
          { matchFn: (e, m) => e.includes('festival') || e.includes('stage_snipe') || m.includes('festival'),
            category: 'genre_wave', heatBoost: 2.0, adoptionBoost: 1 },
          // Sample/licensing actions → sound trends
          { matchFn: (e, _m) => e.includes('sample') || e.includes('license'),
            category: 'sound',    heatBoost: 1.5, adoptionBoost: 1 },
        ];

        // Aggregate boost per category (capped to prevent log-of-activity runaway)
        const categoryBoosts: Record<string, { heat: number; adoption: number }> = {};
        for (const evt of prevEvents as any[]) {
          const evtType = String(evt.event_type || '').toLowerCase();
          const mod = String(evt.module || '').toLowerCase();
          for (const rule of ACTION_TREND_BOOST_RULES) {
            if (rule.matchFn(evtType, mod)) {
              if (!categoryBoosts[rule.category]) categoryBoosts[rule.category] = { heat: 0, adoption: 0 };
              categoryBoosts[rule.category].heat     = Math.min(10, categoryBoosts[rule.category].heat + rule.heatBoost);
              categoryBoosts[rule.category].adoption = Math.min(5,  categoryBoosts[rule.category].adoption + rule.adoptionBoost);
            }
          }
        }

        // Apply aggregated boosts to the highest-heat active trend per category
        for (const [cat, boost] of Object.entries(categoryBoosts)) {
          if (boost.heat <= 0) continue;
          const catTrend = (activeTrends || [])
            .filter((t: any) => t.category === cat && ['emerging', 'rising', 'peak'].includes(t.status))
            .sort((a: any, b: any) => Number(b.heat_score) - Number(a.heat_score))[0];
          if (catTrend) {
            await supabase.from('trends').update({
              heat_score:     Math.round(Math.min(100, Number(catTrend.heat_score) + boost.heat) * 100) / 100,
              adoption_count: Number(catTrend.adoption_count) + boost.adoption,
            }).eq('id', catTrend.id);
          }
        }
      }
    } catch (actionTrendErr: any) {
      console.error(`[TrendEvolution] Action→trend boost error (non-fatal): ${actionTrendErr?.message}`);
    }

    // Safety floor: if fewer than 3 active trends survive after evolution,
    // force-seed one to prevent the table from going permanently empty.
    const { count: activeCount } = await supabase
      .from('trends')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true)
      .neq('status', 'dead');

    if ((activeCount || 0) < 3) {
      // Pick a seed not currently active
      for (const seed of TREND_SEED_POOL) {
        const { data: existingSeed } = await supabase
          .from('trends')
          .select('id')
          .eq('name', seed.name)
          .eq('is_active', true)
          .maybeSingle();
        if (!existingSeed) {
          await supabase.from('trends').insert({
            name:              seed.name,
            category:          seed.category,
            platform_affinity: seed.platform_affinity,
            status:            'emerging',
            heat_score:        15,
            adoption_count:    2,
            tick_born:         globalTurnId,
            decay_rate:        0.04,
            expiration_turn:   globalTurnId + 365,
          });
          console.log(`[TrendEvolution] Floor-seeded trend: "${seed.name}" (active count was ${activeCount})`);
          break;
        }
      }
    }

    console.log(`[TrendEvolution] Processed ${(activeTrends || []).length} active trends (turn ${globalTurnId}, mood: ${algorithmMood})`);
  } catch (err: any) {
    console.error(`[TrendEvolution] Error (non-fatal): ${err?.message || err}`);
  }
}

// ─── IMPLICIT TREND LINKAGE (Original Proposition §3: Song Alignment) ────────
// "Songs are not explicitly tagged with a mood. Instead, their existing attributes
//  are evaluated against the current algorithm_mood and Trends."
//
// Pure function — scores each active trend against a release's attributes and
// returns the best-matching trend ID (or null if nothing scores above threshold).

/** Genre → which trend categories it naturally embodies */
const GENRE_TREND_AFFINITY: Record<string, string[]> = {
  drill:           ['beef', 'sound'],
  uk_drill:        ['beef', 'sound'],
  rap:             ['beef', 'sound', 'meme'],
  hip_hop:         ['sound', 'meme', 'beef'],
  trap:            ['sound', 'meme'],
  melodic_rap:     ['sound', 'aesthetic'],
  alternative_rap: ['sound', 'genre_wave'],
  pop:             ['challenge', 'meme', 'aesthetic'],
  kpop:            ['challenge', 'aesthetic', 'meme'],
  r_and_b:         ['sound', 'aesthetic'],
  indie:           ['genre_wave', 'aesthetic', 'sound'],
  edm:             ['sound', 'challenge'],
  afrobeats:       ['genre_wave', 'sound', 'challenge'],
  amapiano:        ['genre_wave', 'sound'],
  reggaeton:       ['genre_wave', 'challenge'],
  latin_pop:       ['challenge', 'meme'],
  country:         ['genre_wave', 'aesthetic'],
  rock:            ['sound', 'genre_wave'],
  folk:            ['genre_wave', 'aesthetic'],
  dancehall:       ['genre_wave', 'sound'],
  reggae:          ['genre_wave', 'sound'],
  techno:          ['sound', 'genre_wave'],
  trance:          ['sound', 'genre_wave'],
  alternative:     ['sound', 'genre_wave', 'aesthetic'],
  salsa:           ['genre_wave'],
  j_pop:           ['aesthetic', 'challenge'],
};

export interface TrendCandidate {
  id: string;
  category: string;
  status: string;      // 'rising' | 'peak' | 'emerging'
  heat_score: number;
}

export interface ReleaseAttributes {
  genre: string | null;
  isDissTrack: boolean;
  experimentalFactor: number;
  playerGenre: string | null;
}

/**
 * Scores a release against active trends and returns the best-matching trend ID.
 * Returns null if no trend scores above the minimum threshold.
 *
 * Scoring (per trend, max ~10):
 *   +3  genre affinity match (release genre naturally fits trend category)
 *   +2  mood affinity match (current mood favors trend category)
 *   +2  diss track + beef trend
 *   +2  high experimental_factor + sound/genre_wave trend
 *   +1  cross-genre release + genre_wave/sound trend
 *   +1  trend is 'peak' (strongest trends attract new releases)
 *   +0.5 trend is 'rising'
 *
 * Minimum threshold: 3.0 (prevents weak/random linkages)
 */
export function inferTrendForRelease(
  release: ReleaseAttributes,
  activeTrends: TrendCandidate[],
  algorithmMood: AlgorithmMood,
): string | null {
  if (!activeTrends?.length) return null;

  const genre = (release.genre || '').toLowerCase().replace(/[^a-z0-9_]/g, '_');
  const playerGenre = (release.playerGenre || '').toLowerCase().replace(/[^a-z0-9_]/g, '_');
  const genreAffinities = GENRE_TREND_AFFINITY[genre] || [];
  const moodAffinities = MOOD_TREND_AFFINITY[algorithmMood] || [];
  const isCrossGenre = genre && playerGenre && genre !== playerGenre;

  let bestId: string | null = null;
  let bestScore = 0;

  for (const trend of activeTrends) {
    let score = 0;

    // Genre → trend category affinity
    if (genreAffinities.includes(trend.category)) score += 3;

    // Current mood favors this trend category
    if (moodAffinities.includes(trend.category)) score += 2;

    // Diss track strongly links to beef trends
    if (release.isDissTrack && trend.category === 'beef') score += 2;

    // High experimental factor links to sound / genre_wave trends
    if ((release.experimentalFactor ?? 0) > 0.5 &&
        (trend.category === 'sound' || trend.category === 'genre_wave')) {
      score += 2;
    }

    // Cross-genre releases link to genre_wave and sound trends
    if (isCrossGenre && (trend.category === 'genre_wave' || trend.category === 'sound')) {
      score += 1;
    }

    // Hotter trends attract more releases (peak > rising > emerging)
    if (trend.status === 'peak') score += 1;
    else if (trend.status === 'rising') score += 0.5;

    if (score > bestScore) {
      bestScore = score;
      bestId = trend.id;
    }
  }

  // Minimum threshold prevents weak/random linkages
  return bestScore >= 3 ? bestId : null;
}
