import React, { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import { useAuth } from './AuthContext'

const TooltipCtx = createContext(null)

export function TooltipProvider({ children }) {
  const { profile } = useAuth()
  const [dismissed, setDismissed] = useState(new Set())
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!profile?.id) return
    supabase.from('tooltip_dismissals').select('tooltip_key').eq('user_id', profile.id)
      .then(({ data }) => {
        setDismissed(new Set((data || []).map((d) => d.tooltip_key)))
        setLoaded(true)
      })
  }, [profile?.id])

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

  return (
    <TooltipCtx.Provider value={{ isDismissed: (key) => dismissed.has(key), dismiss, resetAll, loaded }}>
      {children}
    </TooltipCtx.Provider>
  )
}

export function useTooltips() {
  return useContext(TooltipCtx)
}
