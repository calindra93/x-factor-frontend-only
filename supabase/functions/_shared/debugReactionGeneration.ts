
import { supabaseAdmin } from './lib/supabaseAdmin.ts';
import { createSupabaseEntitiesAdapter } from './lib/supabaseEntityAdapter.ts';
import { generateReactionVideosForPlayer } from './socialMediaModule.ts';

export async function handleRequest(req: Request) {
  const supabase = supabaseAdmin;
  const entities = createSupabaseEntitiesAdapter(supabase);
  const logs: string[] = [];

  try {
    // 1. Find Tyla
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .ilike('artist_name', 'Tyla')
      .single();

    if (!profile) {
      return Response.json({ error: 'Tyla not found' }, { status: 404 });
    }

    logs.push(`Found artist: ${profile.artist_name} (${profile.id})`);

    // 2. Check recent posts (fetch manually to inspect)
    const recentPosts = await entities.SocialPost.filter({
      artist_id: profile.id,
      platform: 'vidwave'
    });
    
    logs.push(`Found ${recentPosts.length} VidWave posts.`);
    
    const musicVideos = recentPosts.filter((p: any) => {
      const vt = p.metadata?.video_type || p.post_type;
      return vt === 'music_video' || vt === 'live_performance';
    });

    logs.push(`Found ${musicVideos.length} Music Videos/Performances.`);
    
    musicVideos.forEach((mv: any) => {
      logs.push(`- MV: "${mv.title}" (ID: ${mv.id}, Type: ${mv.metadata?.video_type})`);
    });

    // 3. Dry-run generateReactionVideosForPlayer
    // We will inspect what it *would* create
    
    // We can't easily call the function and spy on it without modifying it or mocking entities.
    // But we can call it and see what it returns (it returns an array of posts to create).
    
    const turnId = 999; // Dummy turn ID
    const postsToCreate = await generateReactionVideosForPlayer(entities, profile, turnId);

    logs.push(`generateReactionVideosForPlayer (Standard) returned ${postsToCreate.length} posts to create.`);
    
    postsToCreate.forEach((p: any) => {
      logs.push(`  + Would create: "${p.title}"`);
      logs.push(`    - Channel: ${p.metadata?.reaction_channel_name} (${p.metadata?.reaction_channel_icon})`);
      logs.push(`    - Overlay: ${p.metadata?.thumbnail_overlay}`);
      logs.push(`    - Celebrity: ${p.metadata?.is_celebrity}`);
    });

    // 3b. Dry-run with VIRAL context
    // We mock a runaway song context to test celebrity trigger
    const mockRunawaySong = {
      songId: musicVideos[0]?.id || 'mock_id',
      runawayData: { turnsSinceDetected: 1 }
    };
    // We also need to ensure the linked release ID matches in the video metadata for the logic to trigger 'isRunaway'
    // Since we can't easily modify the entity in memory for the function call without deeper mocks,
    // we will rely on the 'isViral' check inside `generateReactionVideosForPlayer`.
    // The function checks `mvViews > 100000 || hype > 80`.
    // Let's assume Tyla has high hype or views, or we can just observe if we get lucky with the random seed.
    // Actually, I can pass the mockRunawaySong and if I pick a video that matches, it works.
    
    if (musicVideos.length > 0) {
      // Temporarily mock metadata on the first video object in memory if possible? 
      // No, `generateReactionVideosForPlayer` re-fetches or uses the passed entities.
      // It uses `entities.SocialPost.filter` to get recent posts. 
      // I can't easily mock the return of `entities.SocialPost.filter` without changing the adapter.
      
      // However, I can call the function with the `runawaySong` param.
      // `generateReactionVideosForPlayer` checks: `const isRunaway = runawaySong?.songId && (mv.metadata?.linked_release_id === runawaySong.songId);`
      // I need to know the linked_release_id of one of the music videos to test this path effectively.
      const targetMv = musicVideos.find((m: any) => m.metadata?.linked_release_id);
      
      if (targetMv) {
        const runawayCtx = { songId: targetMv.metadata.linked_release_id };
        const viralPosts = await generateReactionVideosForPlayer(entities, profile, turnId + 1, runawayCtx);
        logs.push(`\n[TEST] generateReactionVideosForPlayer (Runaway/Viral) returned ${viralPosts.length} posts.`);
        viralPosts.forEach((p: any) => {
           logs.push(`  + (Runaway) Would create: "${p.title}"`);
           logs.push(`    - Channel: ${p.metadata?.reaction_channel_name} (${p.metadata?.reaction_channel_icon})`);
           logs.push(`    - Celebrity: ${p.metadata?.is_celebrity}`);
        });
      } else {
        logs.push('\n[TEST] Could not test Runaway logic: No MV with linked_release_id found.');
      }
    }

    // 4. Check if reactions ALREADY exist
    for (const mv of musicVideos) {
      const reactions = await entities.SocialPost.filter({
        reacting_to_post_id: mv.id
      });
      logs.push(`MV "${mv.title}" has ${reactions.length} existing reactions.`);
      reactions.forEach((r: any) => {
        logs.push(`    > Existing: "${r.title}" (ID: ${r.id})`);
      });
    }

    return Response.json({
      success: true,
      logs,
      postsToCreateCount: postsToCreate.length
    });

  } catch (error: any) {
    return Response.json({
      success: false,
      error: error.message,
      stack: error.stack,
      logs
    }, { status: 500 });
  }
}
