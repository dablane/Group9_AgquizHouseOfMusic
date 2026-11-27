const db = require('../../config/db');
const lessonInstrumentModel = require('../shared/lessonInstrumentModel');
const { parseInstruments } = require('../../utils/instruments');
const { isWithinRescheduleCutoff } = require('../../utils/dateTime');

const BASE = `
  SELECT l.id, l.coach_id, l.student_id, l.starts_at, l.ends_at, l.instrument AS lesson_instrument,
    DATE_FORMAT(l.starts_at, '%Y-%m-%d %H:%i:%s') AS starts_at_local,
    l.status, l.payment_status, l.amount, l.notes,
    TRIM(CONCAT(s.first_name,' ',s.last_name)) AS student_name,
    s.email AS student_email,
    COALESCE(cp.instruments,'') AS coach_instruments
  FROM lessons l
  JOIN users s ON s.id = l.student_id
  LEFT JOIN coach_profiles cp ON cp.user_id = l.coach_id`;

const queryLessons = async (sql, params) => {
  await lessonInstrumentModel.ensureColumn();
  const [rows] = await db.execute(sql, params);
  return rows;
};

const fmtDate = d => new Date(d).toLocaleDateString('en-PH',
  { weekday: undefined, year: 'numeric', month: 'long', day: 'numeric' });
const fmtTime = d => new Date(d).toLocaleTimeString('en-PH',
  { hour: '2-digit', minute: '2-digit', hour12: true });

exports.shape = r => ({
  id: r.id,
  studentId: r.student_id,
  studentName: r.student_name,
  studentEmail: r.student_email,
  coachId: r.coach_id,
  instruments: r.lesson_instrument ? [r.lesson_instrument] : parseInstruments(r.coach_instruments),
  startsAt: r.starts_at,
  canReschedule: !isWithinRescheduleCutoff(r.starts_at_local),
  endsAt: r.ends_at,
  status: r.status,
  paymentStatus: r.payment_status,
  amount: Number(r.amount || 500),
  notes: r.notes,
  dateLabel: fmtDate(r.starts_at),
  timeLabel: `${fmtTime(r.starts_at)} - ${fmtTime(r.ends_at)}`,
});

exports.getToday = async coachId => {
  return queryLessons(
    `${BASE} WHERE l.coach_id = ? AND DATE(l.starts_at) = CURDATE()
     AND l.status != 'cancelled' ORDER BY l.starts_at ASC`, [coachId]);
};

exports.getUpcoming = async coachId => {
  return queryLessons(
    `${BASE} WHERE l.coach_id = ? AND l.starts_at > NOW()
     AND l.status = 'scheduled' ORDER BY l.starts_at ASC LIMIT 10`, [coachId]);
};

exports.getInProgress = async coachId => {
  return queryLessons(
    `${BASE} WHERE l.coach_id = ? AND l.status = 'scheduled'
     ORDER BY l.starts_at ASC`, [coachId]);
};

exports.getCompleted = async coachId => {
  return queryLessons(
    `${BASE} WHERE l.coach_id = ? AND l.status = 'completed'
     ORDER BY l.starts_at DESC`, [coachId]);
};

exports.getAll = async coachId => {
  return queryLessons(
    `${BASE} WHERE l.coach_id = ? AND l.status != 'cancelled'
     ORDER BY l.starts_at DESC`, [coachId]);
};

exports.findById = async (id, coachId) => {
  const rows = await queryLessons(
    `${BASE} WHERE l.id = ? AND l.coach_id = ? LIMIT 1`, [id, coachId]);
  return rows[0] || null;
};

exports.markCompleted = async (id, coachId) => {
  await db.execute(
    `UPDATE lessons SET status='completed' WHERE id=? AND coach_id=?`, [id, coachId]);
};

exports.markPaid = async (id, coachId) => {
  await db.execute(
    `UPDATE lessons SET payment_status='paid' WHERE id=? AND coach_id=?`, [id, coachId]);
};

exports.getStats = async coachId => {
  const [rows] = await db.execute(
    `SELECT
      SUM(CASE WHEN DATE(starts_at)=CURDATE() AND status!='cancelled' THEN 1 ELSE 0 END) AS today,
      SUM(CASE WHEN starts_at > NOW() AND status='scheduled' THEN 1 ELSE 0 END) AS upcoming,
      COUNT(DISTINCT student_id) AS students,
      SUM(CASE WHEN status='scheduled' THEN 1 ELSE 0 END) AS pending_confirm
    FROM lessons WHERE coach_id=?`, [coachId]);
  return rows[0];
};

exports.getStudents = async coachId => {
  const [rows] = await db.execute(
    `SELECT s.id, TRIM(CONCAT(s.first_name,' ',s.last_name)) AS name, s.email,
      (SELECT starts_at FROM lessons l2
       WHERE l2.student_id=s.id AND l2.coach_id=? AND l2.status='scheduled'
       AND l2.starts_at > NOW() ORDER BY l2.starts_at ASC LIMIT 1) AS next_lesson_at,
      (SELECT ends_at FROM lessons l2
       WHERE l2.student_id=s.id AND l2.coach_id=? AND l2.status='scheduled'
       AND l2.starts_at > NOW() ORDER BY l2.starts_at ASC LIMIT 1) AS next_lesson_end,
      (SELECT status FROM lessons l2
       WHERE l2.student_id=s.id AND l2.coach_id=? ORDER BY l2.starts_at DESC LIMIT 1) AS last_status,
      (SELECT payment_status FROM lessons l2
       WHERE l2.student_id=s.id AND l2.coach_id=? ORDER BY l2.starts_at DESC LIMIT 1) AS last_payment
     FROM users s
     WHERE s.id IN (SELECT DISTINCT student_id FROM lessons WHERE coach_id=? AND status!='cancelled')
     ORDER BY s.first_name`,
  [coachId, coachId, coachId, coachId, coachId]);
  return rows;
};

exports.getPayments = async coachId => {
  return queryLessons(
    `${BASE} WHERE l.coach_id = ? AND l.status != 'cancelled'
     ORDER BY l.starts_at DESC`, [coachId]);
};

exports.getPaymentStats = async coachId => {
  const [rows] = await db.execute(
    `SELECT
      COALESCE(SUM(CASE WHEN payment_status='paid' THEN amount ELSE 0 END),0) AS collected,
      COALESCE(SUM(CASE WHEN payment_status='unpaid' AND status!='cancelled' THEN amount ELSE 0 END),0) AS unpaid
    FROM lessons WHERE coach_id=?`, [coachId]);
  return rows[0];
};
