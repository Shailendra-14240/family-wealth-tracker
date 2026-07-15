import { createClient } from '@supabase/supabase-js'
const s = createClient(
  'https://qcrffbsralnzlqqpzsri.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFjcmZmYnNyYWxuemxxcXB6c3JpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI2ODI0ODIsImV4cCI6MjA5ODI1ODQ4Mn0.6lOJZhs9oymBL-eOIGhTR5SN1ztujf6grH27zTa0Uac'
)
// Check for BAJFINANCE specifically
const r1 = await s.from('fo_transactions').select('id, symbol, type, qty, price, date, trade_id, source_file').ilike('symbol', '%BAJFINANCE26JAN1000%')
console.log('BAJFINANCE26JAN1000CE:', r1.data?.length || 0)
if (r1.data) for (const row of r1.data) console.log('  ', row)

// Check for any synthetic with BAJFINANCE
const r2 = await s.from('fo_transactions').select('id, symbol, trade_id').ilike('trade_id', 'SYNTH-BAJFINANCE%')
console.log('SYNTH-BAJFINANCE:', r2.data?.length || 0)
if (r2.data) for (const row of r2.data) console.log('  ', row)

// Also check ALL 111111 entries found by checking count
const r3 = await s.from('fo_transactions').select('*', { count: 'exact', head: true }).ilike('source_file', '%contract_note%')
console.log('Total contract_note entries:', r3.count)

// Check first batch IDs for BAJFINANCE
const r4 = await s.from('fo_transactions').select('id, symbol, trade_id').in('id', [371,372,373,374,375,376,377,378,379,380,381,382,383,384,385,386,387,388])
console.log('All batch entries:')
if (r4.data) for (const row of r4.data) console.log('  id:', row.id, row.symbol, row.trade_id)
