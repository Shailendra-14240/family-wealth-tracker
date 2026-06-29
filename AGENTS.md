# Family Wealth Tracker

A PWA web app for tracking family investments, accounts, and net worth. Shared between two users (Shailendra and father), no separate logins — everyone sees the same data.

## Tech Stack

- **Frontend**: React + Vite + Tailwind CSS + React Router v7
- **Backend**: Supabase (PostgreSQL, free tier)
- **Deployment**: Vercel (auto-deploys from GitHub main branch)
- **PWA**: Works offline, installable to home screen on iOS/Android

## Live URL

https://family-wealth-tracker-psi.vercel.app/

## GitHub

https://github.com/Shailendra-14240/family-wealth-tracker

## Supabase

- Project URL: https://qcrffbsralnzlqqpzsri.supabase.co
- Tables: accounts, holdings, transactions, net_worth_snapshots
- No RLS (public access — shared data)
- Anon key is set as VITE_SUPABASE_ANON_KEY in Vercel env vars

## Architecture Decisions

- **No auth** — single shared data store for both users
- **"brokerage" renamed to "demat"** in account types
- **CSV upload** for trade history (format: date,type,symbol,qty,price)
- **Fixed bottom nav** with z-10 and pb-28 padding for mobile

## Project Structure

```
├── index.html
├── vite.config.js              # Vite + PWA config, server.host: true
├── tailwind.config.js
├── .env.example
├── .gitignore
├── supabase/schema.sql         # DB schema (no auth version)
├── public/icons/               # PWA icons (192, 512)
└── src/
    ├── main.jsx                # React entry
    ├── App.jsx                 # Router (/, /accounts, /holdings, /transactions)
    ├── index.css               # Tailwind imports
    ├── lib/supabase.js         # Supabase client (null if no env vars)
    ├── components/
    │   └── Layout.jsx          # App shell with bottom nav
    └── pages/
        ├── Dashboard.jsx       # Net worth, summary cards, accounts list
        ├── Accounts.jsx        # CRUD accounts
        ├── Holdings.jsx        # Stock holdings list
        └── Transactions.jsx    # Manual entry + CSV upload
```

## To Run Locally

```bash
cd family-wealth-tracker
npm install
npm run dev        # http://localhost:5173
npm run build      # Production build → dist/
```

## Features Still to Build

- [ ] **Net worth trend chart** (using recharts + net_worth_snapshots table)
- [ ] **Holdings auto-calculation** from transactions (not manual entry)
- [ ] **Current LTP prices** — integrate with an API (e.g., Yahoo Finance, Kite)
- [ ] **Edit/delete accounts and transactions**
- [ ] **Export data to CSV**
- [ ] **Net worth history** — auto-snapshot daily
- [ ] **Categories for transactions** (dividend, interest, etc.)
- [ ] **Better mobile experience** (keyboard handling, pull-to-refresh)
- [ ] **Add father as a separate "owner" tag** per account/transaction (optional)
