
import { supabaseAdmin } from './lib/supabaseAdmin.ts';
import { createSupabaseEntitiesAdapter } from './lib/supabaseEntityAdapter.ts';

// Copied from youtubeHandler.ts to ensure consistency
const VIDEO_TYPES: Record<string, { subGain: number }> = {
  music_video: { subGain: 0.004 },
  lyric_video: { subGain: 0.002 },
  visualizer: { subGain: 0.002 },
  studio_session: { subGain: 0.003 },
  songwriting: { subGain: 0.003 },
  vlog: { subGain: 0.003 },
  tour_diary: { subGain: 0.004 },
  reaction: { subGain: 0.002 },
  collab_video: { subGain: 0.005 },
  interview: { subGain: 0.002 },
  deep_dive: { subGain: 0.003 },
  live_performance: { subGain: 0.005 },
  short: { subGain: 0.003 }
};

const PRODUCTION_TIERS = [
  { id: 0, qualityMult: 0.7 },
  { id: 1, qualityMult: 1.0 },
  { id: 2, qualityMult: 1.5 },
  { id: 3, qualityMult: 2.2 },
  { id: 4, qualityMult: 3.5 }
];

function N(v: any): number { return Number(v) || 0; }

export async function handleRequest(req: Request) {
  const supabase = supabaseAdmin;
  const entities = createSupabaseEntitiesAdapter(supabase);
  const logs: string[] = [];
  const updates: any[] = [];

  try {
    // 1. Get all profiles to iterate artists
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, artist_name, followers');

    if (profilesError) throw profilesError;

    logs.push(`Found ${profiles.length} profiles to check.`);

    for (const profile of profiles) {
      // 2. Get VidWave social account
      const accounts = await entities.SocialAccount.filter({
        artist_id: profile.id,
        platform: 'vidwave'
      });
      
      if (!accounts || accounts.length === 0) {
        logs.push(`No VidWave account for ${profile.artist_name} (${profile.id}). Skipping.`);
        continue;
      }

      const account = accounts[0];
      const currentSubs = N(account.followers);

      // 3. Get all VidWave posts
      const posts = await entities.SocialPost.filter({
        artist_id: profile.id,
        platform: 'vidwave'
      });

      if (!posts || posts.length === 0) {
        logs.push(`No VidWave posts for ${profile.artist_name}. Skipping.`);
        continue;
      }

      // 4. Calculate Expected Subscribers
      let totalExpectedSubs = 0;

      for (const post of posts) {
        const views = N(post.views);
        if (views <= 0) continue;

        const metadata = post.metadata || {};
        const videoType = metadata.video_type || post.video_type || 'music_video';
        const productionTier = N(metadata.production_tier); // defaults to 0 if undefined

        const typeConfig = VIDEO_TYPES[videoType] || VIDEO_TYPES.music_video;
        const prodConfig = PRODUCTION_TIERS[productionTier] || PRODUCTION_TIERS[0];

        // Formula from youtubeHandler.ts
        const subGain = Math.floor(views * typeConfig.subGain * (1 + prodConfig.qualityMult * 0.2));
        
        totalExpectedSubs += subGain;
      }

      // 5. Compare and Update
      // We only update if expected > current, to avoid removing passive gains
      // However, if the difference is huge, it confirms the bug.
      
      const diff = totalExpectedSubs - currentSubs;
      
      if (diff > 0) {
        logs.push(`[UPDATE] ${profile.artist_name}: Current ${currentSubs} -> Expected ${totalExpectedSubs} (Diff: +${diff})`);
        
        // Update social account
        await entities.SocialAccount.update(account.id, {
          followers: totalExpectedSubs,
          updated_at: new Date().toISOString()
        });

        // We might also need to update the main profile followers if VidWave is a major component
        // But profile.followers is aggregate. Let's just update the social account for now 
        // to match the specific "VidWave Subscribers" request.
        // Actually, usually profile.followers should track the sum, but we'll stick to the specific fix.
        
        updates.push({
          artist: profile.artist_name,
          oldSubs: currentSubs,
          newSubs: totalExpectedSubs,
          diff
        });
      } else {
        logs.push(`[OK] ${profile.artist_name}: Current ${currentSubs} >= Expected ${totalExpectedSubs}`);
      }
    }

    return Response.json({
      success: true,
      message: `Processed ${profiles.length} profiles. Updated ${updates.length}.`,
      updates,
      logs
    });

  } catch (error: any) {
    console.error('Backfill error:', error);
    return Response.json({
      success: false,
      error: error.message,
      logs
    }, { status: 500 });
  }
}
