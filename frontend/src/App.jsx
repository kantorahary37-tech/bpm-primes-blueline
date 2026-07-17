import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { DepartmentsProvider } from './contexts/DepartmentsContext'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import BonusesList from './pages/BonusesList'
import BonusKanban from './pages/BonusKanban'
import BonusForm from './pages/BonusForm'
import BonusTypeSelect from './pages/BonusTypeSelect'
import BonusDetail from './pages/BonusDetail'
import PlafondsPage from './pages/PlafondsPage'
import ValidatedBonuses from './pages/ValidatedBonuses'
import ArchivePage from './pages/ArchivePage'
import Employees from './pages/Employees'
import UsersPage from './pages/UsersPage'
import Login from './pages/Login'
import SignUp from './pages/SignUp'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="flex justify-center p-8"><span className="loading loading-spinner loading-lg"></span></div>
  if (!user) return <Navigate to="/login" />
  return <Layout>{children}</Layout>
}

function RestrictedRoute({ children, roles }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="flex justify-center p-8"><span className="loading loading-spinner loading-lg"></span></div>
  if (!user) return <Navigate to="/login" />
  const allowed = roles.some(r => user[r])
  if (!allowed) return <Navigate to="/" />
  return <Layout>{children}</Layout>
}

function AppContent() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<SignUp />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/bonuses" element={<ProtectedRoute><BonusesList /></ProtectedRoute>} />
      <Route path="/bonuses/new" element={<ProtectedRoute><BonusTypeSelect /></ProtectedRoute>} />
      <Route path="/bonuses/new/:type" element={<ProtectedRoute><BonusForm /></ProtectedRoute>} />
      <Route path="/bonuses/:id" element={<ProtectedRoute><BonusDetail /></ProtectedRoute>} />
      <Route path="/bonuses/edit/:id" element={<ProtectedRoute><BonusForm /></ProtectedRoute>} />
      <Route path="/kanban/:type" element={<ProtectedRoute><BonusKanban /></ProtectedRoute>} />
      <Route path="/validated" element={<ProtectedRoute><ValidatedBonuses /></ProtectedRoute>} />
      <Route path="/archive" element={<RestrictedRoute roles={['is_drh', 'is_dg', 'is_admin']}><ArchivePage /></RestrictedRoute>} />
      <Route path="/employees" element={<ProtectedRoute><Employees /></ProtectedRoute>} />
      <Route path="/admin/users" element={<RestrictedRoute roles={['is_admin']}><UsersPage /></RestrictedRoute>} />
      <Route path="/settings/primemax" element={<ProtectedRoute><PlafondsPage /></ProtectedRoute>} />
    </Routes>
  )
}

function App() {
  return (
    <BrowserRouter>
      <Toaster position="top-right" toastOptions={{ duration: 3000, style: { fontSize: '14px', borderRadius: '10px', padding: '12px 16px' } }} />
      <AuthProvider>
        <DepartmentsProvider>
          <AppContent />
        </DepartmentsProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
