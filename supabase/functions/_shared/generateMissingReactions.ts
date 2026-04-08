
import { supabaseAdmin } from './lib/supabaseAdmin.ts';
import { createSupabaseEntitiesAdapter } from './lib/supabaseEntityAdapter.ts';
import { generateReactionVideosForPlayer } from './socialMediaModule.ts';

export async function handleRequest(req: Request) {
  const supabase = supabaseAdmin;
  const entities = createSupabaseEntitiesAdapter(supabase);
  const logs: string[] = [];
  const created: any[] = [];

  try {
    // 1. Find Tyla
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .ilike('artist_name', 'Tyla')
      .single();

    if (!profile) return Response.json({ error: 'Tyla not found' }, { status: 404 });

    logs.push(`Checking reactions for: ${profile.artist_name}`);

    // 2. Generate missing reactions
    // We pass a dummy turn ID (Date.now()) to seed the randomizer
    const postsToCreate = await generateReactionVideosForPlayer(entities, profile, Date.now());

    logs.push(`Found ${postsToCreate.length} missing reactions to generate.`);

    // 3. Create them in the database
    for (const post of postsToCreate) {
      // Ensure status is published and timestamps are correct
      const payload = {
        ...post,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const { data, error } = await supabase
        .from('social_posts')
        .insert(payload)
        .select()
        .single();

      if (error) {
        logs.push(`FAILED to create reaction "${post.title}": ${error.message}`);
      } else {
        logs.push(`SUCCESS: Created reaction "${post.title}"`);
        created.push(data);
      }
    }

    return Response.json({ success: true, logs, createdCount: created.length });

  } catch (e: any) {
    return Response.json({ success: false, error: e.message, stack: e.stack, logs }, { status: 500 });
  }
}
