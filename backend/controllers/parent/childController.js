const svc = require('../../services/parent/childService');
const wrap = fn => async (req,res,next) => { try { res.json({ success:true,...(await fn(req)) }); } catch(e){ next(e); } };
exports.list   = wrap(async req => ({ children: await svc.list(req.user.id) }));
exports.create = wrap(async req => svc.create(req.user.id, req.body));
exports.update = wrap(async req => svc.update(req.user.id, Number(req.params.id), req.body));
exports.remove = wrap(async req => svc.remove(req.user.id, Number(req.params.id)));
