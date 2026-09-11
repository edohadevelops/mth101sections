import React, { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'

export default function Instructors() {
  const [instructors, setInstructors] = useState([])
  const [sectionsByInstructor, setSectionsByInstructor] = useState({})
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState(null) // instructor object, or null
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ username: '', display_name: '' })

  useEffect(() => { load() }, [])

  async function load() {
    const { data: people } = await supabase.from('profiles').select('*').eq('role', 'instructor').order('display_name')
    setInstructors(people || [])

    const { data: links } = await supabase
      .from('instructor_sections')
      .select('instructor_id, role, sections(section_number, terms(name), courses(code))')
    const grouped = {}
    for (const l of links || []) {
      if (!grouped[l.instructor_id]) grouped[l.instructor_id] = []
      grouped[l.instructor_id].push(l)
    }
    setSectionsByInstructor(grouped)
  }

  async function callFunction(payload) {
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-instructor`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify(payload),
    })
    return res.json()
  }

  async function createInstructor(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    const result = await callFunction({ action: 'create', ...form })
    setBusy(false)
    if (!result.ok) { setError(result.error); return }
    setCreating(false)
    setForm({ username: '', display_name: '' })
    load()
  }

  async function saveEdit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    const result = await callFunction({
      action: 'update',
      instructor_id: editing.id,
      username: form.username,
      display_name: form.display_name,
      contact_email: form.contact_email,
    })
    setBusy(false)
    if (!result.ok) { setError(result.error); return }
    setEditing(null)
    load()
  }

  async function resetPassword(instructor) {
    if (!confirm(`Reset ${instructor.display_name}'s password back to the default? They'll be forced to set a new one on their next login.`)) return
    const result = await callFunction({ action: 'reset_password', instructor_id: instructor.id })
    if (!result.ok) alert(result.error)
    else alert(`Done — ${instructor.display_name}'s password is reset to the default.`)
  }

  async function removeInstructor(instructor) {
    if (!confirm(`Permanently delete ${instructor.display_name}'s account? Their section assignments will be removed too. This can't be undone.`)) return
    const result = await callFunction({ action: 'delete', instructor_id: instructor.id })
    if (!result.ok) { alert(result.error); return }
    load()
  }

  function openEdit(instructor) {
    setError('')
    setForm({ username: instructor.username, display_name: instructor.display_name, contact_email: instructor.email || '' })
    setEditing(instructor)
  }

  return (
    <div>
      <div className="flex items-end justify-between mb-6">
        <div>
          <h1 className="font-display text-2xl text-maroon-800">Instructors</h1>
          <p className="text-maroon-400 text-sm mt-1">New accounts start with the default password and must set their own on first login.</p>
        </div>
        <button onClick={() => { setForm({ username: '', display_name: '' }); setCreating(true) }} className="text-sm bg-maroon-700 hover:bg-maroon-800 text-white rounded-lg px-3.5 py-2 transition">
          + New instructor
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-maroon-400 text-xs uppercase tracking-wide border-b border-maroon-50">
              <th className="px-5 py-3">Name</th>
              <th className="px-5 py-3">Username</th>
              <th className="px-5 py-3">Sections</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-maroon-50">
            {instructors.map((p) => (
              <tr key={p.id}>
                <td className="px-5 py-3 text-maroon-800 font-medium">{p.display_name}</td>
                <td className="px-5 py-3 font-mono text-maroon-500">{p.username}</td>
                <td className="px-5 py-3 text-maroon-500">
                  {(sectionsByInstructor[p.id] || []).map((l, i) => (
                    <span key={i} className="inline-block text-xs bg-maroon-50 text-maroon-600 rounded px-2 py-0.5 mr-1 mb-1">
                      {l.sections?.courses?.code} {l.sections?.section_number} · {l.sections?.terms?.name} ({l.role})
                    </span>
                  ))}
                  {!(sectionsByInstructor[p.id] || []).length && <span className="text-maroon-200">Not assigned yet</span>}
                </td>
                <td className="px-5 py-3 text-right whitespace-nowrap">
                  <button onClick={() => openEdit(p)} className="text-maroon-500 hover:text-maroon-800 text-xs mr-3">Edit</button>
                  <button onClick={() => resetPassword(p)} className="text-maroon-400 hover:text-maroon-700 text-xs mr-3">Reset password</button>
                  <button onClick={() => removeInstructor(p)} className="text-maroon-300 hover:text-red-600 text-xs">Delete</button>
                </td>
              </tr>
            ))}
            {instructors.length === 0 && <tr><td colSpan={4} className="px-5 py-8 text-center text-maroon-300">No instructors yet.</td></tr>}
          </tbody>
        </table>
      </div>

      {creating && (
        <div className="fixed inset-0 bg-maroon-900/40 grid place-items-center z-40 px-4" onClick={() => setCreating(false)}>
          <div className="bg-white rounded-2xl shadow-card p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display text-lg text-maroon-800 mb-4">New instructor</h3>
            <form onSubmit={createInstructor} className="space-y-3">
              <label className="block">
                <span className="block text-xs font-semibold text-maroon-500 uppercase tracking-wide mb-1">Full name</span>
                <input value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} className="input" />
              </label>
              <label className="block">
                <span className="block text-xs font-semibold text-maroon-500 uppercase tracking-wide mb-1">Username</span>
                <input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} className="input" placeholder="e.g. AmenEdoha" />
              </label>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <p className="text-xs text-maroon-400">
                They'll log in with this username and the default password, then be required to set their own.
              </p>
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setCreating(false)} className="text-sm text-maroon-400 hover:text-maroon-700 px-3 py-2">Cancel</button>
                <button
                  type="submit"
                  disabled={busy || !form.username || !form.display_name}
                  className="text-sm bg-maroon-700 hover:bg-maroon-800 disabled:opacity-50 text-white rounded-lg px-4 py-2"
                >
                  {busy ? 'Creating…' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 bg-maroon-900/40 grid place-items-center z-40 px-4" onClick={() => setEditing(null)}>
          <div className="bg-white rounded-2xl shadow-card p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display text-lg text-maroon-800 mb-4">Edit {editing.display_name}</h3>
            <form onSubmit={saveEdit} className="space-y-3">
              <label className="block">
                <span className="block text-xs font-semibold text-maroon-500 uppercase tracking-wide mb-1">Full name</span>
                <input value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} className="input" />
              </label>
              <label className="block">
                <span className="block text-xs font-semibold text-maroon-500 uppercase tracking-wide mb-1">Username</span>
                <input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} className="input" />
              </label>
              <label className="block">
                <span className="block text-xs font-semibold text-maroon-500 uppercase tracking-wide mb-1">Email (optional)</span>
                <input type="email" value={form.contact_email || ''} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} className="input" />
              </label>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <p className="text-xs text-maroon-400">
                Changing the username updates their login too — they'll sign in with the new one from now on. Their password isn't affected.
              </p>
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setEditing(null)} className="text-sm text-maroon-400 hover:text-maroon-700 px-3 py-2">Cancel</button>
                <button
                  type="submit"
                  disabled={busy || !form.username || !form.display_name}
                  className="text-sm bg-maroon-700 hover:bg-maroon-800 disabled:opacity-50 text-white rounded-lg px-4 py-2"
                >
                  {busy ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
