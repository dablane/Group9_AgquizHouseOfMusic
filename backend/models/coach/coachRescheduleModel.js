const db = require('../../config/db');
const lessonInstrumentModel = require('../shared/lessonInstrumentModel');
const { isWithinRescheduleCutoff } = require('../../utils/dateTime');

exports.getPending = async coachId => {
  await lessonInstrumentModel.ensureColumn();
  const [rows] = await db.execute(
    `SELECT rr.id, rr.lesson_id, rr.new_starts_at, rr.new_ends_at, rr.reason, rr.status, rr.created_at,
       l.starts_at AS orig_starts, l.ends_at AS orig_ends, l.amount, l.instrument AS lesson_instrument,
       DATE_FORMAT(l.starts_at, '%Y-%m-%d %H:%i:%s') AS orig_starts_local,
       DATE_FORMAT(l.starts_at, '%Y-%m-%d %H:%i:%s') AS orig_starts_local,
       TRIM(CONCAT(u.first_name,' ',u.last_name)) AS student_name,
       COALESCE(cp.instruments,'') AS instruments
     FROM reschedule_requests rr
     JOIN lessons l ON l.id = rr.lesson_id
     JOIN users u ON u.id = rr.student_id
     LEFT JOIN coach_profiles cp ON cp.user_id = l.coach_id
     WHERE l.coach_id = ? AND rr.status = 'pending'
     ORDER BY rr.created_at DESC`,
    [coachId]
  );
  return rows;
};

exports.accept = async (id, coachId) => {
  // Move lesson to new time and mark reschedule approved
  const [rr] = await db.execute(
    `SELECT rr.*, l.coach_id,
       DATE_FORMAT(l.starts_at, '%Y-%m-%d %H:%i:%s') AS orig_starts_local
     FROM reschedule_requests rr
     JOIN lessons l ON l.id = rr.lesson_id
     WHERE rr.id = ? AND l.coach_id = ? AND rr.status = 'pending' LIMIT 1`,
    [id, coachId]
  );
  if (!rr[0]) throw Object.assign(new Error('Request not found.'), { status: 404 });
  if (isWithinRescheduleCutoff(rr[0].orig_starts_local)) {
    throw Object.assign(new Error('Rescheduling is unavailable within 24 hours of the lesson.'), { status: 400 });
  }
  await db.execute(
    `UPDATE lessons SET starts_at=?, ends_at=? WHERE id=?`,
    [rr[0].new_starts_at, rr[0].new_ends_at, rr[0].lesson_id]
  );
  await db.execute(
    `UPDATE reschedule_requests SET status='approved' WHERE id=?`, [id]
  );
};

exports.suggest = async (id, coachId, suggestedAt) => {
  const [rr] = await db.execute(
    `SELECT rr.*, l.coach_id,
       DATE_FORMAT(l.starts_at, '%Y-%m-%d %H:%i:%s') AS orig_starts_local
     FROM reschedule_requests rr
     JOIN lessons l ON l.id = rr.lesson_id
     WHERE rr.id = ? AND l.coach_id = ? LIMIT 1`,
    [id, coachId]
  );
  if (!rr[0]) throw Object.assign(new Error('Request not found.'), { status: 404 });
  if (isWithinRescheduleCutoff(rr[0].orig_starts_local)) {
    throw Object.assign(new Error('Rescheduling is unavailable within 24 hours of the lesson.'), { status: 400 });
  }
  await db.execute(
    `UPDATE reschedule_requests SET status='declined', reason=CONCAT(COALESCE(reason,''),' | Coach suggests: ', ?) WHERE id=?`,
    [suggestedAt, id]
  );
};
