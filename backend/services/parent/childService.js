const childModel = require('../../models/parent/childModel');
const { INSTRUMENTS, parseInstruments } = require('../../utils/instruments');
const fmtDate = d => d ? new Date(d + 'T12:00:00').toLocaleDateString('en-PH', { month: 'short', year: 'numeric' }) : null;
const fmtTime = d => d ? new Date(d).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', hour12: true }) : null;
const ageFromBirthday = b => {
  if (!b) return null;
  const diff = Date.now() - new Date(b).getTime();
  return Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
};

exports.list = async parentId => {
  await childModel.ensureTable();
  const rows = await childModel.list(parentId);

  // For each child, get lesson stats from lessons table
  const db = require('../../config/db');
  const enriched = await Promise.all(rows.map(async r => {
    const childName = r.child_name;

    // Count completed lessons
    let completedCount = 0;
    let nextPaymentStatus = null;
    let nextLessonEnd = null;
    try {
      const [stats] = await db.execute(
        `SELECT COUNT(*) AS completed FROM lessons l
         JOIN users s ON s.id = l.student_id
         WHERE TRIM(CONCAT(s.first_name,' ',s.last_name)) = ? AND l.status = 'completed'`,
        [childName]
      );
      completedCount = Number(stats[0]?.completed || 0);

      if (r.next_lesson_at) {
        const [pay] = await db.execute(
          `SELECT l.payment_status, l.ends_at FROM lessons l
           JOIN users s ON s.id = l.student_id
           WHERE TRIM(CONCAT(s.first_name,' ',s.last_name)) = ?
             AND l.status = 'scheduled' AND l.starts_at > NOW()
           ORDER BY l.starts_at ASC LIMIT 1`,
          [childName]
        );
        nextPaymentStatus = pay[0]?.payment_status || null;
        nextLessonEnd = pay[0]?.ends_at || null;
      }
    } catch (e) { /* no student account yet */ }

    const nextEndLabel = nextLessonEnd
      ? new Date(nextLessonEnd).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', hour12: true })
      : null;

    return {
      id: r.id,
      name: childName,
      age: ageFromBirthday(r.birthday),
      birthday: r.birthday,
      instruments: parseInstruments(r.instrument),
      instrument: r.instrument, // keep raw for display
      level: r.level,
      notes: r.notes,
      joinedLabel: fmtDate(r.created_at),
      nextLessonAt: r.next_lesson_at,
      nextLessonLabel: r.next_lesson_at
        ? new Date(r.next_lesson_at).toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' }) +
          ' · ' + fmtTime(r.next_lesson_at) + (nextEndLabel ? ` – ${nextEndLabel}` : '')
        : null,
      nextCoach: r.next_coach,
      nextPaymentStatus,
      completedCount
    };
  }));

  return enriched;
};

exports.remove = async (parentId, id) => {
  await childModel.ensureTable();
  const child = await childModel.findById(id, parentId);
  if (!child) throw Object.assign(new Error('Child not found.'), { status: 404 });
  await childModel.deleteById(id, parentId);
  return { ok: true };
};

exports.create = async (parentId, body) => {
  await childModel.ensureTable();
  const { childName, birthday, instruments, level, notes } = body;
  if (!childName?.trim()) throw Object.assign(new Error('Child name is required.'), { status: 400 });
  const instrument = Array.isArray(instruments) && instruments.length
    ? instruments.join(',')
    : (instruments || null);
  const id = await childModel.create({ parentId, childName: childName.trim(), birthday, instrument, level, notes });
  return { childId: id };
};

exports.update = async (parentId, id, body = {}) => {
  await childModel.ensureTable();
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw Object.assign(new Error('Invalid child profile data.'), { status: 400 });
  }
  if (!Number.isInteger(id) || id < 1) {
    throw Object.assign(new Error('Invalid child ID.'), { status: 400 });
  }

  const child = await childModel.findById(id, parentId);
  if (!child) throw Object.assign(new Error('Child not found.'), { status: 404 });

  const { birthday, instruments, level, notes } = body;
  let normalizedBirthday = child.birthday;
  if (birthday !== undefined) {
    if (birthday === '' || birthday === null) {
      normalizedBirthday = null;
    } else {
      const date = typeof birthday === 'string' ? new Date(`${birthday}T00:00:00.000Z`) : null;
      if (!date || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== birthday) {
        throw Object.assign(new Error('Enter a valid birthday.'), { status: 400 });
      }
      normalizedBirthday = birthday;
    }
  }

  let instrument = child.instrument;
  if (instruments !== undefined) {
    if (!Array.isArray(instruments) ||
        instruments.some(item => typeof item !== 'string' || !INSTRUMENTS.includes(item))) {
      throw Object.assign(new Error('Select valid instruments.'), { status: 400 });
    }
    instrument = [...new Set(instruments)].join(',') || null;
  }

  const normalizedLevel = level === undefined ? child.level : level;
  if (typeof normalizedLevel !== 'string' || !normalizedLevel.trim() || normalizedLevel.length > 50) {
    throw Object.assign(new Error('Choose a valid experience level.'), { status: 400 });
  }

  const normalizedNotes = notes === undefined ? child.notes : notes;
  if (normalizedNotes !== null && typeof normalizedNotes !== 'string') {
    throw Object.assign(new Error('Notes must be text.'), { status: 400 });
  }
  if (typeof normalizedNotes === 'string' && normalizedNotes.length > 2000) {
    throw Object.assign(new Error('Notes must be 2,000 characters or fewer.'), { status: 400 });
  }

  await childModel.updateById({
    id,
    parentId,
    birthday: normalizedBirthday,
    instrument,
    level: normalizedLevel.trim(),
    notes: normalizedNotes || null
  });
  return { ok: true };
};
