import React, { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../lib/AuthContext'

export default function Terms() {
  const { profile } = useAuth()
  const [terms, setTerms] = useState([])
  const [editing, setEditing] = useState(null) // term object or 'new'

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase.from('terms').select('*').order('start_date', { ascending: false })
    setTerms(data || [])
  }

  async function save(form) {
    if (form.id) {
      await supabase.from('terms').update({ name: form.name, start_date: form.start_date, end_date: form.end_date }).eq('id', form.id)
    } else {
      await supabase.from('terms').insert({ name: form.name, start_date: form.start_date, end_date: form.end_date, created_by: profile.id })
    }
    setEditing(null)
    load()
  }

  async function remove(t) {
    if (!confirm(`Delete "${t.name}"? This will also delete every section, roster, and attendance record under it — this can't be undone.`)) return
    await supabase.from('terms').delete().eq('id', t.id)
    load()
  }

  return (
    <div>
      <div className="flex items-end justify-between mb-6">
        <div>
          <h1 className="font-display text-2xl text-maroon-800">Terms</h1>
          <p className="text-maroon-400 text-sm mt-1">e.g. "Fall 2026" — sections belong to a term.</p>
        </div>
        <button onClick={() => setEditing('new')} className="text-sm bg-maroon-700 hover:bg-maroon-800 text-white rounded-lg px-3.5 py-2 transition">
          + New term
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-maroon-400 text-xs uppercase tracking-wide border-b border-maroon-50">
              <th className="px-5 py-3">Term</th>
              <th className="px-5 py-3">Dates</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-maroon-50">
            {terms.map((t) => (
              <tr key={t.id}>
                <td className="px-5 py-3 text-maroon-800 font-medium">{t.name}</td>
                <td className="px-5 py-3 text-maroon-500">{t.start_date} → {t.end_date}</td>
                <td className="px-5 py-3 text-right whitespace-nowrap">
                  <button onClick={() => setEditing(t)} className="text-maroon-400 hover:text-maroon-700 text-xs mr-3">Edit</button>
                  <button onClick={() => remove(t)} className="text-maroon-300 hover:text-red-600 text-xs">Delete</button>
                </td>
              </tr>
            ))}
            {terms.length === 0 && <tr><td colSpan={3} className="px-5 py-8 text-center text-maroon-300">No terms yet.</td></tr>}
          </tbody>
        </table>
      </div>

      {editing && <TermModal term={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSave={save} />}
    </div>
  )
}

function TermModal({ term, onClose, onSave }) {
  const [form, setForm] = useState(term || { name: '', start_date: '', end_date: '' })
  return (
    <div className="fixed inset-0 bg-maroon-900/40 grid place-items-center z-40 px-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-card p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-display text-lg text-maroon-800 mb-4">{term ? 'Edit term' : 'New term'}</h3>
        <div className="space-y-3">
          <label className="block">
            <span className="block text-xs font-semibold text-maroon-500 uppercase tracking-wide mb-1">Name</span>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input" placeholder="Fall 2026" />
          </label>
          <label className="block">
            <span className="block text-xs font-semibold text-maroon-500 uppercase tracking-wide mb-1">Start date</span>
            <input type="date" value={form.start_date || ''} onChange={(e) => setForm({ ...form, start_date: e.target.value })} className="input" />
          </label>
          <label className="block">
            <span className="block text-xs font-semibold text-maroon-500 uppercase tracking-wide mb-1">End date</span>
            <input type="date" value={form.end_date || ''} onChange={(e) => setForm({ ...form, end_date: e.target.value })} className="input" />
          </label>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="text-sm text-maroon-400 hover:text-maroon-700 px-3 py-2">Cancel</button>
          <button
            onClick={() => onSave(form)}
            disabled={!form.name || !form.start_date || !form.end_date}
            className="text-sm bg-maroon-700 hover:bg-maroon-800 disabled:opacity-50 text-white rounded-lg px-4 py-2"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
