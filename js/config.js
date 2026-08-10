/* =====================================================================
 * config.js — HIER trägst du deine zwei Supabase-Werte ein.
 * =====================================================================
 * Wo finde ich die Werte?
 *   Supabase-Dashboard -> Project Settings (Zahnrad) -> "API"
 *   - "Project URL"        -> unten bei SUPABASE_URL einsetzen
 *   - "Project API keys" -> "anon" "public" -> bei SUPABASE_ANON_KEY
 *
 * Ist der anon-Key geheim?
 *   Nein. Der "anon public"-Key ist dafür gedacht, im Browser zu stehen.
 *   Deine Daten sind durch die Row-Level-Security-Regeln geschützt
 *   (siehe supabase-schema.sql), nicht durch Geheimhaltung des Keys.
 *   NIEMALS den "service_role"-Key hier eintragen — der ist geheim!
 * =================================================================== */

window.WPM_CONFIG = {
  SUPABASE_URL: 'https://jnvpyttgzdcfdppaijxb.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_EJioAkDBkTm1MXRItJolbw_MRmkwfx-',
};
