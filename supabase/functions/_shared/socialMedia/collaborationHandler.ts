/**
 * COLLABORATION HANDLER
 * Manages artist-to-artist collaboration requests and tracking
 */

import { supabaseAdmin } from '../lib/supabaseAdmin.ts';
import { createSupabaseEntitiesAdapter } from '../lib/supabaseEntityAdapter.ts';

// Helper function to wrap numeric values
function N(v: any): number {
  return Number(v) || 0;
}

export async function requestCollaboration(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { 
      requesterArtistId, 
      targetArtistId, 
      collaborationType, 
      proposedConcept,
      energyCostSplit = 0.5,
      revenueSplit = 0.5,
      songId = null
    } = body;

    if (!requesterArtistId || !targetArtistId || !collaborationType) {
      return Response.json({
        error: 'Missing required fields: requesterArtistId, targetArtistId, collaborationType'
      }, { status: 400 });
    }

    if (requesterArtistId === targetArtistId) {
      return Response.json({
        error: 'Cannot collaborate with yourself'
      }, { status: 400 });
    }

    const supabase = supabaseAdmin;
    const entities = createSupabaseEntitiesAdapter(supabase);

    // Get both artist profiles
    const [requesterProfile, targetProfile] = await Promise.all([
      entities.ArtistProfile.get(requesterArtistId),
      entities.ArtistProfile.get(targetArtistId)
    ]);

    if (!requesterProfile || !targetProfile) {
      return Response.json({
        error: 'One or both artist profiles not found'
      }, { status: 404 });
    }

    // Check for existing pending request — handled by partial unique index
    // (idx_collab_requests_pending_unique) at INSERT time below.
    // The pre-check SELECT is kept as a fast-path user feedback shortcut;
    // the authoritative guard is the DB constraint.
    const existingRequest = await supabase
      .from('collaboration_requests')
      .select('id')
      .eq('requester_artist_id', requesterArtistId)
      .eq('target_artist_id', targetArtistId)
      .eq('status', 'pending')
      .maybeSingle();

    if (existingRequest.data) {
      return Response.json({
        error: 'Collaboration request already pending',
        details: { existingRequestId: existingRequest.data.id }
      }, { status: 409 });
    }

    // Calculate energy costs based on collaboration type
    const energyCosts = {
      'YouTube Collab': { requester: 12, target: 12 },
      'TikTok Duet': { requester: 4, target: 2 },
      'Feature': { requester: 8, target: 6 },
      'Remix': { requester: 6, target: 4 }
    };

    const costs = energyCosts[collaborationType] || energyCosts['YouTube Collab'];

    // Check if both artists have enough energy
    // Song features (songId provided) have costs handled by the RecordingWizard frontend
    // Social media collabs (no songId) deduct energy here
    const isSongFeature = !!songId;

    if (!isSongFeature) {
      if (N(requesterProfile.energy) < costs.requester) {
        return Response.json({
          error: 'Insufficient energy for requester',
          required: costs.requester,
          available: N(requesterProfile.energy)
        }, { status: 400 });
      }

      if (N(targetProfile.energy) < costs.target) {
        return Response.json({
          error: 'Target artist has insufficient energy',
          required: costs.target,
          available: N(targetProfile.energy)
        }, { status: 400 });
      }
    }

    // Create collaboration request — guarded by idx_collab_requests_pending_unique
    const { data: collabRequest, error: collabRequestError } = await supabase
      .from('collaboration_requests')
      .insert({
        requester_artist_id: requesterArtistId,
        target_artist_id: targetArtistId,
        collaboration_type: collaborationType,
        status: 'pending',
        proposed_concept: proposedConcept || 'Let\'s create something amazing together!',
        energy_cost_split: energyCostSplit,
        revenue_split: revenueSplit,
        requester_energy_cost: isSongFeature ? 0 : costs.requester,
        target_energy_cost: isSongFeature ? 0 : costs.target,
        ...(songId ? { song_id: songId } : {})
      })
      .select()
      .single();

    if (collabRequestError) {
      // Unique violation from the partial index = duplicate pending request (race condition)
      if (collabRequestError.code === '23505') {
        return Response.json({
          error: 'Collaboration request already pending',
          details: { requesterArtistId, targetArtistId }
        }, { status: 409 });
      }
      throw collabRequestError;
    }
    if (!collabRequest) {
      throw new Error('Failed to create collaboration request');
    }

    // Reserve energy from requester (skip for song features — handled by RecordingWizard)
    if (!isSongFeature) {
      await entities.ArtistProfile.update(requesterArtistId, {
        energy: N(requesterProfile.energy) - costs.requester
      });
    }

    // Generate notification for target artist
    const notification = await supabase
      .from('notifications')
      .insert({
        player_id: targetArtistId,
        type: 'COLLABORATION_REQUEST',
        title: 'Collaboration Request',
        subtitle: `${requesterProfile.artist_name || 'An artist'} wants to feature on your song!`,
        body: proposedConcept || 'Let\'s create something amazing together!',
        metrics: {
          collaboration_id: collabRequest.id,
          collaboration_type: collaborationType,
          requester_id: requesterArtistId,
          requester_name: requesterProfile.artist_name,
          song_id: songId,
        },
        payload: {
          collaboration_id: collabRequest.id,
          collaboration_type: collaborationType,
          requester_id: requesterArtistId,
          requester_name: requesterProfile.artist_name,
          proposed_concept: collabRequest.proposed_concept,
          song_id: songId,
        },
        deep_links: [
          { label: 'Open Collaboration Inbox', route: 'Social', params: { openInbox: 'collaborations' } },
          { label: 'View in Studio', route: 'Studio' }
        ],
        idempotency_key: `collab_request:${collabRequest.id}`,
        priority: 'high',
        is_read: false
      })
      .select()
      .single();

    return Response.json({
      success: true,
      data: {
        collaborationRequest: collabRequest,
        notification,
        energyReserved: costs.requester,
        nextSteps: 'Waiting for target artist to respond'
      }
    });

  } catch (error: any) {
    console.error('Collaboration request error:', error);
    return Response.json({
      error: 'Internal server error',
      details: error.message
    }, { status: 500 });
  }
}

/**
 * Respond to a collaboration request (accept or decline)
 */
export async function respondToCollaboration(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { collaborationId, artistId, response: decision } = body;

    if (!collaborationId || !artistId || !decision) {
      return Response.json({
        error: 'Missing required fields: collaborationId, artistId, response (accept|decline)'
      }, { status: 400 });
    }

    if (decision !== 'accept' && decision !== 'decline') {
      return Response.json({ error: 'response must be "accept" or "decline"' }, { status: 400 });
    }

    const supabase = supabaseAdmin;
    const entities = createSupabaseEntitiesAdapter(supabase);

    // Get the collaboration request
    const { data: collab, error: fetchErr } = await supabase
      .from('collaboration_requests')
      .select('*')
      .eq('id', collaborationId)
      .eq('target_artist_id', artistId)
      .eq('status', 'pending')
      .single();

    if (fetchErr || !collab) {
      return Response.json({ error: 'Collaboration request not found or not pending' }, { status: 404 });
    }

    if (decision === 'decline') {
      // Decline: refund requester energy, update status
      await supabase
        .from('collaboration_requests')
        .update({ status: 'declined' })
        .eq('id', collaborationId);

      const requesterProfile = await entities.ArtistProfile.get(collab.requester_artist_id);
      if (requesterProfile) {
        await entities.ArtistProfile.update(collab.requester_artist_id, {
          energy: N(requesterProfile.energy) + N(collab.requester_energy_cost)
        });
      }

      // Notify requester
      await supabase.from('notifications').insert({
        player_id: collab.requester_artist_id,
        type: 'COLLABORATION_DECLINED',
        title: 'Collaboration Declined',
        subtitle: 'Your collaboration request was declined.',
        body: `Your ${collab.collaboration_type} request was declined. Energy has been refunded.`,
        idempotency_key: `collab_decline_${collaborationId}`,
        priority: 'medium',
        is_read: false
      });

      return Response.json({ success: true, data: { status: 'declined', energyRefunded: N(collab.requester_energy_cost) } });
    }

    // Accept: deduct target energy, create collab content, update status
    const targetProfile = await entities.ArtistProfile.get(artistId);
    const requesterProfile = await entities.ArtistProfile.get(collab.requester_artist_id);

    if (!targetProfile || !requesterProfile) {
      return Response.json({ error: 'Artist profiles not found' }, { status: 404 });
    }

    if (N(targetProfile.energy) < N(collab.target_energy_cost)) {
      return Response.json({
        error: 'Insufficient energy to accept',
        required: N(collab.target_energy_cost),
        available: N(targetProfile.energy)
      }, { status: 400 });
    }

    // Deduct target energy
    await entities.ArtistProfile.update(artistId, {
      energy: N(targetProfile.energy) - N(collab.target_energy_cost)
    });

    // Calculate combined performance (both audiences contribute)
    const combinedFollowers = N(requesterProfile.followers) + N(targetProfile.followers);
    const avgHype = (N(requesterProfile.hype) + N(targetProfile.hype)) / 2;
    const collabBoost = 1.5; // Collab content gets 50% boost
    const baseViews = collab.collaboration_type === 'TikTok Duet' ? 2000 : 5000;
    const views = Math.floor(baseViews * (1 + combinedFollowers / 5000) * (1 + avgHype / 100) * collabBoost * (0.7 + Math.random() * 0.6));
    const likes = Math.floor(views * (0.05 + Math.random() * 0.05));
    const comments = Math.floor(likes * 0.12);
    const shares = Math.floor(likes * 0.08);
    const followerGainEach = Math.floor(views * 0.002);
    const hypeGainEach = Math.floor(Math.random() * 4 + 2);

    // Update both artists
    await entities.ArtistProfile.update(collab.requester_artist_id, {
      followers: N(requesterProfile.followers) + followerGainEach,
      hype: Math.min(100, N(requesterProfile.hype) + hypeGainEach)
    });
    await entities.ArtistProfile.update(artistId, {
      followers: N(targetProfile.followers) + followerGainEach,
      hype: Math.min(100, N(targetProfile.hype) + hypeGainEach)
    });

    // Create social post for the collab (on both platforms)
    const platform = collab.collaboration_type === 'TikTok Duet' ? 'looptok' : 'vidwave';
    for (const pid of [collab.requester_artist_id, artistId]) {
      await entities.SocialPost.create({
        artist_id: pid,
        platform,
        post_type: 'video',
        title: `Collab: ${collab.proposed_concept || collab.collaboration_type}`,
        caption: `Collaboration with @${pid === artistId ? requesterProfile.display_name : targetProfile.display_name}`,
        views, likes, comments, shares, saves: Math.floor(likes * 0.06),
        engagement_rate: Math.floor((likes + comments + shares) / views * 1000) / 10,
        revenue: 0,
        is_viral: views > baseViews * 3,
        viral_multiplier: views > baseViews * 3 ? Math.floor(views / baseViews * 10) / 10 : 1.0,
        status: 'published',
        energy_cost: 0,
        metadata: { collaboration_id: collaborationId, collaboration_type: collab.collaboration_type }
      });
    }

    // Update collab status
    await supabase
      .from('collaboration_requests')
      .update({ status: 'accepted' })
      .eq('id', collaborationId);

    // Notify requester
    await supabase.from('notifications').insert({
      player_id: collab.requester_artist_id,
      type: 'COLLABORATION_ACCEPTED',
      title: 'Collaboration Accepted!',
      subtitle: `Your ${collab.collaboration_type} is live!`,
      body: `The collaboration generated ${views.toLocaleString()} views and +${followerGainEach} followers each!`,
      idempotency_key: `collab_accept_${collaborationId}`,
      priority: 'high',
      is_read: false
    });

    return Response.json({
      success: true,
      data: {
        status: 'accepted',
        performance: { views, likes, comments, shares, followerGainEach, hypeGainEach },
        platform
      }
    });

  } catch (error: any) {
    console.error('Collaboration response error:', error);
    return Response.json({ error: 'Internal server error', details: error.message }, { status: 500 });
  }
}

/**
 * Get collaborations for an artist (pending, accepted, declined)
 */
export async function getCollaborations(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { artistId, status: filterStatus } = body;

    if (!artistId) {
      return Response.json({ error: 'Missing required field: artistId' }, { status: 400 });
    }

    const supabase = supabaseAdmin;

    // Get requests where artist is requester or target
    let query = supabase
      .from('collaboration_requests')
      .select('*')
      .or(`requester_artist_id.eq.${artistId},target_artist_id.eq.${artistId}`)
      .order('created_at', { ascending: false })
      .limit(50);

    if (filterStatus) {
      query = query.eq('status', filterStatus);
    }

    const { data: collabs, error } = await query;

    if (error) {
      return Response.json({ error: 'Failed to fetch collaborations', details: error.message }, { status: 500 });
    }

    // Enrich with artist names
    const artistIds = new Set<string>();
    for (const c of (collabs || [])) {
      artistIds.add(c.requester_artist_id);
      artistIds.add(c.target_artist_id);
    }

    const entities = createSupabaseEntitiesAdapter(supabase);
    const profiles: Record<string, any> = {};
    for (const id of artistIds) {
      try {
        const p = await entities.ArtistProfile.get(id);
        if (p) profiles[id] = { id: p.id, display_name: p.display_name, followers: p.followers, career_stage: p.career_stage };
      } catch (_) { /* skip */ }
    }

    const enriched = (collabs || []).map((c: any) => ({
      ...c,
      requester: profiles[c.requester_artist_id] || null,
      target: profiles[c.target_artist_id] || null,
      isIncoming: c.target_artist_id === artistId
    }));

    return Response.json({
      success: true,
      data: {
        collaborations: enriched,
        pending: enriched.filter((c: any) => c.status === 'pending' && c.isIncoming).length
      }
    });

  } catch (error: any) {
    console.error('Get collaborations error:', error);
    return Response.json({ error: 'Internal server error', details: error.message }, { status: 500 });
  }
}
