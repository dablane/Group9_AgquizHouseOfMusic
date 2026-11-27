// Database queries for the coach schedule grid
const db = require('../../config/db');

exports.bookedHoursInRange = async (coachIds, dateFrom, dateTo) => {
  if (!coachIds.length) return [];
  const marks = coachIds.map(() => '?').join(',');
  const [rows] = await db.execute(
    `SELECT coach_id, DATE_FORMAT(starts_at, '%Y-%m-%d') AS date, HOUR(starts_at) AS hour
     FROM lessons
     WHERE status != 'cancelled'
       AND coach_id IN (${marks})
       AND DATE(starts_at) BETWEEN ? AND ?`,
    [...coachIds, dateFrom, dateTo]
  );
  return rows;
};

/**
 * Returns approved band bookings within a date range (they block the whole band).
 */
exports.bandBookingsInRange = async (dateFrom, dateTo) => {
  const [rows] = await db.execute(
    `SELECT DATE_FORMAT(starts_at, '%Y-%m-%d') AS date, HOUR(starts_at) AS hour
     FROM band_bookings
     WHERE status = 'approved'
       AND DATE(starts_at) BETWEEN ? AND ?`,
    [dateFrom, dateTo]
  );
  return rows;
};