const db = require('../../config/db');

// Create table if not exists
exports.ensureTable = async () => {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS coach_schedule_templates (
      id INT AUTO_INCREMENT PRIMARY KEY,
      coach_id INT NOT NULL UNIQUE,
      days VARCHAR(20) NOT NULL DEFAULT '',
      start_time TIME NOT NULL DEFAULT '09:00:00',
      end_time TIME NOT NULL DEFAULT '17:00:00',
      slot_duration INT NOT NULL DEFAULT 60,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (coach_id) REFERENCES users(id)
    )
  `);
};

exports.get = async (coachId) => {
  const [rows] = await db.execute(
    `SELECT days, TIME_FORMAT(start_time,'%H:%i') AS start_time,
            TIME_FORMAT(end_time,'%H:%i') AS end_time, slot_duration
     FROM coach_schedule_templates WHERE coach_id = ?`,
    [coachId]
  );
  return rows[0] || null;
};

exports.save = async (coachId, { days, startTime, endTime, slotDuration }) => {
  await db.execute(
    `INSERT INTO coach_schedule_templates (coach_id, days, start_time, end_time, slot_duration)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       days = VALUES(days),
       start_time = VALUES(start_time),
       end_time = VALUES(end_time),
       slot_duration = VALUES(slot_duration)`,
    [coachId, days, startTime, endTime, slotDuration || 60]
  );
};