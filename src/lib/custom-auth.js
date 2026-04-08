import { supabaseClient } from '@/lib/supabaseClient';

const USER_ID_KEY = 'user_account_id';
const USER_EMAIL_KEY = 'user_email';

export const getStoredUserAccountId = () => {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(USER_ID_KEY);
};

export const clearStoredUser = () => {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(USER_ID_KEY);
  localStorage.removeItem(USER_EMAIL_KEY);
};

export const getCurrentUserAccount = async () => {
  const userAccountId = getStoredUserAccountId();
  if (!userAccountId) return null;

  const { data } = await supabaseClient.from('players').select('*').eq('id', userAccountId).maybeSingle();
  return data ?? null;
};
