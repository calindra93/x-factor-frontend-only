/**
 * BACKUP MANAGER EDGE FUNCTION
 * Provides API endpoints for player data backup and restore
 * 
 * Endpoints:
 * - POST /backup/create - Create a new backup snapshot
 * - GET /backup/list - List available backups
 * - POST /backup/restore - Restore from a backup
 * - POST /backup/daily - Create daily backup (cron)
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createBackupSnapshot, restorePlayerData, listBackups, createDailyBackup } from '../_shared/backupSystem.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const path = url.pathname.replace('/backup/', '');

    switch (path) {
      case 'create': {
        if (req.method !== 'POST') {
          return new Response('Method not allowed', { status: 405, headers: corsHeaders });
        }

        const { label } = await req.json();
        const backup = await createBackupSnapshot(label);
        
        return new Response(JSON.stringify({
          success: true,
          backup: {
            id: backup.timestamp,
            label: label || 'manual',
            timestamp: backup.timestamp,
            playerCount: backup.playerCount,
            turnId: backup.turnId
          }
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      case 'list': {
        if (req.method !== 'GET') {
          return new Response('Method not allowed', { status: 405, headers: corsHeaders });
        }

        const limit = parseInt(url.searchParams.get('limit') || '10');
        const backups = await listBackups(limit);
        
        return new Response(JSON.stringify({
          success: true,
          backups
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      case 'restore': {
        if (req.method !== 'POST') {
          return new Response('Method not allowed', { status: 405, headers: corsHeaders });
        }

        const { backupId } = await req.json();
        if (!backupId) {
          return new Response(JSON.stringify({ 
            success: false, 
            error: 'backupId is required' 
          }), { 
            status: 400, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          });
        }

        const success = await restorePlayerData(backupId);
        
        return new Response(JSON.stringify({
          success,
          message: success ? 'Player data restored successfully' : 'Restore failed'
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      case 'daily': {
        if (req.method !== 'POST') {
          return new Response('Method not allowed', { status: 405, headers: corsHeaders });
        }

        await createDailyBackup();
        
        return new Response(JSON.stringify({
          success: true,
          message: 'Daily backup created'
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      default:
        return new Response('Not found', { status: 404, headers: corsHeaders });
    }
  } catch (error) {
    console.error('[BackupManager] Error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
