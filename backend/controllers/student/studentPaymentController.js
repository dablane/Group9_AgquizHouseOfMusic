const studentPaymentService = require('../../services/student/studentPaymentService');
const wrap = fn => async (req, res, next) => {
  try { res.json({ success: true, ...(await fn(req)) }); } catch (err) { next(err); }
};
exports.getAll = wrap(async req => studentPaymentService.getAll(req.user.id));
    