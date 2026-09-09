import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../lib/AuthContext'

export default function ForceChangePassword() {
  const { profile, refreshProfile } = useAuth()
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [email, setEmail] = useState(profile?.email || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(e) {
    e.preventDefault()
    setError('')
    if (next.length < 8) { setError('New password needs to be at least 8 characters.'); return }
    if (next !== confirm) { setError("New password and confirmation don't match."); return }

    setBusy(true)
    const { error: pwError } = await supabase.auth.updateUser({ password: next })
    if (pwError) { setError(pwError.message); setBusy(false); return }

    const { error: profileError } = await supabase
      .from('profiles')
      .update({ must_change_password: false, email: email || null })
      .eq('id', profile.id)

    setBusy(false)
    if (profileError) { setError(profileError.message); return }
    await refreshProfile()
  }

  return (
    <div className="min-h-screen bg-maroon-700 flex items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 20 }}
        className="w-full max-w-sm bg-white rounded-2xl shadow-card p-6"
      >
        <h1 className="font-display text-xl text-maroon-800 mb-1">Welcome, {profile?.display_name}</h1>
        <p className="text-maroon-400 text-sm mb-5">
          First thing — set a password only you know, and add your email in case you ever need it recovered.
        </p>
        <form onSubmit={submit} className="space-y-3">
          <label className="block">
            <span className="block text-xs font-semibold text-maroon-500 uppercase tracking-wide mb-1">New password</span>
            <input type="password" value={next} onChange={(e) => setNext(e.target.value)} className="input" autoComplete="new-password" />
          </label>
          <label className="block">
            <span className="block text-xs font-semibold text-maroon-500 uppercase tracking-wide mb-1">Confirm new password</span>
            <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="input" autoComplete="new-password" />
          </label>
          <label className="block">
            <span className="block text-xs font-semibold text-maroon-500 uppercase tracking-wide mb-1">Your email</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input" placeholder="you@missouristate.edu" />
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="w-full bg-maroon-700 hover:bg-maroon-800 disabled:opacity-60 text-white font-medium rounded-lg py-2.5 transition"
          >
            {busy ? 'Saving…' : 'Continue'}
          </button>
        </form>
      </motion.div>
    </div>
  )
}
