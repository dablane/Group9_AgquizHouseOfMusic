// Database queries for band payments
const db = require('../../config/db');

exports.listWithBookings = async () => {
  const [rows] = await db.execute(
    `SELECT
       p.id,
       p.band_booking_id,
       p.amount,
       DATE_FORMAT(p.received_at, '%Y-%m-%d') AS received_at,
       p.divided_at,
       TRIM(CONCAT(u.first_name, ' ', u.last_name)) AS requester,
       DATE_FORMAT(b.starts_at, '%Y-%m-%d') AS booking_date,
       DATE_FORMAT(b.starts_at, '%H:%i') AS booking_start,
       b.for_name
     FROM band_payments p
     JOIN band_bookings b ON b.id = p.band_booking_id
     JOIN users u ON u.id = b.requested_by
     ORDER BY p.received_at DESC, p.id DESC`
  );
  return rows;
};

exports.findById = async id => {
  const [rows] = await db.execute(
    `SELECT
       p.id,
       p.band_booking_id,
       p.amount,
       DATE_FORMAT(p.received_at, '%Y-%m-%d') AS received_at,
       p.divided_at,
       TRIM(CONCAT(u.first_name, ' ', u.last_name)) AS requester,
       DATE_FORMAT(b.starts_at, '%Y-%m-%d') AS booking_date,
       DATE_FORMAT(b.starts_at, '%H:%i') AS booking_start,
       b.for_name
     FROM band_payments p
     JOIN band_bookings b ON b.id = p.band_booking_id
     JOIN users u ON u.id = b.requested_by
     WHERE p.id = ? LIMIT 1`,
    [id]
  );
  return rows[0] || null;
};

exports.create = async ({ bandBookingId, amount, receivedAt }) => {
  const [r] = await db.execute(
    'INSERT INTO band_payments (band_booking_id, amount, received_at) VALUES (?, ?, ?)',
    [bandBookingId, amount, receivedAt]
  );
  return r.insertId;
};

exports.markDivided = async id => {
  await db.execute('UPDATE band_payments SET divided_at = NOW() WHERE id = ?', [id]);
};

exports.getShares = async paymentId => {
  const [rows] = await db.execute(
    `SELECT s.coach_id, s.amount, TRIM(CONCAT(u.first_name, ' ', u.last_name)) AS name
     FROM payment_shares s JOIN users u ON u.id = s.coach_id
     WHERE s.payment_id = ?`,
    [paymentId]
  );
  return rows;
};

exports.insertShares = async shares => {
  if (!shares.length) return;
  const marks = shares.map(() => '(?,?,?)').join(',');
  const vals = shares.flatMap(s => [s.paymentId, s.coachId, s.amount]);
  await db.execute(`INSERT INTO payment_shares (payment_id, coach_id, amount) VALUES ${marks}`, vals);
};

// Approved band bookings that have no payment yet (for the "Record a payment" dropdown)
exports.unpaidBookings = async () => {
  const [rows] = await db.execute(
    `SELECT
       b.id,
       TRIM(CONCAT(u.first_name, ' ', u.last_name)) AS requester,
       DATE_FORMAT(b.starts_at, '%Y-%m-%d') AS booking_date,
       DATE_FORMAT(b.starts_at, '%a, %b %e') AS date_label,
       DATE_FORMAT(b.starts_at, '%H:%i') AS booking_start,
       b.for_name
     FROM band_bookings b
     JOIN users u ON u.id = b.requested_by
     WHERE b.status = 'approved'
       AND b.id NOT IN (SELECT DISTINCT band_booking_id FROM band_payments)
     ORDER BY b.starts_at ASC`
  );
  return rows;
};

// Total payments this month broken down by solo/band
exports.monthlyStats = async () => {
  const [rows] = await db.execute(
    `SELECT
       COALESCE(SUM(p.amount),0) AS band_total
     FROM band_payments p
     WHERE YEAR(p.received_at) = YEAR(CURDATE()) AND MONTH(p.received_at) = MONTH(CURDATE())`
  );
  const bandTotal = Number(rows[0].band_total);
  // Solo lessons total (from lessons table)
  const [lrows] = await db.execute(
    `SELECT COALESCE(SUM(amount),0) AS solo_total
     FROM lessons
     WHERE payment_status='paid'
       AND YEAR(starts_at) = YEAR(CURDATE()) AND MONTH(starts_at) = MONTH(CURDATE())`
  );
  const soloTotal = Number(lrows[0].solo_total);

  // Last month
  const [lmrows] = await db.execute(
    `SELECT COALESCE(SUM(p.amount),0) AS band_last,
            COALESCE((SELECT SUM(amount) FROM lessons WHERE payment_status='paid'
              AND YEAR(starts_at)=YEAR(DATE_SUB(CURDATE(), INTERVAL 1 MONTH))
              AND MONTH(starts_at)=MONTH(DATE_SUB(CURDATE(), INTERVAL 1 MONTH))),0) AS solo_last
     FROM band_payments p
     WHERE YEAR(p.received_at) = YEAR(DATE_SUB(CURDATE(), INTERVAL 1 MONTH))
       AND MONTH(p.received_at) = MONTH(DATE_SUB(CURDATE(), INTERVAL 1 MONTH))`
  );
  const lastMonth = Number(lmrows[0].band_last) + Number(lmrows[0].solo_last);
  const total = soloTotal + bandTotal;

  return {
    total,
    solo: soloTotal,
    band: bandTotal,
    changeFromLastMonth: total - lastMonth
  };
};