import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useAuth } from '../lib/AuthContext'

export default function Login() {
  const { login, session } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  React.useEffect(() => {
    if (session) navigate('/', { replace: true })
  }, [session])

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await login(username, password)
      navigate('/', { replace: true })
    } catch (err) {
      setError("That username or password didn't match. Double check and try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-maroon-700 relative overflow-hidden flex items-center justify-center px-4">
      <div className="pointer-events-none absolute inset-0 opacity-[0.07]"
           style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '28px 28px' }} />

      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.94 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 20 }}
        className="relative w-full max-w-sm"
      >
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-maroon-600 text-white font-display font-semibold text-lg mb-4">
            101
          </div>
          <h1 className="font-display text-2xl text-white tracking-tight">MTH Attendance Platform</h1>
          <p className="text-maroon-200 text-sm mt-1">Sign in</p>
        </div>

        <form onSubmit={onSubmit} className="bg-chalk rounded-2xl shadow-card p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-maroon-600 uppercase tracking-wide mb-1.5">Username</label>
            <input autoFocus value={username} onChange={(e) => setUsername(e.target.value)} className="input" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-maroon-600 uppercase tracking-wide mb-1.5">Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="input" />
          </div>
          {error && <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-sm text-red-600">{error}</motion.p>}
          <motion.button
            whileHover={{ scale: busy ? 1 : 1.02 }}
            whileTap={{ scale: busy ? 1 : 0.97 }}
            type="submit"
            disabled={busy}
            className="w-full bg-maroon-600 hover:bg-maroon-700 disabled:opacity-60 text-white font-medium rounded-lg py-2.5 transition"
          >
            {busy ? 'Signing in…' : 'Sign in'}
          </motion.button>
        </form>
      </motion.div>
    </div>
  )
}
