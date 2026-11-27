const coachModel = require('../../models/admin/coachModel');
const scheduleModel = require('../../models/admin/scheduleModel');

const FIRST_HOUR = 9;
const LAST_HOUR = 16; // 16:00–17:00 is the last slot
const pad = n => String(n).padStart(2, '0');

/**
 * Given an ISO week-start date (Monday), return the 7 dates of that week.
 */
function weekDates(weekStart) {
  const base = new Date(`${weekStart}T12:00:00`);
  const result = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    result.push(d.toLocaleDateString('en-CA')); // YYYY-MM-DD
  }
  return result;
}

/**
 * Returns the ISO date of the Monday of the week containing the given date.
 */
function toMonday(isoDate) {
  const d = new Date(`${isoDate}T12:00:00`);
  const dow = d.getDay(); // 0=Sun
  const diff = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + diff);
  return d.toLocaleDateString('en-CA');
}

exports.getWeek = async ({ weekStart }) => {
  const monday = weekStart ? toMonday(weekStart) : toMonday(new Date().toLocaleDateString('en-CA'));
  const dates = weekDates(monday);
  const dateFrom = dates[0];
  const dateTo = dates[6];

  // Get all band coaches (in_band = 1 and active)
  const bandCoaches = await coachModel.listBand();
  const coachIds = bandCoaches.map(c => c.id);

  // Fetch booked hours for those coaches
  const bookedRows = coachIds.length
    ? await scheduleModel.bookedHoursInRange(coachIds, dateFrom, dateTo)
    : [];

  // Fetch approved band bookings in range (they block ALL coaches as a band)
  const bandRows = await scheduleModel.bandBookingsInRange(dateFrom, dateTo);

  // Build lookup: { coachId: { 'YYYY-MM-DD': Set<hour> } }
  const coachBooked = {};
  coachIds.forEach(id => { coachBooked[id] = {}; });
  bookedRows.forEach(r => {
    if (!coachBooked[r.coach_id]) coachBooked[r.coach_id] = {};
    if (!coachBooked[r.coach_id][r.date]) coachBooked[r.coach_id][r.date] = new Set();
    coachBooked[r.coach_id][r.date].add(Number(r.hour));
  });

  // Build lookup: { 'YYYY-MM-DD': Set<hour> } for band bookings
  const bandBooked = {};
  bandRows.forEach(r => {
    if (!bandBooked[r.date]) bandBooked[r.date] = new Set();
    bandBooked[r.date].add(Number(r.hour));
  });

  // Build the grid
  const days = dates.map(date => {
    const d = new Date(`${date}T12:00:00`);
    const dayLabel = d.toLocaleDateString('en-PH', { weekday: 'short', day: 'numeric' }); // "Mon 9"

    const hours = [];
    for (let h = FIRST_HOUR; h <= LAST_HOUR; h++) {
      const timeLabel = `${pad(h)}:00`;
      const coaches = bandCoaches.map(c => {
        const isBooked = (coachBooked[c.id]?.[date]?.has(h)) || (bandBooked[date]?.has(h));
        return { id: c.id, name: c.name, booked: isBooked };
      });
      const allFree = coaches.length > 0 && coaches.every(c => !c.booked);
      hours.push({ hour: h, timeLabel, endLabel: `${pad(h + 1)}:00`, coaches, allFree });
    }

    return { date, dayLabel, hours };
  });

  return {
    weekStart: monday,
    weekEnd: dates[6],
    coaches: bandCoaches,
    days
  };
};