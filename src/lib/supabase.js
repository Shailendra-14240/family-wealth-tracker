import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

const hasConfig = supabaseUrl && supabaseAnonKey

if (!hasConfig) {
  console.warn(
    'Supabase not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env to enable the backend.'
  )
}

export const supabase = hasConfig
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null
