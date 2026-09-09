// Returns the LOCAL calendar date as "YYYY-MM-DD" — deliberately NOT using
// Date.toISOString(), which always converts to UTC. For anything that means
// "what date is this, on the wall calendar" (today's session, a generated
// class day), that UTC conversion is wrong: in Central time, it silently
// rolls over to the next day starting around 6-7pm local, which would make
// "today's session" point at the wrong date in the evening.
export function localDateStr(d = new Date()) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
