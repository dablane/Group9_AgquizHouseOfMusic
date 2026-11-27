const db = require('../../config/db');
const lessonInstrumentModel = require('../shared/lessonInstrumentModel');
const httpError = (status, message) => Object.assign(new Error(message), { status });

const JOIN = `
  SELECT l.id, l.coach_id, l.student_id, l.starts_at, l.ends_at, l.status, l.payment_status, l.instrument AS lesson_instrument,
    DATE_FORMAT(l.starts_at, '%Y-%m-%d %H:%i:%s') AS starts_at_local,
    l.amount, l.notes, l.created_at,
    TRIM(CONCAT(c.first_name,' ',c.last_name)) AS coach_name,
    TRIM(CONCAT(s.first_name,' ',s.last_name)) AS student_name,
    COALESCE(cp.instruments,'') AS coach_instruments
  FROM lessons l
  JOIN users c ON c.id = l.coach_id
  JOIN users s ON s.id = l.student_id
  LEFT JOIN coach_profiles cp ON cp.user_id = l.coach_id`;

const queryLessons = async (sql, params) => {
  await lessonInstrumentModel.ensureColumn();
  const [rows] = await db.execute(sql, params);
  return rows;
};

exports.getUpcoming = async studentId => {
  return queryLessons(
    `${JOIN} WHERE l.student_id = ? AND l.status = 'scheduled' AND l.starts_at > NOW() ORDER BY l.starts_at ASC`,
    [studentId]
  );
};

exports.getPast = async studentId => {
  return queryLessons(
    `${JOIN} WHERE l.student_id = ? AND l.status IN ('completed','cancelled') ORDER BY l.starts_at DESC`,
    [studentId]
  );
};

exports.findById = async (id, studentId) => {
  const rows = await queryLessons(
    `${JOIN} WHERE l.id = ? AND l.student_id = ? LIMIT 1`,
    [id, studentId]
  );
  return rows[0] || null;
};

exports.getStats = async studentId => {
  const [rows] = await db.execute(
    `SELECT
      SUM(CASE WHEN l.status='scheduled' AND l.starts_at > NOW() THEN 1 ELSE 0 END) AS upcoming,
      SUM(CASE WHEN l.status='completed' THEN 1 ELSE 0 END) AS completed,
      SUM(CASE WHEN l.payment_status='unpaid' AND l.status!='cancelled' THEN COALESCE(l.amount,0) ELSE 0 END) AS unpaid_total
    FROM lessons l WHERE l.student_id = ?`,
    [studentId]
  );
  return rows[0];
};

exports.getUnpaid = async studentId => {
  return queryLessons(
    `${JOIN} WHERE l.student_id = ? AND l.payment_status = 'unpaid' AND l.status != 'cancelled' ORDER BY l.starts_at ASC`,
    [studentId]
  );
};

exports.getNextLesson = async studentId => {
  const rows = await queryLessons(
    `${JOIN} WHERE l.student_id = ? AND l.status = 'scheduled' AND l.starts_at > NOW() ORDER BY l.starts_at ASC LIMIT 1`,
    [studentId]
  );
  return rows[0] || null;
};

exports.createFromSlot = async ({ studentId, coachId, slotId, date, instrument, amount = 500 }) => {
  await lessonInstrumentModel.ensureColumn();
  const connection = await db.getConnection();
  let transactionStarted = false;

  try {
    await connection.beginTransaction();
    transactionStarted = true;

    const accountIds = [...new Set([Number(studentId), Number(coachId)])].sort((a, b) => a - b);
    for (const accountId of accountIds) {
      const [accounts] = await connection.execute(
        'SELECT id FROM users WHERE id = ? FOR UPDATE',
        [accountId]
      );
      if (!accounts[0]) throw httpError(404, 'Student or teacher not found.');
    }

    const [slots] = await connection.execute(
      `SELECT id, TIME_FORMAT(start_time, '%H:%i') AS start_time,
         TIME_FORMAT(end_time, '%H:%i') AS end_time
       FROM coach_available_slots
       WHERE id = ? AND coach_id = ? AND slot_date = ? AND is_booked = 0
       LIMIT 1 FOR UPDATE`,
      [slotId, coachId, date]
    );
    if (!slots[0]) throw httpError(409, 'That slot is no longer available. Please choose another time.');

    const startsAt = `${date} ${slots[0].start_time}:00`;
    const endsAt = `${date} ${slots[0].end_time}:00`;
    const [studentConflicts] = await connection.execute(
      `SELECT id FROM lessons
       WHERE student_id = ? AND status != 'cancelled'
         AND starts_at < ? AND ends_at > ?
       LIMIT 1 FOR UPDATE`,
      [studentId, endsAt, startsAt]
    );
    if (studentConflicts[0]) {
      throw httpError(409, 'This student already has a lesson scheduled during that time. Please choose a different time.');
    }

    const [coachConflicts] = await connection.execute(
      `SELECT id FROM lessons
       WHERE coach_id = ? AND status != 'cancelled'
         AND starts_at < ? AND ends_at > ?
       LIMIT 1 FOR UPDATE`,
      [coachId, endsAt, startsAt]
    );
    if (coachConflicts[0]) {
      throw httpError(409, 'This teacher already has a lesson scheduled during that time. Please choose another slot.');
    }

    const [result] = await connection.execute(
      `INSERT INTO lessons (student_id, coach_id, instrument, starts_at, ends_at, status, payment_status, amount)
       VALUES (?, ?, ?, ?, ?, 'scheduled', 'unpaid', ?)`,
      [studentId, coachId, instrument, startsAt, endsAt, amount]
    );
    const [updated] = await connection.execute(
      'UPDATE coach_available_slots SET is_booked = 1 WHERE id = ? AND is_booked = 0',
      [slotId]
    );
    if (updated.affectedRows !== 1) {
      throw httpError(409, 'That slot is no longer available. Please choose another time.');
    }

    await connection.commit();
    transactionStarted = false;
    return result.insertId;
  } catch (error) {
    if (transactionStarted) await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};