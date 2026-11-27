const scheduleService = require('../../services/admin/scheduleService');

const wrap = fn => async (req, res, next) => {
  try { res.json({ success: true, ...(await fn(req)) }); } catch (err) { next(err); }
};

exports.getWeek = wrap(async req => {
  const { weekStart } = req.query;
  return scheduleService.getWeek({ weekStart });
});