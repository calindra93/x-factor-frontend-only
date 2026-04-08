// Extended era phases with dynamic transitions
export const ERA_PHASES = {
  TEASE: 'TEASE',
  DROP: 'DROP',
  SUSTAIN: 'SUSTAIN',
  SURGE: 'SURGE',
  PLATEAU: 'PLATEAU',
  DECAY: 'DECAY',
  CONSOLIDATION: 'CONSOLIDATION',
  REINVENTION: 'REINVENTION',
  LEGACY: 'LEGACY',
  FADE: 'FADE'
};

export const ERA_VOLATILITY_BASE = {
  TEASE: 20,
  DROP: 35,
  SUSTAIN: 25,
  SURGE: 40,
  PLATEAU: 18,
  DECAY: 32,
  CONSOLIDATION: 15,
  REINVENTION: 45,
  LEGACY: 12,
  FADE: 30
};

export const VOLATILITY_MIN = 10;
export const VOLATILITY_MAX = 85;
export const MAX_EXPECTED_SPIKE = 6;

export const REGION_VOLATILITY_MODIFIERS = {
  "United States": 4,
  USA: 4,
  Canada: 2,
  "South America": 3,
  "United Kingdom": 3,
  UK: 3,
  Europe: 2,
  Africa: 1,
  "Middle East": 1,
  Oceania: 2,
  Asia: -1,
  Japan: -2,
  Korea: -2
};

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function getCareerStage(clout = 0) {
  if (clout < 500) return 'EARLY';
  if (clout >= 5000) return 'LATE';
  return 'MID';
}

export const EraVolatilityCalculator = {
  calculate({ phase, tension, careerStage, expectationPressure, region }) {
    const base = ERA_VOLATILITY_BASE[phase] ?? ERA_VOLATILITY_BASE.SUSTAIN;
    const regionModifier = REGION_VOLATILITY_MODIFIERS[region] ?? 0;
    const volatility =
      base +
      (tension * 0.35) +
      (expectationPressure ? 15 : 0) +
      (careerStage === 'EARLY' ? 10 : 0) -
      (careerStage === 'LATE' ? 10 : 0) +
      regionModifier;

    return clamp(volatility, VOLATILITY_MIN, VOLATILITY_MAX);
  }
};

export const OneHitEvaluator = {
  evaluate({ careerStage, phase, spikeMagnitude, rng }) {
    if (careerStage !== 'EARLY' || phase !== 'DROP') return null;
    if (spikeMagnitude < MAX_EXPECTED_SPIKE * 0.99) return null;

    const rollChance = Math.min((spikeMagnitude / MAX_EXPECTED_SPIKE) * 0.15, 0.015);
    const triggered = rng.random() < rollChance;

    return {
      triggered,
      rollChance
    };
  }
};

export const EraMomentResolver = {
  resolve({ type, rng }) {
    const moments = {
      MOMENTUM: {
        prompt: rng.choice([
          'Snippet caught traction.',
          'Unreleased track buzzing.',
          'Unexpected co-sign.'
        ]),
        choices: [
          { label: 'Drop early', deltas: { momentum: 8, tension: 4, volatility: 6 } },
          { label: 'Wait', deltas: { momentum: 4, tension: -2, volatility: -4 } },
          { label: 'Ignore', deltas: { momentum: 0, tension: 0, volatility: 0 } }
        ]
      },
      PRESSURE: {
        prompt: rng.choice([
          'Label pressure for a follow-up.',
          'Audience expectations spike.',
          'Overexposure talk.'
        ]),
        choices: [
          { label: 'Double down', deltas: { momentum: 6, tension: 6, volatility: 6 } },
          { label: 'Pivot quietly', deltas: { momentum: 2, tension: -4, volatility: -3 } },
          { label: 'Take a break', deltas: { momentum: -2, tension: -6, volatility: -6 } }
        ]
      },
      REINVENTION: {
        prompt: rng.choice([
          'Sound change rumor.',
          'Underground buzz.',
          'Critical reappraisal.'
        ]),
        choices: [
          { label: 'Reinvent', deltas: { momentum: 5, tension: -4, volatility: 4 }, tag: 'reinvention_seeded' },
          { label: 'Refine', deltas: { momentum: 3, tension: -2, volatility: -2 } },
          { label: 'Resist', deltas: { momentum: -1, tension: 2, volatility: 1 } }
        ]
      }
    };

    const moment = moments[type];
    if (!moment) return null;
    const choice = rng.choice(moment.choices);

    return {
      type,
      prompt: moment.prompt,
      choice: choice.label,
      deltas: choice.deltas,
      tag: choice.tag || null
    };
  }
};

export function computeStreamingRandomFactor({ rng, volatility = 20 }) {
  const spread = clamp(volatility / 200, 0.05, 0.35);
  return 1 - spread + (rng.random() * (2 * spread));
}

export function computeLegacyNostalgiaBoost({ phase, careerStage, clout, volatility }) {
  if (!['LEGACY', 'FADE'].includes(phase)) return 0;

  const stageBoost = careerStage === 'LATE' ? 0.08 : 0.03;
  const cloutBoost = clamp((clout || 0) / 100000, 0, 0.06);
  const volatilityPenalty = clamp((volatility || 0) / 200, 0, 0.05);

  return clamp(stageBoost + cloutBoost - volatilityPenalty, 0, 0.12);
}

// Dynamic phase transition logic
export const PhaseTransitioner = {
  calculateNextPhase({ currentPhase, momentum, tension, volatility, streams, followers, careerStage }) {
    const scoreSheet = {
      momentum: momentum || 0,
      tension: tension || 0,
      volatility: volatility || 20,
      streams: streams || 0,
      followers: followers || 100,
      careerStage
    };
    
    // Phase progression rules based on metrics
    const transitions = {
      TEASE: () => {
        if (scoreSheet.momentum > 50 && scoreSheet.streams > 5000) return 'DROP';
        if (scoreSheet.volatility > 60) return 'SURGE';
        return null;
      },
      DROP: () => {
        if (scoreSheet.streams > 20000 && scoreSheet.momentum > 70) return 'SURGE';
        if (scoreSheet.momentum < 20 && scoreSheet.tension > 50) return 'DECAY';
        if (scoreSheet.tension < 20 && scoreSheet.momentum < 40) return 'SUSTAIN';
        return null;
      },
      SURGE: () => {
        if (scoreSheet.momentum > 80 && scoreSheet.volatility > 50) return 'PLATEAU';
        if (scoreSheet.streams > 50000 && scoreSheet.careerStage !== 'EARLY') return 'CONSOLIDATION';
        return null;
      },
      PLATEAU: () => {
        if (scoreSheet.tension > 60) return 'REINVENTION';
        if (scoreSheet.momentum < 40) return 'DECAY';
        return null;
      },
      SUSTAIN: () => {
        if (scoreSheet.momentum > 60) return 'SURGE';
        if (scoreSheet.tension > 70) return 'REINVENTION';
        if (scoreSheet.streams < 1000) return 'DECAY';
        return null;
      },
      DECAY: () => {
        if (scoreSheet.momentum > 50) return 'REINVENTION';
        if (scoreSheet.volatility > 70) return 'CONSOLIDATION';
        return 'FADE';
      },
      CONSOLIDATION: () => {
        if (scoreSheet.momentum > 70) return 'SUSTAIN';
        if (scoreSheet.careerStage === 'LATE') return 'LEGACY';
        return null;
      },
      REINVENTION: () => {
        if (scoreSheet.momentum > 60) return 'TEASE';
        if (scoreSheet.momentum < 30) return 'DECAY';
        return 'SUSTAIN';
      },
      LEGACY: () => {
        return null; // Legacy doesn't transition
      },
      FADE: () => {
        if (scoreSheet.momentum > 40 && scoreSheet.careerStage === 'LATE') return 'LEGACY';
        return null;
      }
    };
    
    const transitionFn = transitions[currentPhase];
    return transitionFn ? transitionFn() : null;
  }
};

export function evaluateViralSpike({ momentum, volatility, careerStage, rng }) {
  const baseViralChance = 0.02;
  const momentumBonus = momentum * 0.0012;
  const volatilityBonus = volatility * 0.001;
  const earlyCap = careerStage === 'EARLY' ? 0.08 : 0.20;
  const chance = Math.min(baseViralChance + momentumBonus + volatilityBonus, earlyCap);

  if (rng.random() >= chance) {
    return { triggered: false, chance, multiplier: 1, magnitude: 0 };
  }

  const volatilityBoost = volatility / 25;
  const momentumBoost = momentum / 200;
  const multiplier = clamp(1 + (rng.random() * volatilityBoost) + momentumBoost, 1.5, MAX_EXPECTED_SPIKE);

  return {
    triggered: true,
    chance,
    multiplier,
    magnitude: multiplier
  };
}