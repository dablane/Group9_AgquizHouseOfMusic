const paymentService = require('../../services/admin/paymentService');

const wrap = (fn, status = 200) => async (req, res, next) => {
  try { res.status(status).json({ success: true, ...(await fn(req)) }); } catch (err) { next(err); }
};

exports.list = wrap(async () => paymentService.list());
exports.record = wrap(async req => paymentService.record(req.body), 201);
exports.divide = wrap(async req => paymentService.divide(Number(req.params.id)));