exports.submitRating = wrap(async req => {
  const { lessonId, teaching, punctuality, communication, encouragement, comment } = req.body;
  const studentId = req.user.id;

  // Verify the lesson belongs to this student and is completed
  const [rows] = await db.execute(
    `SELECT id, coach_id FROM lessons WHERE id = ? AND student_id = ? AND status = 'completed' LIMIT 1`,
    [lessonId, studentId]
  );
  if (!rows[0]) throw Object.assign(new Error('Lesson not found or not completed.'), { status: 404 });

  // Check not already rated
  const [existing] = await db.execute(
    `SELECT id FROM ratings WHERE lesson_id = ? AND rater_id = ? LIMIT 1`, [lessonId, studentId]
  );
  if (existing[0]) throw Object.assign(new Error('You have already rated this lesson.'), { status: 400 });

  // Validate scores
  const scores = [teaching, punctuality, communication, encouragement].map(Number);
  if (scores.some(s => s < 1 || s > 5 || !Number.isInteger(s))) {
    throw Object.assign(new Error('Each rating must be between 1 and 5.'), { status: 400 });
  }

  await db.execute(
    `INSERT INTO ratings (lesson_id, coach_id, rater_id, teaching, punctuality, communication, encouragement, comment)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [lessonId, rows[0].coach_id, studentId, scores[0], scores[1], scores[2], scores[3], comment || null]
  );

  return { message: 'Rating submitted.' };
});