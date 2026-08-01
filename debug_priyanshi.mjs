import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://qcrffbsralnzlqqpzsri.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFjcmZmYnNyYWxuemxxcXB6c3JpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI2ODI0ODIsImV4cCI6MjA5ODI1ODQ4Mn0.6lOJZhs9oymBL-eOIGhTR5SN1ztujf6grH27zTa0Uac'

const supabase = createClient(supabaseUrl, supabaseKey)

async function debugPriyanshi() {
  console.log('🔍 Fetching Priyanshi account...\n')
  
  // Get Priyanshi's account
  const { data: accounts } = await supabase
    .from('accounts')
    .select('*')
    .ilike('name', '%priyanshi%')
  
  if (!accounts || accounts.length === 0) {
    console.log('❌ No account found with "priyanshi" in name')
    return
  }

  const account = accounts[0]
  console.log(`✅ Found account: ${account.name} (ID: ${account.id})\n`)

  // Get all F&O transactions for Priyanshi
  const { data: txns } = await supabase
    .from('fo_transactions')
    .select('*')
    .eq('account_id', account.id)
    .order('date', { ascending: true })

  console.log(`📊 Total F&O transactions: ${txns.length}\n`)

  // Group by symbol
  const bySymbol = {}
  for (const t of txns) {
    if (!bySymbol[t.symbol]) bySymbol[t.symbol] = []
    bySymbol[t.symbol].push(t)
  }

  console.log(`🔤 Unique symbols: ${Object.keys(bySymbol).length}\n`)

  // Analyze each symbol
  console.log('─'.repeat(120))
  console.log('SYMBOL ANALYSIS')
  console.log('─'.repeat(120))

  for (const [symbol, trades] of Object.entries(bySymbol)) {
    let netQty = 0
    let openDate = null
    let closeDate = null
    
    // Process trades chronologically
    const sorted = trades.sort((a, b) => new Date(a.date) - new Date(b.date))
    
    for (const t of sorted) {
      const qty = Number(t.type === 'buy' ? t.qty : -t.qty)
      netQty += qty
      
      if (Math.abs(netQty) > 0 && !openDate) openDate = t.date
      if (Math.abs(netQty) === 0 && openDate) closeDate = t.date
    }

    const status = Math.abs(netQty) === 0 ? '✅ CLOSED' : '⚠️ OPEN'
    const qtyDisplay = Math.abs(netQty) > 0 ? `Long ${netQty}` : Math.abs(netQty) < 0 ? `Short ${netQty}` : 'Flat'
    
    console.log(`\n${status} ${symbol.padEnd(25)} | Qty: ${qtyDisplay.padEnd(12)} | Trades: ${sorted.length}`)
    
    // Show trade details
    for (const t of sorted) {
      const side = t.type === 'buy' ? '🟢 BUY ' : '🔴 SELL'
      console.log(`   ${side} | ${t.date} | ${t.qty} @ ${t.price} | ${t.expiry_date || 'N/A'}`)
    }
  }

  // Summary
  console.log('\n' + '─'.repeat(120))
  console.log('SUMMARY')
  console.log('─'.repeat(120))
  
  let openCount = 0
  let closedCount = 0
  
  for (const [symbol, trades] of Object.entries(bySymbol)) {
    let netQty = 0
    for (const t of trades) {
      netQty += Number(t.type === 'buy' ? t.qty : -t.qty)
    }
    
    if (Math.abs(netQty) > 0) {
      openCount++
      console.log(`⚠️ OPEN: ${symbol} - Net Qty: ${netQty}`)
    } else {
      closedCount++
    }
  }

  console.log(`\n📈 Open positions: ${openCount}`)
  console.log(`📉 Closed positions: ${closedCount}`)
}

debugPriyanshi().catch(err => {
  console.error('Error:', err.message)
  process.exit(1)
})
