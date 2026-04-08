export type SoundburstComplianceMode = 'stealth' | 'balanced' | 'permitted';

export type SoundburstWizardConfigV1 = {
  v: 1;
  eventType: string;
  complianceMode: SoundburstComplianceMode;
  promoStrategy: string;
  eventSpecificChoice: string;
  eventSpecificIntensity: number;
  scheduledTurnsAhead: number;
  eventName: string;
  city: string;
  region: string;
};

export type SoundburstWizardConfigV2 = {
  v: 2;
  eventType: string;
  complianceMode: SoundburstComplianceMode;
  promoStrategy: string;
  eventSpecificChoice: string;
  eventSpecificIntensity: number;
  scheduledTurnsAhead: number;
  eventName: string;
  city: string;
  region: string;
  focusChoice: string | null;
  callType: string;
  socialPlatforms: string[];
  securityMode: string;
  slots: number;
  invitedPlayerIds: string[];
  invitedNpcIds: string[];
};

export type SoundburstWizardConfig = SoundburstWizardConfigV1 | SoundburstWizardConfigV2;

const ALLOWED_KEYS = new Set([
  'eventType',
  'complianceMode',
  'promoStrategy',
  'eventSpecificChoice',
  'eventSpecificIntensity',
  'scheduledTurnsAhead',
  'eventName',
  'city',
  'region',
  // v2 keys
  'focusChoice',
  'callType',
  'socialPlatforms',
  'securityMode',
  'slots',
  'invitedPlayerIds',
  'invitedNpcIds',
]);

const VALID_CALL_TYPES = new Set(['open', 'invite_only']);
const VALID_SECURITY_MODES = new Set(['none', 'lookout', 'bouncer', 'maximum']);
const VALID_SOCIAL_PLATFORMS = new Set(['looptok', 'instavirus', 'xpress']);

const V2_KEYS = new Set(['focusChoice', 'callType', 'socialPlatforms', 'securityMode', 'slots', 'invitedPlayerIds', 'invitedNpcIds']);

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function asTrimmedString(value: any): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asNumber(value: any): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN;
}

function normalizeComplianceMode(value: any): SoundburstComplianceMode {
  const candidate = asTrimmedString(value).toLowerCase();
  if (candidate === 'stealth' || candidate === 'balanced' || candidate === 'permitted') {
    return candidate;
  }
  return 'balanced';
}

function normalizeStringArray(value: any): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v: any) => typeof v === 'string' && v.trim().length > 0).map((v: any) => v.trim());
}

function assertNoUnknownSoundburstKeys(input: Record<string, any>) {
  const unknown = Object.keys(input).filter((k) => !ALLOWED_KEYS.has(k));
  if (unknown.length === 0) return;
  unknown.sort();
  throw new Error(`Unsupported soundburst config keys: ${unknown.join(', ')}`);
}

/**
 * Normalizes the wizard configuration into a deterministic shape.
 * Returns v2 when any v2 field is present, otherwise v1 for back-compat.
 * Unknown keys are explicitly rejected (no silent drops).
 */
export function normalizeSoundburstWizardConfig(input: Record<string, any>): SoundburstWizardConfig {
  assertNoUnknownSoundburstKeys(input);

  const eventType = asTrimmedString(input.eventType) || 'showcase';
  const complianceMode = normalizeComplianceMode(input.complianceMode);
  const promoStrategy = asTrimmedString(input.promoStrategy) || 'standard';
  const eventSpecificChoice = asTrimmedString(input.eventSpecificChoice) || 'default';
  const rawEventSpecificIntensity = asNumber(input.eventSpecificIntensity);
  const eventSpecificIntensity = Number.isFinite(rawEventSpecificIntensity)
    ? clampNumber(rawEventSpecificIntensity, 0, 1)
    : 0.5;
  const rawScheduledTurnsAhead = asNumber(input.scheduledTurnsAhead);
  const scheduledTurnsAhead = Number.isFinite(rawScheduledTurnsAhead)
    ? Math.round(clampNumber(rawScheduledTurnsAhead, 1, 5))
    : 2;

  const hasV2 = Object.keys(input).some((k) => V2_KEYS.has(k));

  if (!hasV2) {
    return {
      v: 1,
      eventType,
      complianceMode,
      promoStrategy,
      eventSpecificChoice,
      eventSpecificIntensity,
      scheduledTurnsAhead,
      eventName: asTrimmedString(input.eventName),
      city: asTrimmedString(input.city),
      region: asTrimmedString(input.region),
    };
  }

  // v2 field normalization
  const focusChoice = input.focusChoice != null ? asTrimmedString(input.focusChoice) || null : null;

  const rawCallType = asTrimmedString(input.callType).toLowerCase();
  const callType = VALID_CALL_TYPES.has(rawCallType) ? rawCallType : 'open';

  const rawPlatforms = Array.isArray(input.socialPlatforms) ? input.socialPlatforms : [];
  const socialPlatforms = rawPlatforms
    .map((p: any) => (typeof p === 'string' ? p.trim().toLowerCase() : ''))
    .filter((p: string) => VALID_SOCIAL_PLATFORMS.has(p));

  const rawSecurityMode = asTrimmedString(input.securityMode).toLowerCase();
  const securityMode = VALID_SECURITY_MODES.has(rawSecurityMode) ? rawSecurityMode : 'none';

  const rawSlots = asNumber(input.slots);
  const slots = Number.isFinite(rawSlots) ? Math.round(clampNumber(rawSlots, 1, 12)) : 4;

  const invitedPlayerIds = normalizeStringArray(input.invitedPlayerIds);
  const invitedNpcIds = normalizeStringArray(input.invitedNpcIds);

  return {
    v: 2,
    eventType,
    complianceMode,
    promoStrategy,
    eventSpecificChoice,
    eventSpecificIntensity,
    scheduledTurnsAhead,
    eventName: asTrimmedString(input.eventName),
    city: asTrimmedString(input.city),
    region: asTrimmedString(input.region),
    focusChoice,
    callType,
    socialPlatforms,
    securityMode,
    slots,
    invitedPlayerIds,
    invitedNpcIds,
  };
}

/**
 * Merge-writes the soundburst config into TourEvent metadata while preserving unrelated keys.
 */
export function mergeTourEventMetadataWithSoundburst(
  metadata: Record<string, any> | null | undefined,
  config: SoundburstWizardConfig,
): Record<string, any> {
  return {
    ...(metadata || {}),
    soundburst: { ...config },
  };
}

/**
 * Updates complianceMode in nested soundburst metadata (if present) without touching other metadata keys.
 */
export function updateSoundburstComplianceModeInMetadata(
  metadata: Record<string, any> | null | undefined,
  complianceMode: SoundburstComplianceMode,
): Record<string, any> {
  const base = { ...(metadata || {}) };
  if (!base.soundburst || typeof base.soundburst !== 'object') return base;

  const current = base.soundburst as Record<string, any>;
  base.soundburst = {
    ...current,
    complianceMode: normalizeComplianceMode(complianceMode),
  };

  return base;
}
