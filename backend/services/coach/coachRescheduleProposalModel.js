const db = require('../../config/db');

const httpError = (status, message) => Object.assign(new Error(message), { status });

exports.ensureTable = async () => {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS coach_reschedule_proposals (
      id INT AUTO_INCREMENT PRIMARY KEY,
      lesson_id INT NOT NULL,
      student_id INT NOT NULL,
      coach_id INT NOT NULL,
      slot_id INT NULL,
      new_starts_at DATETIME NOT NULL,
      new_ends_at DATETIME NOT NULL,
      reason TEXT NULL,
      status VARCHAR(16) NOT NULL DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_coach_proposals_lesson_status (lesson_id, status),
      INDEX idx_coach_proposals_student_status (student_id, status)
    )
  `);
  const [columns] = await db.execute(
    `SHOW COLUMNS FROM coach_reschedule_proposals LIKE 'slot_id'`
  );
  if (!columns.length) {
    await db.execute(
      `ALTER TABLE coach_reschedule_proposals ADD COLUMN slot_id INT NULL AFTER coach_id`
    );
  }
};

exports.findPendingByLesson = async (lessonId, studentId) => {
  await exports.ensureTable();
  const [rows] = await db.execute(
    `SELECT id, lesson_id, student_id, coach_id, new_starts_at, new_ends_at, reason, status, created_at
     FROM coach_reschedule_proposals
     WHERE lesson_id = ? AND student_id = ? AND status = 'pending'
     ORDER BY id DESC LIMIT 1`,
    [lessonId, studentId]
  );
  return rows[0] || null;
};

exports.create = async ({
  lessonId, studentId, coachId, slotId, customSlot, newStartsAt, newEndsAt, reason
}) => {
  await exports.ensureTable();
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    let reservedSlotId = null;
    if (slotId) {
      const [slots] = await connection.execute(
        `SELECT id FROM coach_available_slots
         WHERE id = ? AND coach_id = ? AND slot_date = ?
           AND start_time = TIME(?) AND end_time = TIME(?) AND is_booked = 0
         LIMIT 1 FOR UPDATE`,
        [
          slotId,
          coachId,
          newStartsAt.slice(0, 10),
          newStartsAt.slice(11),
          newEndsAt.slice(11)
        ]
      );
      if (!slots[0]) throw httpError(409, 'That time slot is no longer available.');
      reservedSlotId = slots[0].id;
    } else {
      const [overlappingSlots] = await connection.execute(
        `SELECT id FROM coach_available_slots
         WHERE coach_id = ? AND slot_date = ?
           AND start_time < TIME(?) AND end_time > TIME(?)
         LIMIT 1 FOR UPDATE`,
        [
          coachId,
          customSlot.date,
          newEndsAt.slice(11),
          newStartsAt.slice(11)
        ]
      );
      if (overlappingSlots.length) {
        throw httpError(409, 'That time overlaps another slot on your schedule.');
      }
    }

    const [conflicts] = await connection.execute(
      `SELECT id FROM lessons
       WHERE status != 'cancelled' AND (coach_id = ? OR student_id = ?)
         AND starts_at < ? AND ends_at > ?
       LIMIT 1 FOR UPDATE`,
      [coachId, studentId, newEndsAt, newStartsAt]
    );
    if (conflicts.length) {
      throw httpError(409, 'That time conflicts with a scheduled lesson.');
    }

    if (slotId) {
      const [reserved] = await connection.execute(
        `UPDATE coach_available_slots SET is_booked = 1
         WHERE id = ? AND is_booked = 0`,
        [reservedSlotId]
      );
      if (!reserved.affectedRows) throw httpError(409, 'That time slot is no longer available.');
    } else {
      const [slotResult] = await connection.execute(
        `INSERT INTO coach_available_slots
           (coach_id, slot_date, start_time, end_time, is_booked)
         VALUES (?, ?, ?, ?, 1)`,
        [
          coachId,
          customSlot.date,
          customSlot.startTime,
          customSlot.endTime
        ]
      );
      reservedSlotId = slotResult.insertId;
    }

    const [result] = await connection.execute(
      `INSERT INTO coach_reschedule_proposals
         (lesson_id, student_id, coach_id, slot_id, new_starts_at, new_ends_at, reason, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [lessonId, studentId, coachId, reservedSlotId, newStartsAt, newEndsAt, reason || null]
    );
    await connection.commit();
    return result.insertId;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

exports.respond = async (lessonId, studentId, decision) => {
  await exports.ensureTable();
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute(
      `SELECT p.id, p.slot_id, p.status, p.new_starts_at, p.new_ends_at,
         DATE_FORMAT(p.new_starts_at, '%Y-%m-%d') AS new_date,
         TIME_FORMAT(p.new_starts_at, '%H:%i:%s') AS new_start_time,
         TIME_FORMAT(p.new_ends_at, '%H:%i:%s') AS new_end_time,
         l.coach_id, l.student_id, l.status AS lesson_status,
         DATE_FORMAT(l.starts_at, '%Y-%m-%d') AS old_date,
         TIME_FORMAT(l.starts_at, '%H:%i:%s') AS old_start_time
       FROM coach_reschedule_proposals p
       JOIN lessons l ON l.id = p.lesson_id
       WHERE p.lesson_id = ? AND p.student_id = ? AND p.status = 'pending'
       LIMIT 1 FOR UPDATE`,
      [lessonId, studentId]
    );
    const proposal = rows[0];
    if (!proposal) throw httpError(404, 'Pending tutor reschedule proposal not found.');

    if (decision === 'decline') {
      await connection.execute(
        `UPDATE coach_reschedule_proposals SET status = 'declined' WHERE id = ? AND status = 'pending'`,
        [proposal.id]
      );
      if (proposal.slot_id) {
        await connection.execute(
          `UPDATE coach_available_slots SET is_booked = 0
           WHERE id = ? AND is_booked = 1`,
          [proposal.slot_id]
        );
      }
      await connection.commit();
      return { ok: true, status: 'declined' };
    }

    if (proposal.lesson_status !== 'scheduled') {
      throw httpError(409, 'This lesson can no longer be rescheduled.');
    }

    const slotQuery = proposal.slot_id
      ? `SELECT id, is_booked FROM coach_available_slots
         WHERE id = ? AND coach_id = ? AND slot_date = ?
           AND start_time = ? AND end_time = ? AND is_booked = 1
         LIMIT 1 FOR UPDATE`
      : `SELECT id, is_booked FROM coach_available_slots
         WHERE coach_id = ? AND slot_date = ? AND start_time = ? AND end_time = ? AND is_booked = 0
         LIMIT 1 FOR UPDATE`;
    const slotParams = proposal.slot_id
      ? [proposal.slot_id, proposal.coach_id, proposal.new_date, proposal.new_start_time, proposal.new_end_time]
      : [proposal.coach_id, proposal.new_date, proposal.new_start_time, proposal.new_end_time];
    const [availableSlots] = await connection.execute(slotQuery, slotParams);
    if (!availableSlots[0]) {
      throw httpError(409, 'The proposed time is no longer available. Please contact your tutor.');
    }
    const proposedSlot = availableSlots[0];

    const [conflicts] = await connection.execute(
      `SELECT id FROM lessons
       WHERE id != ? AND status != 'cancelled'
         AND ((student_id = ? OR coach_id = ?) AND starts_at < ? AND ends_at > ?)
       LIMIT 1 FOR UPDATE`,
      [lessonId, studentId, proposal.coach_id, proposal.new_ends_at, proposal.new_starts_at]
    );
    if (conflicts.length) {
      throw httpError(409, 'The proposed time now conflicts with another lesson.');
    }

    const [updatedLesson] = await connection.execute(
      `UPDATE lessons SET starts_at = ?, ends_at = ?
       WHERE id = ? AND student_id = ? AND status = 'scheduled'`,
      [proposal.new_starts_at, proposal.new_ends_at, lessonId, studentId]
    );
    if (!updatedLesson.affectedRows) throw httpError(409, 'This lesson can no longer be rescheduled.');

    await connection.execute(
      `UPDATE coach_available_slots SET is_booked = 0
       WHERE coach_id = ? AND slot_date = ? AND start_time = ? AND is_booked = 1 AND id != ?`,
      [proposal.coach_id, proposal.old_date, proposal.old_start_time, proposedSlot.id]
    );
    await connection.execute(
      `UPDATE coach_available_slots SET is_booked = 1 WHERE id = ?`,
      [proposedSlot.id]
    );
    await connection.execute(
      `UPDATE coach_reschedule_proposals SET status = 'approved' WHERE id = ? AND status = 'pending'`,
      [proposal.id]
    );
    await connection.commit();
    return { ok: true, status: 'approved' };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};
