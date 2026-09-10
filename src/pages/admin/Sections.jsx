import React, { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../lib/AuthContext'
import Tip from '../../lib/Tip'
import { bannerGradient } from '../../lib/cardBanner'

const WEEKDAYS = [
  { n: 1, label: 'Monday' },
  { n: 2, label: 'Tuesday' },
  { n: 3, label: 'Wednesday' },
  { n: 4, label: 'Thursday' },
]

export default function Sections() {
  const { profile } = useAuth()
  const [terms, setTerms] = useState([])
  const [courses, setCourses] = useState([])
  const [instructors, setInstructors] = useState([])
  const [sections, setSections] = useState([])
  const [termFilter, setTermFilter] = useState('')
  const [editing, setEditing] = useState(null) // section id, or 'new'
  const [error, setError] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    const [{ data: t }, { data: c }, { data: p }] = await Promise.all([
      supabase.from('terms').select('*').order('start_date', { ascending: false }),
      supabase.from('courses').select('*').order('code'),
      supabase.from('profiles').select('*').eq('role', 'instructor').order('display_name'),
    ])
    setTerms(t || [])
    setInstructors(p || [])

    let courseList = c || []
    if (courseList.length === 0) {
      const { data: created } = await supabase.from('courses').insert({ code: 'MTH 101', title: 'Intermediate Algebra' }).select().single()
      courseList = created ? [created] : []
    }
    setCourses(courseList)
    if (!termFilter && t?.length) setTermFilter(t[0].id)

    await loadSections()
  }

  async function loadSections() {
    const { data, error } = await supabase
      .from('sections')
      .select('*, terms(name), courses(code), instructor_sections(instructor_id, role, profiles!instructor_sections_instructor_id_fkey(display_name)), section_schedule(*)')
      .order('section_number')
    if (error) {
      console.error('Failed to load sections:', error)
      setError(error.message)
      return
    }
    setError('')
    setSections(data || [])
  }

  const visible = sections.filter((s) => !termFilter || s.term_id === termFilter)

  async function archive(s, status) {
    await supabase.from('sections').update({ status }).eq('id', s.id)
    loadSections()
  }

  async function remove(s) {
    if (!confirm(`Delete ${s.courses?.code} ${s.section_number}? This removes its whole roster and attendance history — can't be undone.`)) return
    await supabase.from('sections').delete().eq('id', s.id)
    loadSections()
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="font-display text-2xl text-maroon-800">Sections</h1>
        </div>
        <div className="flex items-center gap-3">
          <Tip tipKey="section-term-filter" title="Filter by term" text="Show only sections from one term at a time.">
            <select value={termFilter} onChange={(e) => setTermFilter(e.target.value)} className="rounded-lg border border-maroon-100 px-3 py-2 text-sm text-maroon-800">
              {terms.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </Tip>
          <Tip tipKey="new-section-btn" title="New section" text="Set the section number, meeting times, and which instructors teach it, all in one step.">
            <button
              onClick={() => setEditing('new')}
              disabled={terms.length === 0}
              className="text-sm bg-maroon-700 hover:bg-maroon-800 disabled:opacity-50 text-white rounded-lg px-3.5 py-2 transition"
            >
              + New section
            </button>
          </Tip>
        </div>
      </div>

      {error && <p className="text-sm text-red-600 mb-4 bg-red-50 rounded-lg px-3.5 py-2.5">{error}</p>}
      {terms.length === 0 && <p className="text-maroon-400 text-sm mb-4">Create a term first, from the Terms tab.</p>}

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((s) => (
          <div key={s.id} className={`bg-white rounded-2xl shadow-card overflow-hidden ${s.status === 'archived' ? 'opacity-50' : ''}`}>
            <div className={`relative h-20 bg-gradient-to-br ${bannerGradient(s.id)} flex items-center justify-between px-5`}>
              <span className="font-display text-white/90 text-lg">{s.courses?.code} — {s.section_number}</span>
              {s.status === 'archived' && <span className="text-[10px] bg-white/90 text-maroon-600 rounded px-1.5 py-0.5">ARCHIVED</span>}
            </div>
            <div className="p-5">
              <p className="text-maroon-400 text-xs mb-3">{s.terms?.name}</p>
              <div className="text-xs text-maroon-500 mb-3">
                {(s.section_schedule || []).sort((a, b) => a.weekday - b.weekday).map((sc) => (
                  <div key={sc.weekday}>{WEEKDAYS.find((w) => w.n === sc.weekday)?.label}: {sc.start_time}–{sc.end_time}</div>
                ))}
              </div>
              <div className="flex flex-wrap gap-1 mb-4">
                {(s.instructor_sections || []).map((is, i) => (
                  <span key={i} className="text-xs bg-maroon-50 text-maroon-600 rounded px-2 py-0.5">
                    {is.profiles?.display_name} ({is.role})
                  </span>
                ))}
                {!(s.instructor_sections || []).length && <span className="text-xs text-maroon-200">No instructor assigned</span>}
              </div>
              <div className="flex gap-3 text-xs">
                <button onClick={() => setEditing(s.id)} className="text-maroon-500 hover:text-maroon-800">Edit</button>
                {s.status === 'active'
                  ? <Tip tipKey="archive-btn" title="Archive" text="Hides this section from the default view and from instructors' section list, without deleting any data. Reversible any time." side="top">
                      <button onClick={() => archive(s, 'archived')} className="text-maroon-500 hover:text-maroon-800">Archive</button>
                    </Tip>
                  : <button onClick={() => archive(s, 'active')} className="text-maroon-500 hover:text-maroon-800">Unarchive</button>}
                <Tip tipKey="delete-section-btn" title="Delete section" text="Permanently deletes this section and everything in it — roster, attendance, redlist history. Cannot be undone." side="top">
                  <button onClick={() => remove(s)} className="text-maroon-300 hover:text-red-600">Delete</button>
                </Tip>
              </div>
            </div>
          </div>
        ))}
        {visible.length === 0 && terms.length > 0 && <p className="text-maroon-300 text-sm">No sections in this term yet.</p>}
      </div>

      {editing && (
        <SectionModal
          sectionId={editing === 'new' ? null : editing}
          section={editing === 'new' ? null : sections.find((s) => s.id === editing)}
          terms={terms} courses={courses} instructors={instructors} defaultTermId={termFilter}
          profile={profile}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); loadSections() }}
        />
      )}
    </div>
  )
}

function SectionModal({ sectionId, section, terms, courses, instructors, defaultTermId, profile, onClose, onSaved }) {
  const [termId, setTermId] = useState(section?.term_id || defaultTermId || terms[0]?.id || '')
  const [courseId, setCourseId] = useState(section?.course_id || courses[0]?.id || '')
  const [sectionNumber, setSectionNumber] = useState(section?.section_number || '')
  const [schedule, setSchedule] = useState(() => {
    const base = { 1: { meets: false, start: '', end: '' }, 2: { meets: false, start: '', end: '' }, 3: { meets: false, start: '', end: '' }, 4: { meets: false, start: '', end: '' } }
    for (const sc of section?.section_schedule || []) {
      base[sc.weekday] = { meets: true, start: sc.start_time?.slice(0, 5) || '', end: sc.end_time?.slice(0, 5) || '' }
    }
    return base
  })
  const [assignments, setAssignments] = useState(
    (section?.instructor_sections || []).map((is) => ({ instructor_id: is.instructor_id, role: is.role }))
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  function addAssignment() {
    const unassigned = instructors.find((i) => !assignments.some((a) => a.instructor_id === i.id))
    if (!unassigned) return
    setAssignments([...assignments, { instructor_id: unassigned.id, role: assignments.length === 0 ? 'lead' : 'support' }])
  }

  async function save() {
    setError('')
    if (!termId || !courseId || !sectionNumber.trim()) { setError('Term, course, and section number are all required.'); return }
    setBusy(true)

    let id = sectionId
    if (id) {
      const { error: upErr } = await supabase.from('sections').update({ term_id: termId, course_id: courseId, section_number: sectionNumber.trim() }).eq('id', id)
      if (upErr) { setError(upErr.message); setBusy(false); return }
    } else {
      const { data, error: insErr } = await supabase.from('sections').insert({
        term_id: termId, course_id: courseId, section_number: sectionNumber.trim(), created_by: profile.id,
      }).select().single()
      if (insErr) { setError(insErr.message); setBusy(false); return }
      id = data.id
    }

    // schedule: replace all 4 weekday rows
    await supabase.from('section_schedule').delete().eq('section_id', id)
    const scheduleRows = Object.entries(schedule)
      .filter(([, v]) => v.meets && v.start && v.end)
      .map(([weekday, v]) => ({ section_id: id, weekday: Number(weekday), start_time: v.start, end_time: v.end }))
    if (scheduleRows.length > 0) {
      const { error: schedErr } = await supabase.from('section_schedule').insert(scheduleRows)
      if (schedErr) { setError(schedErr.message); setBusy(false); return }
    }

    // instructor assignments: replace all
    await supabase.from('instructor_sections').delete().eq('section_id', id)
    if (assignments.length > 0) {
      const { error: asgErr } = await supabase.from('instructor_sections').insert(
        assignments.map((a) => ({ section_id: id, instructor_id: a.instructor_id, role: a.role, assigned_by: profile.id }))
      )
      if (asgErr) { setError(asgErr.message); setBusy(false); return }
    }

    setBusy(false)
    onSaved()
  }

  return (
    <div className="fixed inset-0 bg-maroon-900/40 overflow-y-auto z-40 px-4 py-8" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-card w-full max-w-2xl mx-auto" onClick={(e) => e.stopPropagation()}>
        <div className="p-6">
          <h3 className="font-display text-lg text-maroon-800 mb-5">{sectionId ? 'Edit section' : 'New section'}</h3>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
            <label className="block">
              <span className="block text-xs font-semibold text-maroon-500 uppercase tracking-wide mb-1">Term</span>
              <select value={termId} onChange={(e) => setTermId(e.target.value)} className="input">
                {terms.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="block text-xs font-semibold text-maroon-500 uppercase tracking-wide mb-1">Course</span>
              <select value={courseId} onChange={(e) => setCourseId(e.target.value)} className="input">
                {courses.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="block text-xs font-semibold text-maroon-500 uppercase tracking-wide mb-1">Section number</span>
              <input value={sectionNumber} onChange={(e) => setSectionNumber(e.target.value)} className="input" placeholder="003" />
            </label>
          </div>

          <div className="bg-maroon-50 rounded-xl p-4 mb-6">
            <p className="text-xs font-semibold text-maroon-500 uppercase tracking-wide mb-3">Meeting times</p>
            <div className="space-y-2">
              {WEEKDAYS.map((w) => (
                <div key={w.n} className="grid grid-cols-[100px_1fr_16px_1fr] items-center gap-3">
                  <label className="flex items-center gap-2 text-sm text-maroon-700">
                    <input
                      type="checkbox"
                      checked={schedule[w.n].meets}
                      onChange={(e) => setSchedule({ ...schedule, [w.n]: { ...schedule[w.n], meets: e.target.checked } })}
                    />
                    {w.label}
                  </label>
                  <input
                    type="time" disabled={!schedule[w.n].meets}
                    value={schedule[w.n].start}
                    onChange={(e) => setSchedule({ ...schedule, [w.n]: { ...schedule[w.n], start: e.target.value } })}
                    className="w-full rounded-md border border-maroon-100 bg-white px-2 py-1.5 text-sm disabled:opacity-40 disabled:bg-maroon-50"
                  />
                  <span className="text-maroon-300 text-sm text-center">–</span>
                  <input
                    type="time" disabled={!schedule[w.n].meets}
                    value={schedule[w.n].end}
                    onChange={(e) => setSchedule({ ...schedule, [w.n]: { ...schedule[w.n], end: e.target.value } })}
                    className="w-full rounded-md border border-maroon-100 bg-white px-2 py-1.5 text-sm disabled:opacity-40 disabled:bg-maroon-50"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="bg-maroon-50 rounded-xl p-4 mb-6">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-maroon-500 uppercase tracking-wide">Instructors</p>
              <button onClick={addAssignment} type="button" disabled={instructors.length === 0} className="text-xs text-maroon-600 hover:text-maroon-800 disabled:opacity-40 disabled:hover:text-maroon-600 underline underline-offset-2">
                + Add instructor
              </button>
            </div>
            <div className="space-y-2">
              {instructors.length === 0 && (
                <p className="text-maroon-400 text-xs">No instructors exist yet — create one from the Instructors tab first, then come back to assign them.</p>
              )}
              {assignments.map((a, i) => (
                <div key={i} className="grid grid-cols-[1fr_110px_28px] items-center gap-2">
                  <select
                    value={a.instructor_id}
                    onChange={(e) => setAssignments(assignments.map((x, j) => j === i ? { ...x, instructor_id: e.target.value } : x))}
                    className="w-full rounded-md border border-maroon-100 bg-white px-2 py-1.5 text-sm"
                  >
                    {instructors.map((ins) => <option key={ins.id} value={ins.id}>{ins.display_name}</option>)}
                  </select>
                  <select
                    value={a.role}
                    onChange={(e) => setAssignments(assignments.map((x, j) => j === i ? { ...x, role: e.target.value } : x))}
                    className="w-full rounded-md border border-maroon-100 bg-white px-2 py-1.5 text-sm"
                  >
                    <option value="lead">Lead</option>
                    <option value="support">Support</option>
                  </select>
                  <button onClick={() => setAssignments(assignments.filter((_, j) => j !== i))} type="button" className="text-maroon-300 hover:text-red-600 text-sm justify-self-center">✕</button>
                </div>
              ))}
              {assignments.length === 0 && <p className="text-maroon-300 text-xs">No instructors assigned yet.</p>}
            </div>
          </div>

          {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="text-sm text-maroon-400 hover:text-maroon-700 px-3 py-2">Cancel</button>
            <button onClick={save} disabled={busy} className="text-sm bg-maroon-700 hover:bg-maroon-800 disabled:opacity-50 text-white rounded-lg px-4 py-2">
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
