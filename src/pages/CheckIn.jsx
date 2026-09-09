import React, { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../lib/supabaseClient'

function getDeviceToken() {
  let t = localStorage.getItem('device_token')
  if (!t) { t = crypto.randomUUID(); localStorage.setItem('device_token', t) }
  return t
}

export default function CheckIn() {
  const [params] = useSearchParams()
  const sessionId = params.get('session')
  const token = params.get('token')
  const [mNumber, setMNumber] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)

  async function submit(e) {
    e.preventDefault()
    if (!mNumber.trim()) return
    setBusy(true)
    const { data, error } = await supabase.rpc('check_in', {
      p_session_id: sessionId, p_token: token, p_m_number: mNumber.trim(), p_device_token: getDeviceToken(),
    })
    setBusy(false)
    if (error) { setResult({ ok: false, message: 'Something went wrong. Please try again.' }); return }
    setResult(data?.[0] || { ok: false, message: 'No response from server.' })
  }

  if (!sessionId || !token) {
    return <Shell><p className="text-maroon-600 text-center">This link is missing information. Scan the QR code currently on the classroom screen.</p></Shell>
  }

  return (
    <Shell>
      <AnimatePresence mode="wait">
        {!result?.ok ? (
          <motion.div key="form" initial={{ opacity: 0, y: 16, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ type: 'spring', stiffness: 280, damping: 20 }}>
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-maroon-600 text-white font-display font-semibold text-lg mb-3">101</div>
              <h1 className="font-display text-xl text-maroon-800">Check in to class</h1>
              <p className="text-maroon-400 text-sm mt-1">Enter your M-number to mark yourself present</p>
            </div>
            <form onSubmit={submit} className="space-y-4">
              <input autoFocus value={mNumber} onChange={(e) => setMNumber(e.target.value)} placeholder="M12345678"
                className="w-full text-center tracking-wide font-mono text-lg rounded-xl border border-maroon-100 px-4 py-3.5 text-maroon-800 placeholder:text-maroon-300 focus:border-maroon-500 focus:ring-2 focus:ring-maroon-500/15 outline-none transition" autoCapitalize="characters" />
              <motion.button whileHover={{ scale: busy ? 1 : 1.02 }} whileTap={{ scale: busy ? 1 : 0.97 }} type="submit" disabled={busy || !mNumber.trim()}
                className="w-full bg-maroon-700 hover:bg-maroon-800 disabled:opacity-50 text-white font-medium rounded-xl py-3.5 transition">
                {busy ? 'Checking in…' : 'Check in'}
              </motion.button>
            </form>
            {result && !result.ok && <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="text-sm text-red-600 text-center mt-4">{result.message}</motion.p>}
          </motion.div>
        ) : (
          <motion.div key="success" initial={{ opacity: 0, scale: 0.85, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 13 }} className="text-center py-4">
            <motion.div initial={{ scale: 0, rotate: -8 }} animate={{ scale: 1, rotate: 0 }} transition={{ delay: 0.12, type: 'spring', stiffness: 320, damping: 11 }} className="mx-auto mb-5">
              {result.photo_url ? (
                <img src={result.photo_url} alt="" className="w-24 h-24 rounded-full object-cover mx-auto ring-4 ring-gold-400" />
              ) : (
                <div className="w-24 h-24 rounded-full bg-maroon-600 text-white grid place-items-center mx-auto ring-4 ring-gold-400"><CheckIcon /></div>
              )}
            </motion.div>
            <motion.h2 initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.22 }} className="font-display text-2xl text-maroon-800">
              Thank you, {firstName(result.student_name)}, for coming to class!
            </motion.h2>
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.32 }} className="text-maroon-400 mt-1">You're marked present for today.</motion.p>
          </motion.div>
        )}
      </AnimatePresence>
    </Shell>
  )
}

function firstName(full) { return full ? full.split(' ')[0] : '' }
function CheckIcon() { return <svg width="36" height="36" viewBox="0 0 24 24" fill="none"><path d="M4 12.5L9.5 18L20 6" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg> }
function Shell({ children }) { return <div className="min-h-screen bg-chalk flex items-center justify-center px-4 py-10"><div className="w-full max-w-sm bg-white rounded-2xl shadow-card p-7">{children}</div></div> }
