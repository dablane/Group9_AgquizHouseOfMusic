const db = require('../../config/db');

const httpError = (status, message) => Object.assign(new Error(message), { status });

exports.list = async role => {
  if (!['parent', 'student'].includes(role)) throw httpError(400, 'Role must be parent or student.');
  const [rows] = await db.execute(
    `SELECT
       u.id,
       TRIM(CONCAT(u.first_name, ' ', u.last_name)) AS name,
       u.email,
       COALESCE(DATE_FORMAT(u.created_at, '%Y-%m-%d'), NULL) AS joined_at,
       COUNT(DISTINCT b.id) AS band_bookings
     FROM users u
     LEFT JOIN band_bookings b ON b.requested_by = u.id AND b.status != 'cancelled'
     WHERE u.role = ? AND u.is_active = 1
     GROUP BY u.id, name, u.email, u.created_at
     ORDER BY u.first_name, u.last_name`,
    [role]
  );
  return rows.map(r => ({
    id: r.id,
    name: r.name,
    email: r.email,
    joinedAt: r.joined_at,
    bandBookings: Number(r.band_bookings)
  }));
};