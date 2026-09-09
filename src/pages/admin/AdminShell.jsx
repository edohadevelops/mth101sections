import React from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '../../lib/AuthContext'

const tabs = [
  { to: 'terms', label: 'Terms' },
  { to: 'instructors', label: 'Instructors' },
  { to: 'sections', label: 'Sections' },
  { to: 'reset', label: 'Reset Data' },
]

export default function AdminShell() {
  const { profile, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  async function onLogout() {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-screen bg-chalk">
      <header className="bg-maroon-700 text-white sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-maroon-600 text-white font-display font-semibold text-sm grid place-items-center">101</div>
              <div className="leading-tight">
                <p className="font-display text-[15px] tracking-tight">MTH Attendance Platform</p>
                <p className="text-[11px] text-maroon-200">Superadmin</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <span className="hidden sm:block text-sm text-maroon-100">{profile?.display_name}</span>
              <button onClick={onLogout} className="text-sm text-maroon-200 hover:text-white border border-maroon-500 hover:border-maroon-400 rounded-md px-3 py-1.5 transition">
                Sign out
              </button>
            </div>
          </div>
          <nav className="flex gap-1 -mb-px overflow-x-auto">
            {tabs.map((t) => (
              <NavLink key={t.to} to={t.to}
                className={({ isActive }) => `whitespace-nowrap px-4 py-2.5 text-sm font-medium border-b-2 transition ${
                  isActive ? 'border-white text-white' : 'border-transparent text-maroon-200 hover:text-white'
                }`}>
                {t.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <AnimatePresence mode="wait">
          <motion.div key={location.pathname} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 340, damping: 26 }}>
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  )
}