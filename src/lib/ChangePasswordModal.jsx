import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { supabase } from './supabaseClient'
import { useAuth, usernameToEmail } from './AuthContext'

// Self-service password change, available any time from the header once
// logged in — separate from the FORCED change on first login. Anyone
// (instructor or supervisor) can open this whenever they want to pick a
// new password, not just the one time the system makes them.
export default function ChangePasswordModal({ onClose }) {
  const { profile } = useAuth()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setError('')
    if (next.length < 8) { setError('New password needs to be at least 8 characters.'); return }
    if (next !== confirm) { setError("New password and confirmation don't match."); return }

    setBusy(true)
    const { error: reauthError } = await supabase.auth.signInWithPassword({
      email: usernameToEmail(profile.username), password: current,
    })
    if (reauthError) {
      setBusy(false)
      setError('Current password is incorrect.')
      return
    }

    const { error: pwError } = await supabase.auth.updateUser({ password: next })
    setBusy(false)
    if (pwError) { setError(pwError.message); return }
    setDone(true)
  }

  return (
    <div className="fixed inset-0 bg-maroon-900/40 grid place-items-center z-40 px-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 22 }}
        className="bg-white rounded-2xl shadow-card p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-display text-lg text-maroon-800 mb-1">Change your password</h3>
        <p className="text-maroon-400 text-sm mb-4">Signed in as <span className="font-medium text-maroon-600">{profile?.username}</span></p>

        {done ? (
          <div>
            <p className="text-green-700 text-sm mb-4">✓ Password updated.</p>
            <button onClick={onClose} className="text-sm bg-maroon-700 hover:bg-maroon-800 text-white rounded-lg px-4 py-2 transition">Done</button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} placeholder="Current password" className="input" autoComplete="current-password" />
            <input type="password" value={next} onChange={(e) => setNext(e.target.value)} placeholder="New password (min 8 characters)" className="input" autoComplete="new-password" />
            <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Confirm new password" className="input" autoComplete="new-password" />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={onClose} className="text-sm text-maroon-400 hover:text-maroon-700 px-3 py-2">Cancel</button>
              <button
                type="submit"
                disabled={busy || !current || !next || !confirm}
                className="text-sm bg-maroon-700 hover:bg-maroon-800 disabled:opacity-50 text-white rounded-lg px-4 py-2 transition"
              >
                {busy ? 'Updating…' : 'Update password'}
              </button>
            </div>
          </form>
        )}
      </motion.div>
    </div>
  )
}
