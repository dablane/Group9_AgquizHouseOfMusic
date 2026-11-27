const lessonModel = require('../../models/coach/coachLessonModel');

exports.list = async coachId => {
  const [rows, stats] = await Promise.all([
    lessonModel.getPayments(coachId),
    lessonModel.getPaymentStats(coachId)
  ]);
  return {
    payments: rows.map(lessonModel.shape),
    stats: {
      collected: Number(stats.collected || 0),
      unpaid: Number(stats.unpaid || 0),
      lessonFee: 500
    }
  };
};

exports.markPaid = async (id, coachId) => {
  const lesson = await lessonModel.findById(id, coachId);
  if (!lesson) throw Object.assign(new Error('Lesson not found.'), { status: 404 });
  await lessonModel.markPaid(id, coachId);
  return { lesson: lessonModel.shape(await lessonModel.findById(id, coachId)) };
};