import { createClient } from '@supabase/supabase-js';
import type { Database } from '@cb/shared';
import { env } from '../env';

/** Server-only client using the service-role key (bypasses RLS). Never expose to the browser. */
export const db = createClient<Database>(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
