import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/AuthContext'
import Login from './pages/Login'
import ForceChangePassword from './pages/ForceChangePassword'
import CheckIn from './pages/CheckIn'
import AdminShell from './pages/admin/AdminShell'
import Terms from './pages/admin/Terms'
import Sections from './pages/admin/Sections'
import Instructors from './pages/admin/Instructors'
import ResetData from './pages/admin/ResetData'
import SectionPicker from './pages/SectionPicker'
import SectionShell from './pages/section/SectionShell'
import TakeAttendance from './pages/section/TakeAttendance'
import Roster from './pages/section/Roster'
import Reports from './pages/section/Reports'
import Redlist from './pages/section/Redlist'
import ClassDays from './pages/section/ClassDays'

function FullScreenLoader() {
  return (
    <div className="min-h-screen grid place-items-center bg-chalk">
      <div className="w-8 h-8 rounded-full border-2 border-maroon-200 border-t-maroon-600 animate-spin" />
    </div>
  )
}

function Protected({ children, requireSuperadmin = false }) {
  const { session, profile, loading } = useAuth()
  if (loading) return <FullScreenLoader />
  if (!session) return <Navigate to="/login" replace />
  if (profile?.must_change_password) return <ForceChangePassword />
  if (requireSuperadmin && profile?.role !== 'superadmin') return <Navigate to="/" replace />
  return children
}

function Landing() {
  const { profile } = useAuth()
  if (profile?.role === 'superadmin') return <Navigate to="/admin" replace />
  return <SectionPicker />
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/checkin" element={<CheckIn />} />

      <Route path="/" element={<Protected><Landing /></Protected>} />

      <Route path="/admin" element={<Protected requireSuperadmin><AdminShell /></Protected>}>
        <Route index element={<Navigate to="terms" replace />} />
        <Route path="terms" element={<Terms />} />
        <Route path="sections" element={<Sections />} />
        <Route path="instructors" element={<Instructors />} />
        <Route path="reset" element={<ResetData />} />
      </Route>

      <Route path="/section/:sectionId" element={<Protected><SectionShell /></Protected>}>
        <Route index element={<Navigate to="attendance" replace />} />
        <Route path="attendance" element={<TakeAttendance />} />
        <Route path="roster" element={<Roster />} />
        <Route path="reports" element={<Reports />} />
        <Route path="redlist" element={<Redlist />} />
        <Route path="class-days" element={<ClassDays />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  )
}
