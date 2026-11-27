const db = require('../../config/db');
const notificationModel = require('./coachNotificationModel');

// available_slots: coach-defined open time slots
exports.createTable = async () => {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS coach_available_slots (
      id INT AUTO_INCREMENT PRIMARY KEY,
      coach_id INT NOT NULL,
      slot_date DATE NOT NULL,
      start_time TIME NOT NULL,
      end_time TIME NOT NULL,
      is_booked TINYINT(1) DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (coach_id) REFERENCES users(id)
    )
  `);
};

exports.getWeek = async (coachId, dateFrom, dateTo) => {
  const [rows] = await db.execute(
    `SELECT s.id, DATE_FORMAT(s.slot_date,'%Y-%m-%d') AS slot_date,
       TIME_FORMAT(s.start_time,'%H:%i') AS start_time,
       TIME_FORMAT(s.end_time,'%H:%i') AS end_time, s.is_booked,
         l.id AS lesson_id, l.status AS lesson_status,
       TRIM(CONCAT(u.first_name,' ',u.last_name)) AS student_name,
       p.id AS proposal_id,
       TRIM(CONCAT(pu.first_name,' ',pu.last_name)) AS proposal_student_name
     FROM coach_available_slots s
     LEFT JOIN lessons l ON l.coach_id = s.coach_id
       AND DATE(l.starts_at) = s.slot_date
       AND TIME(l.starts_at) = s.start_time
       AND l.status != 'cancelled'
     LEFT JOIN users u ON u.id = l.student_id
     LEFT JOIN coach_reschedule_proposals p ON p.slot_id = s.id AND p.status = 'pending'
     LEFT JOIN users pu ON pu.id = p.student_id
     WHERE s.coach_id = ? AND DATE(s.slot_date) BETWEEN ? AND ?
     ORDER BY s.slot_date, s.start_time`,
    [coachId, dateFrom, dateTo]
  );
  return rows;
};

exports.create = async (coachId, slotDate, startTime, endTime) => {
  const [r] = await db.execute(
    `INSERT INTO coach_available_slots (coach_id, slot_date, start_time, end_time) VALUES (?,?,?,?)`,
    [coachId, slotDate, startTime, endTime]
  );
  return r.insertId;
};

exports.deleteById = async (id, coachId) => {
  await db.execute(
    `DELETE FROM coach_available_slots WHERE id=? AND coach_id=? AND is_booked=0`,
    [id, coachId]
  );
};

exports.getList = async coachId => {
  const [rows] = await db.execute(
    `SELECT s.id, DATE_FORMAT(s.slot_date,'%Y-%m-%d') AS slot_date,
       TIME_FORMAT(s.start_time,'%H:%i') AS start_time,
       TIME_FORMAT(s.end_time,'%H:%i') AS end_time, s.is_booked,
       TRIM(CONCAT(u.first_name,' ',u.last_name)) AS student_name,
       p.id AS proposal_id,
       TRIM(CONCAT(pu.first_name,' ',pu.last_name)) AS proposal_student_name
     FROM coach_available_slots s
     LEFT JOIN lessons l ON l.coach_id=s.coach_id AND DATE(l.starts_at)=s.slot_date
       AND TIME(l.starts_at)=s.start_time AND l.status!='cancelled'
     LEFT JOIN users u ON u.id=l.student_id
     LEFT JOIN coach_reschedule_proposals p ON p.slot_id = s.id AND p.status = 'pending'
     LEFT JOIN users pu ON pu.id = p.student_id
     WHERE s.coach_id=? ORDER BY s.slot_date, s.start_time`,
    [coachId]
  );
  return rows;
};

exports.getAvailableList = async coachId => {
  const [rows] = await db.execute(
    `SELECT s.id, DATE_FORMAT(s.slot_date,'%Y-%m-%d') AS slot_date,
       TIME_FORMAT(s.start_time,'%H:%i') AS start_time,
       TIME_FORMAT(s.end_time,'%H:%i') AS end_time
     FROM coach_available_slots s
     WHERE s.coach_id = ? AND COALESCE(s.is_booked, 0) = 0
       AND NOT EXISTS (
         SELECT 1 FROM lessons l
         WHERE l.coach_id = s.coach_id AND l.status != 'cancelled'
           AND DATE(l.starts_at) = s.slot_date AND TIME(l.starts_at) = s.start_time
       )
     ORDER BY s.slot_date, s.start_time`,
    [coachId]
  );
  return rows;
};

exports.deleteExpiredAvailable = async (coachId, date, time) => {
  await notificationModel.ensureTable();
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();
    const [expiredSlots] = await connection.execute(
      `SELECT s.id,
         DATE_FORMAT(s.slot_date, '%b %e, %Y') AS slot_date,
         TIME_FORMAT(s.start_time, '%h:%i %p') AS start_time,
         TIME_FORMAT(s.end_time, '%h:%i %p') AS end_time
       FROM coach_available_slots s
       WHERE s.coach_id = ? AND COALESCE(s.is_booked, 0) = 0
         AND (s.slot_date < ? OR (s.slot_date = ? AND s.end_time <= TIME(?)))
         AND NOT EXISTS (
           SELECT 1 FROM lessons l
           WHERE l.coach_id = s.coach_id AND l.status != 'cancelled'
             AND DATE(l.starts_at) = s.slot_date AND TIME(l.starts_at) = s.start_time
         )
       FOR UPDATE`,
      [coachId, date, date, time]
    );

    if (expiredSlots.length) {
      await notificationModel.createExpiredSlotNotifications(connection, coachId, expiredSlots);
      const placeholders = expiredSlots.map(() => '?').join(', ');
      await connection.execute(
        `DELETE FROM coach_available_slots
         WHERE coach_id = ? AND id IN (${placeholders}) AND COALESCE(is_booked, 0) = 0`,
        [coachId, ...expiredSlots.map(slot => slot.id)]
      );
    }

    await connection.commit();
    return expiredSlots.length;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};