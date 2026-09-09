import React, { useEffect, useState, useMemo } from 'react'
import { useOutletContext } from 'react-router-dom'
import { motion } from 'framer-motion'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../lib/AuthContext'

const PHRASES = {
  attendance: { initial: 'missed several classes', follow_up: 'your attendance continues to be inconsistent', second_follow_up: 'your number of absences' },
  grade: { initial: 'not completing some of the assignments', follow_up: 'several assignments have not been completed', second_follow_up: 'missing assignments' },
}
const SUBJECTS = { initial: 'Checking In About Class', follow_up: 'Following Up About Class', second_follow_up: 'Concern About Your Progress' }
const TIER_LABELS = { initial: 'Initial Check-In', follow_up: 'Follow Up', second_follow_up: '2nd Follow Up' }
const TIER_ORDER = ['initial', 'follow_up', 'second_follow_up']

function bodyFor(tier, name, instructor, phrase) {
  if (tier === 'initial') return `Hi ${name},\n\nI wanted to reach out and check in with you. I've noticed that you've ${phrase} recently, and I wanted to make sure everything is okay.\n\nKeeping up with attendance, participation, and assignments is important for being successful in this course.\n\nIf something is making it difficult for you to stay on track, please reach out — I'd be happy to help you figure out next steps.\n\nBest,\n${instructor}`
  if (tier === 'follow_up') return `Hi ${name},\n\nI'm following up because I'm still concerned about your progress. I've noticed that ${phrase}, and I don't want you to fall further behind.\n\nPlease reply so we can talk about how to get you back on track.\n\nBest,\n${instructor}`
  return `Hi ${name},\n\nI'm reaching out because I'm concerned about your current progress. At this point in the semester, ${phrase} is making it increasingly difficult to stay on track.\n\nPlease reach out as soon as possible so we can discuss next steps.\n\nBest,\n${instructor}`
}
function firstName(f) { return (f || '').trim().split(' ')[0] || f }

async function fetchTierMap(studentIds, sectionId, reason) {
  if (studentIds.length === 0) return {}
  const { data } = await supabase.from('redlist_contacts').select('student_id').eq('section_id', sectionId).eq('reason', reason).in('student_id', studentIds)
  const counts = {}
  for (const c of data || []) counts[c.student_id] = (counts[c.student_id] || 0) + 1
  const tiers = {}
  for (const id of studentIds) tiers[id] = TIER_ORDER[Math.min(counts[id] || 0, TIER_ORDER.length - 1)]
  return tiers
}

export default function Redlist() {
  const [view, setView] = useState('attendance')
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div><h1 className="font-display text-2xl text-maroon-800">Redlist</h1></div>
        <div className="flex rounded-lg border border-maroon-200 overflow-hidden text-sm">
          <button onClick={() => setView('attendance')} className={`px-4 py-2 transition ${view === 'attendance' ? 'bg-maroon-700 text-white' : 'bg-white text-maroon-600 hover:bg-maroon-50'}`}>Attendance</button>
          <button onClick={() => setView('grade')} className={`px-4 py-2 transition ${view === 'grade' ? 'bg-maroon-700 text-white' : 'bg-white text-maroon-600 hover:bg-maroon-50'}`}>Grades</button>
        </div>
      </div>
      {view === 'attendance' ? <AttendanceRedlist /> : <GradeRedlist />}
    </div>
  )
}

function AttendanceRedlist() {
  const { sectionId } = useOutletContext()
  const { profile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [threshold, setThreshold] = useState(60)
  const [minDayPct, setMinDayPct] = useState(20)
  const [raw, setRaw] = useState(null)
  const [selected, setSelected] = useState(new Set())
  const [modalStudent, setModalStudent] = useState(null)

  useEffect(() => { load() }, [sectionId])

  async function load() {
    setLoading(true)
    const [{ data: students }, { data: sessions }, { data: present }] = await Promise.all([
      supabase.from('students').select('id, full_name, m_number, email, photo_url').eq('section_id', sectionId).eq('active', true).eq('is_test', false),
      supabase.from('class_sessions').select('id').eq('section_id', sectionId).not('checkin_opened_at', 'is', null),
      supabase.from('attendance').select('student_id, session_id').eq('status', 1),
    ])
    const activeIds = new Set((students || []).map((s) => s.id))
    const presentRows = (present || []).filter((r) => activeIds.has(r.student_id))
    const tiers = await fetchTierMap((students || []).map((s) => s.id), sectionId, 'attendance')
    setRaw({ students: students || [], sessionIds: (sessions || []).map((s) => s.id), presentRows, tiers })
    setLoading(false)
  }

  const computed = useMemo(() => {
    if (!raw) return { rows: [], daysTaken: 0 }
    const totalActive = raw.students.length || 1
    const presentCountBySession = {}
    for (const r of raw.presentRows) presentCountBySession[r.session_id] = (presentCountBySession[r.session_id] || 0) + 1
    const validSessionIds = new Set(raw.sessionIds.filter((id) => ((presentCountBySession[id] || 0) / totalActive) * 100 >= minDayPct))
    const daysTaken = validSessionIds.size
    const presentByStudent = {}
    for (const r of raw.presentRows) { if (validSessionIds.has(r.session_id)) presentByStudent[r.student_id] = (presentByStudent[r.student_id] || 0) + 1 }
    const rows = raw.students.map((s) => {
      const daysPresent = presentByStudent[s.id] || 0
      const missedPct = daysTaken > 0 ? Math.round(((daysTaken - daysPresent) / daysTaken) * 100) : 0
      return { student: s, daysTaken, daysPresent, missedPct, tier: raw.tiers[s.id] || 'initial' }
    })
    return { rows: daysTaken > 0 ? rows : [], daysTaken }
  }, [raw, minDayPct])

  const flagged = useMemo(() => computed.rows.filter((r) => r.missedPct >= threshold).sort((a, b) => b.missedPct - a.missedPct), [computed, threshold])

  function toggle(id) { setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n }) }
  async function copyForTeams() {
    const today = new Date().toLocaleDateString()
    const lines = flagged.filter((r) => selected.has(r.student.id)).map((r) => `3\t${r.student.full_name}\tAttendance (Missed ${r.daysTaken - r.daysPresent} of ${r.daysTaken} classes as of ${today})\tEmail`)
    await navigator.clipboard.writeText(lines.join('\n'))
  }

  if (loading) return <p className="text-maroon-300">Loading…</p>
  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mb-4">
        <label className="text-sm text-maroon-600">Flag missed at least <input type="number" value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} className="mx-2 w-16 rounded-md border border-maroon-100 px-2 py-1 text-center" />%</label>
        <label className="text-sm text-maroon-600">Only count a day if at least <input type="number" value={minDayPct} onChange={(e) => setMinDayPct(Number(e.target.value))} className="mx-2 w-16 rounded-md border border-maroon-100 px-2 py-1 text-center" />% checked in</label>
      </div>
      <p className="text-maroon-400 text-sm mb-4">{computed.daysTaken} real class day{computed.daysTaken === 1 ? '' : 's'} counted</p>
      <ResultsTable flagged={flagged} selected={selected} onToggle={toggle} onOpenEmail={setModalStudent} onCopy={copyForTeams} statCol="Missed" statValue={(r) => `${r.daysTaken - r.daysPresent} of ${r.daysTaken} (${r.missedPct}%)`} />
      {modalStudent && <EmailModal sectionId={sectionId} student={modalStudent.student} reason="attendance" tier={modalStudent.tier} profile={profile} onClose={() => setModalStudent(null)} onSent={load} />}
    </div>
  )
}

function GradeRedlist() {
  const { sectionId } = useOutletContext()
  const { profile } = useAuth()
  const [threshold, setThreshold] = useState(70)
  const [rows, setRows] = useState(null)
  const [selected, setSelected] = useState(new Set())
  const [modalStudent, setModalStudent] = useState(null)
  const [uploadedAt, setUploadedAt] = useState(null)

  useEffect(() => { load() }, [sectionId])

  async function load() {
    const { data: snap } = await supabase.from('grade_snapshots').select('*').eq('section_id', sectionId).order('uploaded_at', { ascending: false }).limit(1).single()
    if (!snap) { setRows([]); return }
    setUploadedAt(snap.uploaded_at)
    const { data: roster } = await supabase.from('students').select('id, full_name, m_number, email, photo_url').eq('section_id', sectionId).eq('is_test', false)
    const byM = {}
    for (const s of roster || []) byM[s.m_number.toUpperCase()] = s
    const matchedIds = snap.data.map((r) => byM[r.m_number.toUpperCase()]?.id).filter(Boolean)
    const tiers = await fetchTierMap(matchedIds, sectionId, 'grade')
    setRows(snap.data.map((r) => {
      const match = byM[r.m_number.toUpperCase()]
      return { m_number: r.m_number, full_name: match?.full_name || r.full_name, pct: r.pct, student: match || null, tier: match ? tiers[match.id] || 'initial' : 'initial' }
    }))
  }

  const flagged = useMemo(() => (rows || []).filter((r) => r.pct < threshold).sort((a, b) => a.pct - b.pct), [rows, threshold])
  function toggle(m) { setSelected((prev) => { const n = new Set(prev); n.has(m) ? n.delete(m) : n.add(m); return n }) }
  async function copyForTeams() {
    const today = new Date().toLocaleDateString()
    const lines = flagged.filter((r) => selected.has(r.m_number)).map((r) => `3\t${r.full_name}\tGrade (${r.pct}% as of ${today})\tEmail`)
    await navigator.clipboard.writeText(lines.join('\n'))
  }

  if (rows === null) return <p className="text-maroon-300">Loading…</p>
  if (rows.length === 0) return <div className="bg-white rounded-2xl shadow-card p-8 text-center text-maroon-400">No grade data yet — upload a grade export from the Roster tab.</div>

  return (
    <div>
      <div className="flex items-center gap-6 mb-4">
        <label className="text-sm text-maroon-600">Flag below <input type="number" value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} className="mx-2 w-16 rounded-md border border-maroon-100 px-2 py-1 text-center" />%</label>
        <span className="text-maroon-300 text-xs">From upload on {new Date(uploadedAt).toLocaleString()}</span>
      </div>
      <ResultsTable flagged={flagged} selected={selected} onToggle={toggle} idKey="m_number" onOpenEmail={setModalStudent} onCopy={copyForTeams} statCol="Grade" statValue={(r) => `${r.pct}%`} />
      {modalStudent && <EmailModal sectionId={sectionId} student={modalStudent.student || { full_name: modalStudent.full_name, id: null }} reason="grade" tier={modalStudent.tier} profile={profile} onClose={() => setModalStudent(null)} onSent={() => {}} />}
    </div>
  )
}

function ResultsTable({ flagged, selected, onToggle, onOpenEmail, onCopy, statCol, statValue, idKey = 'student.id' }) {
  function idOf(r) { return idKey === 'm_number' ? r.m_number : r.student.id }
  return (
    <div className="bg-white rounded-2xl shadow-card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-maroon-50">
        <h2 className="font-display text-maroon-800">{flagged.length} flagged</h2>
        <button onClick={onCopy} disabled={selected.size === 0} className="text-sm border border-maroon-200 hover:border-maroon-400 disabled:opacity-40 text-maroon-700 rounded-lg px-3 py-1.5 transition">Copy {selected.size > 0 ? selected.size : ''} for Teams doc</button>
      </div>
      <table className="w-full text-sm">
        <thead><tr className="text-left text-maroon-400 text-xs uppercase tracking-wide border-b border-maroon-50"><th className="px-5 py-2 w-8"></th><th className="px-2 py-2">Student</th><th className="px-2 py-2">{statCol}</th><th className="px-2 py-2">Next contact</th><th className="px-2 py-2"></th></tr></thead>
        <tbody className="divide-y divide-maroon-50">
          {flagged.map((r) => (
            <tr key={idOf(r)}>
              <td className="px-5 py-2.5"><input type="checkbox" checked={selected.has(idOf(r))} onChange={() => onToggle(idOf(r))} /></td>
              <td className="px-2 py-2.5 text-maroon-800 font-medium">{r.student?.full_name || r.full_name}<span className="text-maroon-300 font-mono text-xs ml-2">{r.student?.m_number || r.m_number}</span></td>
              <td className="px-2 py-2.5 text-maroon-600">{statValue(r)}</td>
              <td className="px-2 py-2.5"><span className="text-xs bg-maroon-50 text-maroon-600 rounded px-2 py-0.5">{TIER_LABELS[r.tier || 'initial']}</span></td>
              <td className="px-2 py-2.5 text-right"><button onClick={() => onOpenEmail(r)} className="text-maroon-600 hover:text-maroon-800 text-sm underline underline-offset-2">View email</button></td>
            </tr>
          ))}
          {flagged.length === 0 && <tr><td colSpan={5} className="px-5 py-8 text-center text-maroon-300">No one meets this threshold.</td></tr>}
        </tbody>
      </table>
    </div>
  )
}

function EmailModal({ sectionId, student, reason, tier, profile, onClose, onSent }) {
  const [selectedTier, setSelectedTier] = useState(tier || 'initial')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const subject = SUBJECTS[selectedTier]
  const body = bodyFor(selectedTier, firstName(student.full_name), profile?.display_name || 'Instructor', PHRASES[reason][selectedTier])

  async function copy() { await navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`); setCopied(true); setTimeout(() => setCopied(false), 2000) }
  async function markSent() {
    if (!student.id) { setSent(true); return }
    setBusy(true)
    await supabase.from('redlist_contacts').insert({ student_id: student.id, section_id: sectionId, tier: selectedTier, reason, sent_by: profile?.id })
    setBusy(false); setSent(true); onSent?.()
  }

  return (
    <div className="fixed inset-0 bg-maroon-900/40 grid place-items-center z-40 px-4" onClick={onClose}>
      <motion.div initial={{ opacity: 0, scale: 0.94, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 22 }} className="bg-white rounded-2xl shadow-card p-6 w-full max-w-lg max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="font-display text-lg text-maroon-800">{student.full_name}</h3>
            {student.email ? <p className="text-maroon-600 text-sm mt-1 font-mono">{student.email}</p> : <p className="text-maroon-300 text-xs mt-1">No email on file.</p>}
          </div>
          <button onClick={onClose} className="text-maroon-300 hover:text-maroon-600">✕</button>
        </div>
        <div className="flex gap-1.5 mb-4">{TIER_ORDER.map((t) => <button key={t} onClick={() => setSelectedTier(t)} className={`text-xs rounded-full px-3 py-1 transition ${selectedTier === t ? 'bg-maroon-700 text-white' : 'bg-maroon-50 text-maroon-500 hover:bg-maroon-100'}`}>{TIER_LABELS[t]}</button>)}</div>
        <div className="bg-maroon-50 rounded-xl p-4 mb-4">
          <p className="text-xs font-semibold text-maroon-500 uppercase tracking-wide mb-1">Subject</p><p className="text-maroon-800 mb-3">{subject}</p>
          <p className="text-xs font-semibold text-maroon-500 uppercase tracking-wide mb-1">Body</p><p className="text-maroon-800 text-sm whitespace-pre-wrap leading-relaxed">{body}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {student.email && <a href={`mailto:${student.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`} className="text-sm bg-maroon-700 hover:bg-maroon-800 text-white rounded-lg px-4 py-2 transition">Open in email app</a>}
          <button onClick={copy} className="text-sm border border-maroon-200 hover:border-maroon-400 text-maroon-700 rounded-lg px-4 py-2 transition">{copied ? 'Copied!' : 'Copy email text'}</button>
          <button onClick={markSent} disabled={busy || sent} className="text-sm border border-maroon-200 hover:border-maroon-400 disabled:opacity-50 text-maroon-700 rounded-lg px-4 py-2 transition">{sent ? '✓ Marked sent' : busy ? 'Saving…' : 'Mark as sent'}</button>
        </div>
      </motion.div>
    </div>
  )
}
