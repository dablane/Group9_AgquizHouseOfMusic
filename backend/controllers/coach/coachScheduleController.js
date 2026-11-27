const svc = require('../../services/coach/coachScheduleService');
const requestSvc = require('../../services/coach/coachScheduleRequestService');
const wrap = fn => async (req,res,next) => { try { res.json({ success:true,...(await fn(req)) }); } catch(e){ next(e); } };

exports.getWeek      = wrap(async req => svc.getWeek(req.user.id, req.query.weekStart));
exports.createSlot   = wrap(async req => svc.createSlot(req.user.id, req.body));
exports.deleteSlot   = wrap(async req => svc.deleteSlot(req.user.id, Number(req.params.id)));
exports.saveTemplate = wrap(async req => svc.saveTemplate(req.user.id, req.body));
exports.applyTemplate = wrap(async req => svc.applyTemplate(req.user.id, req.body));
exports.publishRequest = wrap(async req => requestSvc.publish(req.user.id, Number(req.params.id)));
exports.declineRequest = wrap(async req => requestSvc.decline(req.user.id, Number(req.params.id), req.body?.reason));
exports.rescheduleRequest = wrap(async req => requestSvc.reschedule(req.user.id, Number(req.params.id), req.body));