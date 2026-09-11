import React, { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../lib/AuthContext'
import { backupSection } from '../../lib/backup'

export default function Backups() {
  const { sectionId } = useOutletContext()
  const { profile } = useAuth()
  const [backups, setBackups] = useState([])
  const [profiles, setProfiles] = useState({})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => { load() }, [sectionId])

  async function load() {
    setLoading(true)
    const [{ data: b }, { data: p }] = await Promise.all([
      supabase.from('backups').select('id, created_at, triggered_by').eq('scope', sectionId).order('created_at', { ascending: false }).limit(50),
      supabase.from('profiles').select('id, display_name'),
    ])
    setBackups(b || [])
    const pMap = {}
    for (const person of p || []) pMap[person.id] = person.display_name
    setProfiles(pMap)
    setLoading(false)
  }

  async function runManualBackup() {
    setBusy(true)
    setMsg('')
    const result = await backupSection(sectionId, profile.id)
    setBusy(false)
    if (!result.ok) { setMsg(`Backup failed: ${result.error}`); return }
    setMsg('✓ Backup saved.')
    load()
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-2xl text-maroon-800">Backups</h1>
        <p className="text-maroon-400 text-sm mt-1">
          A backup of this section saves automatically every time you log in. Only your supervisor can restore one, but you can see the history here and trigger an extra one any time.
        </p>
      </div>

      <div className="bg-white rounded-2xl shadow-card p-5 mb-6 flex items-center gap-3">
        <button onClick={runManualBackup} disabled={busy} className="text-sm bg-maroon-700 hover:bg-maroon-800 disabled:opacity-50 text-white rounded-lg px-3.5 py-2 transition">
          {busy ? 'Backing up…' : 'Back up now'}
        </button>
        {msg && <span className="text-sm text-maroon-600">{msg}</span>}
      </div>

      <div className="bg-white rounded-2xl shadow-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-maroon-400 text-xs uppercase tracking-wide border-b border-maroon-50">
              <th className="px-5 py-3">When</th>
              <th className="px-5 py-3">Triggered by</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-maroon-50">
            {loading && <tr><td colSpan={2} className="px-5 py-8 text-center text-maroon-300">Loading…</td></tr>}
            {!loading && backups.length === 0 && <tr><td colSpan={2} className="px-5 py-8 text-center text-maroon-300">No backups yet.</td></tr>}
            {backups.map((b) => (
              <tr key={b.id}>
                <td className="px-5 py-3 text-maroon-800">{new Date(b.created_at).toLocaleString()}</td>
                <td className="px-5 py-3 text-maroon-500">{profiles[b.triggered_by] || 'Unknown'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
