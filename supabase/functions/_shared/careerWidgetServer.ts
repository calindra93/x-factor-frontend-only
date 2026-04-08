/**
 * Career Widget Backend - Serves career progression data to frontend
 * Reads milestones, available moments, unlocks, and stage info
 */

import { supabaseAdmin } from './lib/supabaseAdmin.ts';
import { createSupabaseEntitiesAdapter } from './lib/supabaseEntityAdapter.ts';
import { getAuthUser } from './lib/authFromRequest.ts';
import { getAvailableMomentsForStage, getMilestoneUnlocks, detectCareerStage } from './careerProgressionLogic.ts';

export async function handleRequest(req) {
  try {
    const { user, error: authErr } = await getAuthUser(req);
    if (!user) {
      return Response.json({ error: authErr || 'Unauthorized' }, { status: 401 });
    }

    const entities = createSupabaseEntitiesAdapter(supabaseAdmin);

    const url = new URL(req.url);
    const body = await req.clone().json().catch(() => ({}));
    const subAction = body.subAction || url.searchParams.get('subAction') || url.searchParams.get('action');

    if (subAction === 'getCareerData') {
      // Get artist profile
      const profiles = await entities.ArtistProfile.filter({
        user_account_id: user.email
      });

      if (!profiles?.length) {
        return Response.json({ error: 'No artist profile' }, { status: 404 });
      }

      const profile = profiles[0];
      const stage = detectCareerStage(profile.followers || 0);

      // Get completed milestones
      const milestones = await entities.CareerMilestone.filter({
        artist_id: profile.id
      });

      const completedMilestoneTypes = milestones.map((m) => m.milestone_type);

      // Get available player-triggered moments
      const availableMoments = getAvailableMomentsForStage(stage);

      // Filter available ones (user hasn't triggered + has funds/requirements)
      const availableToTrigger = availableMoments.filter((moment) => {
        const alreadyCompleted = milestones.some((m) => m.milestone_type === moment.type);
        if (alreadyCompleted) return false;

        const hasFunds = profile.income >= moment.cost;
        const meetsRequirements = Object.entries(moment.requirements).every(
          ([key, value]) => profile[key] >= value
        );

        return hasFunds && meetsRequirements;
      });

      return Response.json({
        career_stage: stage,
        followers: profile.followers,
        hype: profile.hype,
        income: profile.income,
        clout: profile.clout,
        completed_milestones: completedMilestoneTypes,
        total_milestones_unlocked: milestones.length,
        available_moments: availableToTrigger.map((m) => ({
          type: m.type,
          cost: m.cost,
          story: m.story,
          requirements: m.requirements,
          unlocks: m.unlocks
        }))
      });
    }

    if (subAction === 'triggerMoment') {
      const momentType = body.momentType || url.searchParams.get('momentType');

      const profiles = await entities.ArtistProfile.filter({
        user_account_id: user.email
      });

      if (!profiles?.length) {
        return Response.json({ error: 'No artist profile' }, { status: 404 });
      }

      const profile = profiles[0];
      const stage = detectCareerStage(profile.followers || 0);
      const availableMoments = getAvailableMomentsForStage(stage);
      const moment = availableMoments.find((m) => m.type === momentType);

      if (!moment) {
        return Response.json({ error: 'Moment not found' }, { status: 404 });
      }

      // Validation
      if (profile.income < moment.cost) {
        return Response.json({ error: 'Insufficient funds' }, { status: 400 });
      }

      const meetsRequirements = Object.entries(moment.requirements).every(
        ([key, value]) => profile[key] >= value
      );

      if (!meetsRequirements) {
        return Response.json({ error: 'Requirements not met' }, { status: 400 });
      }

      // Deduct cost
      await entities.ArtistProfile.update(profile.id, {
        income: profile.income - moment.cost
      });

      // Create milestone record
      const turnStates = await entities.TurnState.list('-created_date', 1);
      const turnId = turnStates?.length > 0 ? turnStates[0].current_turn_id : 1;

      await entities.CareerMilestone.create({
        artist_id: profile.id,
        milestone_type: momentType,
        triggered_turn: turnId,
        triggered_at: new Date().toISOString(),
        is_auto_triggered: false,
        unlocks: moment.unlocks,
        story_text: moment.story
      });

      // Log event
      await entities.TurnEventLog.create({
        turn_id: turnId,
        player_id: profile.id,
        module: 'CareerWidget',
        event_type: 'player_triggered_moment',
        description: `Player triggered moment: ${momentType}`,
        deltas: { cost_deducted: moment.cost },
        metadata: { unlocks: moment.unlocks }
      });

      return Response.json({
        success: true,
        moment_type: momentType,
        unlocks: moment.unlocks,
        new_income: profile.income - moment.cost
      });
    }

    return Response.json({ error: `Unknown subAction: ${subAction}`, available: ['getCareerData', 'triggerMoment'] }, { status: 400 });
  } catch (error) {
    console.error('[CareerWidget] Error:', error);
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}

if (import.meta.main) {
  Deno.serve(handleRequest);
}