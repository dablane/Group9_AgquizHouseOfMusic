const lessonService = require('../../services/student/lessonService');
const wrap = fn => async (req, res, next) => {
  try { res.json({ success: true, ...(await fn(req)) }); } catch (err) { next(err); }
};

exports.list = wrap(async req => {
  const tab = req.query.tab || 'upcoming';
  const lessons = tab === 'past'
    ? await lessonService.getPast(req.user.id)
    : await lessonService.getUpcoming(req.user.id);
  return { lessons };
});

exports.getById = wrap(async req => ({
  lesson: await lessonService.getById(Number(req.params.id), req.user.id)
}));

exports.respondToReschedule = wrap(async req => ({
  result: await lessonService.respondToCoachProposal(
    Number(req.params.id),
    req.user.id,
    req.body.decision
  )
}));