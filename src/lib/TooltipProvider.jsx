import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react'
import { supabase } from './supabaseClient'
import { useAuth } from './AuthContext'

const TooltipCtx = createContext(null)

export function TooltipProvider({ children }) {
  const { profile } = useAuth()
  const [dismissed, setDismissed] = useState(new Set())
  const [loaded, setLoaded] = useState(false)
  // Ordered list of tip keys currently mounted on screen — used to decide
  // which ONE gets to show its popup at a time.
  const order = useRef([])
  const [, forceTick] = useState(0)

  useEffect(() => {
    if (!profile?.id) return
    supabase.from('tooltip_dismissals').select('tooltip_key').eq('user_id', profile.id)
      .then(({ data }) => {
        setDismissed(new Set((data || []).map((d) => d.tooltip_key)))
        setLoaded(true)
      })
  }, [profile?.id])

  const register = useCallback((key) => {
    if (!order.current.includes(key)) order.current.push(key)
    forceTick((n) => n + 1)
    return () => {
      order.current = order.current.filter((k) => k !== key)
      forceTick((n) => n + 1)
    }
  }, [])

  async function dismiss(key) {
    setDismissed((prev) => new Set(prev).add(key))
    if (profile?.id) {
      await supabase.from('tooltip_dismissals').upsert({ user_id: profile.id, tooltip_key: key }, { onConflict: 'user_id,tooltip_key' })
    }
  }

  async function resetAll() {
    setDismissed(new Set())
    if (profile?.id) {
      await supabase.from('tooltip_dismissals').delete().eq('user_id', profile.id)
    }
  }

  // The first mounted, not-yet-dismissed key in registration order is the
  // only one allowed to show its auto-popup right now.
  const activeKey = order.current.find((k) => !dismissed.has(k)) ?? null

  return (
    <TooltipCtx.Provider value={{ isDismissed: (key) => dismissed.has(key), dismiss, resetAll, loaded, register, activeKey }}>
      {children}
    </TooltipCtx.Provider>
  )
}

export function useTooltips() {
  return useContext(TooltipCtx)
}