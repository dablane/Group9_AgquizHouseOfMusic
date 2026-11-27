const svc = require('../../services/coach/coachPaymentService');
const wrap = fn => async (req,res,next) => { try { res.json({ success:true,...(await fn(req)) }); } catch(e){ next(e); } };
exports.list    = wrap(async req => svc.list(req.user.id));
exports.markPaid = wrap(async req => svc.markPaid(Number(req.params.id), req.user.id));