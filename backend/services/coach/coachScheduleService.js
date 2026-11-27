const slotModel     = require('../../models/coach/coachSlotModel');
const templateModel = require('../../models/coach/coachTemplateModel');
const proposalModel = require('../../models/coach/coachRescheduleProposalModel');
const scheduleRequestModel = require('../../models/coach/coachScheduleRequestModel');
const { getManilaDateTime, isFutureManilaTime, isWithinRescheduleCutoff } = require('../../utils/dateTime');
const db            = require('../../config/db');

const DAYS = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
// Day index map: MON=1, TUE=2 … SUN=0
const DAY_INDEX = { MON:1, TUE:2, WED:3, THU:4, FRI:5, SAT:6, SUN:0 };

function weekDates(weekStart) {
  const base = new Date(`${weekStart}T12:00:00`);
  const dow = base.getDay();
  const monday = new Date(base);
  monday.setDate(base.getDate() - (dow === 0 ? 6 : dow - 1));
  const dates = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    dates.push(d.toLocaleDateString('en-CA'));
  }
  return dates;
}

function addDays(iso, n) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString('en-CA');
}

// Generate time slots between startTime and endTime with given duration (mins)
function generateSlots(startTime, endTime, duration) {
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  const startMins = sh * 60 + sm;
  const endMins   = eh * 60 + em;
  const slots = [];
  for (let m = startMins; m + duration <= endMins; m += duration) {
    const s = `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
    const e = `${String(Math.floor((m+duration)/60)).padStart(2,'0')}:${String((m+duration)%60).padStart(2,'0')}`;
    slots.push({ start: s, end: e });
  }
  return slots;
}

function clockMinutes(time) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/.exec(String(time));
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function isValidDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return false;
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

exports.getWeek = async (coachId, weekStart) => {
  await templateModel.ensureTable();
  await proposalModel.ensureTable();
  const now = getManilaDateTime();
  const expiredSlotsRemoved = await slotModel.deleteExpiredAvailable(
    coachId,
    now.date,
    `${now.time}:${now.seconds}`
  );
  const start = weekStart || new Date().toLocaleDateString('en-CA');
  const dates = weekDates(start);
  const slots = await slotModel.getWeek(coachId, dates[0], dates[6]);
  const template = await templateModel.get(coachId);
  const scheduleRequests = await scheduleRequestModel.listPendingForCoach(coachId, dates[0], dates[6]);

  const days = dates.map(date => {
    const d = new Date(date + 'T12:00:00');
    const daySlots = slots.filter(s =>
      s.slot_date === date
      && (s.lesson_id
        ? s.lesson_status !== 'completed'
        : isFutureManilaTime(s.slot_date, s.start_time))
      && !(Number(s.is_booked) === 1 && !s.student_name && !s.proposal_id)
    );
    return {
      date,
      dayLabel: DAYS[d.getDay()],
      dayNum: d.getDate(),
      slots: daySlots.map(s => ({
        id: s.id,
        lessonId: s.lesson_id || null,
        lessonStatus: s.lesson_status || null,
        startTime: s.start_time,
        endTime: s.end_time,
        isBooked: Number(s.is_booked) === 1 || Boolean(s.lesson_id),
        proposalPending: Boolean(s.proposal_id),
        canReschedule: !isWithinRescheduleCutoff(`${s.slot_date} ${s.start_time}:00`),
        studentName: s.student_name || s.proposal_student_name || null
      }))
    };
  });

  const [list, availableList] = await Promise.all([
    slotModel.getList(coachId),
    slotModel.getAvailableList(coachId)
  ]);

  return {
    weekStart: dates[0],
    weekEnd: dates[6],
    expiredSlotsRemoved,
    days,
    scheduleRequests,
    template: template || null,
    slotList: list.map(s => ({
      id: s.id,
      date: s.slot_date,
      startTime: s.start_time,
      endTime: s.end_time,
      isBooked: Number(s.is_booked) === 1 || Boolean(s.student_name),
      proposalPending: Boolean(s.proposal_id),
      studentName: s.student_name || s.proposal_student_name || null
    })),
    availableSlots: availableList.map(s => ({
      id: s.id,
      date: s.slot_date,
      startTime: s.start_time,
      endTime: s.end_time
    }))
  };
};

exports.createSlot = async (coachId, { date, startTime, endTime } = {}) => {
  if (!date || !startTime || !endTime)
    throw Object.assign(new Error('date, startTime and endTime are required.'), { status: 400 });
  const startMinutes = /^\d{2}:\d{2}$/.test(startTime) ? clockMinutes(startTime) : null;
  const endMinutes = /^\d{2}:\d{2}$/.test(endTime) ? clockMinutes(endTime) : null;
  if (!isValidDate(date) || startMinutes === null || endMinutes === null || endMinutes - startMinutes !== 60) {
    throw Object.assign(new Error('Choose a valid date and a one-hour time slot.'), { status: 400 });
  }
  if (!isFutureManilaTime(date, startTime)) {
    throw Object.assign(new Error('Choose a future schedule time.'), { status: 400 });
  }

  const [slotConflicts] = await db.execute(
    `SELECT id FROM coach_available_slots
     WHERE coach_id = ? AND slot_date = ? AND start_time < ? AND end_time > ?
     LIMIT 1`,
    [coachId, date, endTime, startTime]
  );
  const [lessonConflicts] = await db.execute(
    `SELECT id FROM lessons
     WHERE coach_id = ? AND DATE(starts_at) = ? AND status != 'cancelled'
       AND TIME(starts_at) < ? AND TIME(ends_at) > ?
     LIMIT 1`,
    [coachId, date, endTime, startTime]
  );
  if (slotConflicts.length || lessonConflicts.length) {
    throw Object.assign(new Error('That time overlaps an existing schedule.'), { status: 409 });
  }

  const id = await slotModel.create(coachId, date, startTime, endTime);
  return { slotId: id };
};

exports.deleteSlot = async (coachId, id) => {
  await slotModel.deleteById(id, coachId);
  return { ok: true };
};

// Save weekly template
exports.saveTemplate = async (coachId, { days, startTime, endTime }) => {
  if (!days || !startTime || !endTime)
    throw Object.assign(new Error('days, startTime and endTime are required.'), { status: 400 });
  const startMinutes = clockMinutes(startTime);
  const endMinutes = clockMinutes(endTime);
  if (startMinutes === null || endMinutes - startMinutes !== 60)
    throw Object.assign(new Error('End time must be exactly one hour after start time.'), { status: 400 });
  await templateModel.save(coachId, { days, startTime, endTime, slotDuration: 60 });
  return { ok: true };
};

// Apply template: generate slots for the next `weeks` weeks
exports.applyTemplate = async (coachId, { weeks = 4 } = {}) => {
  const template = await templateModel.get(coachId);
  if (!template) throw Object.assign(new Error('No template saved yet.'), { status: 400 });

  const activeDays = template.days.split(',').map(d => d.trim()).filter(Boolean);
  const startMinutes = clockMinutes(template.start_time);
  const endMinutes = clockMinutes(template.end_time);
  if (startMinutes === null || endMinutes - startMinutes !== 60)
    throw Object.assign(new Error('Update your weekly template to use a one-hour time range before publishing.'), { status: 400 });
  const slots = generateSlots(template.start_time, template.end_time, 60);
  if (!activeDays.length || !slots.length) return { created: 0 };

  // Start from today's Monday
  const todayIso = getManilaDateTime().date;
  const todayDates = weekDates(todayIso);
  let created = 0;

  for (let w = 0; w < weeks; w++) {
    const weekBase = addDays(todayDates[0], w * 7);
    const dates    = weekDates(weekBase);

    for (const date of dates) {
      const d   = new Date(date + 'T12:00:00');
      const dow = DAYS[d.getDay()]; // MON, TUE …
      if (!activeDays.includes(dow)) continue;

      // Skip dates in the past
      if (date < todayIso) continue;

      for (const slot of slots) {
        if (date === todayIso && !isFutureManilaTime(date, slot.start)) continue;
        // Skip if slot already exists for this date+time
        const [existing] = await db.execute(
          `SELECT id FROM coach_available_slots
           WHERE coach_id=? AND slot_date=? AND start_time=? LIMIT 1`,
          [coachId, date, slot.start]
        );
        if (existing.length) continue;
        await slotModel.create(coachId, date, slot.start, slot.end);
        created++;
      }
    }
  }

  return { created };
};