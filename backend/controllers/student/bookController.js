const bookService = require('../../services/student/bookService');
const bandBookingService = require('../../services/admin/bandBookingService');
const scheduleRequestService = require('../../services/coach/coachScheduleRequestService');
const wrap = fn => async (req, res, next) => {
  try { res.json({ success: true, ...(await fn(req)) }); } catch (err) { next(err); }
};

exports.getCoaches = wrap(async () => ({ coaches: await bookService.getCoaches() }));

exports.getSlots = wrap(async req => {
  const { coachId, date } = req.query;
  if (!coachId || !date) throw Object.assign(new Error('coachId and date are required.'), { status: 400 });
  const slots = await bookService.getSlots({ coachId: Number(coachId), date, studentId: req.user.id });
  return { slots };
});

exports.getAvailableDates = wrap(async req => {
  const { coachId } = req.query;
  if (!coachId) throw Object.assign(new Error('coachId is required.'), { status: 400 });
  const dates = await bookService.getAvailableDates({ coachId: Number(coachId) });
  return { dates };
});

exports.book = wrap(async req => {
  const { coachId, date, hour, slotId, instrument } = req.body;
  if (!coachId || !date || hour === undefined || !slotId || !instrument)
    throw Object.assign(new Error('coachId, date, hour, slotId and instrument are required.'), { status: 400 });
  return bookService.book({ studentId: req.user.id, coachId: Number(coachId), date, hour: Number(hour), slotId: Number(slotId), instrument });
});

exports.requestBandBooking = wrap(async req =>
  bandBookingService.requestByStudent(req.user.id, req.body)
);

exports.getScheduleRequests = wrap(async req =>
  scheduleRequestService.listForRequester(req.user.id, 'student', req.query.coachId)
);

exports.requestSchedule = wrap(async req =>
  scheduleRequestService.requestByStudent(req.user.id, req.body)
);