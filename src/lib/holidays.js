// Federal-style holidays — computed from fixed rules, valid for any year,
// zero maintenance ever. University-specific breaks (fall break, etc.) are
// NOT here on purpose — those vary year to year with no formula behind
// them, so instructors mark those themselves via section_holidays.

function dateStr(y, m, d) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

// weekday: 0=Sun..6=Sat (matches JS Date.getDay())
function nthWeekdayOfMonth(year, month1to12, weekday, n) {
  const d = new Date(year, month1to12 - 1, 1)
  let count = 0
  while (d.getMonth() === month1to12 - 1) {
    if (d.getDay() === weekday) {
      count++
      if (count === n) return dateStr(year, month1to12, d.getDate())
    }
    d.setDate(d.getDate() + 1)
  }
  return null
}

function lastWeekdayOfMonth(year, month1to12, weekday) {
  const d = new Date(year, month1to12, 0) // last day of month
  while (d.getDay() !== weekday) d.setDate(d.getDate() - 1)
  return dateStr(year, month1to12, d.getDate())
}

export function federalHolidays(year) {
  return new Set([
    dateStr(year, 1, 1),                       // New Year's Day
    nthWeekdayOfMonth(year, 1, 1, 3),           // MLK Day: 3rd Monday of Jan
    nthWeekdayOfMonth(year, 2, 1, 3),           // Presidents' Day: 3rd Monday of Feb
    lastWeekdayOfMonth(year, 5, 1),             // Memorial Day: last Monday of May
    dateStr(year, 6, 19),                       // Juneteenth
    dateStr(year, 7, 4),                        // Independence Day
    nthWeekdayOfMonth(year, 9, 1, 1),           // Labor Day: 1st Monday of Sept
    nthWeekdayOfMonth(year, 10, 1, 2),          // Columbus/Indigenous Peoples Day: 2nd Monday of Oct
    dateStr(year, 11, 11),                      // Veterans Day
    nthWeekdayOfMonth(year, 11, 4, 4),          // Thanksgiving Day: 4th Thursday of Nov
    dateStr(year, 12, 25),                      // Christmas Day
  ].filter(Boolean))
}

export function isFederalHoliday(dateISO) {
  const year = Number(dateISO.slice(0, 4))
  return federalHolidays(year).has(dateISO)
}
