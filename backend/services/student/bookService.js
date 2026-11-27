const db = require('../../config/db');
const lessonModel = require('../../models/student/lessonModel');
const { INSTRUMENTS, parseInstruments } = require('../../utils/instruments');

const LESSON_FEE = 500;
const httpError = (s, m) => Object.assign(new Error(m), { status: s });

exports.getCoaches = async () => {
  const [rows] = await db.execute(
    `SELECT u.id, TRIM(CONCAT(u.first_name,' ',u.last_name)) AS name,
       COALESCE(cp.instruments,'') AS instruments
     FROM users u JOIN coach_profiles cp ON cp.user_id = u.id
     WHERE u.role='coach' AND u.is_active=1 ORDER BY u.first_name`
  );
  return rows.map(r => ({
    id: r.id,
    name: r.name,
    instruments: parseInstruments(r.instruments)
  }));
};

// Only return slots the coach actually uploaded — not all 9-16
exports.getSlots = async ({ coachId, date, studentId }) => {
  // Get coach's uploaded available slots for this date that are not yet booked
  const [slots] = await db.execute(
    `SELECT s.id, TIME_FORMAT(s.start_time,'%H:%i') AS start_time,
       TIME_FORMAT(s.end_time,'%H:%i') AS end_time, HOUR(s.start_time) AS hour
     FROM coach_available_slots s
     WHERE s.coach_id = ? AND s.slot_date = ? AND s.is_booked = 0
     ORDER BY s.start_time`,
    [coachId, date]
  );

  if (slots.length === 0) return [];

  // Filter out any slots where a lesson already exists for that coach at that time
  const [bookedLessons] = await db.execute(
    `SELECT HOUR(starts_at) AS hour FROM lessons
     WHERE coach_id = ? AND DATE(starts_at) = ? AND status != 'cancelled'`,
    [coachId, date]
  );
  const bookedHours = new Set(bookedLessons.map(r => Number(r.hour)));

  // Also filter out slots where the student is already booked at that time
  let studentBookedHours = new Set();
  if (studentId) {
    const [studentLessons] = await db.execute(
      `SELECT HOUR(starts_at) AS hour FROM lessons
       WHERE student_id = ? AND DATE(starts_at) = ? AND status != 'cancelled'`,
      [studentId, date]
    );
    studentBookedHours = new Set(studentLessons.map(r => Number(r.hour)));
  }

  // Get coach instruments to attach to each slot
  const [[coachRow]] = await db.execute(
    `SELECT COALESCE(cp.instruments,'') AS instruments
     FROM coach_profiles cp WHERE cp.user_id = ?`, [coachId]
  );
  const coachInstruments = coachRow?.instruments
    ? parseInstruments(coachRow.instruments)
    : [];

  return slots
    .filter(s => !bookedHours.has(Number(s.hour)) && !studentBookedHours.has(Number(s.hour)))
    .map(s => ({
      slotId: s.id,
      hour: Number(s.hour),
      start: s.start_time,
      end: s.end_time,
      instruments: coachInstruments,
      instrument: coachInstruments[0] || '',
      label: `${s.start_time} – ${s.end_time} · 60 mins`
    }));
};

// Get all dates that a coach has uploaded slots for (for the day picker)
// Only dates with at least one unbooked slot, today or future
exports.getAvailableDates = async ({ coachId }) => {
  const [rows] = await db.execute(
    `SELECT DISTINCT DATE_FORMAT(s.slot_date,'%Y-%m-%d') AS date
     FROM coach_available_slots s
     WHERE s.coach_id = ?
       AND s.is_booked = 0
       AND DATE(s.slot_date) >= CURDATE()
     ORDER BY s.slot_date ASC`,
    [coachId]
  );
  return rows.map(r => r.date);
};

exports.book = async ({ studentId, coachId, date, slotId, instrument }) => {
  if (!INSTRUMENTS.includes(instrument)) {
    throw httpError(400, 'Choose a valid instrument.');
  }

  const [coachRows] = await db.execute(
    `SELECT COALESCE(instruments, '') AS instruments FROM coach_profiles WHERE user_id = ?`,
    [coachId]
  );
  if (!parseInstruments(coachRows[0]?.instruments).includes(instrument)) {
    throw httpError(400, 'This teacher does not teach the selected instrument.');
  }

  const id = await lessonModel.createFromSlot({
    studentId,
    coachId,
    date,
    slotId,
    instrument,
    amount: LESSON_FEE
  });
  return { lessonId: id };
};