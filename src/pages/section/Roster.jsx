import React, { useEffect, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import * as XLSX from 'xlsx'
import Papa from 'papaparse'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../lib/AuthContext'

export default function Roster() {
  const { sectionId } = useOutletContext()
  const { profile } = useAuth()
  const [students, setStudents] = useState([])
  const [showInactive, setShowInactive] = useState(false)
  const [showTest, setShowTest] = useState(false)
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState(null)
  const csvRef = useRef(null)
  const gradeRef = useRef(null)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => { load() }, [sectionId])

  async function load() {
    const { data } = await supabase.from('students').select('*').eq('section_id', sectionId).order('full_name')
    setStudents(data || [])
  }

  const filtered = students.filter((s) => {
    if (!showTest && s.is_test) return false
    if (!showInactive && !s.active) return false
    if (query && !(s.full_name.toLowerCase().includes(query.toLowerCase()) || s.m_number.toLowerCase().includes(query.toLowerCase()))) return false
    return true
  })

  async function saveStudent(form) {
    if (form.id) {
      await supabase.from('students').update({ full_name: form.full_name, m_number: form.m_number, email: form.email || null, photo_url: form.photo_url || null, active: form.active }).eq('id', form.id)
    } else {
      await supabase.from('students').insert({ section_id: sectionId, full_name: form.full_name, m_number: form.m_number, email: form.email || null, photo_url: form.photo_url || null, active: true })
    }
    setEditing(null); load()
  }

  async function toggleActive(s) { await supabase.from('students').update({ active: !s.active }).eq('id', s.id); load() }
  async function removeStudent(s) {
    if (!confirm(`Remove ${s.full_name} permanently? Consider marking inactive instead.`)) return
    await supabase.from('students').delete().eq('id', s.id); load()
  }

  function onCsvFile(e) {
    const file = e.target.files?.[0]; if (!file) return
    Papa.parse(file, {
      header: true, skipEmptyLines: true,
      complete: async (res) => {
        const get = (r, ...keys) => { for (const k of Object.keys(r)) if (keys.some((w) => k.trim().toLowerCase() === w)) return r[k]; return '' }
        const rows = res.data.map((r) => ({
          section_id: sectionId,
          m_number: (get(r, 'm number', 'm-number', 'mnumber', 'orgdefinedid', 'm_number') || '').toString().trim(),
          full_name: (get(r, 'full name', 'name', 'student name') || '').toString().trim(),
          email: (get(r, 'email', 'e-mail') || '').toString().trim() || null,
          photo_url: (get(r, 'photo url', 'photo') || '').toString().trim() || null,
        })).filter((r) => r.m_number)
        if (rows.length === 0) { setMsg('No rows with an M-number found.'); return }
        const { error } = await supabase.from('students').upsert(rows, { onConflict: 'section_id,m_number' })
        setMsg(error ? `Import failed: ${error.message}` : `Imported/updated ${rows.length} students.`)
        load()
      },
    })
    e.target.value = ''
  }

  async function onGradeFile(e) {
    const file = e.target.files?.[0]; if (!file) return
    setBusy(true); setMsg('')
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      const json = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null })
      const numCol = Object.keys(json[0] || {}).find((k) => k.startsWith('Calculated Final Grade Numerator'))
      const denCol = Object.keys(json[0] || {}).find((k) => k.startsWith('Calculated Final Grade Denominator'))
      if (!json[0]?.OrgDefinedId) { setMsg("Doesn't look like a Brightspace export — no OrgDefinedId column found."); setBusy(false); return }

      const rows = json.filter((r) => r.OrgDefinedId).map((r) => ({
        m_number: String(r.OrgDefinedId).trim(),
        full_name: `${r['First Name'] || ''} ${r['Last Name'] || ''}`.trim() || String(r.OrgDefinedId).trim(),
        email: r.Email ? String(r.Email).trim() : null,
        pct: numCol && denCol && r[denCol] ? Math.round((Number(r[numCol]) / Number(r[denCol])) * 1000) / 10 : null,
      }))

      // upsert everyone in this upload as active
      const upsertRows = rows.map((r) => ({ section_id: sectionId, m_number: r.m_number, full_name: r.full_name, email: r.email, active: true }))
      const { error: upsertErr } = await supabase.from('students').upsert(upsertRows, { onConflict: 'section_id,m_number' })
      if (upsertErr) throw new Error(upsertErr.message)

      // anyone active but NOT in this upload gets marked inactive (dropped)
      const uploadedMnums = rows.map((r) => r.m_number.toUpperCase())
      const { data: currentActive } = await supabase.from('students').select('id, m_number').eq('section_id', sectionId).eq('active', true).eq('is_test', false)
      const toDrop = (currentActive || []).filter((s) => !uploadedMnums.includes(s.m_number.toUpperCase())).map((s) => s.id)
      if (toDrop.length > 0) await supabase.from('students').update({ active: false }).in('id', toDrop)

      // feed the grade redlist
      const gradeData = rows.filter((r) => r.pct !== null).map((r) => ({ m_number: r.m_number, full_name: r.full_name, pct: r.pct }))
      if (gradeData.length > 0) {
        await supabase.from('grade_snapshots').insert({ section_id: sectionId, uploaded_by: profile.id, data: gradeData })
      }

      setMsg(`Roster updated: ${rows.length} students in this upload${toDrop.length > 0 ? `, ${toDrop.length} marked inactive` : ''}${gradeData.length > 0 ? `, grades saved for the Redlist` : ''}.`)
      load()
    } catch (err) {
      setMsg(`Upload failed: ${err.message}`)
    }
    setBusy(false)
    e.target.value = ''
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="font-display text-2xl text-maroon-800">Roster</h1>
          <p className="text-maroon-400 text-sm mt-1">{students.filter((s) => !s.is_test && s.active).length} active students</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <label className="text-sm bg-maroon-700 hover:bg-maroon-800 text-white rounded-lg px-3.5 py-2 transition cursor-pointer">
            {busy ? 'Uploading…' : 'Upload grade export'}
            <input ref={gradeRef} type="file" accept=".xlsx" className="hidden" onChange={onGradeFile} disabled={busy} />
          </label>
          <button onClick={() => csvRef.current?.click()} className="text-sm border border-maroon-200 hover:border-maroon-400 text-maroon-700 rounded-lg px-3.5 py-2 transition">Import CSV</button>
          <input ref={csvRef} type="file" accept=".csv" className="hidden" onChange={onCsvFile} />
          <button onClick={() => setEditing('new')} className="text-sm border border-maroon-200 hover:border-maroon-400 text-maroon-700 rounded-lg px-3.5 py-2 transition">+ Add student</button>
        </div>
      </div>

      {msg && <div className="mb-4 text-sm bg-maroon-50 border border-maroon-200 text-maroon-700 rounded-lg px-3.5 py-2.5">{msg}</div>}

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search…" className="rounded-lg border border-maroon-100 px-3 py-2 text-sm text-maroon-800 min-w-[200px]" />
        <label className="flex items-center gap-1.5 text-sm text-maroon-500"><input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Show inactive/dropped</label>
        <label className="flex items-center gap-1.5 text-sm text-maroon-500"><input type="checkbox" checked={showTest} onChange={(e) => setShowTest(e.target.checked)} /> Show test accounts</label>
      </div>

      <div className="bg-white rounded-2xl shadow-card overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-maroon-400 text-xs uppercase tracking-wide border-b border-maroon-50">
            <th className="px-5 py-3">Student</th><th className="px-5 py-3">M-number</th><th className="px-5 py-3">Email</th><th className="px-5 py-3">Status</th><th className="px-5 py-3"></th>
          </tr></thead>
          <tbody className="divide-y divide-maroon-50">
            {filtered.map((s) => (
              <tr key={s.id} className={!s.active ? 'opacity-50' : ''}>
                <td className="px-5 py-3">
                  <div className="flex items-center gap-3">
                    {s.photo_url ? <img src={s.photo_url} className="w-8 h-8 rounded-full object-cover" alt="" /> : <div className="w-8 h-8 rounded-full bg-maroon-100 text-maroon-600 text-xs font-semibold grid place-items-center">{s.full_name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()}</div>}
                    <span className="text-maroon-800 font-medium">{s.full_name}</span>
                    {s.is_test && <span className="text-[10px] bg-gold-100 text-gold-700 rounded px-1.5 py-0.5">TEST</span>}
                  </div>
                </td>
                <td className="px-5 py-3 font-mono text-maroon-500">{s.m_number}</td>
                <td className="px-5 py-3 text-maroon-500">{s.email || <span className="text-maroon-200">—</span>}</td>
                <td className="px-5 py-3"><button onClick={() => toggleActive(s)} className={`text-xs rounded-full px-2.5 py-1 ${s.active ? 'bg-green-50 text-green-700' : 'bg-maroon-50 text-maroon-400'}`}>{s.active ? 'Active' : 'Inactive'}</button></td>
                <td className="px-5 py-3 text-right whitespace-nowrap"><button onClick={() => setEditing(s)} className="text-maroon-400 hover:text-maroon-700 text-xs mr-3">Edit</button><button onClick={() => removeStudent(s)} className="text-maroon-300 hover:text-red-600 text-xs">Remove</button></td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={5} className="px-5 py-8 text-center text-maroon-300">No students match.</td></tr>}
          </tbody>
        </table>
      </div>

      {editing && <StudentModal sectionId={sectionId} student={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSave={saveStudent} />}
    </div>
  )
}

function StudentModal({ sectionId, student, onClose, onSave }) {
  const [form, setForm] = useState(student || { full_name: '', m_number: '', email: '', photo_url: '' })
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')

  async function onPickPhoto(e) {
    const file = e.target.files?.[0]; if (!file) return
    if (!form.m_number.trim()) { setUploadError('Enter the M-number first.'); e.target.value = ''; return }
    setUploading(true); setUploadError('')
    const ext = file.name.split('.').pop()
    const path = `${sectionId}/${form.m_number.trim().toUpperCase()}.${ext}`
    const { error } = await supabase.storage.from('student-photos').upload(path, file, { upsert: true, cacheControl: '3600' })
    if (error) { setUploadError(error.message); setUploading(false); return }
    const { data } = supabase.storage.from('student-photos').getPublicUrl(path)
    setForm((f) => ({ ...f, photo_url: `${data.publicUrl}?v=${Date.now()}` }))
    setUploading(false); e.target.value = ''
  }

  return (
    <div className="fixed inset-0 bg-maroon-900/40 grid place-items-center z-40 px-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-card p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-display text-lg text-maroon-800 mb-4">{student ? 'Edit student' : 'Add student'}</h3>
        <div className="space-y-3">
          <label className="block"><span className="block text-xs font-semibold text-maroon-500 uppercase tracking-wide mb-1">Full name</span><input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} className="input" /></label>
          <label className="block"><span className="block text-xs font-semibold text-maroon-500 uppercase tracking-wide mb-1">M-number</span><input value={form.m_number} onChange={(e) => setForm({ ...form, m_number: e.target.value })} className="input font-mono" /></label>
          <label className="block"><span className="block text-xs font-semibold text-maroon-500 uppercase tracking-wide mb-1">Email</span><input type="email" value={form.email || ''} onChange={(e) => setForm({ ...form, email: e.target.value })} className="input" /></label>
          <label className="block">
            <span className="block text-xs font-semibold text-maroon-500 uppercase tracking-wide mb-1">Photo</span>
            <div className="flex items-center gap-3">
              {form.photo_url ? <img src={form.photo_url} className="w-12 h-12 rounded-full object-cover" alt="" /> : <div className="w-12 h-12 rounded-full bg-maroon-100 text-maroon-500 grid place-items-center text-xs">None</div>}
              <label className="text-xs text-maroon-600 hover:text-maroon-800 border border-maroon-200 hover:border-maroon-400 rounded-lg px-3 py-2 cursor-pointer transition">
                {uploading ? 'Uploading…' : 'Upload photo'}
                <input type="file" accept="image/*" className="hidden" onChange={onPickPhoto} disabled={uploading} />
              </label>
            </div>
            {uploadError && <p className="text-xs text-red-600 mt-1.5">{uploadError}</p>}
          </label>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="text-sm text-maroon-400 hover:text-maroon-700 px-3 py-2">Cancel</button>
          <button onClick={() => onSave(form)} disabled={!form.full_name || !form.m_number || uploading} className="text-sm bg-maroon-700 hover:bg-maroon-800 disabled:opacity-50 text-white rounded-lg px-4 py-2">Save</button>
        </div>
      </div>
    </div>
  )
}
