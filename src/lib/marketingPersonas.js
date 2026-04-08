export const MARKETING_PERSONAS = {
  street_authentic: { label: 'Street Authentic', emoji: '🔥' },
  luxury_hustler: { label: 'Luxury Hustler', emoji: '💎' },
  conscious_voice: { label: 'Conscious Voice', emoji: '✊' },
  party_club_catalyst: { label: 'Party / Club Catalyst', emoji: '🎉' },
  nostalgic_boom_bap: { label: 'Nostalgic Boom Bap', emoji: '📻' },
  femme_power: { label: 'Femme Power', emoji: '👑' },
  viral_trendsetter: { label: 'Viral Trendsetter', emoji: '⚡' },
  aesthetic_curator: { label: 'Aesthetic Curator', emoji: '🎨' },
  relatable_storyteller: { label: 'Relatable Storyteller', emoji: '💬' },
  internet_troll: { label: 'Internet Troll', emoji: '🤡' },
  producer_visionary: { label: 'Producer Visionary', emoji: '🎛️' },
  motivational_hustler: { label: 'Motivational Hustler', emoji: '💪' },
};

export const MARKETING_PERSONA_OPTIONS = Object.entries(MARKETING_PERSONAS).map(([id, meta]) => ({ id, ...meta }));

export function getPersonaLabel(id) {
  if (!id) return null;
  return MARKETING_PERSONAS[id]?.label || id;
}
