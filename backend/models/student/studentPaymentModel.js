const db = require('../../config/db');
const lessonInstrumentModel = require('../shared/lessonInstrumentModel');

exports.getAll = async studentId => {
  await lessonInstrumentModel.ensureColumn();
  const [rows] = await db.execute(
    `SELECT l.id, l.starts_at, l.ends_at, l.payment_status, l.amount, l.status, l.instrument AS lesson_instrument,
      TRIM(CONCAT(c.first_name,' ',c.last_name)) AS coach_name,
      COALESCE(cp.instruments,'') AS coach_instruments
     FROM lessons l
     JOIN users c ON c.id = l.coach_id
     LEFT JOIN coach_profiles cp ON cp.user_id = l.coach_id
     WHERE l.student_id = ? AND l.status != 'cancelled'
     ORDER BY l.starts_at DESC`,
    [studentId]
  );
  return rows;
};

exports.getStats = async studentId => {
  const [rows] = await db.execute(
    `SELECT
      COALESCE(SUM(CASE WHEN payment_status='unpaid' AND status!='cancelled' THEN COALESCE(amount,0) END),0) AS outstanding,
      COALESCE(SUM(CASE WHEN payment_status='paid'
        AND YEAR(starts_at)=YEAR(NOW()) AND MONTH(starts_at)=MONTH(NOW()) THEN COALESCE(amount,0) END),0) AS paid_this_month,
      COUNT(CASE WHEN payment_status='paid'
        AND YEAR(starts_at)=YEAR(NOW()) AND MONTH(starts_at)=MONTH(NOW()) THEN 1 END) AS paid_sessions
     FROM lessons WHERE student_id = ?`,
    [studentId]
  );
  return rows[0];
};