/**
 * AI Thumbnail Generator — AI-powered thumbnails for NPC content using Gemini
 * ─────────────────────────────────────────────────────────────────
 * Generates AI-powered thumbnails for:
 * - Reaction videos (channel icon + artist name + sentiment overlay)
 * - Fan content (fan cam, analysis, meme)
 * - Trashy media (clickbait style)
 * - Music videos (gradient + title)
 *
 * Uses Google Gemini API for creative, unique thumbnails.
 * Falls back to procedural SVG if API unavailable.
 */
import { invokeLLM } from './lib/invokeLLM.ts';

// Color palettes by sentiment/type
const PALETTES: Record<string, { bg1: string; bg2: string; accent: string; text: string }> = {
  hype:      { bg1: '#ff4500', bg2: '#ff8c00', accent: '#ffd700', text: '#ffffff' },
  critic:    { bg1: '#1a1a2e', bg2: '#16213e', accent: '#e94560', text: '#ffffff' },
  mixed:     { bg1: '#2d3436', bg2: '#636e72', accent: '#fdcb6e', text: '#ffffff' },
  hater:     { bg1: '#2d0a0a', bg2: '#5c1010', accent: '#ff0000', text: '#ffffff' },
  casual:    { bg1: '#0f3460', bg2: '#16213e', accent: '#53d8fb', text: '#ffffff' },
  gossip:    { bg1: '#6c0ba9', bg2: '#c62adb', accent: '#ffd700', text: '#ffffff' },
  interview: { bg1: '#1b1b2f', bg2: '#162447', accent: '#e43f5a', text: '#ffffff' },
  neutral:   { bg1: '#2c3e50', bg2: '#34495e', accent: '#3498db', text: '#ffffff' },
  fan:       { bg1: '#e91e63', bg2: '#9c27b0', accent: '#ffeb3b', text: '#ffffff' },
  trashy:    { bg1: '#ff0000', bg2: '#ffcc00', accent: '#000000', text: '#ffffff' },
  music:     { bg1: '#1db954', bg2: '#191414', accent: '#1ed760', text: '#ffffff' },
};

// Emoji overlays by type
const TYPE_OVERLAYS: Record<string, string> = {
  reaction: '👀',
  fan_looptok: '🎥',
  fan_analysis: '🔍',
  fan_cam: '📹',
  fan_meme: '😂',
  trashy_media: '🗑️',
  commentary: '💬',
  music_video: '🎵',
  live_performance: '🎤',
};

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + '…';
}

// Simple hash for deterministic "randomness"
function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

interface ThumbnailOptions {
  title: string;
  artistName?: string;
  channelName?: string;
  channelIcon?: string;
  sentiment?: string;
  contentType?: string;
  overlay?: string;
  isCelebrity?: boolean;
  isViral?: boolean;
}

/**
 * Generate AI-powered thumbnail using Gemini
 */
async function generateAIThumbnail(opts: ThumbnailOptions): Promise<string> {
  const {
    title,
    artistName = '',
    channelName = '',
    channelIcon = '',
    sentiment = 'neutral',
    contentType = 'reaction',
    isCelebrity = false,
    isViral = false,
  } = opts;

  const sentimentDescriptions = {
    hype: 'excited, energetic, positive reaction with fire/energy themes',
    critic: 'professional, analytical, serious music review with critical eye',
    mixed: 'balanced, thoughtful reaction showing both positives and negatives',
    hater: 'negative, critical, disappointed reaction with bold red/black themes',
    casual: 'relaxed, friendly, everyday person reaction',
    gossip: 'dramatic, sensational, celebrity-style reaction',
    interview: 'professional, journalistic, behind-the-scenes style',
    neutral: 'objective, balanced, straightforward reaction'
  };

  const prompt = `Generate a creative YouTube thumbnail as SVG for a reaction video with these details:

TITLE: "${title}"
ARTIST: "${artistName}"
CHANNEL: "${channelName}" (${channelIcon})
SENTIMENT: ${sentiment} - ${sentimentDescriptions[sentiment] || 'balanced reaction'}
TYPE: ${contentType} reaction video
CELEBRITY: ${isCelebrity ? 'Yes - make it flashy and premium' : 'No - standard channel style'}
VIRAL: ${isViral ? 'Yes - add viral elements and high energy' : 'No - standard reaction'}

Requirements:
- Create as valid SVG code (no <svg> wrapper needed, just the inner content)
- Use modern YouTube thumbnail design principles
- Include channel branding with the channel icon "${channelIcon}"
- Use colors and styling that match the "${sentiment}" sentiment
- Make the title text prominent and readable
- Add visual elements that suggest it's a reaction video
- Include the artist name "${artistName}" if space allows
- Size should be 1280x720 (16:9 aspect ratio)
- Use bold, modern typography suitable for YouTube
- Add subtle gradients and visual depth

Return ONLY the SVG code, no explanations or markdown.`;

  try {
    const response = await invokeLLM({
      prompt,
      response_json_schema: {
        type: "object",
        properties: {
          svg_content: {
            type: "string",
            description: "The SVG thumbnail code"
          }
        },
        required: ["svg_content"]
      }
    });

    const svgContent = response.svg_content;
    
    // Convert to data URI
    const svgWithWrapper = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">${svgContent}</svg>`;
    const base64 = btoa(svgWithWrapper);
    return `data:image/svg+xml;base64,${base64}`;
    
  } catch (error) {
    console.warn('[AIThumbnail] AI generation failed, falling back to procedural:', error);
    return generateProceduralThumbnail(opts); // Fallback to procedural
  }
}

/**
 * Generate procedural SVG thumbnail as fallback
 */
export function generateProceduralReactionThumbnail(
  title: string,
  artistName: string,
  channel: { name: string; icon: string; sentiment: string; overlay?: string; isCelebrity?: boolean },
  isViral = false
): string {
  return generateProceduralThumbnail({
    title,
    artistName,
    channelName: channel.name,
    channelIcon: channel.icon,
    sentiment: channel.sentiment,
    contentType: 'reaction',
    overlay: channel.overlay,
    isCelebrity: channel.isCelebrity,
    isViral,
  });
}

/**
 * Generate procedural SVG thumbnail as fallback
 */
function generateProceduralThumbnail(opts: ThumbnailOptions): string {
  const {
    title,
    artistName = '',
    channelName = '',
    channelIcon = '',
    sentiment = 'neutral',
    contentType = 'reaction',
    overlay,
    isCelebrity = false,
    isViral = false,
  } = opts;

  const palette = PALETTES[sentiment] || PALETTES.neutral;
  const typeOverlay = overlay || TYPE_OVERLAYS[contentType] || '🎬';
  const hash = simpleHash(title + artistName);

  // Geometric pattern seed
  const patternAngle = (hash % 360);
  const circleX = 60 + (hash % 200);
  const circleY = 30 + (hash % 100);
  const circleR = 40 + (hash % 60);

  const safeTitle = escapeXml(truncate(title, 60));
  const safeArtist = escapeXml(truncate(artistName, 30));
  const safeChannel = escapeXml(truncate(channelName, 25));
  const safeIcon = escapeXml(channelIcon);

  // Celebrity thumbnails get gold border
  const borderStyle = isCelebrity
    ? `<rect x="2" y="2" width="316" height="176" rx="6" fill="none" stroke="#ffd700" stroke-width="3"/>`
    : '';

  // Viral badge
  const viralBadge = isViral
    ? `<g transform="translate(260, 8)">
        <rect x="0" y="0" width="50" height="18" rx="9" fill="#ff0000" opacity="0.9"/>
        <text x="25" y="13" text-anchor="middle" font-family="Arial,sans-serif" font-size="8" font-weight="bold" fill="white">🔥 VIRAL</text>
      </g>`
    : '';

  // Channel badge at bottom
  const channelBadge = channelName
    ? `<g transform="translate(0, 148)">
        <rect x="0" y="0" width="320" height="32" fill="rgba(0,0,0,0.75)"/>
        <text x="10" y="20" font-family="Arial,sans-serif" font-size="11" font-weight="bold" fill="white">${safeIcon} ${safeChannel}</text>
        <text x="310" y="20" text-anchor="end" font-family="Arial,sans-serif" font-size="9" fill="${palette.accent}">▶ Watch</text>
      </g>`
    : '';

  // Overlay emoji (large, centered)
  const overlayEmoji = `<text x="260" y="80" font-size="48" text-anchor="middle" opacity="0.3" transform="rotate(${patternAngle % 30 - 15}, 260, 80)">${typeOverlay}</text>`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${palette.bg1}"/>
      <stop offset="100%" stop-color="${palette.bg2}"/>
    </linearGradient>
    <linearGradient id="titleBg" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="rgba(0,0,0,0)"/>
      <stop offset="100%" stop-color="rgba(0,0,0,0.7)"/>
    </linearGradient>
  </defs>
  <rect width="320" height="180" rx="8" fill="url(#bg)"/>
  <!-- Geometric accent -->
  <circle cx="${circleX}" cy="${circleY}" r="${circleR}" fill="${palette.accent}" opacity="0.08"/>
  <circle cx="${320 - circleX}" cy="${180 - circleY}" r="${circleR * 0.7}" fill="${palette.accent}" opacity="0.06"/>
  <!-- Diagonal stripe -->
  <line x1="0" y1="${80 + hash % 40}" x2="320" y2="${40 + hash % 40}" stroke="${palette.accent}" stroke-width="1.5" opacity="0.12"/>
  ${overlayEmoji}
  ${borderStyle}
  ${viralBadge}
  <!-- Title area -->
  <rect x="0" y="90" width="320" height="58" fill="url(#titleBg)"/>
  <text x="10" y="115" font-family="Arial,sans-serif" font-size="13" font-weight="bold" fill="${palette.text}">
    <tspan>${safeTitle.slice(0, 35)}</tspan>
  </text>
  ${safeTitle.length > 35 ? `<text x="10" y="132" font-family="Arial,sans-serif" font-size="11" fill="${palette.text}" opacity="0.85"><tspan>${escapeXml(truncate(title.slice(35), 40))}</tspan></text>` : ''}
  ${safeArtist ? `<text x="10" y="${safeTitle.length > 35 ? 146 : 132}" font-family="Arial,sans-serif" font-size="10" fill="${palette.accent}">${safeArtist}</text>` : ''}
  ${channelBadge}
</svg>`;

  // Convert to data URI
  const encoded = encodeURIComponent(svg)
    .replace(/'/g, '%27')
    .replace(/"/g, '%22');

  return `data:image/svg+xml,${encoded}`;
}

/**
 * Generate thumbnail for a reaction video using AI
 */
export async function generateReactionThumbnail(
  title: string,
  artistName: string,
  channel: { name: string; icon: string; sentiment: string; overlay?: string; isCelebrity?: boolean },
  isViral = false
): Promise<string> {
  return await generateAIThumbnail({
    title,
    artistName,
    channelName: channel.name,
    channelIcon: channel.icon,
    sentiment: channel.sentiment,
    contentType: 'reaction',
    overlay: channel.overlay,
    isCelebrity: channel.isCelebrity,
    isViral,
  });
}

/**
 * Generate thumbnail for fan content
 */
export function generateFanContentThumbnail(
  title: string,
  artistName: string,
  outletName: string,
  outletIcon: string,
  fanContentType: string
): string {
  return generateProceduralThumbnail({
    title,
    artistName,
    channelName: outletName,
    channelIcon: outletIcon,
    sentiment: 'fan',
    contentType: `fan_${fanContentType}`,
  });
}

/**
 * Generate thumbnail for trashy media
 */
export function generateTrashyThumbnail(
  title: string,
  artistName: string,
  outletName: string,
  outletIcon: string
): string {
  return generateProceduralThumbnail({
    title,
    artistName,
    channelName: outletName,
    channelIcon: outletIcon,
    sentiment: 'trashy',
    contentType: 'trashy_media',
  });
}
