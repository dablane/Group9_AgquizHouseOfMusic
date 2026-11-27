const peopleService = require('../../services/admin/peopleService');

const wrap = fn => async (req, res, next) => {
  try { res.json({ success: true, ...(await fn(req)) }); } catch (err) { next(err); }
};

exports.listPeople = wrap(async req => {
  const role = req.query.role || 'parent';
  const people = await peopleService.list(role);
  return { people };
});