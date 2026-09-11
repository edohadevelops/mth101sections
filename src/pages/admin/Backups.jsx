import React, { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../lib/AuthContext'
import { backupSection, backupAllSections, restoreSectionBackup } from '../../lib/backup'

export default function Backups() {
  const { profile } = useAuth()
  const [backups, setBackups] = useState([])
  const [sections, setSections] = useState([])
  const [profiles, setProfiles] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [pickSection, setPickSection] = useState('all')
  const [restoring, setRestoring] = useState(null) // backup id being restored
  const [msg, setMsg] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [{ data: b, error: bErr }, { data: s }, { data: p }] = await Promise.all([
      // metadata only — never pull the (potentially large) snapshot column just to list rows
      supabase.from('backups').select('id, created_at, triggered_by, scope').order('created_at', { ascending: false }).limit(100),
      supabase.from('sections').select('id, section_number, terms(name), courses(code)'),
      supabase.from('profiles').select('id, display_name'),
    ])
    if (bErr) { setError(bErr.message); setLoading(false); return }
    setError('')
    setBackups(b || [])
    setSections(s || [])
    const pMap = {}
    for (const person of p || []) pMap[person.id] = person.display_name
    setProfiles(pMap)
    if ((s || []).length > 0 && pickSection === 'all') setPickSection(s[0].id)
    setLoading(false)
  }

  function sectionLabel(scope) {
    if (scope === 'all') return 'All sections'
    const s = sections.find((x) => x.id === scope)
    return s ? `${s.courses?.code} ${s.section_number} · ${s.terms?.name}` : 'Deleted section'
  }

  async function runManualBackup() {
    setBusy(true)
    setMsg('')
    const result = pickSection === 'all' ? await backupAllSections(profile.id) : await backupSection(pickSection, profile.id)
    setBusy(false)
    if (!result.ok) { setMsg(`Backup failed: ${result.error}`); return }
    setMsg('✓ Backup saved.')
    load()
  }

  async function runRestore(backup) {
    if (!confirm(
      `Restore "${sectionLabel(backup.scope)}" to how it was on ${new Date(backup.created_at).toLocaleString()}?\n\n` +
      `This replaces everything currently in that section — roster, attendance, redlist history — with what's in this backup. ` +
      `Anything added or changed since then will be gone unless it's in a different backup.`
    )) return
    setRestoring(backup.id)
    const result = await restoreSectionBackup(backup.id)
    setRestoring(null)
    if (!result.ok) { alert(`Restore failed: ${result.error}`); return }
    alert('Restored successfully.')
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-2xl text-maroon-800">Backups</h1>
        <p className="text-maroon-400 text-sm mt-1">
          A new backup is saved automatically every time anyone logs in. You can also trigger one manually below.
        </p>
      </div>

      <div className="bg-white rounded-2xl shadow-card p-5 mb-6">
        <h2 className="font-display text-lg text-maroon-800 mb-3">Back up now</h2>
        <div className="flex flex-wrap items-center gap-3">
          <select value={pickSection} onChange={(e) => setPickSection(e.target.value)} className="rounded-lg border border-maroon-100 px-3 py-2 text-sm text-maroon-800">
            <option value="all">All sections</option>
            {sections.map((s) => <option key={s.id} value={s.id}>{s.courses?.code} {s.section_number} · {s.terms?.name}</option>)}
          </select>
          <button onClick={runManualBackup} disabled={busy} className="text-sm bg-maroon-700 hover:bg-maroon-800 disabled:opacity-50 text-white rounded-lg px-3.5 py-2 transition">
            {busy ? 'Backing up…' : 'Back up now'}
          </button>
          {msg && <span className="text-sm text-maroon-600">{msg}</span>}
        </div>
      </div>

      {error && <p className="text-sm text-red-600 mb-4 bg-red-50 rounded-lg px-3.5 py-2.5">{error}</p>}

      <div className="bg-white rounded-2xl shadow-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-maroon-400 text-xs uppercase tracking-wide border-b border-maroon-50">
              <th className="px-5 py-3">When</th>
              <th className="px-5 py-3">Triggered by</th>
              <th className="px-5 py-3">Covers</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-maroon-50">
            {loading && <tr><td colSpan={4} className="px-5 py-8 text-center text-maroon-300">Loading…</td></tr>}
            {!loading && backups.length === 0 && <tr><td colSpan={4} className="px-5 py-8 text-center text-maroon-300">No backups yet — one gets created the next time anyone logs in.</td></tr>}
            {backups.map((b) => (
              <tr key={b.id}>
                <td className="px-5 py-3 text-maroon-800">{new Date(b.created_at).toLocaleString()}</td>
                <td className="px-5 py-3 text-maroon-500">{profiles[b.triggered_by] || 'Unknown'}</td>
                <td className="px-5 py-3 text-maroon-600">{sectionLabel(b.scope)}</td>
                <td className="px-5 py-3 text-right">
                  {b.scope !== 'all' && (
                    <button
                      onClick={() => runRestore(b)}
                      disabled={restoring === b.id}
                      className="text-xs text-maroon-500 hover:text-red-600 disabled:opacity-50"
                    >
                      {restoring === b.id ? 'Restoring…' : 'Restore this backup'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
