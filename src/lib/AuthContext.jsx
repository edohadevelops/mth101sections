import React, { createContext, useContext, useEffect, useState, useRef } from 'react'
import { supabase } from './supabaseClient'

const AuthContext = createContext(null)

export function usernameToEmail(username) {
  return `${username.trim().toLowerCase()}@mth-platform.instructor`
}

async function triggerLoginBackup(userId) {
  try {
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', userId).single()
    if (!profile) return

    if (profile.role === 'superadmin') {
      const [terms, sections, students, sessions, attendance, redlist] = await Promise.all([
        supabase.from('terms').select('*'),
        supabase.from('sections').select('*'),
        supabase.from('students').select('*'),
        supabase.from('class_sessions').select('*'),
        supabase.from('attendance').select('*'),
        supabase.from('redlist_contacts').select('*'),
      ])
      await supabase.from('backups').insert({
        triggered_by: userId, scope: 'all',
        snapshot: { terms: terms.data, sections: sections.data, students: students.data, class_sessions: sessions.data, attendance: attendance.data, redlist_contacts: redlist.data },
      })
    } else {
      const { data: links } = await supabase.from('instructor_sections').select('section_id').eq('instructor_id', userId)
      for (const link of links || []) {
        const sectionId = link.section_id
        const [students, sessions, attendance, redlist] = await Promise.all([
          supabase.from('students').select('*').eq('section_id', sectionId),
          supabase.from('class_sessions').select('*').eq('section_id', sectionId),
          supabase.from('attendance').select('*, class_sessions!inner(section_id)').eq('class_sessions.section_id', sectionId),
          supabase.from('redlist_contacts').select('*').eq('section_id', sectionId),
        ])
        await supabase.from('backups').insert({
          triggered_by: userId, scope: sectionId,
          snapshot: { students: students.data, class_sessions: sessions.data, attendance: attendance.data, redlist_contacts: redlist.data },
        })
      }
    }
  } catch (err) {
    console.error('Login backup failed (non-fatal):', err)
  }
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined)
  const [profile, setProfile] = useState(null)
  const [profileLoading, setProfileLoading] = useState(false)
  const backedUpThisSession = useRef(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      if (event === 'SIGNED_IN' && s?.user && !backedUpThisSession.current) {
        backedUpThisSession.current = true
        triggerLoginBackup(s.user.id)
      }
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session?.user) { setProfile(null); return }
    setProfileLoading(true)
    supabase.from('profiles').select('*').eq('id', session.user.id).single()
      .then(({ data }) => { setProfile(data); setProfileLoading(false) })
  }, [session])

  async function login(username, password) {
    const email = usernameToEmail(username)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }

  async function logout() {
    await supabase.auth.signOut()
  }

  async function refreshProfile() {
    if (!session?.user) return
    const { data } = await supabase.from('profiles').select('*').eq('id', session.user.id).single()
    setProfile(data)
  }

  const value = {
    session, profile, refreshProfile,
    loading: session === undefined || (!!session && profileLoading && !profile),
    login, logout,
  }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}
