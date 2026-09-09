import React, { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../lib/AuthContext'
import { syncSectionSessions } from '../../lib/sessionSync'

export default function ClassDays() {
  const { sectionId } = useOutletContext()
  const { profile } = useAuth()
  const [holidays, setHolidays] = useState([])
  const [sessions, setSessions] = useState([])
  const [newDate, setNewDate] = useState('')
  const [newLabel, setNewLabel] = useState('')

  useEffect(() => { load() }, [sectionId])

  async function load() {
    const [{ data: h }, { data: s }] = await Promise.all([
      supabase.from('section_holidays').select('*').eq('section_id', sectionId).order('holiday_date'),
      supabase.from('class_sessions').select('*').eq('section_id', sectionId).order('session_date'),
    ])
    setHolidays(h || [])
    setSessions(s || [])
  }

  async function addHoliday(e) {
    e.preventDefault()
    if (!newDate) return
    await supabase.from('section_holidays').insert({ section_id: sectionId, holiday_date: newDate, label: newLabel || null, added_by: profile.id })
    setNewDate(''); setNewLabel('')
    load()
  }

  async function removeHoliday(h) {
    await supabase.from('section_holidays').delete().eq('id', h.id)
    load()
  }

  async function resync() {
    await syncSectionSessions(sectionId)
    load()
  }

  return (
    <div>
      <h1 className="font-display text-2xl text-maroon-800 mb-1">Class Days</h1>
      <p className="text-maroon-400 text-sm mb-6">
        Class days generate automatically from your term dates and schedule, skipping federal
        holidays. Mark any other no-class day here (fall break, a snow day, etc.) — future
        generation will skip it. This never removes a day that's already been used to take attendance.
      </p>

      <div className="bg-white rounded-2xl shadow-card p-5 mb-6">
        <h2 className="font-display text-lg text-maroon-800 mb-3">Mark a day off</h2>
        <form onSubmit={addHoliday} className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="block text-xs font-semibold text-maroon-500 uppercase tracking-wide mb-1">Date</span>
            <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} className="input" />
          </label>
          <label className="block flex-1 min-w-[160px]">
            <span className="block text-xs font-semibold text-maroon-500 uppercase tracking-wide mb-1">Label (optional)</span>
            <input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} className="input" placeholder="Fall Break" />
          </label>
          <button type="submit" disabled={!newDate} className="text-sm bg-maroon-700 hover:bg-maroon-800 disabled:opacity-50 text-white rounded-lg px-4 py-2 transition">Add</button>
        </form>
      </div>

      <div className="bg-white rounded-2xl shadow-card p-5 mb-6">
        <h2 className="font-display text-lg text-maroon-800 mb-3">Marked days off</h2>
        {holidays.length === 0 ? <p className="text-maroon-300 text-sm">None yet.</p> : (
          <div className="divide-y divide-maroon-50">
            {holidays.map((h) => (
              <div key={h.id} className="flex items-center justify-between py-2">
                <span className="text-maroon-700 text-sm">{h.holiday_date}{h.label ? ` — ${h.label}` : ''}</span>
                <button onClick={() => removeHoliday(h)} className="text-maroon-300 hover:text-red-600 text-xs">Remove</button>
              </div>
            ))}
          </div>
        )}
      </div>

      <button onClick={resync} className="text-sm border border-maroon-200 hover:border-maroon-400 text-maroon-700 rounded-lg px-3.5 py-2 transition mb-6">
        Sync class days now
      </button>

      <div className="bg-white rounded-2xl shadow-card p-5">
        <h2 className="font-display text-lg text-maroon-800 mb-3">{sessions.length} generated class days</h2>
        <div className="text-xs text-maroon-500 grid grid-cols-4 sm:grid-cols-6 gap-1 max-h-48 overflow-y-auto">
          {sessions.map((s) => <span key={s.id}>{s.session_date}</span>)}
        </div>
      </div>
    </div>
  )
}
