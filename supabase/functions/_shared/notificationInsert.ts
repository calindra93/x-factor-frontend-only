export async function insertNotificationIdempotent(supabase: any, notification: any, scope = 'notifications') {
  const { error } = await supabase.from('notifications').insert(notification);
  if (!error) return { inserted: true, duplicate: false, error: null };

  if (error.code === '23505') {
    return { inserted: false, duplicate: true, error };
  }

  console.error(`[${scope}] Notification insert failed: ${error.message}`, {
    code: error.code,
    details: error.details,
    hint: error.hint,
    type: notification?.type,
    player_id: notification?.player_id,
    idempotency_key: notification?.idempotency_key,
  });

  return { inserted: false, duplicate: false, error };
}
