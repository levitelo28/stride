// Public Supabase project URL and publishable key (safe to ship; row-level security protects data).
// Override with EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.local.
export const SUPABASE_URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'https://tlslogvdbwjttfehesrr.supabase.co';
export const SUPABASE_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? 'sb_publishable_QiiSCbrsiYvh1TB3L9xOLg_2ahLJvRK';

/** Public privacy policy (served by the Netlify site from stride-v9/privacy.html). */
export const PRIVACY_URL = 'https://stridehealth.netlify.app/privacy.html';
