/**
 * AMPLIFI FESTIVAL SYSTEM — Backstage Deals Module (Phase 2)
 *
 * Handles:
 *  1. Generating system offers after day resolution (based on performance)
 *  2. Validating player accept/decline actions
 *  3. Resolving accepted deals at tick (applying effects)
 *  4. Expiring stale offers
 *  5. Notifications
 *
 * Deal types: FEATURE_SWAP, REMIX_PERMISSION, BRAND_SCOUT_MEETING, STAGE_GUEST_SURPRISE
 * All deals stage during the hour and resolve on tick. No live chat.
 */

import { insertNotificationIdempotent } from './notificationInsert.ts';

// ── Artifact minting TTL ─────────────────────────────────────────────────────

/** How many turns a follow-through artifact stays valid before expiring */
const ARTIFACT_TTL_TURNS = 336;  // ~14 in-game days (2 weeks)

/** Retain expired artifacts for a short audit window before hard delete */
const ARTIFACT_PRUNE_GRACE_TURNS = 336;

// ── Constants ────────────────────────────────────────────────────────────────

export const DEAL_TYPES = [
  'FEATURE_SWAP',
  'REMIX_PERMISSION',
  'BRAND_SCOUT_MEETING',
  'STAGE_GUEST_SURPRISE',
  'TOURING_INVITE',   // Phase 3: invite to supporting tour slot
  'SYNC_PITCH',       // Phase 3: pitch a song for a sync deal together
] as const;

export type DealType = (typeof DEAL_TYPES)[number];

/** How many turns an offer stays valid before expiring */
const OFFER_TTL_TURNS = 48;  // ~2 in-game days

/** Max offers a player can receive per day */
const MAX_OFFERS_PER_DAY = 4;

/** Max deals a player can accept per day */
const MAX_ACCEPTS_PER_DAY = 2;

/** Max deal offers a player can send per day */
const MAX_SENDS_PER_DAY = 1;

// ── Deal effect definitions ──────────────────────────────────────────────────

interface DealEffects {
  credibility_boost: number;     // added to next performance credibility (0-1 scale)
  conversion_boost: number;      // added to next performance conversion
  moment_card_boost: string[];   // moment card types with higher probability
  moment_card_penalty: string[]; // moment card types with higher probability (risk)
  brand_interest_tokens: number; // extra brand deal rolls for N turns
  brand_interest_duration: number;
  clout_bump: number;            // immediate small clout gain
}

const DEAL_EFFECTS: Record<DealType, { a: Partial<DealEffects>; b: Partial<DealEffects> }> = {
  FEATURE_SWAP: {
    a: { credibility_boost: 0.03, conversion_boost: 0.02, clout_bump: 5 },
    b: { credibility_boost: 0.03, conversion_boost: 0.02, clout_bump: 5 },
  },
  REMIX_PERMISSION: {
    a: { clout_bump: 8, conversion_boost: 0.02 },   // grantor
    b: { credibility_boost: 0.02, clout_bump: 3 },   // grantee
  },
  BRAND_SCOUT_MEETING: {
    a: { brand_interest_tokens: 1, brand_interest_duration: 72, clout_bump: 3 },
    b: {},  // system/scout deal, no artist_b
  },
  STAGE_GUEST_SURPRISE: {
    a: { moment_card_boost: ['SurpriseGuestHit', 'CrowdChant'], moment_card_penalty: ['TechnicalFail'], credibility_boost: 0.02 },
    b: { moment_card_boost: ['SurpriseGuestHit', 'CrowdChant'], moment_card_penalty: ['TechnicalFail'], credibility_boost: 0.02 },
  },
  // Phase 3: player-initiated deals
  TOURING_INVITE: {
    a: { clout_bump: 15, brand_interest_tokens: 1, brand_interest_duration: 48 },  // host
    b: { clout_bump: 5, conversion_boost: 0.03 },  // invitee
  },
  SYNC_PITCH: {
    a: { credibility_boost: 0.04, clout_bump: 10 },
    b: { credibility_boost: 0.04, clout_bump: 10 },
  },
};

// ── Generate system offers after day resolution ──────────────────────────────

export async function generateBackstageOffers(
  supabase: any,
  festivalInstanceId: string,
  dayId: string,
  dayIndex: number,
  globalTurnId: number,
  performanceResults: any[],
): Promise<void> {
  if (!performanceResults?.length) return;

  // B-1: Sort for deterministic partner selection
  performanceResults.sort((a: any, b: any) => (a.artist_id || '').localeCompare(b.artist_id || ''));

  // Fetch festival config for posture checks
  const { data: instance } = await supabase
    .from('festival_instances')
    .select('festival_id')
    .eq('id', festivalInstanceId)
    .single();

  const { data: festival } = await supabase
    .from('festivals')
    .select('id, brand_posture')
    .eq('id', instance?.festival_id)
    .single();

  const brandPosture = festival?.brand_posture || '';
  const isCorporate = brandPosture.includes('corporate');
  const artistIds = performanceResults.map((result: any) => result.artist_id).filter(Boolean);
  const { data: backstageFactions } = festival?.id
    ? await supabase
        .from('festival_factions')
        .select('id')
        .eq('festival_id', festival.id)
        .eq('standing_effect', 'backstage_quality')
    : { data: [] as any[] };
  const backstageFactionIds = (backstageFactions || []).map((f: any) => f.id);
  const { data: standingRows } = backstageFactionIds.length && artistIds.length
    ? await supabase
        .from('player_faction_standing')
        .select('player_id, faction_id, standing')
        .in('player_id', artistIds)
        .in('faction_id', backstageFactionIds)
    : { data: [] as any[] };
  const backstageStandingMap = new Map<string, number>();
  for (const row of (standingRows || [])) {
    backstageStandingMap.set(`${row.player_id}:${row.faction_id}`, Number(row.standing ?? 0));
  }

  const offersToCreate: any[] = [];
  const expiresAt = globalTurnId + OFFER_TTL_TURNS;

  for (const result of performanceResults) {
    const offers: any[] = [];
    const totalBackstageStanding = backstageFactionIds.reduce((sum: number, factionId: string) => {
      return sum + (backstageStandingMap.get(`${result.artist_id}:${factionId}`) ?? 0);
    }, 0);
    const avgBackstageStanding = backstageFactionIds.length ? totalBackstageStanding / backstageFactionIds.length : 0;
    const backstageThresholdShift = Math.max(-10, Math.min(10, avgBackstageStanding / 10));

    // High credibility → BRAND_SCOUT_MEETING chance
    if (result.credibility >= (65 - backstageThresholdShift) || (isCorporate && result.credibility >= (50 - backstageThresholdShift))) {
      offers.push({
        offer_type: 'BRAND_SCOUT_MEETING',
        from_artist_id: null,  // system/scout
        payload: { reason: 'High credibility performance caught a scout\'s eye' },
      });
    }

    // High crowd_heat → STAGE_GUEST_SURPRISE with similar vibe artist
    if (result.crowd_heat >= (70 - backstageThresholdShift)) {
      // Find another artist in lineup with similar performance
      const partner = performanceResults.find(
        (r: any) => r.artist_id !== result.artist_id && r.crowd_heat >= 50 && Math.abs(r.crowd_heat - result.crowd_heat) < 30,
      );
      if (partner) {
        offers.push({
          offer_type: 'STAGE_GUEST_SURPRISE',
          from_artist_id: partner.artist_id,
          payload: { partner_name: 'Festival artist', reason: 'Hot crowd — surprise guest potential' },
        });
      }
    }

    // High conversion → FEATURE_SWAP suggestion
    if (result.conversion >= (40 - backstageThresholdShift)) {
      const swapPartner = performanceResults.find(
        (r: any) => r.artist_id !== result.artist_id && r.conversion >= 30,
      );
      if (swapPartner) {
        offers.push({
          offer_type: 'FEATURE_SWAP',
          from_artist_id: swapPartner.artist_id,
          payload: { reason: 'Strong audience overlap — collab potential' },
        });
      }
    }

    // General: REMIX_PERMISSION for moderate+ performers
    if (result.crowd_heat >= (45 - backstageThresholdShift) && result.credibility >= (40 - backstageThresholdShift)) {
      const remixPartner = performanceResults.find(
        (r: any) => r.artist_id !== result.artist_id && r.credibility >= 50,
      );
      if (remixPartner) {
        offers.push({
          offer_type: 'REMIX_PERMISSION',
          from_artist_id: remixPartner.artist_id,
          payload: { reason: 'Complementary styles — remix opportunity' },
        });
      }
    }

    // Limit to MAX_OFFERS_PER_DAY per artist
    const limited = offers.slice(0, MAX_OFFERS_PER_DAY);

    for (const offer of limited) {
      offersToCreate.push({
        festival_instance_id: festivalInstanceId,
        festival_instance_day_id: dayId,
        offer_type: offer.offer_type,
        from_artist_id: offer.from_artist_id,
        to_artist_id: result.artist_id,
        payload: offer.payload || {},
        created_turn_id: globalTurnId,
        expires_turn_id: expiresAt,
        status: 'OFFERED',
      });
    }
  }

  // Upsert (idempotent via unique constraint)
  for (const offer of offersToCreate) {
    try {
      await supabase.from('festival_backstage_offers').upsert(offer, {
        onConflict: 'to_artist_id,festival_instance_day_id,offer_type,from_artist_id',
        ignoreDuplicates: true,
      });
    } catch (_) {}
  }

  // Notify recipients
  for (const offer of offersToCreate) {
    const typeLabel = offer.offer_type.replace(/_/g, ' ').toLowerCase();
    const isScout = !offer.from_artist_id;
    try {
      await insertNotificationIdempotent(supabase, {
        player_id: offer.to_artist_id,
        global_turn_id: globalTurnId,
        created_turn_index: globalTurnId,
        type: 'FESTIVAL_BACKSTAGE_OFFER',
        title: isScout ? 'A scout wants a meeting' : `Backstage deal: ${typeLabel}`,
        subtitle: `Day ${dayIndex} · expires in ${OFFER_TTL_TURNS} turns`,
        body: offer.payload?.reason || `New backstage opportunity available.`,
        priority: 'medium',
        is_read: false,
        idempotency_key: `backstage_offer:${offer.to_artist_id}:${festivalInstanceId}:${dayIndex}:${offer.offer_type}:${offer.from_artist_id || 'system'}`,
        deep_links: { page: 'AmplifiApp', tab: 'backstage' },
      }, 'festivalBackstageModule.offer');
    } catch (_) {}
  }

  console.log(`[Amplifi Backstage] Generated ${offersToCreate.length} offers for day ${dayIndex}`);
}

// ── Accept/Decline an offer ──────────────────────────────────────────────────

export interface RespondOfferParams {
  offerId: string;
  artistId: string;
  accept: boolean;
  globalTurnId: number;
}

export async function respondToBackstageOffer(
  supabase: any,
  params: RespondOfferParams,
): Promise<{ success: boolean; error?: string }> {
  const { offerId, artistId, accept, globalTurnId } = params;

  if (!accept) {
    // Decline path: simple update, idempotent if already declined
    const { data: declined, error: declineErr } = await supabase
      .from('festival_backstage_offers')
      .update({ status: 'DECLINED' })
      .eq('id', offerId)
      .eq('to_artist_id', artistId)
      .eq('status', 'OFFERED')
      .select('id');
    if (declineErr) return { success: false, error: declineErr.message };
    if (!declined?.length) return { success: false, error: 'Offer not found or no longer available' };
    return { success: true };
  }

  // Accept path: use atomic RPC to prevent race with expiry (B-2 fix)
  const { data: accepted, error: acceptError } = await supabase.rpc('accept_backstage_offer', {
    p_offer_id: offerId,
    p_artist_id: artistId,
    p_turn_id: globalTurnId,
  });
  if (acceptError) return { success: false, error: acceptError.message };
  if (!accepted || accepted.length === 0) {
    return { success: false, error: 'Offer no longer available (expired or already claimed)' };
  }
  const offer = accepted[0];

  // Check daily accept cap (post-accept validation - if exceeded, revert)
  const { count: acceptCount } = await supabase
    .from('festival_backstage_offers')
    .select('id', { count: 'exact', head: true })
    .eq('to_artist_id', artistId)
    .eq('festival_instance_day_id', offer.festival_instance_day_id)
    .eq('status', 'ACCEPTED');

  if ((acceptCount ?? 0) > MAX_ACCEPTS_PER_DAY) {
    // Revert: we exceeded the cap
    await supabase
      .from('festival_backstage_offers')
      .update({ status: 'OFFERED', accepted_turn_id: null })
      .eq('id', offerId);
    return { success: false, error: `Max ${MAX_ACCEPTS_PER_DAY} deals per day` };
  }

  return { success: true };
}

// ── Resolve accepted deals at tick ───────────────────────────────────────────

export async function resolveAcceptedDeals(
  supabase: any,
  festivalInstanceId: string,
  globalTurnId: number,
): Promise<void> {
  // Find all ACCEPTED offers for this festival that haven't been resolved yet
  const { data: accepted } = await supabase
    .from('festival_backstage_offers')
    .select('*')
    .eq('festival_instance_id', festivalInstanceId)
    .eq('status', 'ACCEPTED');

  if (!accepted?.length) return;

  // Check which ones already have deals created
  const offerIds = accepted.map((a: any) => a.id);
  const { data: existingDeals } = await supabase
    .from('festival_backstage_deals')
    .select('offer_id')
    .in('offer_id', offerIds);

  const resolvedOfferIds = new Set((existingDeals || []).map((d: any) => d.offer_id));

  for (const offer of accepted) {
    if (resolvedOfferIds.has(offer.id)) continue;

    const effects = DEAL_EFFECTS[offer.offer_type as DealType];
    if (!effects) continue;

    const dealPayload: any = {
      offer_type: offer.offer_type,
      effects_a: effects.a,
      effects_b: effects.b,
      original_payload: offer.payload,
    };

    // Create the resolved deal and get its ID for artifact linkage
    let dealId: string | null = null;
    try {
      const { data: insertedDeal, error: dealErr } = await supabase
        .from('festival_backstage_deals')
        .insert({
          festival_instance_id: festivalInstanceId,
          festival_instance_day_id: offer.festival_instance_day_id,
          deal_type: offer.offer_type,
          artist_a_id: offer.to_artist_id,
          artist_b_id: offer.from_artist_id,
          offer_id: offer.id,
          payload: dealPayload,
          resolved_turn_id: globalTurnId,
          effects_applied: false,
        })
        .select('id')
        .single();
      
      if (dealErr) {
        console.error(`[BACKSTAGE_DEAL_INSERT_FAIL] offerId=${offer.id}:`, dealErr?.message);
        continue;
      }
      dealId = insertedDeal?.id;
    } catch (err: any) {
      console.error(`[BACKSTAGE_DEAL_INSERT_FAIL] offerId=${offer.id}:`, err?.message);
      continue;
    }

    if (!dealId) {
      console.error(`[BACKSTAGE_DEAL_NO_ID] offerId=${offer.id}: insert succeeded but no ID returned`);
      continue;
    }

    // Apply immediate effects (clout bumps, brand interest tokens)
    await applyDealEffects(supabase, offer, effects, globalTurnId);

    // ─── APPROACH C: Mint follow-through artifacts ───────────────────────────
    const artifactResult = await mintFollowThroughArtifacts(
      supabase,
      dealId,
      offer.offer_type as DealType,
      offer.to_artist_id,
      offer.from_artist_id,
      globalTurnId,
      dealPayload,
    );

    if (artifactResult.minted) {
      console.log(`[BACKSTAGE_ARTIFACT_MINTED] dealId=${dealId} type=${artifactResult.artifactType} artifactId=${artifactResult.artifactId}`);
    } else if (artifactResult.duplicate) {
      console.log(`[BACKSTAGE_ARTIFACT_DUPLICATE] dealId=${dealId} type=${artifactResult.artifactType} (idempotent)`);
    } else if (artifactResult.error) {
      console.error(`[BACKSTAGE_ARTIFACT_ERROR] dealId=${dealId} type=${artifactResult.artifactType}: ${artifactResult.error}`);
    }

    // Mark offer as RESOLVED
    await supabase
      .from('festival_backstage_offers')
      .update({ status: 'RESOLVED' })
      .eq('id', offer.id);

    // Mark deal as effects_applied
    await supabase
      .from('festival_backstage_deals')
      .update({ effects_applied: true })
      .eq('offer_id', offer.id);

    // ─── Notification: Deal resolved (with artifact-aware deep link) ─────────
    const typeLabel = offer.offer_type.replace(/_/g, ' ').toLowerCase();
    const artifactDeepLink = artifactResult.minted 
      ? getArtifactDeepLink(artifactResult.artifactType)
      : { page: 'AmplifiApp', tab: 'backstage' };
    
    const hasArtifact = artifactResult.minted && artifactResult.artifactType;
    const artifactSuffix = hasArtifact ? ` Check your ${artifactResult.artifactType === 'collaboration_requests' ? 'collaborations' : artifactResult.artifactType === 'tour_support_invites' ? 'tour invites' : 'sync leads'}.` : '';

    try {
      await insertNotificationIdempotent(supabase, {
        player_id: offer.to_artist_id,
        global_turn_id: globalTurnId,
        created_turn_index: globalTurnId,
        type: 'FESTIVAL_BACKSTAGE_RESOLVED',
        title: `Backstage deal resolved`,
        subtitle: typeLabel,
        body: `Your ${typeLabel} deal has been locked in. Effects are now active.${artifactSuffix}`,
        priority: 'medium',
        is_read: false,
        idempotency_key: `backstage_resolved:${offer.to_artist_id}:${offer.id}`,
        deep_links: artifactDeepLink,
      }, 'festivalBackstageModule.resolvedRecipient');
    } catch (_) {}

    // ─── Artifact-specific notification for recipient ────────────────────────
    if (artifactResult.minted && artifactResult.artifactType) {
      try {
        const artifactNotif = buildArtifactNotification(
          artifactResult.artifactType,
          offer.to_artist_id,
          globalTurnId,
          dealId,
          artifactDeepLink,
          artifactResult.artifactData,
        );
        if (artifactNotif) {
          await insertNotificationIdempotent(supabase, artifactNotif, 'festivalBackstageModule.artifactMinted');
        }
      } catch (_) {}
    }

    // ─── Notify the other party if it's an artist deal ───────────────────────
    if (offer.from_artist_id) {
      try {
        await insertNotificationIdempotent(supabase, {
          player_id: offer.from_artist_id,
          global_turn_id: globalTurnId,
          created_turn_index: globalTurnId,
          type: 'FESTIVAL_BACKSTAGE_RESOLVED',
          title: `Backstage deal accepted`,
          subtitle: typeLabel,
          body: `Your ${typeLabel} offer was accepted. Deal effects are now active.`,
          priority: 'medium',
          is_read: false,
          idempotency_key: `backstage_resolved:${offer.from_artist_id}:${offer.id}`,
          deep_links: { page: 'AmplifiApp', tab: 'backstage' },
        }, 'festivalBackstageModule.resolvedSender');
      } catch (_) {}
    }
  }
}

/**
 * Build artifact-specific notification for UI discoverability.
 */
function buildArtifactNotification(
  artifactType: string,
  playerId: string,
  globalTurnId: number,
  dealId: string,
  deepLink: { page: string; tab?: string },
  artifactData: any,
): any | null {
  switch (artifactType) {
    case 'collaboration_requests':
      return {
        player_id: playerId,
        global_turn_id: globalTurnId,
        created_turn_index: globalTurnId,
        type: 'COLLABORATION_REQUEST',
        title: 'New collaboration request',
        subtitle: 'From festival connection',
        body: 'A festival backstage deal has turned into a collaboration request. Check your collabs to respond.',
        priority: 'medium',
        is_read: false,
        idempotency_key: `backstage_artifact:${dealId}:collab`,
        deep_links: deepLink,
        metrics: {
          collaboration_id: artifactData?.id || null,
          collaboration_type: artifactData?.collaboration_type || null,
          status: artifactData?.status || 'pending',
          source_backstage_deal_id: dealId,
        },
        payload: {
          collaboration_id: artifactData?.id || null,
          source_backstage_deal_id: dealId,
        },
      };
    case 'tour_support_invites':
      return {
        player_id: playerId,
        global_turn_id: globalTurnId,
        created_turn_index: globalTurnId,
        type: 'TOURING_INVITE',
        title: 'Tour support invitation',
        subtitle: 'From festival connection',
        body: 'A festival backstage deal has turned into a tour support invitation! Check Touring to redeem.',
        priority: 'medium',
        is_read: false,
        idempotency_key: `backstage_artifact:${dealId}:tour`,
        deep_links: deepLink,
        metrics: {
          invite_id: artifactData?.id || null,
          support_invite_id: artifactData?.id || null,
          headliner_id: artifactData?.headliner_id || null,
          opener_id: artifactData?.opener_id || null,
          status: artifactData?.status || 'PENDING',
          expires_turn_id: artifactData?.expires_turn_id ?? null,
          source_backstage_deal_id: dealId,
        },
        payload: {
          invite_id: artifactData?.id || null,
          support_invite_id: artifactData?.id || null,
          status: artifactData?.status || 'PENDING',
          expires_turn_id: artifactData?.expires_turn_id ?? null,
          source_backstage_deal_id: dealId,
        },
      };
    case 'sync_pitch_leads':
      return {
        player_id: playerId,
        global_turn_id: globalTurnId,
        created_turn_index: globalTurnId,
        type: 'SYNC_PITCH_LEAD',
        title: 'New sync licensing lead',
        subtitle: 'From festival connection',
        body: 'A festival backstage deal has turned into a sync pitch opportunity! Check Studio Licensing.',
        priority: 'medium',
        is_read: false,
        idempotency_key: `backstage_artifact:${dealId}:sync`,
        deep_links: deepLink,
        metrics: {
          lead_id: artifactData?.id || null,
          from_artist_id: artifactData?.from_artist_id || null,
          status: artifactData?.status || 'NEW',
          expires_turn_id: artifactData?.expires_turn_id ?? null,
          usage_type: artifactData?.pitch?.usage_type || null,
          fee_range: artifactData?.pitch?.fee_range || null,
          source_backstage_deal_id: dealId,
        },
        payload: {
          lead_id: artifactData?.id || null,
          status: artifactData?.status || 'NEW',
          expires_turn_id: artifactData?.expires_turn_id ?? null,
          usage_type: artifactData?.pitch?.usage_type || null,
          fee_range: artifactData?.pitch?.fee_range || null,
          source_backstage_deal_id: dealId,
        },
      };
    default:
      return null;
  }
}

// ── Apply deal effects to profiles ───────────────────────────────────────────

async function applyDealEffects(
  supabase: any,
  offer: any,
  effects: { a: Partial<DealEffects>; b: Partial<DealEffects> },
  globalTurnId: number,
): Promise<void> {
  // Apply clout bump to artist_a (the accepter) — atomic to prevent race (B-4 fix)
  if (effects.a.clout_bump) {
    await supabase.rpc('bump_clout', { p_artist_id: offer.to_artist_id, p_delta: effects.a.clout_bump });
  }

  if (effects.a.brand_interest_tokens) {
    // Store as a temporary buff via player_brand_stats
    try {
      await supabase.from('player_brand_stats').upsert({
        artist_id: offer.to_artist_id,
        platform: 'all',
        festival_brand_boost: effects.a.brand_interest_tokens * 20,
        festival_boost_expires_turn: globalTurnId + (effects.a.brand_interest_duration || 72),
        last_brand_turn: globalTurnId,
      }, { onConflict: 'artist_id,platform' });
    } catch (err: any) {
      console.error(`[FESTIVAL_BRAND_STATS_FAIL] artist=${offer.to_artist_id} turn=${globalTurnId}:`, err?.message);
    }
  }

  // Apply clout bump to artist_b (the offerer) — atomic to prevent race (B-4 fix)
  if (offer.from_artist_id && effects.b.clout_bump) {
    await supabase.rpc('bump_clout', { p_artist_id: offer.from_artist_id, p_delta: effects.b.clout_bump });
  }
}

// ── Mint follow-through artifacts by deal type ───────────────────────────────

interface ArtifactMintResult {
  minted: boolean;
  artifactType: string | null;
  artifactId: string | null;
  artifactData: any | null;
  duplicate: boolean;
  error: string | null;
}

/**
 * Mint follow-through artifacts for resolved backstage deals.
 * Idempotent: Uses source_backstage_deal_id unique constraints to prevent duplicates.
 * 
 * Artifact types by deal:
 *   FEATURE_SWAP, REMIX_PERMISSION → collaboration_requests row
 *   TOURING_INVITE → tour_support_invites token row  
 *   SYNC_PITCH → sync_pitch_leads row
 *   BRAND_SCOUT_MEETING → no artifact (boost already applied via applyDealEffects)
 *   STAGE_GUEST_SURPRISE → no artifact (performance effects only)
 */
async function mintFollowThroughArtifacts(
  supabase: any,
  dealId: string,
  dealType: DealType,
  artistA: string,      // accepter/recipient (to_artist_id from offer)
  artistB: string | null, // offerer (from_artist_id from offer), null for system deals
  globalTurnId: number,
  payload: any,
): Promise<ArtifactMintResult> {
  const expiresAt = globalTurnId + ARTIFACT_TTL_TURNS;

  switch (dealType) {
    case 'FEATURE_SWAP':
    case 'REMIX_PERMISSION': {
      // Create collaboration_requests row linking back to this deal
      if (!artistB) {
        return { minted: false, artifactType: null, artifactId: null, artifactData: null, duplicate: false, error: 'No partner artist for collab deal' };
      }
      
      const collabType = dealType === 'FEATURE_SWAP' ? 'Feature' : 'Remix';
      const concept = payload?.original_payload?.reason || `Festival backstage ${collabType.toLowerCase()} opportunity`;
      
      const { data: inserted, error: collabErr } = await supabase
        .from('collaboration_requests')
        .insert({
          requester_artist_id: artistB,  // offerer proposes
          target_artist_id: artistA,      // accepter receives
          collaboration_type: collabType,
          status: 'pending',
          proposed_concept: concept,
          energy_cost_split: 0.5,
          revenue_split: 0.5,
          requester_energy_cost: 10,
          target_energy_cost: 10,
          source_backstage_deal_id: dealId,
        })
        .select('id, collaboration_type, status, requester_artist_id, target_artist_id')
        .single();

      if (collabErr) {
        // Check for unique constraint violation (duplicate)
        if (collabErr.code === '23505') {
          return { minted: false, artifactType: 'collaboration_requests', artifactId: null, artifactData: null, duplicate: true, error: null };
        }
        console.error(`[BACKSTAGE_ARTIFACT_FAIL] collab dealId=${dealId}:`, collabErr?.message);
        return { minted: false, artifactType: 'collaboration_requests', artifactId: null, artifactData: null, duplicate: false, error: collabErr.message };
      }
      
      return { minted: true, artifactType: 'collaboration_requests', artifactId: inserted?.id || null, artifactData: inserted || null, duplicate: false, error: null };
    }

    case 'TOURING_INVITE': {
      // Create tour_support_invites token row
      if (!artistB) {
        return { minted: false, artifactType: null, artifactId: null, artifactData: null, duplicate: false, error: 'No headliner for touring invite' };
      }

      const { data: inserted, error: tourErr } = await supabase
        .from('tour_support_invites')
        .insert({
          source_backstage_deal_id: dealId,
          headliner_id: artistB,   // offerer is the headliner inviting
          opener_id: artistA,       // accepter is the opener being invited
          status: 'PENDING',
          created_turn_id: globalTurnId,
          expires_turn_id: expiresAt,
          payload: {
            suggested_revenue_split: 0.20,
            suggested_attendance_boost: 1.10,
            origin: 'festival_backstage',
            concept: payload?.original_payload?.reason || 'Festival backstage touring opportunity',
          },
        })
        .select('id, headliner_id, opener_id, status, expires_turn_id')
        .single();

      if (tourErr) {
        if (tourErr.code === '23505') {
          return { minted: false, artifactType: 'tour_support_invites', artifactId: null, artifactData: null, duplicate: true, error: null };
        }
        console.error(`[BACKSTAGE_ARTIFACT_FAIL] tour dealId=${dealId}:`, tourErr?.message);
        return { minted: false, artifactType: 'tour_support_invites', artifactId: null, artifactData: null, duplicate: false, error: tourErr.message };
      }

      return { minted: true, artifactType: 'tour_support_invites', artifactId: inserted?.id || null, artifactData: inserted || null, duplicate: false, error: null };
    }

    case 'SYNC_PITCH': {
      // Create sync_pitch_leads row for Studio/Licensing
      const { data: inserted, error: syncErr } = await supabase
        .from('sync_pitch_leads')
        .insert({
          source_backstage_deal_id: dealId,
          player_id: artistA,           // recipient of the sync opportunity
          from_artist_id: artistB,      // may be null for system-generated leads
          status: 'NEW',
          created_turn_id: globalTurnId,
          expires_turn_id: expiresAt,
          pitch: {
            brief: payload?.original_payload?.reason || 'Sync licensing opportunity from festival connection',
            fee_range: { min: 5000, max: 25000 },  // reasonable defaults
            usage_type: 'tv_film',
            genre_fit: [],
            origin: 'festival_backstage',
          },
        })
        .select('id, from_artist_id, status, expires_turn_id, pitch')
        .single();

      if (syncErr) {
        if (syncErr.code === '23505') {
          return { minted: false, artifactType: 'sync_pitch_leads', artifactId: null, artifactData: null, duplicate: true, error: null };
        }
        console.error(`[BACKSTAGE_ARTIFACT_FAIL] sync dealId=${dealId}:`, syncErr?.message);
        return { minted: false, artifactType: 'sync_pitch_leads', artifactId: null, artifactData: null, duplicate: false, error: syncErr.message };
      }

      return { minted: true, artifactType: 'sync_pitch_leads', artifactId: inserted?.id || null, artifactData: inserted || null, duplicate: false, error: null };
    }

    case 'BRAND_SCOUT_MEETING':
    case 'STAGE_GUEST_SURPRISE':
    default:
      // No follow-through artifact for these types (boost/effects already applied)
      return { minted: false, artifactType: null, artifactId: null, artifactData: null, duplicate: false, error: null };
  }
}

/**
 * Get deep link target for a minted artifact type.
 */
function getArtifactDeepLink(artifactType: string | null): { page: string; tab?: string } {
  switch (artifactType) {
    case 'collaboration_requests':
      return { page: 'Social', tab: 'collaborations' };
    case 'tour_support_invites':
      return { page: 'TouringAppV2', tab: 'invites' };
    case 'sync_pitch_leads':
      return { page: 'Studio', tab: 'licensing' };
    default:
      return { page: 'AmplifiApp', tab: 'history' };
  }
}

// ── Expire stale offers ──────────────────────────────────────────────────────

export async function expireStaleOffers(
  supabase: any,
  globalTurnId: number,
): Promise<void> {
  try {
    await supabase
      .from('festival_backstage_offers')
      .update({ status: 'EXPIRED' })
      .eq('status', 'OFFERED')
      .lt('expires_turn_id', globalTurnId);
  } catch (_) {}
}

export async function pruneExpiredArtifacts(
  supabase: any,
  globalTurnId: number,
): Promise<void> {
  const pruneBeforeTurn = globalTurnId - ARTIFACT_PRUNE_GRACE_TURNS;
  if (pruneBeforeTurn <= 0) return;

  try {
    await Promise.all([
      supabase
        .from('tour_support_invites')
        .delete()
        .lt('expires_turn_id', pruneBeforeTurn),
      supabase
        .from('sync_pitch_leads')
        .delete()
        .lt('expires_turn_id', pruneBeforeTurn),
    ]);
  } catch (_) {}
}

// ── Get backstage effects for a specific artist for performance resolution ───

export async function getBackstageEffectsForArtist(
  supabase: any,
  festivalInstanceId: string,
  artistId: string,
): Promise<{
  credibility_boost: number;
  conversion_boost: number;
  moment_card_boost: string[];
  moment_card_penalty: string[];
}> {
  const result = {
    credibility_boost: 0,
    conversion_boost: 0,
    moment_card_boost: [] as string[],
    moment_card_penalty: [] as string[],
  };

  // Find resolved deals where this artist is party a or b
  const { data: deals } = await supabase
    .from('festival_backstage_deals')
    .select('deal_type, artist_a_id, artist_b_id, payload')
    .eq('festival_instance_id', festivalInstanceId)
    .eq('effects_applied', true)
    .or(`artist_a_id.eq.${artistId},artist_b_id.eq.${artistId}`);

  if (!deals?.length) return result;

  for (const deal of deals) {
    const isA = deal.artist_a_id === artistId;
    const effects = isA ? deal.payload?.effects_a : deal.payload?.effects_b;
    if (!effects) continue;

    result.credibility_boost += effects.credibility_boost || 0;
    result.conversion_boost += effects.conversion_boost || 0;
    if (effects.moment_card_boost) result.moment_card_boost.push(...effects.moment_card_boost);
    if (effects.moment_card_penalty) result.moment_card_penalty.push(...effects.moment_card_penalty);
  }

  return result;
}
