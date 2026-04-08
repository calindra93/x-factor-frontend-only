/**
 * SAMPLE CLEARANCE MODULE — Lean v1
 *
 * Handles:
 *  - Song valuation (quality * lifetime_streams * BASE_RATE)
 *  - requestSample()  — validate, calculate cost, insert request, notify source artist
 *  - respondToSampleRequest() — approve/reject, transactional fee transfer, notify requester
 *  - completeSampleRequest() — called when derivative song is created, links new_song_id
 *  - getSampleRequestsForArtist() — fetch pending/active requests for UI
 *
 * Reuses existing songs columns: original_song_id, is_remix, remix_type
 * Does NOT introduce new revenue tracking — fee transfer uses existing income delta pattern
 */

import { supabaseAdmin } from './lib/supabaseAdmin.ts';

// ─── Constants ───────────────────────────────────────────────────────────────

/** Per-stream rate used for song valuation. Configurable. */
const SAMPLE_BASE_RATE = 0.0005;

/** Minimum fee a requester must offer (prevents $0 lowball requests) */
const MIN_SAMPLE_FEE = 50;

/** Maximum pending requests a single artist can have open at once */
const MAX_PENDING_REQUESTS = 10;

const SAMPLE_ROYALTY_BY_TIER: Record<string, number> = {
  common: 0.05,
  viral: 0.1,
  rare: 0.1,
  legendary: 0.15,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function N(v: unknown): number { return Number(v) || 0; }

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function computeArtistSizeScore(clout: number, followers: number, lifetimeStreams: number): number {
  return clamp(
    Math.round(
      (Math.min(45, clout / 40))
      + (Math.min(30, followers / 50000))
      + (Math.min(25, lifetimeStreams / 200000))
    ),
    0,
    100,
  );
}

function derivePlayerSampleTier(params: { quality: number; valuation: number; artistSizeScore: number; lifetimeStreams: number }): 'common' | 'viral' | 'rare' | 'legendary' {
  const quality = N(params.quality);
  const valuation = N(params.valuation);
  const artistSizeScore = N(params.artistSizeScore);
  const lifetimeStreams = N(params.lifetimeStreams);
  const qualityScore = Math.min(34, Math.max(0, (quality - 58) * 0.8));
  const valuationScore = Math.min(16, valuation / 250);
  const artistScaleScore = Math.min(8, artistSizeScore / 4.5);
  const streamScore = Math.min(10, lifetimeStreams / 450000);
  const score = qualityScore + valuationScore + artistScaleScore + streamScore;

  const isLegendary = quality >= 97
    && valuation >= 22000
    && lifetimeStreams >= 5000000
    && artistSizeScore >= 28
    && score >= 58;

  if (isLegendary) return 'legendary';
  if (score >= 43 || (quality >= 90 && (valuation >= 5000 || lifetimeStreams >= 700000))) return 'rare';
  if (score >= 29 || (quality >= 78 && (valuation >= 1400 || lifetimeStreams >= 140000))) return 'viral';
  return 'common';
}

function buildPlayerSongSamplingProfile(params: {
  title: string;
  artistName: string;
  genre: string;
  quality: number;
  valuation: number;
  lifetimeStreams: number;
  artistSizeScore: number;
}) {
  const tier = derivePlayerSampleTier(params);
  const tierRiskBase = { common: 10, viral: 16, rare: 24, legendary: 34 }[tier];
  const tierClearanceTurns = { common: 1, viral: 1, rare: 2, legendary: 3 }[tier];
  const tierQualityBoost = { common: 4, viral: 6, rare: 8, legendary: 12 }[tier];
  const tierCloutBoost = { common: 2, viral: 4, rare: 7, legendary: 11 }[tier];
  const scaledRisk = clamp(Math.round(tierRiskBase + (params.artistSizeScore * 0.45)), 8, 92);

  return {
    tier,
    base_cost: Math.max(MIN_SAMPLE_FEE, Math.round(params.valuation)),
    controversy_risk: scaledRisk,
    clearance_turns: tierClearanceTurns,
    quality_boost: tierQualityBoost,
    clout_boost: tierCloutBoost,
    description: `Released track by ${params.artistName} · ${params.genre} · Q${params.quality}`,
    royalty_rate: SAMPLE_ROYALTY_BY_TIER[tier],
  };
}

function isSongReleased(song: { release_status?: string | null; status?: string | null; release_id?: string | null } | null | undefined): boolean {
  if (!song) return false;
  return song.release_status === 'released' || song.status === 'released' || !!song.release_id;
}

// ─── Song Valuation ───────────────────────────────────────────────────────────

/**
 * Calculate the fair market value of a song for sample clearance purposes.
 * value = quality * lifetime_streams * BASE_RATE
 * Streams are derived from release data — no redundant counters introduced.
 */
export async function calculateSongValuation(songId: string): Promise<number> {
  const supabase = supabaseAdmin;

  // Fetch song quality
  const { data: song } = await supabase
    .from('songs')
    .select('quality, release_id')
    .eq('id', songId)
    .single();

  if (!song) return 0;

  const quality = N(song.quality);

  // Derive lifetime streams from release data
  let lifetimeStreams = 0;
  if (song.release_id) {
    const { data: release } = await supabase
      .from('releases')
      .select('lifetime_streams')
      .eq('id', song.release_id)
      .single();
    lifetimeStreams = N(release?.lifetime_streams);
  }

  // Floor: even unreleased songs have a minimum valuation based on quality
  const baseValue = Math.max(100, Math.floor(quality * Math.max(lifetimeStreams, 200) * SAMPLE_BASE_RATE));
  return baseValue;
}

// ─── Request Sample ───────────────────────────────────────────────────────────

export interface RequestSampleParams {
  requesterId: string;
  sourceSongId: string;
  feeOffered: number;
  message?: string;
  globalTurnId: number;
  clearanceStrategy?: 'direct' | 'anonymous_flip' | 'underground';
  songId?: string;
}

export async function requestSample(params: RequestSampleParams): Promise<{
  success: boolean;
  requestId?: string;
  songValuation?: number;
  error?: string;
}> {
  const supabase = supabaseAdmin;
  const { requesterId, sourceSongId, feeOffered, message, globalTurnId, clearanceStrategy = 'direct', songId } = params;

  // 1. Validate fee
  if (clearanceStrategy === 'direct' && N(feeOffered) < MIN_SAMPLE_FEE) {
    return { success: false, error: `Minimum sample fee is $${MIN_SAMPLE_FEE}` };
  }

  // 2. Fetch source song — must exist, be released, and be sampleable
  const { data: sourceSong } = await supabase
    .from('songs')
    .select('id, artist_id, title, genre, quality, status, release_status, release_id, is_sampleable, is_remix')
    .eq('id', sourceSongId)
    .single();

  if (!sourceSong) return { success: false, error: 'Song not found' };
  if (sourceSong.artist_id === requesterId) return { success: false, error: 'Cannot sample your own song' };
  if (!sourceSong.is_sampleable) return { success: false, error: 'This song is not available for sampling' };
  if (!isSongReleased(sourceSong)) return { success: false, error: 'Can only sample released songs' };
  if (sourceSong.is_remix) return { success: false, error: 'Cannot sample a derivative work — only original songs' };

  // 3. Check no duplicate pending request for same song
  const { data: existing } = await supabase
    .from('sample_requests')
    .select('id')
    .eq('requester_id', requesterId)
    .eq('source_song_id', sourceSongId)
    .in('status', ['pending', 'approved'])
    .limit(1);

  if (existing && existing.length > 0) {
    return { success: false, error: 'You already have an open request for this song' };
  }

  // 4. Check max pending requests
  const { count: pendingCount } = await supabase
    .from('sample_requests')
    .select('id', { count: 'exact', head: true })
    .eq('requester_id', requesterId)
    .eq('status', 'pending');

  if (N(pendingCount) >= MAX_PENDING_REQUESTS) {
    return { success: false, error: `Maximum ${MAX_PENDING_REQUESTS} pending requests allowed` };
  }

  const { data: sourceArtist } = await supabase
    .from('profiles')
    .select('artist_name, clout, followers')
    .eq('id', sourceSong.artist_id)
    .maybeSingle();

  let lifetimeStreams = 0;
  if (sourceSong.release_id) {
    const { data: sourceRelease } = await supabase
      .from('releases')
      .select('lifetime_streams')
      .eq('id', sourceSong.release_id)
      .maybeSingle();
    lifetimeStreams = N(sourceRelease?.lifetime_streams);
  }

  // 6. Calculate song valuation
  const songValuation = await calculateSongValuation(sourceSongId);
  const artistSizeScore = computeArtistSizeScore(N(sourceArtist?.clout), N(sourceArtist?.followers), lifetimeStreams);
  const samplingProfile = buildPlayerSongSamplingProfile({
    title: sourceSong.title || 'Untitled',
    artistName: sourceArtist?.artist_name || 'Unknown',
    genre: sourceSong.genre || 'Music',
    quality: N(sourceSong.quality),
    valuation: songValuation,
    lifetimeStreams,
    artistSizeScore,
  });

  const effectiveFee = clearanceStrategy === 'underground'
    ? Math.max(MIN_SAMPLE_FEE, Math.floor(songValuation * 0.5))
    : clearanceStrategy === 'anonymous_flip'
      ? 0
      : N(feeOffered);

  // 5. Check requester has enough cash
  const { data: requester } = await supabase
    .from('profiles')
    .select('cash_balance')
    .eq('id', requesterId)
    .single();

  if (!requester) return { success: false, error: 'Requester not found' };
  if (N(requester.cash_balance) < effectiveFee) {
    return { success: false, error: `Insufficient funds. You have $${N(requester.cash_balance).toLocaleString()}, required is $${effectiveFee.toLocaleString()}` };
  }

  if (clearanceStrategy === 'direct' && effectiveFee < MIN_SAMPLE_FEE) {
    return { success: false, error: `Minimum sample fee is $${MIN_SAMPLE_FEE}` };
  }

  let clearanceStatus: 'pending' | 'unlicensed' = 'pending';
  let requestStatus: 'pending' | 'clearing' | 'completed' = 'pending';
  let controversyChance = 0;
  let clearanceTurnsRemaining = 0;

  if (clearanceStrategy === 'underground') {
    clearanceStatus = 'pending';
    requestStatus = 'clearing';
    controversyChance = clamp(Math.round(samplingProfile.controversy_risk * 0.65), 8, 95);
    clearanceTurnsRemaining = Math.max(1, samplingProfile.clearance_turns - 1);
  } else if (clearanceStrategy === 'anonymous_flip') {
    clearanceStatus = 'unlicensed';
    requestStatus = 'completed';
    controversyChance = clamp(Math.round(samplingProfile.controversy_risk * 1.15), 12, 99);
  }

  // 7. Insert request
  const { data: request, error: insertErr } = await supabase
    .from('sample_requests')
    .insert({
      requester_id: requesterId,
      source_song_id: sourceSongId,
      source_artist_id: sourceSong.artist_id,
      source_type: 'player_song',
      status: requestStatus,
      fee_offered: effectiveFee,
      fee_final: clearanceStrategy === 'anonymous_flip' ? 0 : null,
      clearance_strategy: clearanceStrategy,
      clearance_turns_remaining: clearanceTurnsRemaining,
      clearance_cost: effectiveFee,
      controversy_chance: controversyChance,
      song_valuation: songValuation,
      message: message || null,
      requested_turn: globalTurnId,
      new_song_id: songId || null,
    })
    .select('id')
    .single();

  if (insertErr || !request) {
    return { success: false, error: insertErr?.message || 'Failed to create request' };
  }

  // 8. Notify source artist
  await supabase.from('notifications').insert({
    artist_id: sourceSong.artist_id,
    type: 'SAMPLE_REQUEST_RECEIVED',
    title: 'Sample Request',
    message: `An artist wants to sample "${sourceSong.title}" using ${clearanceStrategy} and is offering $${effectiveFee.toLocaleString()}`,
    metadata: {
      request_id: request.id,
      requester_id: requesterId,
      source_song_id: sourceSongId,
      fee_offered: effectiveFee,
      song_valuation: songValuation,
      clearance_strategy: clearanceStrategy,
    },
    is_read: false,
    created_at: new Date().toISOString(),
  }).catch(() => {}); // Non-fatal

  if (songId) {
    const patch: Record<string, unknown> = {
      sampled_player_song_id: sourceSongId,
      sample_strategy: clearanceStrategy,
      sample_quality_boost: samplingProfile.quality_boost,
      sample_clout_boost: samplingProfile.clout_boost,
      sample_controversy_chance: controversyChance,
      sample_clearance_status: clearanceStatus,
    };

    if (clearanceStrategy === 'direct') {
      patch.sample_royalty_rate = samplingProfile.royalty_rate;
    }

    await supabase.from('songs').update(patch).eq('id', songId);
  }

  return { success: true, requestId: request.id, songValuation };
}

// ─── Respond To Sample Request ────────────────────────────────────────────────

export interface RespondToSampleParams {
  requestId: string;
  sourceArtistId: string;
  decision: 'approved' | 'rejected';
  responseMessage?: string;
  globalTurnId: number;
}

export async function respondToSampleRequest(params: RespondToSampleParams): Promise<{
  success: boolean;
  error?: string;
}> {
  const supabase = supabaseAdmin;
  const { requestId, sourceArtistId, decision, responseMessage, globalTurnId } = params;

  // 1. Fetch request — must be pending and owned by this source artist
  const { data: req } = await supabase
    .from('sample_requests')
    .select('*')
    .eq('id', requestId)
    .eq('source_artist_id', sourceArtistId)
    .eq('status', 'pending')
    .single();

  if (!req) return { success: false, error: 'Request not found or already actioned' };

  if (decision === 'rejected') {
    await supabase
      .from('sample_requests')
      .update({
        status: 'rejected',
        response_message: responseMessage || null,
        responded_turn: globalTurnId,
      })
      .eq('id', requestId);

    if (req.new_song_id) {
      await supabase
        .from('songs')
        .update({
          sample_clearance_status: 'denied',
          sample_controversy_chance: 0,
        })
        .eq('id', req.new_song_id);
    }

    // Notify requester
    await supabase.from('notifications').insert({
      artist_id: req.requester_id,
      type: 'SAMPLE_REQUEST_REJECTED',
      title: 'Sample Request Rejected',
      message: `Your sample request was rejected${responseMessage ? `: "${responseMessage}"` : ''}`,
      metadata: { request_id: requestId, source_song_id: req.source_song_id },
      is_read: false,
      created_at: new Date().toISOString(),
    }).catch(() => {});

    return { success: true };
  }

  // decision === 'approved' — transactional fee transfer
  const feeFinal = N(req.fee_offered);

  // 2. Deduct from requester
  const { data: requester } = await supabase
    .from('profiles')
    .select('cash_balance')
    .eq('id', req.requester_id)
    .single();

  if (!requester || N(requester.cash_balance) < feeFinal) {
    // Requester no longer has funds — auto-reject
    await supabase
      .from('sample_requests')
      .update({ status: 'rejected', response_message: 'Requester has insufficient funds', responded_turn: globalTurnId })
      .eq('id', requestId);
    return { success: false, error: 'Requester no longer has sufficient funds — request auto-rejected' };
  }

  // 3. Atomic transfer: deduct requester, credit source artist
  const { error: deductErr } = await supabase
    .from('profiles')
    .update({ cash_balance: N(requester.cash_balance) - feeFinal })
    .eq('id', req.requester_id);

  if (deductErr) return { success: false, error: 'Failed to deduct fee from requester' };

  const { data: sourceArtist } = await supabase
    .from('profiles')
    .select('cash_balance')
    .eq('id', sourceArtistId)
    .single();

  await supabase
    .from('profiles')
    .update({ cash_balance: N(sourceArtist?.cash_balance) + feeFinal })
    .eq('id', sourceArtistId);

  // 4. Update request status
  await supabase
    .from('sample_requests')
    .update({
      status: 'approved',
      fee_final: feeFinal,
      response_message: responseMessage || null,
      responded_turn: globalTurnId,
    })
    .eq('id', requestId);

  if (req.new_song_id && req.source_song_id) {
    const sourceSong = await supabase
      .from('songs')
      .select('id, title, genre, quality, release_id, profiles:artist_id(artist_name, clout, followers)')
      .eq('id', req.source_song_id)
      .maybeSingle();

    let lifetimeStreams = 0;
    const releaseId = sourceSong.data?.release_id;
    if (releaseId) {
      const release = await supabase
        .from('releases')
        .select('lifetime_streams')
        .eq('id', releaseId)
        .maybeSingle();
      lifetimeStreams = N(release.data?.lifetime_streams);
    }

    const artistSizeScore = computeArtistSizeScore(
      N(sourceSong.data?.profiles?.clout),
      N(sourceSong.data?.profiles?.followers),
      lifetimeStreams,
    );
    const profile = buildPlayerSongSamplingProfile({
      title: sourceSong.data?.title || 'Untitled',
      artistName: sourceSong.data?.profiles?.artist_name || 'Unknown',
      genre: sourceSong.data?.genre || 'Music',
      quality: N(sourceSong.data?.quality),
      valuation: req.song_valuation || 0,
      lifetimeStreams,
      artistSizeScore,
    });

    await supabase
      .from('songs')
      .update({
        sampled_player_song_id: req.source_song_id,
        sample_clearance_status: 'cleared',
        sample_controversy_chance: 0,
        sample_royalty_rate: profile.royalty_rate,
      })
      .eq('id', req.new_song_id);
  }

  // 5. Notify requester
  await supabase.from('notifications').insert({
    artist_id: req.requester_id,
    type: 'SAMPLE_REQUEST_APPROVED',
    title: 'Sample Cleared!',
    message: `Your sample request was approved. $${feeFinal.toLocaleString()} has been paid. You can now create your song.`,
    metadata: { request_id: requestId, source_song_id: req.source_song_id, fee_paid: feeFinal },
    is_read: false,
    created_at: new Date().toISOString(),
  }).catch(() => {});

  return { success: true };
}

// ─── Complete Sample Request ──────────────────────────────────────────────────

/**
 * Called after the requester creates their derivative song.
 * Links new_song_id to the request and marks it completed.
 */
export async function completeSampleRequest(params: {
  requestId: string;
  requesterId: string;
  newSongId: string;
  globalTurnId: number;
}): Promise<{ success: boolean; error?: string }> {
  const supabase = supabaseAdmin;
  const { requestId, requesterId, newSongId, globalTurnId } = params;

  const { data: req } = await supabase
    .from('sample_requests')
    .select('id, source_song_id, source_artist_id')
    .eq('id', requestId)
    .eq('requester_id', requesterId)
    .eq('status', 'approved')
    .single();

  if (!req) return { success: false, error: 'Approved request not found' };

  // Link new song and mark completed
  await supabase
    .from('sample_requests')
    .update({ status: 'completed', new_song_id: newSongId, completed_turn: globalTurnId })
    .eq('id', requestId);

  // Ensure the derivative song has correct linkage
  await supabase
    .from('songs')
    .update({ original_song_id: req.source_song_id, is_remix: true, remix_type: 'sample' })
    .eq('id', newSongId)
    .eq('artist_id', requesterId);

  return { success: true };
}

// ─── Get Sample Requests For Artist ──────────────────────────────────────────

/**
 * Returns both inbound (source_artist_id) and outbound (requester_id) requests.
 */
export async function getSampleRequestsForArtist(artistId: string): Promise<{
  inbound: any[];
  outbound: any[];
}> {
  const supabase = supabaseAdmin;

  const [inboundRes, outboundRes] = await Promise.all([
    supabase
      .from('sample_requests')
      .select('*, source_song:songs(id,title,quality,release_status), requester:artists(id,artist_name)')
      .eq('source_artist_id', artistId)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('sample_requests')
      .select('*, source_song:songs(id,title,quality,release_status), source_artist:artists(id,artist_name)')
      .eq('requester_id', artistId)
      .order('created_at', { ascending: false })
      .limit(50),
  ]);

  return {
    inbound: inboundRes.data || [],
    outbound: outboundRes.data || [],
  };
}

// ─── Get Sampleable Songs ─────────────────────────────────────────────────────

/**
 * Returns released songs from other artists that have opted in to sampling.
 * Used by the Studio UI to populate the sample browser.
 */
export async function getSampleableSongs(requesterId: string, limit = 50): Promise<any[]> {
  const supabase = supabaseAdmin;

  const { data } = await supabase
    .from('songs')
    .select('id, title, genre, quality, status, release_status, release_id, is_remix, is_sampleable, artist_id, profiles(artist_name, clout, followers)')
    .neq('artist_id', requesterId)
    .order('quality', { ascending: false })
    .limit(limit);

  const releasedOriginalSongs = (data || []).filter((song: any) => !song.is_remix && isSongReleased(song));
  const explicitlySampleableSongs = releasedOriginalSongs.filter((song: any) => !!song.is_sampleable);
  const songsToUse = explicitlySampleableSongs.length > 0 ? explicitlySampleableSongs : releasedOriginalSongs;

  const releaseIds = songsToUse.map((song: any) => song.release_id).filter(Boolean);
  const releaseMap = new Map<string, any>();
  if (releaseIds.length > 0) {
    const { data: releases } = await supabase
      .from('releases')
      .select('id, lifetime_streams')
      .in('id', releaseIds);
    (releases || []).forEach((release: any) => releaseMap.set(release.id, release));
  }

  const enrichedSongs = await Promise.all(songsToUse.map(async (song: any) => {
    const valuation = await calculateSongValuation(song.id);
    const release = song.release_id ? releaseMap.get(song.release_id) : null;
    const lifetimeStreams = N(release?.lifetime_streams);
    const artistSizeScore = computeArtistSizeScore(N(song?.profiles?.clout), N(song?.profiles?.followers), lifetimeStreams);
    const profile = buildPlayerSongSamplingProfile({
      title: song.title || 'Untitled',
      artistName: song?.profiles?.artist_name || 'Unknown',
      genre: song.genre || 'Music',
      quality: N(song.quality),
      valuation,
      lifetimeStreams,
      artistSizeScore,
    });

    return {
      id: song.id,
      source_song_id: song.id,
      source_type: 'player_song',
      name: song.title || 'Untitled',
      artist_name: song?.profiles?.artist_name || 'Unknown',
      genre: song.genre || 'Music',
      quality: N(song.quality),
      artist_size_score: artistSizeScore,
      valuation,
      ...profile,
      is_active: true,
    };
  }));

  return enrichedSongs.sort((a: any, b: any) => {
    const tierRank = { legendary: 4, rare: 3, viral: 2, common: 1 } as Record<string, number>;
    const tierDelta = (tierRank[b.tier] || 0) - (tierRank[a.tier] || 0);
    if (tierDelta !== 0) return tierDelta;
    return N(b.valuation) - N(a.valuation);
  });
}

// ─── NPC Sample Source Request ────────────────────────────────────────────────

/**
 * Request clearance for a predefined NPC sample source.
 * Called from the Write Song Wizard or Licensing UI.
 * clearanceStrategy: 'direct' | 'anonymous_flip' | 'underground'
 */
export async function requestNPCSample(params: {
  requesterId: string;
  sampleSourceId: string;
  clearanceStrategy: 'direct' | 'anonymous_flip' | 'underground';
  songId?: string; // if song already created
  globalTurnId: number;
}): Promise<{ success: boolean; requestId?: string; clearanceStatus?: string; controversyChance?: number; cost?: number; error?: string }> {
  const supabase = supabaseAdmin;
  const { requesterId, sampleSourceId, clearanceStrategy, songId, globalTurnId } = params;

  // 1. Fetch sample source
  const { data: source } = await supabase
    .from('sample_sources')
    .select('*')
    .eq('id', sampleSourceId)
    .eq('is_active', true)
    .single();

  if (!source) return { success: false, error: 'Sample source not found' };

  // 2. Calculate cost & controversy based on strategy
  let cost = 0;
  let controversyChance = 0;
  let clearanceStatus: string = 'none';
  let turnsToResolve = 0;

  if (clearanceStrategy === 'direct') {
    // High cost, low risk — pay upfront, wait for clearance
    cost = source.base_cost;
    controversyChance = 0;
    clearanceStatus = 'pending';
    turnsToResolve = source.clearance_turns;
  } else if (clearanceStrategy === 'underground') {
    // Medium cost, moderate risk — cheaper but may fail
    cost = Math.floor(source.base_cost * 0.5);
    controversyChance = Math.floor(source.controversy_risk * 0.5);
    clearanceStatus = 'pending';
    turnsToResolve = Math.max(1, source.clearance_turns - 1);
  } else if (clearanceStrategy === 'anonymous_flip') {
    // No cost, high risk — immediate use but unlicensed
    cost = 0;
    controversyChance = source.controversy_risk;
    clearanceStatus = 'unlicensed';
    turnsToResolve = 0;
  }

  // 3. Check requester can afford it
  if (cost > 0) {
    const { data: requester } = await supabase
      .from('profiles')
      .select('income')
      .eq('id', requesterId)
      .single();

    const cash = N(requester?.income);
    if (cash < cost) {
      return { success: false, error: `Insufficient funds. Need $${cost.toLocaleString()}, have $${cash.toLocaleString()}` };
    }

    // Deduct cost
    await supabase
      .from('profiles')
      .update({ income: cash - cost })
      .eq('id', requesterId);
  }

  // 4. Insert sample request (NPC type)
  const { data: request, error: insertErr } = await supabase
    .from('sample_requests')
    .insert({
      requester_id: requesterId,
      source_song_id: null, // NULL for NPC samples (no actual source song)
      source_artist_id: null, // NULL for NPC samples
      source_type: 'npc',
      sample_source_id: sampleSourceId,
      status: clearanceStrategy === 'anonymous_flip' ? 'completed' : 'clearing',
      fee_offered: cost,
      fee_final: cost,
      clearance_strategy: clearanceStrategy,
      clearance_turns_remaining: turnsToResolve,
      clearance_cost: cost,
      controversy_chance: controversyChance,
      song_valuation: source.base_cost,
      requested_turn: globalTurnId,
      new_song_id: songId || null,
    })
    .select('id')
    .single();

  if (insertErr || !request) {
    return { success: false, error: insertErr?.message || 'Failed to create request' };
  }

  // 5. If song already linked, update its sample fields
  if (songId) {
    await supabase.from('songs').update({
      sample_source_id: sampleSourceId,
      sample_clearance_status: clearanceStatus,
      sample_strategy: clearanceStrategy,
      sample_controversy_chance: controversyChance,
      sample_quality_boost: source.quality_boost,
      sample_clout_boost: source.clout_boost,
    }).eq('id', songId);
  }

  return {
    success: true,
    requestId: request.id,
    clearanceStatus,
    controversyChance,
    cost,
  };
}

// ─── Turn Engine: Process Sample Clearance ────────────────────────────────────

/**
 * Called once per player per turn by the turn engine.
 * Processes:
 *  1. NPC clearance requests (tick down turns, resolve success/failure)
 *  2. Controversy checks for unlicensed samples on active songs
 */
export async function processSampleClearanceForPlayer(player: any, globalTurnId: number, entities: any, ctx: any = {}) {
  const supabase = supabaseAdmin;
  const notifications: any[] = [];
  const turnEvents: any[] = [];
  const artistProfileDelta: Record<string, any> = {};
  const sampleRequestUpdates: any[] = [];
  const songsUpdates: any[] = [];
  const releasesUpdates: any[] = [];

  // --- 1. PROCESS PENDING NPC CLEARANCE REQUESTS ---
  const { data: pendingRequests } = await supabase
    .from('sample_requests')
    .select('*, sample_sources(*), source_song:songs!sample_requests_source_song_id_fkey(id, title, genre, quality, artist_id, profiles(artist_name, clout, followers), releases:lifetime_streams)')
    .eq('requester_id', player.id)
    .eq('status', 'clearing');

  for (const req of pendingRequests || []) {
    const turnsLeft = N(req.clearance_turns_remaining) - 1;
    const source = req.sample_sources;
    const playerSourceSong = req.source_song;
    const playerSourceStreams = N(playerSourceSong?.releases?.lifetime_streams);
    const playerArtistSizeScore = computeArtistSizeScore(N(playerSourceSong?.profiles?.clout), N(playerSourceSong?.profiles?.followers), playerSourceStreams);
    const playerSamplingProfile = playerSourceSong ? buildPlayerSongSamplingProfile({
      title: playerSourceSong?.title || 'Untitled',
      artistName: playerSourceSong?.profiles?.artist_name || 'Unknown',
      genre: playerSourceSong?.genre || 'Music',
      quality: N(playerSourceSong?.quality),
      valuation: await calculateSongValuation(playerSourceSong.id),
      lifetimeStreams: playerSourceStreams,
      artistSizeScore: playerArtistSizeScore,
    }) : null;

    if (turnsLeft > 0) {
      // Still waiting — stage the update
      sampleRequestUpdates.push({ id: req.id, patch: { clearance_turns_remaining: turnsLeft } });
      continue;
    }

    // Resolution turn — determine success/failure
    const difficulty = N(source?.clearance_difficulty || 50) + (playerSamplingProfile ? Math.floor(playerArtistSizeScore * 0.2) : 0);
    const playerClout = N(player.clout);
    // Higher clout = better negotiation: base 60% + clout bonus (up to +30%)
    const cloutBonus = Math.min(30, Math.floor(playerClout / 1000));
    let successRate = 60 + cloutBonus;

    if (req.clearance_strategy === 'underground') {
      successRate = Math.max(20, successRate - 20); // Underground is harder
    }

    // Difficulty reduces success rate
    successRate = Math.max(10, successRate - Math.floor(difficulty / 3));

    const rng = mulberry32(hashStr(`sample_clear:${req.id}:${player.id}:${globalTurnId}`));
    const roll = Math.floor(rng() * 100);
    const cleared = roll < successRate;

    if (cleared) {
      // SUCCESS — stage updates
      sampleRequestUpdates.push({ id: req.id, patch: { status: 'completed', clearance_turns_remaining: 0, completed_turn: globalTurnId } });

      // Update song clearance status
      if (req.new_song_id) {
        songsUpdates.push({ id: req.new_song_id, patch: { sample_clearance_status: 'cleared', sample_controversy_chance: 0 } });
      }

      notifications.push({
        player_id: player.id,
        type: 'SAMPLE_CLEARED',
        title: 'Sample Cleared! ✅',
        subtitle: `"${source?.name || 'Sample'}" by ${source?.artist_name || 'Unknown'}`,
        body: `Your sample clearance for "${source?.name}" was successful! The sample is now legally cleared for your song.`,
        priority: 'normal',
        is_read: false,
        idempotency_key: `sample_cleared_${req.id}_${globalTurnId}`,
        created_turn_index: globalTurnId,
      });

      turnEvents.push({
        global_turn_id: globalTurnId,
        player_id: player.id,
        module: 'SampleClearance',
        event_type: 'sample_cleared',
        description: `Cleared sample: ${source?.name} (${req.clearance_strategy})`,
        metadata: { request_id: req.id, source_name: source?.name, strategy: req.clearance_strategy, success_rate: successRate, roll },
      });
    } else {
      // FAILED
      const failStatus = req.clearance_strategy === 'underground' ? 'unlicensed' : 'denied';
      const controversyChance = req.clearance_strategy === 'underground'
        ? (playerSamplingProfile
          ? clamp(Math.round(playerSamplingProfile.controversy_risk * 0.75), 10, 95)
          : N(source?.controversy_risk || 20))
        : 0;

      sampleRequestUpdates.push({ id: req.id, patch: { status: failStatus === 'unlicensed' ? 'completed' : 'denied', clearance_turns_remaining: 0, completed_turn: globalTurnId } });

      if (req.new_song_id) {
        songsUpdates.push({ id: req.new_song_id, patch: {
            sample_clearance_status: failStatus,
            sample_controversy_chance: controversyChance,
        } });
      }

      const failMsg = failStatus === 'unlicensed'
        ? `Clearance failed for "${source?.name}" — defaulting to anonymous flip. Controversy risk activated.`
        : `Clearance denied for "${source?.name}". You lost the $${N(req.clearance_cost).toLocaleString()} fee and cannot use this sample legally.`;

      notifications.push({
        player_id: player.id,
        type: 'SAMPLE_CLEARANCE_FAILED',
        title: failStatus === 'unlicensed' ? 'Clearance Failed — Flipping Anyway ⚠️' : 'Clearance Denied ❌',
        subtitle: `"${source?.name || 'Sample'}"`,
        body: failMsg,
        priority: 'high',
        is_read: false,
        idempotency_key: `sample_fail_${req.id}_${globalTurnId}`,
        created_turn_index: globalTurnId,
      });

      turnEvents.push({
        global_turn_id: globalTurnId,
        player_id: player.id,
        module: 'SampleClearance',
        event_type: 'sample_clearance_failed',
        description: `Clearance failed: ${source?.name} (${req.clearance_strategy}) → ${failStatus}`,
        metadata: { request_id: req.id, source_name: source?.name, strategy: req.clearance_strategy, success_rate: successRate, roll },
      });
    }
  }

  // --- 2. CONTROVERSY CHECK FOR UNLICENSED SAMPLES ---
  const { data: unlicensedSongs } = await supabase
    .from('songs')
    .select('id, title, sample_controversy_chance, sample_source_id, sampled_player_song_id, release_id, release_status')
    .eq('artist_id', player.id)
    .eq('sample_clearance_status', 'unlicensed')
    .gt('sample_controversy_chance', 0);

  for (const song of unlicensedSongs || []) {
    // Only trigger controversy on released songs (unreleased = not visible yet)
    if (song.release_status !== 'released') continue;

    // Controversy chance increases with visibility (released songs get checked each turn)
    let chance = N(song.sample_controversy_chance);

    // Boost controversy chance if the song has high streams
    if (song.release_id) {
      const { data: release } = await supabase
        .from('releases')
        .select('lifetime_streams, lifecycle_state')
        .eq('id', song.release_id)
        .single();

      const streams = N(release?.lifetime_streams);
      const state = (release?.lifecycle_state || '').toLowerCase();

      // High visibility = higher risk
      if (state === 'hot' || state === 'trending') chance += 5;
      if (streams > 10000) chance += 5;
      if (streams > 100000) chance += 10;
    }

    // Roll for controversy
    const controversyRng = mulberry32(hashStr(`sample_controversy:${song.id}:${player.id}:${globalTurnId}`));
    const roll = Math.floor(controversyRng() * 100);
    if (roll >= chance) continue; // No controversy this turn

    // CONTROVERSY TRIGGERED!
    // Penalties scale with the source tier
    let tier = 'common';
    let sourceName = 'a sample';
    let sourceArtistName = 'Unknown';
    let sourceBaseCost = 100;
    let artistSizePenaltyBonus = 0;

    if (song.sample_source_id) {
      const { data: source } = await supabase
        .from('sample_sources')
        .select('tier, name, artist_name, base_cost')
        .eq('id', song.sample_source_id)
        .maybeSingle();
      tier = source?.tier || 'common';
      sourceName = source?.name || sourceName;
      sourceArtistName = source?.artist_name || sourceArtistName;
      sourceBaseCost = N(source?.base_cost) || sourceBaseCost;
    } else if (song.sampled_player_song_id) {
      const { data: sourceSong } = await supabase
        .from('songs')
        .select('id, title, genre, quality, artist_id, profiles(artist_name, clout, followers), releases:lifetime_streams')
        .eq('id', song.sampled_player_song_id)
        .maybeSingle();
      if (sourceSong) {
        const lifetimeStreams = N(sourceSong?.releases?.lifetime_streams);
        const artistSizeScore = computeArtistSizeScore(N(sourceSong?.profiles?.clout), N(sourceSong?.profiles?.followers), lifetimeStreams);
        const profile = buildPlayerSongSamplingProfile({
          title: sourceSong.title || 'Untitled',
          artistName: sourceSong?.profiles?.artist_name || 'Unknown',
          genre: sourceSong?.genre || 'Music',
          quality: N(sourceSong?.quality),
          valuation: await calculateSongValuation(sourceSong.id),
          lifetimeStreams,
          artistSizeScore,
        });
        tier = profile.tier;
        sourceName = sourceSong.title || sourceName;
        sourceArtistName = sourceSong?.profiles?.artist_name || sourceArtistName;
        sourceBaseCost = profile.base_cost;
        artistSizePenaltyBonus = Math.floor(artistSizeScore / 12);
      }
    }

    let financialPenalty = 0;
    let cloutLoss = 0;
    let hypeLoss = 0;

    if (tier === 'legendary') {
      financialPenalty = Math.floor(sourceBaseCost * 1.5);
      cloutLoss = 15;
      hypeLoss = 10;
    } else if (tier === 'rare') {
      financialPenalty = Math.floor(sourceBaseCost * 1.0);
      cloutLoss = 8;
      hypeLoss = 6;
    } else if (tier === 'common') {
      financialPenalty = Math.floor(sourceBaseCost * 0.5);
      cloutLoss = 3;
      hypeLoss = 3;
    } else {
      // viral — minimal consequences
      financialPenalty = 50;
      cloutLoss = 1;
      hypeLoss = 2;
    }

    financialPenalty += artistSizePenaltyBonus * 50;
    cloutLoss += artistSizePenaltyBonus;
    hypeLoss += Math.max(1, Math.floor(artistSizePenaltyBonus / 2));

    // Apply penalties via delta accumulation
    const currentIncome = N(player.income);
    artistProfileDelta.income = Math.max(0, (artistProfileDelta.income ?? currentIncome) - financialPenalty);
    artistProfileDelta.clout = Math.max(0, N(artistProfileDelta.clout ?? player.clout) - cloutLoss);
    artistProfileDelta.hype = Math.max(0, N(artistProfileDelta.hype ?? player.hype) - hypeLoss);

    // Mark song — controversy triggered, reduce future chance (one-time event mostly)
    songsUpdates.push({ id: song.id, patch: {
      sample_clearance_status: 'controversy',
      sample_controversy_chance: Math.max(0, N(song.sample_controversy_chance) - 15),
    } });

    // Song takedown chance for legendary samples
    const takedownRng = mulberry32(hashStr(`sample_takedown:${song.id}:${player.id}:${globalTurnId}`));
    if (tier === 'legendary' && takedownRng() < 0.3) {
      // Platform restriction — reduce lifecycle
      if (song.release_id) {
        releasesUpdates.push({ id: song.release_id, patch: { lifecycle_state: 'Declining' }, filter: { lifecycle_state_in: ['Hot', 'Trending', 'Momentum'] } });
      }
    }

    notifications.push({
      player_id: player.id,
      type: 'CONTROVERSY',
      title: '⚖️ Copyright Infringement Notice',
      subtitle: `"${song.title}" flagged`,
      body: `Legal action over your unlicensed use of "${sourceName}" by ${sourceArtistName}. Penalty: $${financialPenalty.toLocaleString()} in legal fees, -${cloutLoss} clout, -${hypeLoss} hype.`,
      priority: 'high',
      is_read: false,
      idempotency_key: `controversy_sample_${song.id}_${globalTurnId}`,
      created_turn_index: globalTurnId,
    });

    turnEvents.push({
      global_turn_id: globalTurnId,
      player_id: player.id,
      module: 'SampleClearance',
      event_type: 'sample_controversy',
      description: `Copyright infringement: "${song.title}" using unlicensed sample "${sourceName}"`,
      metadata: { song_id: song.id, source_tier: tier, financial_penalty: financialPenalty, clout_loss: cloutLoss, hype_loss: hypeLoss },
    });
  }

  // --- 3. CLEARED SAMPLE BONUSES (passive boost for cleared legendary/rare samples) ---
  const { data: clearedSongs } = await supabase
    .from('songs')
    .select('id, sample_clout_boost, release_id, release_status')
    .eq('artist_id', player.id)
    .eq('sample_clearance_status', 'cleared')
    .gt('sample_clout_boost', 0);

  for (const song of clearedSongs || []) {
    if (song.release_status !== 'released') continue;
    // Small passive clout boost each turn from a cleared legendary sample
    const boost = Math.min(3, Math.floor(N(song.sample_clout_boost) / 5));
    if (boost > 0) {
      artistProfileDelta.clout = Math.min(2_000_000, N(artistProfileDelta.clout ?? player.clout) + boost);
    }
  }

  return {
    success: true,
    deltas: {
      artistProfile: Object.keys(artistProfileDelta).length > 0 ? artistProfileDelta : undefined,
      notifications_to_create: notifications,
      turn_events: turnEvents,
      sample_request_updates: sampleRequestUpdates,
      songs_updates: songsUpdates,
      releases_updates: releasesUpdates,
    },
  };
}
