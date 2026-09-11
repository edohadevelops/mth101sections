import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../lib/AuthContext'
import { bannerGradient } from '../lib/cardBanner'
import Tip from '../lib/Tip'
import ChangePasswordModal from '../lib/ChangePasswordModal'

const WEEKDAY_ABBR = { 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu' }

export default function SectionPicker() {
  const { profile, logout } = useAuth()
  const navigate = useNavigate()
  const [sections, setSections] = useState([])
  const [loading, setLoading] = useState(true)
  const [changingPassword, setChangingPassword] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase
      .from('instructor_sections')
      .select('role, sections(id, section_number, status, terms(name), courses(code), section_schedule(*))')
      .eq('instructor_id', profile.id)
    setSections((data || []).filter((d) => d.sections?.status === 'active'))
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-chalk">
      <header className="bg-maroon-700 text-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-maroon-600 grid place-items-center font-display font-semibold text-sm">101</div>
            <p className="font-display text-[15px]">MTH Attendance Platform</p>
          </div>
          <div className="flex items-center gap-4">
            <span className="hidden sm:block text-sm text-maroon-100">{profile?.display_name}</span>
            <button onClick={() => setChangingPassword(true)} className="text-sm text-maroon-200 hover:text-white">
              Change password
            </button>
            <button onClick={logout} className="text-sm text-maroon-200 hover:text-white border border-maroon-500 hover:border-maroon-400 rounded-md px-3 py-1.5 transition">
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
        <h1 className="font-display text-2xl text-maroon-800 mb-6">Your sections</h1>

        {loading ? (
          <p className="text-maroon-300">Loading…</p>
        ) : sections.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-card p-8 text-center">
            <p className="text-maroon-500">You're not assigned to any active sections yet.</p>
            <p className="text-maroon-300 text-sm mt-1">Ask your supervisor to assign you to one.</p>
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {sections.map((l, i) => (
              <motion.div
                key={l.sections.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05, type: 'spring', stiffness: 260, damping: 22 }}
              >
                <Tip
                  tipKey="section-card"
                  title="Open your section"
                  text="Click the card, or hover and press Open, to get to attendance, the roster, redlist, and everything else for this section."
                  side="bottom"
                >
                  <SectionCard link={l} onOpen={() => navigate(`/section/${l.sections.id}`)} />
                </Tip>
              </motion.div>
            ))}
          </div>
        )}
      </main>
      {changingPassword && <ChangePasswordModal onClose={() => setChangingPassword(false)} />}
    </div>
  )
}

function SectionCard({ link, onOpen }) {
  const s = link.sections
  const [hover, setHover] = useState(false)

  return (
    <button
      onClick={onOpen}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="bg-white rounded-2xl shadow-card overflow-hidden block text-left w-full group"
    >
      <div className={`relative h-28 bg-gradient-to-br ${bannerGradient(s.id)} grid place-items-center`}>
        <span className="font-display text-white/90 text-2xl tracking-tight">{s.courses?.code}</span>
        {hover && (
          <motion.span
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
            className="absolute bottom-3 left-3 bg-maroon-900 text-white text-xs font-semibold rounded-full px-3 py-1.5"
          >
            Open →
          </motion.span>
        )}
      </div>
      <div className="p-4">
        <p className="font-display text-lg text-maroon-800">Section {s.section_number}</p>
        <p className="text-maroon-400 text-xs mb-3">{s.terms?.name}</p>
        <div className="flex items-center justify-between">
          <span className="text-maroon-500 text-xs">
            {(s.section_schedule || []).sort((a, b) => a.weekday - b.weekday).map((sc) => `${WEEKDAY_ABBR[sc.weekday]} ${sc.start_time?.slice(0, 5)}`).join(' · ')}
          </span>
          <span className="text-[10px] bg-maroon-50 text-maroon-600 rounded px-2 py-0.5 uppercase tracking-wide">{link.role}</span>
        </div>
      </div>
    </button>
  )
}
