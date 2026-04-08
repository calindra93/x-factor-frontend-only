/**
 * Era Triumph & Flop Event System
 * 
 * Rare, impactful events that reshape game mechanics and unlock new content.
 * Triggered by performance metrics, fan trends, and career stage.
 */

import { clamp } from './eraLogic.js';

/**
 * Evaluate if an era should trigger a Triumph or Flop event
 */
export function evaluateEraEvent(era, playerState, fanProfile, turnId, allMetrics) {
  const careerStage = playerState.clout < 500 ? 'EARLY' : playerState.clout >= 5000 ? 'LATE' : 'MID';
  
  // Early career players almost never flop
  if (careerStage === 'EARLY') {
    return evaluateEarlyCareerEvent(era, playerState, fanProfile, allMetrics);
  }

  // Mid/Late career can flop or triumph
  const triumphEval = evaluateTriumph(era, playerState, fanProfile, allMetrics, careerStage);
  const flopEval = evaluateFlop(era, playerState, fanProfile, allMetrics, careerStage);

  // Triumph takes precedence if both trigger
  if (triumphEval) return triumphEval;
  if (flopEval) return flopEval;

  return null;
}

/**
 * Early career events (mostly triumphs, rare flops)
 */
function evaluateEarlyCareerEvent(era, playerState, fanProfile, allMetrics) {
  const monthlyListenerGrowth = fanProfile.monthly_listeners - fanProfile.last_monthly_listeners;
  const retentionRate = fanProfile.retention_rate || 0.7;
  const momentumTrend = allMetrics.momentum || 0;

  // Strong early traction = Breakthrough event
  if (monthlyListenerGrowth > 2000 && retentionRate > 0.8 && momentumTrend > 50) {
    return {
      type: 'BREAKTHROUGH',
      severity: 'major',
      title: 'Breakthrough Moment',
      description: 'Your music caught fire with early adopters. Mainstream eyes are watching.',
      effects: {
        momentum_boost: 20,
        unlock_platforms: true,
        unlock_touring: true,
        unlock_merch_premium: true,
        fan_mix_shift: { og: 1, core: 10, casual: 0, trend_chaser: 0, stan: 5, critic: 0 }
      },
      rewards: {
        clout: 50,
        income: 500
      }
    };
  }

  // Solid growth but small listener base = Building Momentum
  if (monthlyListenerGrowth > 500 && retentionRate > 0.7) {
    return {
      type: 'BUILDING_MOMENTUM',
      severity: 'minor',
      title: 'Building Momentum',
      description: 'Your fanbase is growing steadily. Dedication is paying off.',
      effects: {
        momentum_boost: 10,
        fan_mix_shift: { og: 0, core: 3, casual: 0, trend_chaser: 0, stan: 2, critic: 0 }
      },
      rewards: {
        clout: 20
      }
    };
  }

  // Early career flop is extremely rare (needs major mismanagement)
  if (monthlyListenerGrowth < -500 && retentionRate < 0.3 && momentumTrend < 10) {
    return {
      type: 'FALSE_START',
      severity: 'major',
      title: 'False Start',
      description: 'Early momentum fizzled faster than expected. Time to reset.',
      effects: {
        momentum_reset: 15,
        volatility_increase: 10,
        phase_lock: 'DECAY',
        force_phase_change: 'REINVENTION'
      },
      requirements: {
        min_turns_in_phase: 96
      }
    };
  }

  return null;
}

/**
 * Triumph evaluation - sustained excellence
 */
function evaluateTriumph(era, playerState, fanProfile, allMetrics, careerStage) {
  const { monthly_listeners, retention_rate, listener_growth_trend } = fanProfile;
  const { momentum, volatility, streams } = allMetrics;

  // Criteria for triumph
  const strongStreaming = streams > 50000;
  const strongRetention = retention_rate > 0.85;
  const strongMomentum = momentum > 70;
  const stableVolatility = volatility < 30;

  const triumphScore = [
    strongStreaming ? 1 : 0,
    strongRetention ? 1 : 0,
    strongMomentum ? 1 : 0,
    stableVolatility ? 1 : 0
  ].reduce((a, b) => a + b, 0);

  // Need 3+ criteria for triumph
  if (triumphScore >= 3) {
    const isMajor = triumphScore === 4; // All criteria met = major

    return {
      type: 'ERA_TRIUMPH',
      severity: isMajor ? 'major' : 'minor',
      title: isMajor ? '🏆 Era Triumph' : '✨ Strong Era',
      description: isMajor
        ? 'This era exceeded all expectations. You defined the zeitgeist.'
        : 'This era exceeded expectations. Momentum is strong.',
      effects: {
        momentum_boost: isMajor ? 25 : 15,
        volatility_reduction: isMajor ? 15 : 8,
        fan_mix_shift: isMajor
          ? { og: 2, core: 5, casual: -3, trend_chaser: -2, stan: 10, critic: -2 }
          : { og: 1, core: 3, casual: -1, trend_chaser: -1, stan: 5, critic: -1 },
        phase_extension: isMajor ? 72 : 36,
        unlock_content: isMajor ? ['era_collab', 'exclusive_studio'] : []
      },
      rewards: {
        clout: isMajor ? 150 : 75,
        income: isMajor ? 2000 : 1000
      }
    };
  }

  return null;
}

/**
 * Flop evaluation - declining performance
 */
function evaluateFlop(era, playerState, fanProfile, allMetrics, careerStage) {
  const { monthly_listeners, retention_rate, listener_growth_trend, last_monthly_listeners } = fanProfile;
  const { momentum, tension, streams } = allMetrics;

  // Only mid/late career can truly flop
  if (careerStage === 'EARLY') return null;

  // Criteria for flop
  const decreasingListeners = monthly_listeners < last_monthly_listeners * 0.8; // 20%+ drop
  const poorRetention = retention_rate < 0.5;
  const lowMomentum = momentum < 20;
  const highTension = tension > 80;
  const lowStreams = streams < 1000;

  const flopScore = [
    decreasingListeners ? 1 : 0,
    poorRetention ? 1 : 0,
    lowMomentum ? 1 : 0,
    highTension ? 1 : 0,
    lowStreams ? 1 : 0
  ].reduce((a, b) => a + b, 0);

  // Need 4+ criteria for flop (high bar)
  if (flopScore >= 4) {
    const isMajor = flopScore === 5; // All criteria met = major flop

    return {
      type: 'ERA_FLOP',
      severity: isMajor ? 'major' : 'minor',
      title: isMajor ? '📉 Era Flop' : '⚠️ Declining Era',
      description: isMajor
        ? 'This era didn\'t land. Listeners are moving on. Time to reinvent or accept the decline.'
        : 'This era is losing steam. Audiences are becoming unengaged.',
      effects: {
        momentum_penalty: isMajor ? -40 : -20,
        volatility_increase: isMajor ? 25 : 12,
        fan_mix_shift: isMajor
          ? { og: -1, core: -8, casual: 5, trend_chaser: -5, stan: -3, critic: 5 }
          : { og: 0, core: -4, casual: 3, trend_chaser: -2, stan: -1, critic: 2 },
        phase_lock: isMajor ? 'DECAY' : null,
        force_phase_change: isMajor ? 'DECAY' : null,
        unlock_recovery_choice: true
      },
      penalties: {
        clout: isMajor ? -50 : -20,
        income: isMajor ? -1000 : -300
      },
      recovery_options: isMajor ? ['reinvention', 'strategic_pivot', 'hiatus'] : []
    };
  }

  return null;
}

/**
 * Apply triumph/flop event effects permanently
 */
export function applyEventEffects(eventData, era, playerState, fanProfile) {
  return {
    event_type: eventData.type,
    event_severity: eventData.severity,
    
    // Mechanical effects
    momentum_change: (eventData.effects.momentum_boost || 0) - (eventData.effects.momentum_penalty || 0),
    volatility_change: (eventData.effects.volatility_reduction || 0) * -1 + (eventData.effects.volatility_increase || 0),
    fan_mix_delta: eventData.effects.fan_mix_shift || {},
    
    // Phase effects
    phase_extension: eventData.effects.phase_extension || 0,
    forced_phase: eventData.effects.force_phase_change || null,
    locked_until_turn: eventData.effects.phase_lock ? null : undefined,
    
    // Rewards/Penalties
    clout_delta: (eventData.rewards?.clout || 0) - (eventData.penalties?.clout || 0),
    income_delta: (eventData.rewards?.income || 0) - (eventData.penalties?.income || 0),
    
    // Content unlocks
    unlocked_features: [
      ...(eventData.effects.unlock_platforms ? ['platform_unlock'] : []),
      ...(eventData.effects.unlock_touring ? ['touring_unlock'] : []),
      ...(eventData.effects.unlock_merch_premium ? ['merch_premium'] : []),
      ...(eventData.effects.unlock_content || [])
    ],
    
    // Recovery options for flops
    recovery_options: eventData.recovery_options || []
  };
}