import('C:/Users/shail/PycharmProjects/tracker/src/lib/pnlCalc.js').then(async (mod) => {
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFjcmZmYnNyYWxuemxxcXB6c3JpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI2ODI0ODIsImV4cCI6MjA5ODI1ODQ4Mn0.6lOJZhs9oymBL-eOIGhTR5SN1ztujf6grH27zTa0Uac';
const url = 'https://qcrffbsralnzlqqpzsri.supabase.co';
const headers = { apikey: key };
const q = async (path) => { const r = await fetch(url + '/rest/v1/' + path, { headers }); return r.json(); };

const txns = await q("transactions?symbol=eq.TATAMTRDVR&order=date");
console.log('=== ALL DVR TRANSACTIONS (' + txns.length + ') ===');
for (const t of txns) console.log(t.date, t.type, t.qty, t.price, 'order=' + (t.order_id||'').substring(0,14));

console.log('\n=== ENGINE FIFO MATCHING (DVR only) ===');
const buys = txns.filter(t => t.type === 'buy').map(t => ({ qty: t.qty, price: t.price, date: t.date }));

for (const s of txns.filter(t => t.type === 'sell')) {
  let rem = s.qty;
  while (rem > 0 && buys.length > 0) {
    const b = buys[0];
    const matched = Math.min(rem, b.qty);
    const pnl = matched * (s.price - b.price);
    console.log('Sell ' + matched + '@' + s.price + ' vs Buy ' + matched + '@' + b.price + ' (' + b.date + ') P&L=' + pnl.toFixed(0));
    b.qty -= matched;
    rem -= matched;
    if (b.qty === 0) buys.shift();
  }
  if (rem > 0) console.log('  !! UNMATCHED: ' + rem);
}

const remaining = buys.filter(b => b.qty > 0);
console.log('\nRemaining DVR (' + remaining.reduce((s,b) => s + b.qty, 0) + ' shares):');
for (const b of remaining) console.log('  ' + b.qty.toFixed(1) + ' @ ' + b.price + ' from ' + b.date);
});
