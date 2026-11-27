const lessonModel = require('../../models/student/lessonModel');
const rescheduleModel = require('../../models/student/rescheduleModel');
const proposalModel = require('../../models/coach/coachRescheduleProposalModel');
const { lessonInstruments } = require('../../utils/instruments');
const { isWithinRescheduleCutoff } = require('../../utils/dateTime');
const httpError = (s, m) => Object.assign(new Error(m), { status: s });

const fmtDate = d => new Date(d).toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
const fmtTime = d => new Date(d).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', hour12: true });
const fmtDateShort = d => new Date(d).toLocaleDateString('en-PH', { weekday: 'short', day: 'numeric', month: 'short' });
const fmtMonth = d => new Date(d).toLocaleDateString('en-PH', { month: 'short' }).toUpperCase();
const fmtDay = d => new Date(d).getDate();

const shape = (r, reschedule = null, requester = 'student') => ({
  id: r.id,
  coachId: r.coach_id,
  coachName: r.coach_name,
  studentName: r.student_name,
  instruments: lessonInstruments(r.lesson_instrument, r.coach_instruments),
  startsAt: r.starts_at,
  canReschedule: !isWithinRescheduleCutoff(r.starts_at_local),
  endsAt: r.ends_at,
  status: r.status,
  paymentStatus: r.payment_status,
  amount: Number(r.amount || 500),
  dateLabel: fmtDate(r.starts_at),
  dateShort: fmtDateShort(r.starts_at),
  timeLabel: `${fmtTime(r.starts_at)} – ${fmtTime(r.ends_at)}`,
  monthAbbr: fmtMonth(r.starts_at),
  dayNum: fmtDay(r.starts_at),
  reschedule: reschedule ? {
    id: reschedule.id,
    newStartsAt: reschedule.new_starts_at,
    newEndsAt: reschedule.new_ends_at,
    newDateLabel: fmtDate(reschedule.new_starts_at),
    newTimeLabel: `${fmtTime(reschedule.new_starts_at)} – ${fmtTime(reschedule.new_ends_at)}`,
    reason: reschedule.reason,
    status: reschedule.status,
    requester,
    createdAt: reschedule.created_at
  } : null
});

exports.getUpcoming = async studentId => {
  const rows = await lessonModel.getUpcoming(studentId);
  const lessons = await Promise.all(rows.map(async r => {
    const [studentRequest, coachProposal] = await Promise.all([
      rescheduleModel.findByLesson(r.id),
      proposalModel.findPendingByLesson(r.id, studentId)
    ]);
    return coachProposal
      ? shape(r, coachProposal, 'coach')
      : shape(r, studentRequest);
  }));
  return lessons;
};

exports.getPast = async studentId => {
  const rows = await lessonModel.getPast(studentId);
  return rows.map(r => shape(r));
};

exports.getById = async (id, studentId) => {
  const r = await lessonModel.findById(id, studentId);
  if (!r) throw httpError(404, 'Lesson not found.');
  const [studentRequest, coachProposal] = await Promise.all([
    rescheduleModel.findByLesson(r.id),
    proposalModel.findPendingByLesson(r.id, studentId)
  ]);
  return coachProposal
    ? shape(r, coachProposal, 'coach')
    : shape(r, studentRequest);
};

exports.respondToCoachProposal = async (lessonId, studentId, decision) => {
  if (!['approve', 'decline'].includes(decision)) {
    throw httpError(400, 'Choose whether to approve or decline the proposed time.');
  }
  const lesson = await lessonModel.findById(lessonId, studentId);
  if (!lesson) throw httpError(404, 'Lesson not found.');
  if (decision === 'approve' && isWithinRescheduleCutoff(lesson.starts_at_local)) {
    throw httpError(400, 'Rescheduling is unavailable within 24 hours of the lesson.');
  }
  return proposalModel.respond(lessonId, studentId, decision);
};