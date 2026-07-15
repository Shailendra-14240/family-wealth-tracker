import { createClient } from '@supabase/supabase-js'
const s = createClient(
  'https://qcrffbsralnzlqqpzsri.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFjcmZmYnNyYWxuemxxcXB6c3JpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI2ODI0ODIsImV4cCI6MjA5ODI1ODQ4Mn0.6lOJZhs9oymBL-eOIGhTR5SN1ztujf6grH27zTa0Uac'
)
const r = await s.from('fo_transactions').select('*', { count: 'exact' }).ilike('source_file', '%contract_note%')
console.log(JSON.stringify(r, null, 2))
