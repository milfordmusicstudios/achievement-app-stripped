import { supabase } from './supabaseClient.js';

/**
 * Require a logged-in user.
 * If not authenticated, redirect to login.
 */
export async function requireAuth() {
  const {
    data: { session },
    error
  } = await supabase.auth.getSession();

  if (error || !session) {
    window.location.href = 'login.html';
    return null;
  }

  return session.user;
}

/**
 * Get the current authenticated user (no redirect).
 */
export async function getCurrentUser() {
  const {
    data: { user },
    error
  } = await supabase.auth.getUser();

  if (error) return null;
  return user;
}

/**
 * Sign out and redirect to login.
 */
export async function signOut() {
  await supabase.auth.signOut();
  window.location.href = 'login.html';
}
