import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://qcrffbsralnzlqqpzsri.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFjcmZmYnNyYWxuemxxcXB6c3JpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI2ODI0ODIsImV4cCI6MjA5ODI1ODQ4Mn0.6lOJZhs9oymBL-eOIGhTR5SN1ztujf6grH27zTa0Uac'

const supabase = createClient(supabaseUrl, supabaseKey)

async function debugPriyanshi() {
  // Get Priyanshi's account
  const { data: accounts } = await supabase
    .from('accounts')
    .select('*')
    .ilike('name', '%priyanshi%')
  
  const account = accounts[0]
  console.log(`Analyzing Priyanshi account (ID: ${account.id})\n`)

  // Get all F&O transactions
  const { data: txns } = await supabase
    .from('fo_transactions')
    .select('*')
    .eq('account_id', account.id)
    .order('date', { ascending: true })

  // Group by symbol
  const bySymbol = {}
  for (const t of txns) {
    if (!bySymbol[t.symbol]) bySymbol[t.symbol] = []
    bySymbol[t.symbol].push(t)
  }

  // Find open positions
  console.log('🔴 OPEN POSITIONS (Need Investigation)\n')
  console.log('─'.repeat(140))
  
  const openPositions = []
  
  for (const [symbol, trades] of Object.entries(bySymbol)) {
    let netQty = 0
    for (const t of trades) {
      netQty += Number(t.type === 'buy' ? t.qty : -t.qty)
    }
    
    if (Math.abs(netQty) > 0.01) {
      openPositions.push({ symbol, netQty, trades })
      
      console.log(`\n📌 ${symbol}`)
      console.log(`   Status: ${netQty > 0 ? 'LONG' : 'SHORT'} ${Math.abs(netQty)} qty`)
      console.log(`   Expiry: ${trades[0].expiry_date}`)
      console.log(`   Trades:`)
      
      const sorted = trades.sort((a, b) => new Date(a.date) - new Date(b.date))
      for (const t of sorted) {
        const side = t.type === 'buy' ? 'BUY ' : 'SELL'
        console.log(`     ${side} | ${t.date} | ${t.qty} @ ₹${t.price} | ID: ${t.id}`)
      }
    }
  }

  console.log('\n' + '─'.repeat(140))
  console.log(`\n📊 SUMMARY: ${openPositions.length} open positions found\n`)
  
  // Identify issues
  console.log('🔍 LIKELY ISSUES:\n')
  
  for (const { symbol, netQty, trades } of openPositions) {
    const sorted = trades.sort((a, b) => new Date(a.date) - new Date(b.date))
    const lastTrade = sorted[sorted.length - 1]
    
    console.log(`❌ ${symbol}`)
    console.log(`   Last trade: ${lastTrade.type} on ${lastTrade.date}`)
    console.log(`   Possible issues:`)
    
    // Check for incomplete pairs
    if (trades.length === 1) {
      console.log(`   • Missing closing trade - Only 1 trade found`)
    } else {
      // Check if last trade price is 0
      if (lastTrade.price === 0 || lastTrade.price === null) {
        console.log(`   • Last trade has 0 or null price (ID: ${lastTrade.id})`)
      }
      
      // Check for mismatched quantities
      let buyQty = 0, sellQty = 0
      for (const t of trades) {
        if (t.type === 'buy') buyQty += Number(t.qty)
        else sellQty += Number(t.qty)
      }
      
      if (Math.abs(buyQty - sellQty) > 0.01) {
        console.log(`   • Qty mismatch: ${buyQty} bought vs ${sellQty} sold`)
      }
    }
    console.log()
  }

  console.log('💡 RECOMMENDATION: Check if missing closing trades need to be uploaded')
}

debugPriyanshi().catch(err => {
  console.error('Error:', err.message)
  process.exit(1)
})
