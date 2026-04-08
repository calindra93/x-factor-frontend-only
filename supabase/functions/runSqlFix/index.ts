import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { supabaseAdmin } from "../_shared/lib/supabaseAdmin.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Execute SQL updates using supabaseAdmin with raw SQL
    const updates = [
      // Fix profiles table
      supabaseAdmin.rpc('exec_sql', { sql_query: "UPDATE public.profiles SET region = 'United States' WHERE region = 'North America'" }),
      supabaseAdmin.rpc('exec_sql', { sql_query: "UPDATE public.profiles SET home_region = 'United States' WHERE home_region = 'North America'" }),
      
      // Fix Tyla and Drake specifically
      supabaseAdmin.rpc('exec_sql', { sql_query: "UPDATE public.profiles SET home_region = 'Africa' WHERE artist_name = 'Tyla'" }),
      supabaseAdmin.rpc('exec_sql', { sql_query: "UPDATE public.profiles SET home_region = 'Canada' WHERE artist_name = 'Drake'" }),
      
      // Fix studios table
      supabaseAdmin.rpc('exec_sql', { sql_query: "UPDATE public.studios SET region = 'United States' WHERE region = 'North America'" }),
      
      // Fix venues table
      supabaseAdmin.rpc('exec_sql', { sql_query: "UPDATE public.venues SET region = 'United States' WHERE region = 'North America'" }),
      
      // Fix tours table
      supabaseAdmin.rpc('exec_sql', { sql_query: "UPDATE public.tours SET region = 'United States' WHERE region = 'North America'" }),
      
      // Fix gigs table
      supabaseAdmin.rpc('exec_sql', { sql_query: "UPDATE public.gigs SET region = 'United States' WHERE region = 'North America'" }),
      
      // Fix releases table
      supabaseAdmin.rpc('exec_sql', { sql_query: "UPDATE public.releases SET primary_region = 'United States' WHERE primary_region = 'North America'" }),
      
      // Fix fan_profiles region_share
      supabaseAdmin.rpc('exec_sql', { 
        sql_query: "UPDATE public.fan_profiles SET region_share = jsonb_set(region_share::jsonb, '{United States}', COALESCE((region_share::jsonb)->>'North America', '0')::text::jsonb) - 'North America' WHERE region_share ? 'North America'" 
      })
    ];

    // Wait for all updates to complete
    const results = await Promise.allSettled(updates);
    
    // Verify Tyla's current state
    const { data: tylaData, error: tylaError } = await supabaseAdmin
      .from('profiles')
      .select('artist_name, region, home_region')
      .eq('artist_name', 'Tyla')
      .single();

    // Verify no North America remains
    const { data: profilesCheck } = await supabaseAdmin
      .from('profiles')
      .select('region')
      .eq('region', 'North America');

    const { data: studiosCheck } = await supabaseAdmin
      .from('studios')
      .select('region')
      .eq('region', 'North America');

    return new Response(JSON.stringify({
      message: 'North America fix completed',
      results: results.map((r, i) => ({ 
        step: i + 1, 
        status: r.status === 'fulfilled' ? 'success' : 'failed',
        error: r.status === 'rejected' ? r.reason.message : null
      })),
      tylaState: tylaData || { error: tylaError?.message },
      remainingNorthAmerica: {
        profiles: profilesCheck?.length || 0,
        studios: studiosCheck?.length || 0
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    });

  } catch (error) {
    return new Response(JSON.stringify({ 
      error: error.message,
      stack: error.stack 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500
    });
  }
});
