import React, { useState } from 'react'
import { supabase } from '../../lib/supabaseClient'

export default function ResetData() {
  const [confirmText, setConfirmText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  async function runReset() {
    setError('')
    setBusy(true)
    const { error: rpcError } = await supabase.rpc('reset_all_data')
    setBusy(false)
    if (rpcError) { setError(rpcError.message); return }
    setDone(true)
    setConfirmText('')
  }

  return (
    <div className="max-w-lg">
      <h1 className="font-display text-2xl text-maroon-800 mb-1">Reset Data</h1>
      <p className="text-maroon-400 text-sm mb-6">
        For wiping test data clean before handing the app to real instructors — e.g. after you've
        tried everything out yourself and want a blank slate for a live demo.
      </p>

      <div className="bg-white rounded-2xl shadow-card p-6 border border-red-100">
        <h2 className="font-display text-lg text-red-700 mb-2">This deletes, permanently:</h2>
        <ul className="text-sm text-maroon-600 list-disc list-inside space-y-1 mb-4">
          <li>Every term and section</li>
          <li>Every student roster</li>
          <li>All attendance records</li>
          <li>All grade uploads and redlist history</li>
        </ul>
        <h2 className="font-display text-sm text-maroon-700 mb-2">This keeps:</h2>
        <ul className="text-sm text-maroon-500 list-disc list-inside space-y-1 mb-5">
          <li>All instructor and superadmin logins</li>
          <li>Course records (e.g. "MTH 101")</li>
          <li>Any backups already saved</li>
        </ul>

        {done ? (
          <p className="text-green-700 text-sm font-medium">✓ Done — everything's cleared. Ready for a fresh start.</p>
        ) : (
          <>
            <label className="block mb-3">
              <span className="block text-xs font-semibold text-maroon-500 uppercase tracking-wide mb-1">
                Type RESET to confirm
              </span>
              <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} className="input" placeholder="RESET" />
            </label>
            {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
            <button
              onClick={runReset}
              disabled={confirmText !== 'RESET' || busy}
              className="w-full bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white font-medium rounded-lg py-2.5 transition"
            >
              {busy ? 'Resetting…' : 'Permanently reset all data'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
