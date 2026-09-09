import { supabase } from './supabaseClient'
import { isFederalHoliday } from './holidays'

function toISO(d) {
  return d.toISOString().slice(0, 10)
}

// Generates every missing class_sessions row for a section — every date
// between the term's start/end that matches one of the section's scheduled
// weekdays, skipping federal holidays and anything the instructor has
// marked as a holiday for this section. Never deletes or touches an
// existing session (so it's always safe to call this on every page load).
export async function syncSectionSessions(sectionId) {
  const { data: section } = await supabase.from('sections').select('term_id, terms(start_date, end_date)').eq('id', sectionId).single()
  if (!section?.terms) return

  const { data: schedule } = await supabase.from('section_schedule').select('*').eq('section_id', sectionId)
  if (!schedule || schedule.length === 0) return
  const scheduledWeekdays = new Set(schedule.map((s) => s.weekday)) // 1=Mon..4=Thu

  const { data: holidays } = await supabase.from('section_holidays').select('holiday_date').eq('section_id', sectionId)
  const holidaySet = new Set((holidays || []).map((h) => h.holiday_date))

  const { data: existing } = await supabase.from('class_sessions').select('session_date').eq('section_id', sectionId)
  const existingSet = new Set((existing || []).map((s) => s.session_date))

  const start = new Date(section.terms.start_date + 'T00:00:00')
  const end = new Date(section.terms.end_date + 'T00:00:00')
  const toCreate = []

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const jsDay = d.getDay() // 0=Sun..6=Sat
    const ourDay = jsDay // our weekday convention is also 1=Mon..4=Thu, 0/5/6 unused
    if (!scheduledWeekdays.has(ourDay)) continue
    const iso = toISO(d)
    if (existingSet.has(iso) || holidaySet.has(iso) || isFederalHoliday(iso)) continue
    toCreate.push({ section_id: sectionId, session_date: iso })
  }

  if (toCreate.length > 0) {
    await supabase.from('class_sessions').insert(toCreate)
  }
}
