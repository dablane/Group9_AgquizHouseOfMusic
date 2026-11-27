const lessonModel     = require('../../models/coach/coachLessonModel');
const rescheduleModel = require('../../models/coach/coachRescheduleModel');

const studentRescheduleModel = require('../../models/student/rescheduleModel');
const proposalModel = require('../../models/coach/coachRescheduleProposalModel');
const bookService = require('../student/bookService');
const { isFutureManilaTime } = require('../../utils/dateTime');
const { lessonInstruments } = require('../../utils/instruments');
const httpError = (status, message) => Object.assign(new Error(message), { status });

const fmtTime = d => new Date(d).toLocaleTimeString('en-PH',
  { hour: '2-digit', minute: '2-digit', hour12: true });
const fmtDate = d => new Date(d).toLocaleDateString('en-PH',
  { month: 'long', day: 'numeric', year: 'numeric' });

exports.list = async coachId => {
  const [inProgress, completed, reschedules, pending] = await Promise.all([
    lessonModel.getInProgress(coachId),
    lessonModel.getCompleted(coachId),
    rescheduleModel.getPending(coachId),
    scheduleRequestModel.listPendingForCoachAll(coachId)
  ]);

  const shapeReschedule = r => ({
    id: r.id,
    lessonId: r.lesson_id,
    studentName: r.student_name,
    instruments: lessonInstruments(r.lesson_instrument, r.instruments),
    origDate: new Date(r.orig_starts).toLocaleDateString('en-CA'),
    canReschedule: !isWithinRescheduleCutoff(r.orig_starts_local),
    origDateLabel: fmtDate(r.orig_starts),
    origTimeLabel: `${fmtTime(r.orig_starts)} - ${fmtTime(r.orig_ends)}`,
    newDateLabel: fmtDate(r.new_starts_at),
    newTimeLabel: `${fmtTime(r.new_starts_at)} - ${fmtTime(r.new_ends_at)}`,
    reason: r.reason,
    amount: Number(r.amount || 500),
    status: r.status,
    createdAt: r.created_at
  });

  return {
    inProgress:  inProgress.map(lessonModel.shape),
    completed:   completed.map(lessonModel.shape),
    reschedules: reschedules.map(shapeReschedule),
    pending
  };
};

exports.markCompleted = async (id, coachId) => {
  const lesson = await lessonModel.findById(id, coachId);
  if (!lesson) throw Object.assign(new Error('Lesson not found.'), { status: 404 });
  await lessonModel.markCompleted(id, coachId);
  return { lesson: lessonModel.shape(await lessonModel.findById(id, coachId)) };
};

exports.acceptReschedule = async (id, coachId) => {
  await rescheduleModel.accept(id, coachId);
  return { ok: true };
};

exports.suggestReschedule = async (id, coachId, suggestedTime) => {
  await rescheduleModel.suggest(id, coachId, suggestedTime);
  return { ok: true };
};

exports.requestReschedule = async (id, coachId, {
  date, slotId, customStartTime, customEndTime, reason
}) => {
  const lesson = await lessonModel.findById(id, coachId);
  if (!lesson) throw httpError(404, 'Lesson not found.');
  if (lesson.status !== 'scheduled') throw httpError(400, 'Only scheduled lessons can be rescheduled.');
  if (isWithinRescheduleCutoff(lesson.starts_at_local)) {
    throw httpError(400, 'Rescheduling is unavailable within 24 hours of the lesson.');
  }
  const isCustomTime = customStartTime !== undefined || customEndTime !== undefined;
  const selectedSlotId = Number(slotId);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') ||
      (!isCustomTime && (!Number.isSafeInteger(selectedSlotId) || selectedSlotId <= 0))) {
    throw httpError(400, 'Choose an available date and time.');
  }
  const [year, month, day] = date.split('-').map(Number);
  const selectedDate = new Date(year, month - 1, day);
  if (selectedDate.getFullYear() !== year || selectedDate.getMonth() !== month - 1 || selectedDate.getDate() !== day) {
    throw httpError(400, 'Choose a valid date.');
  }

  const existingStudentRequest = await studentRescheduleModel.findByLesson(id);
  if (existingStudentRequest) {
    throw httpError(409, 'There is already a student reschedule request for this lesson.');
  }
  const existingProposal = await proposalModel.findPendingByLesson(id, lesson.student_id);
  if (existingProposal) throw httpError(409, 'A reschedule proposal is already awaiting the student.');

  let selectedSlot = null;
  let customSlot = null;
  let newStartsAt;
  let newEndsAt;
  if (isCustomTime) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(customStartTime || '') ||
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(customEndTime || '') ||
        customEndTime <= customStartTime) {
      throw httpError(400, 'Choose a valid start and end time.');
    }
    selectedSlot = {
      start: customStartTime,
      end: customEndTime
    };
    customSlot = {
      date,
      startTime: `${customStartTime}:00`,
      endTime: `${customEndTime}:00`
    };
  } else {
    const availableSlots = await bookService.getSlots({
      coachId,
      date,
      studentId: lesson.student_id
    });
    selectedSlot = availableSlots.find(slot => slot.slotId === selectedSlotId);
    if (!selectedSlot) throw httpError(409, 'That time slot is no longer available.');
  }

  if (!isFutureManilaTime(date, selectedSlot.start)) {
    throw httpError(400, 'Choose a future time slot.');
  }

  newStartsAt = `${date} ${selectedSlot.start}:00`;
  newEndsAt = `${date} ${selectedSlot.end}:00`;

  const proposalId = await proposalModel.create({
    lessonId: id,
    studentId: lesson.student_id,
    coachId,
    slotId: isCustomTime ? null : selectedSlotId,
    customSlot,
    newStartsAt,
    newEndsAt,
    reason: typeof reason === 'string' ? reason.trim() : null
  });
  return { proposalId };
};
