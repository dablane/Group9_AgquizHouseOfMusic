const db = require('../../config/db');

// children are stored as users with role='student' linked to a parent via parent_children table
// We need to create that table if it doesn't exist

exports.ensureTable = async () => {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS parent_children (
      id         INT AUTO_INCREMENT PRIMARY KEY,
      parent_id  INT NOT NULL,
      child_name VARCHAR(100) NOT NULL,
      birthday   DATE DEFAULT NULL,
      instrument VARCHAR(50) DEFAULT NULL,
      level      VARCHAR(50) DEFAULT 'Beginner',
      notes      TEXT DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (parent_id) REFERENCES users(id)
    )
  `);
};

exports.list = async parentId => {
  const [rows] = await db.execute(
    `SELECT pc.id, pc.child_name, pc.birthday, pc.instrument, pc.level, pc.notes, pc.created_at,
       (SELECT l.starts_at FROM lessons l
        JOIN users u ON u.id = l.student_id
        WHERE l.student_id IN (
          SELECT s.id FROM users s WHERE s.role='student'
          AND TRIM(CONCAT(s.first_name,' ',s.last_name)) = pc.child_name
        ) AND l.status='scheduled' AND l.starts_at > NOW()
        ORDER BY l.starts_at ASC LIMIT 1) AS next_lesson_at,
       (SELECT TRIM(CONCAT(c.first_name,' ',c.last_name))
        FROM lessons l2
        JOIN users c ON c.id = l2.coach_id
        WHERE l2.student_id IN (
          SELECT s.id FROM users s WHERE s.role='student'
          AND TRIM(CONCAT(s.first_name,' ',s.last_name)) = pc.child_name
        ) AND l2.status='scheduled' AND l2.starts_at > NOW()
        ORDER BY l2.starts_at ASC LIMIT 1) AS next_coach
     FROM parent_children pc
     WHERE pc.parent_id = ?
     ORDER BY pc.created_at ASC`,
    [parentId]
  );
  return rows;
};

exports.create = async ({ parentId, childName, birthday, instrument, level, notes }) => {
  const [r] = await db.execute(
    `INSERT INTO parent_children (parent_id, child_name, birthday, instrument, level, notes)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [parentId, childName, birthday || null, instrument || null, level || 'Beginner', notes || null]
  );
  return r.insertId;
};

exports.findById = async (id, parentId) => {
  const [rows] = await db.execute(
    `SELECT * FROM parent_children WHERE id = ? AND parent_id = ? LIMIT 1`,
    [id, parentId]
  );
  return rows[0] || null;
};

exports.updateById = async ({ id, parentId, birthday, instrument, level, notes }) => {
  const [result] = await db.execute(
    `UPDATE parent_children
     SET birthday = ?, instrument = ?, level = ?, notes = ?
     WHERE id = ? AND parent_id = ?`,
    [birthday, instrument, level, notes, id, parentId]
  );
  return result.affectedRows > 0;
};

exports.deleteById = async (id, parentId) => {
  await db.execute(
    `DELETE FROM parent_children WHERE id = ? AND parent_id = ?`,
    [id, parentId]
  );
};

exports.getStudentIdByName = async (childName) => {
  const [rows] = await db.execute(
    `SELECT id FROM users WHERE role='student'
     AND TRIM(CONCAT(first_name,' ',last_name)) = ? LIMIT 1`,
    [childName]
  );
  return rows[0]?.id || null;
};
