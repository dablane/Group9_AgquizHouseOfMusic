const db = require('../../config/db');

exports.findByLesson = async lessonId => {
  const [rows] = await db.execute(
    `SELECT * FROM reschedule_requests WHERE lesson_id = ? AND status = 'pending' LIMIT 1`,
    [lessonId]
  );
  return rows[0] || null;
};

exports.create = async ({ lessonId, studentId, coachId, newStartsAt, newEndsAt, reason }) => {
  const [r] = await db.execute(
    `INSERT INTO reschedule_requests (lesson_id, student_id, coach_id, new_starts_at, new_ends_at, reason, status)
     VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
    [lessonId, studentId, coachId, newStartsAt, newEndsAt, reason || null]
  );
  return r.insertId;
};

exports.cancelByLesson = async lessonId => {
  await db.execute(
    `UPDATE reschedule_requests SET status = 'cancelled' WHERE lesson_id = ? AND status = 'pending'`,
    [lessonId]
  );
};