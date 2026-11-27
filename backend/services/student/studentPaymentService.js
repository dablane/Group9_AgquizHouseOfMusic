const studentPaymentModel = require('../../models/student/studentPaymentModel');
const { lessonInstruments } = require('../../utils/instruments');

const fmtDate = d => new Date(d).toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
const fmtTime = d => new Date(d).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', hour12: true });

exports.getAll = async studentId => {
  const [rows, stats] = await Promise.all([
    studentPaymentModel.getAll(studentId),
    studentPaymentModel.getStats(studentId)
  ]);

  const lessons = rows.map(r => ({
    id: r.id,
    dateLabel: fmtDate(r.starts_at),
    timeLabel: `${fmtTime(r.starts_at)} – ${fmtTime(r.ends_at)}`,
    coachName: r.coach_name,
    instruments: lessonInstruments(r.lesson_instrument, r.coach_instruments),
    amount: Number(r.amount || 500),
    paymentStatus: r.payment_status,
    lessonStatus: r.status
  }));

  return {
    lessons,
    stats: {
      outstanding: Number(stats.outstanding || 0),
      paidThisMonth: Number(stats.paid_this_month || 0),
      paidSessions: Number(stats.paid_sessions || 0),
      lessonFee: 500
    }
  };
};