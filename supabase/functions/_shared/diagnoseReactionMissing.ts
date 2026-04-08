
import { supabaseAdmin } from './lib/supabaseAdmin.ts';
import { createSupabaseEntitiesAdapter } from './lib/supabaseEntityAdapter.ts';

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

    if (!profile) return Response.json({ error: 'Tyla not found' }, { status: 404 });

    logs.push(`Artist: ${profile.artist_name} (${profile.id})`);

    // 2. Find the "Patience" video
    const { data: videos } = await supabase
      .from('social_posts')
      .select('*')
      .eq('artist_id', profile.id)
      .ilike('title', '%Patience%'); // Match partial title

    if (!videos || videos.length === 0) {
      logs.push('No video found matching "Patience"');
      return Response.json({ success: false, logs, step: 'video_lookup' });
    }

    const video = videos[0];
    logs.push(`Found Video: "${video.title}" (ID: ${video.id}) created at ${video.created_at}`);

    // 3. Check Turn History
    const history = await entities.PlayerTurnHistory.filter(
      { player_id: profile.id },
      '-created_at',
      5
    );

    logs.push('Recent Turn History:');
    history.forEach((h: any) => {
      logs.push(`- Turn ${h.global_turn_id}: ${h.status} (Started: ${h.started_at}, Completed: ${h.completed_at})`);
    });

    // 4. Check Turn Timing
    // Was the video created BEFORE the last successful turn completion?
    const lastCompleted = history.find((h: any) => h.status === 'completed');
    if (lastCompleted) {
      const vidTime = new Date(video.created_at).getTime();
      const turnTime = new Date(lastCompleted.started_at).getTime(); // Logic runs between start/complete
      
      logs.push(`Video Time: ${vidTime}`);
      logs.push(`Last Turn Start: ${turnTime}`);
      
      if (vidTime < turnTime) {
        logs.push('TIMING: Video was created BEFORE the last turn started. Reactions SHOULD exist.');
      } else {
        logs.push('TIMING: Video was created AFTER the last turn started. Reactions will appear NEXT turn.');
      }
    } else {
      logs.push('TIMING: No completed turns found.');
    }

    // 5. Check for EXISTING reactions (orphaned?)
    const { data: existingReactions } = await supabase
      .from('social_posts')
      .select('*')
      .eq('reacting_to_post_id', video.id);

    logs.push(`Existing DB Reactions for this video: ${existingReactions?.length || 0}`);
    existingReactions?.forEach((r: any) => logs.push(`- ${r.title} (${r.created_at})`));

    return Response.json({ success: true, logs });

  } catch (error: any) {
    return Response.json({
      success: false,
      error: error.message,
      logs
    }, { status: 500 });
  }
}
