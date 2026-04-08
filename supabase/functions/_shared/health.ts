Deno.serve(async () => {
  const hasSupabaseUrl = !!Deno.env.get('SUPABASE_URL');
  const hasAnonKey = !!Deno.env.get('SUPABASE_ANON_KEY');
  const hasServiceRole = !!Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  return Response.json({
    ok: hasSupabaseUrl && hasAnonKey,
    config: {
      supabase_url_set: hasSupabaseUrl,
      supabase_anon_key_set: hasAnonKey,
      supabase_service_role_set: hasServiceRole
    }
  });
});
