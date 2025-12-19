// supabase.js
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://wygdmapqwqjqrmrksaef.supabase.co";

const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Z2RtYXBxd3FqcXJtcmtzYWVmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMyODE2NDEsImV4cCI6MjA2ODg1NzY0MX0.LPkBdlfSc6V8dbQ6wTAJMPvm7PzQ1OxOraypdee7w2I";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

console.log("Supabase client initialized:", supabase);
