/**
 * BACKUP SYSTEM — Prevents player data loss
 * Provides automated backup and restore capabilities for critical player data
 */

import { supabaseAdmin } from './lib/supabaseAdmin.ts';

// Critical tables that should always be backed up
export const BACKUP_TABLES = [
  'players',
  'profiles', 
  'fan_profiles',
  'eras',
  'social_accounts',
  'social_posts',
  'releases',
  'songs',
  'projects',
  'merch',
  'tours',
  'gigs',
  'career_milestones',
  'notifications',
  'player_turn_history'
];

export interface BackupSnapshot {
  timestamp: string;
  turnId: number;
  tables: Record<string, any[]>;
  playerCount: number;
}

/**
 * Create a backup snapshot of all critical player data
 */
export async function createBackupSnapshot(label?: string): Promise<BackupSnapshot> {
  console.log(`[Backup] Creating snapshot: ${label || 'manual'}`);
  
  const timestamp = new Date().toISOString();
  const turnState = await supabaseAdmin
    .from('turn_state')
    .select('global_turn_id')
    .eq('id', 1)
    .single();
  
  const turnId = turnState.data?.global_turn_id || 1;
  const snapshot: BackupSnapshot = {
    timestamp,
    turnId,
    tables: {},
    playerCount: 0
  };

  // Backup each critical table
  for (const table of BACKUP_TABLES) {
    try {
      const { data, error } = await supabaseAdmin
        .from(table)
        .select('*')
        .limit(10000); // Reasonable limit to prevent oversized backups
      
      if (error) {
        console.warn(`[Backup] Warning: Could not backup ${table}: ${error.message}`);
        snapshot.tables[table] = [];
      } else {
        snapshot.tables[table] = data || [];
        if (table === 'players') {
          snapshot.playerCount = data?.length || 0;
        }
        console.log(`[Backup] ${table}: ${data?.length || 0} rows`);
      }
    } catch (e) {
      console.error(`[Backup] Error backing up ${table}:`, e);
      snapshot.tables[table] = [];
    }
  }

  // Store backup in a dedicated backups table
  try {
    await supabaseAdmin
      .from('player_backups')
      .insert({
        label: label || 'manual',
        snapshot: snapshot,
        created_at: timestamp
      });
  } catch (e) {
    console.error('[Backup] Failed to store backup:', e);
  }

  console.log(`[Backup] Snapshot complete: ${snapshot.playerCount} players, turn ${turnId}`);
  return snapshot;
}

/**
 * Restore players from a backup snapshot
 * Only restores player-related tables, preserves system state
 */
export async function restorePlayerData(backupId: string): Promise<boolean> {
  console.log(`[Backup] Restoring from backup: ${backupId}`);
  
  try {
    // Get the backup
    const { data: backup, error } = await supabaseAdmin
      .from('player_backups')
      .select('snapshot')
      .eq('id', backupId)
      .single();
    
    if (error || !backup?.snapshot) {
      console.error('[Backup] Backup not found:', error);
      return false;
    }

    const snapshot: BackupSnapshot = backup.snapshot;
    let restoredTables = 0;

    // Restore each table
    for (const [tableName, rows] of Object.entries(snapshot.tables)) {
      if (!BACKUP_TABLES.includes(tableName)) continue;
      
      try {
        // Clear existing data (only for player-related tables)
        if (tableName !== 'turn_state') {
          await supabaseAdmin
            .from(tableName)
            .delete()
            .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all real rows
        }

        // Insert backup data
        if (rows && rows.length > 0) {
          await supabaseAdmin
            .from(tableName)
            .upsert(rows, { onConflict: 'id' });
          
          console.log(`[Backup] Restored ${tableName}: ${rows.length} rows`);
        }
        restoredTables++;
      } catch (e) {
        console.error(`[Backup] Failed to restore ${tableName}:`, e);
      }
    }

    console.log(`[Backup] Restore complete: ${restoredTables}/${BACKUP_TABLES.length} tables`);
    return true;
  } catch (e) {
    console.error('[Backup] Restore failed:', e);
    return false;
  }
}

/**
 * List available backups
 */
export async function listBackups(limit = 10): Promise<any[]> {
  try {
    const { data, error } = await supabaseAdmin
      .from('player_backups')
      .select('id, label, created_at, snapshot')
      .order('created_at', { ascending: false })
      .limit(limit);
    
    if (error) {
      console.error('[Backup] Failed to list backups:', error);
      return [];
    }

    return data?.map(backup => ({
      id: backup.id,
      label: backup.label,
      timestamp: backup.created_at,
      playerCount: backup.snapshot?.playerCount || 0,
      turnId: backup.snapshot?.turnId || 0
    })) || [];
  } catch (e) {
    console.error('[Backup] Failed to list backups:', e);
    return [];
  }
}

/**
 * Create automatic daily backup
 */
export async function createDailyBackup(): Promise<void> {
  const today = new Date().toISOString().split('T')[0];
  await createBackupSnapshot(`daily_${today}`);
}
