import React, { useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import * as XLSX from 'xlsx'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../lib/AuthContext'

export default function Reports() {
  const { sectionId } = useOutletContext()
  const { profile } = useAuth()
  const [students, setStudents] = useState([])
  const [sessions, setSessions] = useState([])
  const [attendance, setAttendance] = useState([])
  const [showTest, setShowTest] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => { load() }, [sectionId])

  async function load() {
    setLoading(true)
    const [{ data: st, error: stErr }, { data: se, error: seErr }, { data: at, error: atErr }] = await Promise.all([
      supabase.from('students').select('*').eq('section_id', sectionId).order('full_name'),
      supabase.from('class_sessions').select('id, session_date').eq('section_id', sectionId).order('session_date'),
      supabase.from('attendance').select('session_id, student_id, status, class_sessions!inner(section_id)').eq('class_sessions.section_id', sectionId),
    ])
    const err = stErr || seErr || atErr
    if (err) { setError(err.message); setLoading(false); return }
    setError('')
    setStudents(st || [])
    setSessions(se || [])
    setAttendance(at || [])
    setLoading(false)
  }

  const attMap = useMemo(() => {
    const m = new Map()
    attendance.forEach((a) => m.set(`${a.session_id}:${a.student_id}`, a.status))
    return m
  }, [attendance])

  const visibleStudents = students.filter((s) => showTest || !s.is_test)

  async function toggle(sessionId, studentId, current) {
    const next = current === 1 ? 0 : 1
    await supabase.from('attendance').upsert(
      { session_id: sessionId, student_id: studentId, status: next, method: 'manual', marked_by: profile?.id },
      { onConflict: 'session_id,student_id' }
    )
    setAttendance((prev) => {
      const others = prev.filter((a) => !(a.session_id === sessionId && a.student_id === studentId))
      return [...others, { session_id: sessionId, student_id: studentId, status: next }]
    })
  }

  function total(studentId) {
    return sessions.reduce((acc, s) => acc + (attMap.get(`${s.id}:${studentId}`) === 1 ? 1 : 0), 0)
  }

  function exportExcel() {
    const header = ['Full Name', 'M-Number', ...sessions.map((s) => new Date(s.session_date + 'T12:00:00').toLocaleDateString()), 'Total Present']
    const rows = visibleStudents.map((s) => {
      const cells = sessions.map((sess) => (attMap.get(`${sess.id}:${s.id}`) === 1 ? 1 : 0))
      const t = cells.reduce((a, b) => a + b, 0)
      return [s.full_name, s.m_number, ...cells, t]
    })
    const ws = XLSX.utils.aoa_to_sheet([header, ...rows])
    ws['!cols'] = [{ wch: 24 }, { wch: 12 }, ...sessions.map(() => ({ wch: 10 })), { wch: 12 }]
    ws['!freeze'] = { xSplit: 2, ySplit: 1 }
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Attendance')
    XLSX.writeFile(wb, `Attendance_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  if (loading) return <p className="text-maroon-300">Loading…</p>

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="font-display text-2xl text-maroon-800">Reports</h1>
          <p className="text-maroon-400 text-sm mt-1">Click any cell to manually override present/absent for that day.</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-sm text-maroon-500">
            <input type="checkbox" checked={showTest} onChange={(e) => setShowTest(e.target.checked)} /> Include test accounts
          </label>
          <button onClick={exportExcel} className="text-sm bg-maroon-700 hover:bg-maroon-800 text-white rounded-lg px-3.5 py-2 transition">
            Download Excel
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-red-600 mb-4 bg-red-50 rounded-lg px-3.5 py-2.5">{error}</p>}

      <div className="bg-white rounded-2xl shadow-card overflow-auto">
        <table className="text-sm border-collapse">
          <thead>
            <tr>
              <th className="sticky left-0 bg-white z-10 text-left px-4 py-3 text-maroon-500 text-xs uppercase tracking-wide border-b border-maroon-50 min-w-[200px]">
                Student
              </th>
              {sessions.map((s) => (
                <th key={s.id} className="px-2 py-3 text-maroon-400 text-[11px] font-medium border-b border-maroon-50 whitespace-nowrap">
                  {new Date(s.session_date + 'T12:00:00').toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' })}
                </th>
              ))}
              <th className="px-3 py-3 text-maroon-500 text-xs uppercase tracking-wide border-b border-maroon-50">Total</th>
            </tr>
          </thead>
          <tbody>
            {visibleStudents.map((s) => (
              <tr key={s.id} className="hover:bg-maroon-50/40">
                <td className="sticky left-0 bg-white z-10 px-4 py-2 text-maroon-800 font-medium border-b border-maroon-50 whitespace-nowrap">
                  {s.full_name}
                </td>
                {sessions.map((sess) => {
                  const val = attMap.get(`${sess.id}:${s.id}`)
                  const present = val === 1
                  return (
                    <td key={sess.id} className="px-2 py-2 border-b border-maroon-50 text-center">
                      <button
                        onClick={() => toggle(sess.id, s.id, val)}
                        className={`w-6 h-6 rounded-md text-xs font-semibold transition ${present ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-maroon-50 text-maroon-300 hover:bg-maroon-100'}`}
                        title={present ? 'Present — click to mark absent' : 'Absent — click to mark present'}
                      >
                        {present ? '1' : '0'}
                      </button>
                    </td>
                  )
                })}
                <td className="px-3 py-2 border-b border-maroon-50 text-maroon-700 font-semibold text-center">{total(s.id)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
