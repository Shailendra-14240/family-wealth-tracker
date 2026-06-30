import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Accounts from './pages/Accounts'
import Holdings from './pages/Holdings'
import Transactions from './pages/Transactions'
import CorporateActions from './pages/CorporateActions'
import LotWisePnl from './pages/LotWisePnl'

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/accounts" element={<Accounts />} />
        <Route path="/holdings" element={<Holdings />} />
        <Route path="/transactions" element={<Transactions />} />
        <Route path="/corporate-actions" element={<CorporateActions />} />
        <Route path="/lot-pnl" element={<LotWisePnl />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  )
}
