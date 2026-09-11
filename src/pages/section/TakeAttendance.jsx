import React, { useEffect, useRef, useState, useCallback } from 'react'
import { useOutletContext } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../lib/AuthContext'
import { localDateStr } from '../../lib/localDate'

const TOKEN_TTL = 15
const ROTATE_EVERY = 12
const POLL_EVERY = 6

function todayStr() {
  return localDateStr()
}

export default function TakeAttendance() {
  const { sectionId } = useOutletContext()
  const { profile } = useAuth()
  const [sessions, setSessions] = useState([])
  const [sessionsLoading, setSessionsLoading] = useState(true)
  const [sessionId, setSessionId] = useState('')
  const [session, setSession] = useState(null)
  const [schedule, setSchedule] = useState(null)
  const [token, setToken] = useState(null)
  const [running, setRunning] = useState(false)
  const [checkins, setCheckins] = useState([])
  const [loadError, setLoadError] = useState('')
  const [fullscreen, setFullscreen] = useState(false)
  const containerRef = useRef(null)
  const rotateTimer = useRef(null)
  const pollTimer = useRef(null)

  useEffect(() => { loadSessions() }, [sectionId])

  async function loadSessions() {
    setSessionsLoading(true)
    const { data } = await supabase.from('class_sessions').select('*').eq('section_id', sectionId).order('session_date', { ascending: true })
    setSessions(data || [])
    const today = todayStr()
    const match = (data || []).find((s) => s.session_date === today)
    setSessionId(match ? match.id : data?.[data.length - 1]?.id || '')
    setSessionsLoading(false)
  }

  useEffect(() => {
    if (!sessionId) { setSession(null); return }
    const s = sessions.find((x) => x.id === sessionId)
    setSession(s || null)
    if (s) loadSchedule(s.session_date)
    loadCheckins(sessionId)
  }, [sessionId, sessions])

  async function loadSchedule(dateStr) {
    const weekday = new Date(dateStr + 'T12:00:00').getDay()
    const { data } = await supabase.from('section_schedule').select('*').eq('section_id', sectionId).eq('weekday', weekday).single()
    setSchedule(data)
  }

  async function loadCheckins(sid) {
    const { data, error } = await supabase
      .from('attendance')
      .select('id, checked_in_at, method, students(full_name, m_number, photo_url, is_test)')
      .eq('session_id', sid)
      .order('checked_in_at', { ascending: false })
    if (error) {
      console.error('Failed to load check-ins:', error)
      setLoadError(error.message)
      return
    }
    setLoadError('')
    setCheckins(data || [])
  }

  useEffect(() => {
    if (!sessionId) return
    const channel = supabase
      .channel(`attendance-${sessionId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance', filter: `session_id=eq.${sessionId}` }, () => loadCheckins(sessionId))
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [sessionId])

  useEffect(() => {
    if (!running || !sessionId) { clearInterval(pollTimer.current); return }
    pollTimer.current = setInterval(() => loadCheckins(sessionId), POLL_EVERY * 1000)
    return () => clearInterval(pollTimer.current)
  }, [running, sessionId])

  const rotate = useCallback(async () => {
    if (!sessionId) return
    const { data, error } = await supabase.rpc('rotate_token', { p_session_id: sessionId, p_ttl_seconds: TOKEN_TTL })
    if (!error && data?.[0]) setToken(data[0].token)
  }, [sessionId])

  async function startSession() {
    if (!session || !schedule) return
    const isToday = session.session_date === todayStr()

    const { data: fresh } = await supabase.from('class_sessions').select('checkin_opened_at').eq('id', session.id).single()
    const isFirstOpen = !fresh?.checkin_opened_at

    let closesIso = null
    if (isToday && isFirstOpen) {
      const [h, m] = (schedule.end_time || '09:50').split(':').map(Number)
      const closes = new Date(session.session_date + 'T00:00:00')
      closes.setHours(h, m + (schedule.late_grace_minutes ?? 10), 0, 0)
      closesIso = closes.toISOString()
    }

    await supabase.from('class_sessions').update({ checkin_closes_at: closesIso }).eq('id', session.id)
    setSession((prev) => ({ ...prev, checkin_closes_at: closesIso }))
    setRunning(true)
    await rotate()
    rotateTimer.current = setInterval(rotate, ROTATE_EVERY * 1000)
  }

  async function stopSession() {
    setRunning(false)
    clearInterval(rotateTimer.current)
    clearInterval(pollTimer.current)
    setToken(null)
    if (session?.id) {
      const nowIso = new Date().toISOString()
      await supabase.from('class_sessions').update({ checkin_closes_at: nowIso }).eq('id', session.id)
      setSession((prev) => (prev ? { ...prev, checkin_closes_at: nowIso } : prev))
    }
  }

  useEffect(() => () => { clearInterval(rotateTimer.current); clearInterval(pollTimer.current) }, [])

  function toggleFullscreen() {
    if (!document.fullscreenElement) { containerRef.current?.requestFullscreen?.(); setFullscreen(true) }
    else { document.exitFullscreen?.(); setFullscreen(false) }
  }
  useEffect(() => {
    const onFsChange = () => setFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onFsChange)
    return () => document.removeEventListener('fullscreenchange', onFsChange)
  }, [])

  const checkinUrl = session && token ? `${window.location.origin}/checkin?session=${session.id}&token=${token}` : null
  const realCheckins = checkins.filter((c) => !c.students?.is_test)
  const isClosed = session?.checkin_closes_at && new Date(session.checkin_closes_at) < new Date()

  return (
    <div>
      {!fullscreen && (
        <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
          <div>
            <h1 className="font-display text-2xl text-maroon-800">Take attendance</h1>
            <p className="text-maroon-400 text-sm mt-1">Signed in as {profile?.display_name}</p>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-maroon-500 uppercase tracking-wide mb-1">Class date</label>
            {sessionsLoading ? (
              <div className="rounded-lg border border-maroon-100 px-3 py-2 text-sm text-maroon-300 bg-white min-w-[220px] flex items-center gap-2">
                <span className="w-3.5 h-3.5 rounded-full border-2 border-maroon-200 border-t-maroon-600 animate-spin" />
                Loading dates…
              </div>
            ) : (
              <select
                value={sessionId}
                onChange={(e) => { stopSession(); setSessionId(e.target.value) }}
                className="rounded-lg border border-maroon-100 px-3 py-2 text-sm text-maroon-800 bg-white min-w-[220px]"
              >
                {sessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {new Date(s.session_date + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
      )}

      <div ref={containerRef} className={fullscreen ? 'fixed inset-0 bg-maroon-800 grid place-items-center z-50' : 'bg-maroon-800 rounded-2xl shadow-card p-8 grid place-items-center min-h-[420px] relative'}>
        {!fullscreen && <button onClick={toggleFullscreen} className="absolute top-4 right-4 text-maroon-200 hover:text-white text-xs border border-maroon-600 rounded-md px-2.5 py-1.5 transition">Full screen</button>}
        {fullscreen && <button onClick={toggleFullscreen} className="absolute top-6 right-6 text-maroon-300 hover:text-white text-sm">Exit</button>}

        {sessionsLoading ? (
          <div className="flex flex-col items-center gap-3">
            <span className="w-6 h-6 rounded-full border-2 border-maroon-500 border-t-white animate-spin" />
            <p className="text-maroon-300 text-sm">Loading this section…</p>
          </div>
        ) : !session ? (
          <p className="text-maroon-300">Pick a class date to begin.</p>
        ) : !schedule?.start_time ? (
          <p className="text-maroon-300 text-center max-w-sm">This date isn't a scheduled class day for this section.</p>
        ) : isClosed ? (
          <div className="text-center">
            <p className="text-maroon-200 font-display text-lg mb-1">Check-in closed for this date</p>
            <p className="text-maroon-400 text-sm mb-5">{realCheckins.length} student{realCheckins.length === 1 ? '' : 's'} checked in</p>
            <motion.button
              whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
              onClick={startSession}
              className="bg-white hover:bg-maroon-50 text-maroon-700 font-semibold rounded-xl px-6 py-3 transition"
            >
              Reopen check-in
            </motion.button>
          </div>
        ) : !running ? (
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 18 }} className="text-center">
            <p className="font-display text-white text-xl mb-1">
              {new Date(session.session_date + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
            </p>
            <p className="text-maroon-300 text-sm mb-6">
              {session.session_date === todayStr() ? `Opens in the last ${schedule.checkin_window_minutes} min of class` : 'Not today — opens as a manual window and stays open until you end it'}
            </p>
            <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }} onClick={startSession} className="bg-white hover:bg-maroon-50 text-maroon-700 font-semibold rounded-xl px-6 py-3 transition">
              Start check-in
            </motion.button>
          </motion.div>
        ) : (
          <div className="text-center">
            <motion.div key={token} initial={{ scale: 0.82, opacity: 0, rotate: -2 }} animate={{ scale: 1, opacity: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 340, damping: 16 }}
              className="relative w-[240px] h-[240px] mx-auto mb-6 bg-white rounded-[28px] shadow-[0_20px_50px_rgba(61,11,20,0.35)] grid place-items-center p-4">
              <div className="absolute -inset-px rounded-[28px] border-2 border-maroon-100 pointer-events-none" />
              {checkinUrl && <QRCodeSVG value={checkinUrl} size={200} bgColor="#ffffff" fgColor="#3D0B14" level="M" />}
            </motion.div>
            <p className="text-white font-display text-xl">Scan to check in</p>
            <motion.p key={realCheckins.length} initial={{ scale: 1.15 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 400, damping: 12 }} className="text-maroon-200 text-sm mt-2">
              {realCheckins.length} checked in
            </motion.p>
            {!fullscreen && <button onClick={stopSession} className="mt-6 text-maroon-300 hover:text-white text-sm underline underline-offset-4">End check-in</button>}
          </div>
        )}
      </div>

      {!fullscreen && (
        <div className="mt-6 bg-white rounded-2xl shadow-card p-5">
          <h2 className="font-display text-lg text-maroon-800 mb-3">Live roll — {realCheckins.length} today</h2>
          {loadError && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3.5 py-2.5 mb-3">{loadError}</p>}
          <ManualCheckIn sectionId={sectionId} sessionId={sessionId} profile={profile} onMarked={() => loadCheckins(sessionId)} />
          <AnimatePresence initial={false}>
            <div className="divide-y divide-maroon-50 mt-1">
              {checkins.length === 0 && <p className="text-maroon-300 text-sm py-4">No check-ins yet.</p>}
              {checkins.map((c) => (
                <motion.div key={c.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} className="flex items-center justify-between py-2.5">
                  <div className="flex items-center gap-3">
                    <Avatar name={c.students?.full_name} url={c.students?.photo_url} />
                    <div>
                      <p className="text-maroon-800 text-sm font-medium">{c.students?.full_name}</p>
                      <p className="text-maroon-300 text-xs font-mono">{c.students?.m_number}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {c.students?.is_test && <span className="text-[10px] bg-gold-100 text-gold-700 rounded px-1.5 py-0.5">TEST — not counted above</span>}
                    {c.method === 'manual' && <span className="text-[10px] bg-maroon-50 text-maroon-500 rounded px-1.5 py-0.5">manual</span>}
                    <span className="text-maroon-300 text-xs">{new Date(c.checked_in_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
                    <button onClick={async () => { await supabase.from('attendance').delete().eq('id', c.id); loadCheckins(sessionId) }} className="text-maroon-200 hover:text-red-600 text-xs" title="Undo">✕</button>
                  </div>
                </motion.div>
              ))}
            </div>
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}

function ManualCheckIn({ sectionId, sessionId, profile, onMarked }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [busy, setBusy] = useState(false)
  const [justAdded, setJustAdded] = useState('')

  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); return }
    const t = setTimeout(async () => {
      const { data } = await supabase.from('students').select('id, full_name, m_number')
        .eq('section_id', sectionId).eq('active', true)
        .or(`full_name.ilike.%${query.trim()}%,m_number.ilike.%${query.trim()}%`).limit(6)
      setResults(data || [])
    }, 200)
    return () => clearTimeout(t)
  }, [query, sectionId])

  async function markPresent(student) {
    if (!sessionId) return
    setBusy(true)
    await supabase.from('attendance').upsert(
      { session_id: sessionId, student_id: student.id, status: 1, method: 'manual', marked_by: profile?.id },
      { onConflict: 'session_id,student_id' }
    )
    setBusy(false); setQuery(''); setResults([]); setJustAdded(student.full_name)
    onMarked(); setTimeout(() => setJustAdded(''), 2000)
  }

  return (
    <div className="relative mb-3">
      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Mark someone present manually — search by name or M-number…" className="input text-sm" disabled={!sessionId} />
      {justAdded && <p className="text-xs text-green-700 mt-1.5">✓ Marked {justAdded} present.</p>}
      {results.length > 0 && (
        <div className="absolute left-0 right-0 mt-1 bg-white border border-maroon-100 rounded-lg shadow-card z-10 overflow-hidden">
          {results.map((s) => (
            <button key={s.id} disabled={busy} onClick={() => markPresent(s)} className="w-full text-left px-3 py-2 hover:bg-maroon-50 text-sm flex items-center justify-between disabled:opacity-50">
              <span className="text-maroon-800">{s.full_name}</span>
              <span className="text-maroon-300 text-xs font-mono">{s.m_number}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function Avatar({ name, url }) {
  const initials = (name || '?').split(' ').map((s) => s[0]).slice(0, 2).join('').toUpperCase()
  if (url) return <img src={url} alt={name} className="w-8 h-8 rounded-full object-cover" />
  return <div className="w-8 h-8 rounded-full bg-maroon-100 text-maroon-600 text-xs font-semibold grid place-items-center">{initials}</div>
}
