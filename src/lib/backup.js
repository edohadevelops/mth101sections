import { supabase } from './supabaseClient'

// Snapshots one section's full working data (roster, sessions, attendance,
// redlist history) into a single backups row. Used both automatically on
// every login and on-demand from the Backups screen — same function either
// way, so there's exactly one place this logic lives.
export async function backupSection(sectionId, userId) {
  const [students, sessions, attendance, redlist] = await Promise.all([
    supabase.from('students').select('*').eq('section_id', sectionId),
    supabase.from('class_sessions').select('*').eq('section_id', sectionId),
    supabase.from('attendance').select('*, class_sessions!inner(section_id)').eq('class_sessions.section_id', sectionId),
    supabase.from('redlist_contacts').select('*').eq('section_id', sectionId),
  ])
  const err = students.error || sessions.error || attendance.error || redlist.error
  if (err) return { ok: false, error: err.message }

  // strip the join artifact before storing — we only want real attendance columns
  const cleanAttendance = (attendance.data || []).map(({ class_sessions, ...rest }) => rest)

  const { error } = await supabase.from('backups').insert({
    triggered_by: userId,
    scope: sectionId,
    snapshot: { students: students.data, class_sessions: sessions.data, attendance: cleanAttendance, redlist_contacts: redlist.data },
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function backupAllSections(userId) {
  const [terms, sections, students, sessions, attendance, redlist] = await Promise.all([
    supabase.from('terms').select('*'),
    supabase.from('sections').select('*'),
    supabase.from('students').select('*'),
    supabase.from('class_sessions').select('*'),
    supabase.from('attendance').select('*'),
    supabase.from('redlist_contacts').select('*'),
  ])
  const err = terms.error || sections.error || students.error || sessions.error || attendance.error || redlist.error
  if (err) return { ok: false, error: err.message }

  const { error } = await supabase.from('backups').insert({
    triggered_by: userId,
    scope: 'all',
    snapshot: {
      terms: terms.data, sections: sections.data, students: students.data,
      class_sessions: sessions.data, attendance: attendance.data, redlist_contacts: redlist.data,
    },
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

// Restores one section back to exactly what a specific backup captured.
// Deletes the section's current students + class_sessions (which cascades
// to attendance, redlist_contacts, checkin_tokens, and device_checkins
// automatically via foreign keys), then re-inserts everything from the
// snapshot. Section-scoped backups only — a full "all sections" backup
// isn't a one-click restore target, since it spans every section at once.
export async function restoreSectionBackup(backupId) {
  const { data: backup, error: fetchErr } = await supabase.from('backups').select('*').eq('id', backupId).single()
  if (fetchErr) return { ok: false, error: fetchErr.message }
  if (backup.scope === 'all') return { ok: false, error: "This is a full-platform backup, not a single-section one — it can't be restored with one click." }

  const sectionId = backup.scope
  const snap = backup.snapshot

  const { error: delStudentsErr } = await supabase.from('students').delete().eq('section_id', sectionId)
  if (delStudentsErr) return { ok: false, error: delStudentsErr.message }
  const { error: delSessionsErr } = await supabase.from('class_sessions').delete().eq('section_id', sectionId)
  if (delSessionsErr) return { ok: false, error: delSessionsErr.message }

  if (snap.students?.length) {
    const { error } = await supabase.from('students').insert(snap.students)
    if (error) return { ok: false, error: `Restoring students: ${error.message}` }
  }
  if (snap.class_sessions?.length) {
    const { error } = await supabase.from('class_sessions').insert(snap.class_sessions)
    if (error) return { ok: false, error: `Restoring class sessions: ${error.message}` }
  }
  if (snap.attendance?.length) {
    const { error } = await supabase.from('attendance').insert(snap.attendance)
    if (error) return { ok: false, error: `Restoring attendance: ${error.message}` }
  }
  if (snap.redlist_contacts?.length) {
    const { error } = await supabase.from('redlist_contacts').insert(snap.redlist_contacts)
    if (error) return { ok: false, error: `Restoring redlist history: ${error.message}` }
  }

  return { ok: true }
}
