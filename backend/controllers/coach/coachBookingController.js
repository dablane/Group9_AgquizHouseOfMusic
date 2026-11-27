const svc = require('../../services/coach/coachBookingService');
const wrap = fn => async (req,res,next) => { try { res.json({ success:true,...(await fn(req)) }); } catch(e){ next(e); } };
exports.list            = wrap(async req => svc.list(req.user.id));
exports.markCompleted   = wrap(async req => svc.markCompleted(Number(req.params.id), req.user.id));
exports.acceptReschedule = wrap(async req => svc.acceptReschedule(Number(req.params.id), req.user.id));
exports.suggestReschedule = wrap(async req => svc.suggestReschedule(Number(req.params.id), req.user.id, req.body.suggestedTime));
exports.requestReschedule = wrap(async req => svc.requestReschedule(Number(req.params.id), req.user.id, req.body));
