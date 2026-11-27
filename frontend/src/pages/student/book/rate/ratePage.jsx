import { useEffect, useState } from 'react';
import Staff from '../Staff.jsx';
import '../staff.css';
import { api } from '../../../services/api.js';
import './ratePage.css';

const CRITERIA = [
  { key: 'teaching',      label: 'Teaching',      hint: 'The lesson was explained clearly.' },
  { key: 'punctuality',   label: 'Punctuality',   hint: 'The lesson started and ended on time.' },
  { key: 'communication', label: 'Communication', hint: 'The coach kept you informed about progress.' },
  { key: 'encouragement', label: 'Encouragement', hint: 'The lesson was patient and encouraging.' },
];

const EMPTY_SCORES = { teaching: 0, punctuality: 0, communication: 0, encouragement: 0 };
const COACH_COLORS = ['#ef4444', '#3b82f6', '#a855f7', '#22c55e', '#f59e0b'];
const coachKey = lesson => String(lesson.coachId ?? lesson.coachName);

function StarRow({ value, onChange }) {
  const [hover, setHover] = useState(0);
  const active = hover || value;
  return (
    <div className="rp__stars">
      {[1,2,3,4,5].map(n => (
        <svg
          key={n}
          className="rp__star"
          viewBox="0 0 24 24"
          fill={n <= active ? '#f5c842' : 'none'}
          stroke={n <= active ? '#f5c842' : '#d8c8b4'}
          strokeWidth="2"
          onMouseEnter={() => setHover(n)}
          onMouseLeave={() => setHover(0)}
          onClick={() => onChange(n)}
        >
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
        </svg>
      ))}
    </div>
  );
}

export default function RatePage({ audience = 'student' }) {
  const isParent = audience === 'parent';
  const [lessons, setLessons]   = useState([]);
  const [children, setChildren] = useState([]);
  const [selectedChild, setSelectedChild] = useState('');
  const [loading, setLoading]   = useState(true);
  const [selected, setSelected] = useState(null);
  const [scores, setScores]     = useState(EMPTY_SCORES);
  const [comment, setComment]   = useState('');
  const [rated, setRated]       = useState({});   // lessonId → true
  const [busy, setBusy]         = useState(false);
  const [success, setSuccess]   = useState('');
  const [error, setError]       = useState('');

  useEffect(() => {
    if (isParent) {
      api.get('/parent/ratings')
        .then(data => {
          const completed = data.lessons || [];
          const childList = data.children || [];
          const initialRated = Object.fromEntries(completed.filter(l => l.rated).map(l => [l.id, true]));
          const defaultChild = childList.find(child =>
            completed.some(l => l.childName === child.name && !l.rated)
          )?.name || childList.find(child => completed.some(l => l.childName === child.name))?.name || childList[0]?.name || '';
          const initialLesson = completed.find(l => l.childName === defaultChild && !l.rated)
            || null;

          setChildren(childList);
          setLessons(completed);
          setRated(initialRated);
          setSelectedChild(defaultChild);
          setSelected(initialLesson);
        })
        .catch(e => setError(e.message))
        .finally(() => setLoading(false));
      return;
    }

    api.get('/student/lessons?tab=past')
      .then(d => {
        const completed = (d.lessons || []).filter(l => l.status === 'completed');
        setLessons(completed);
        if (completed.length) setSelected(completed[0]);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [isParent]);

  const pickChild = childName => {
    const childLessons = lessons.filter(l => l.childName === childName);
    setSelectedChild(childName);
    setSelected(childLessons.find(l => !rated[l.id]) || null);
    setScores(EMPTY_SCORES);
    setComment('');
    setSuccess('');
    setError('');
  };

  const pick = l => {
    if (rated[l.id]) return;
    setSelected(l);
    setScores(EMPTY_SCORES);
    setComment('');
    setSuccess('');
    setError('');
  };

  const pickCoach = coach => {
    const lesson = coach.lessons.find(l => !rated[l.id]) || coach.lessons[0];
    if (lesson) pick(lesson);
  };

  const submit = async () => {
    if (!selected) return;
    if (Object.values(scores).some(v => v === 0)) {
      return setError('Please give a star rating for all 4 criteria.');
    }
    setBusy(true); setError('');
    try {
      await api.post(isParent ? '/parent/ratings' : '/student/ratings', {
        lessonId: selected.id,
        ...scores,
        comment: comment.trim() || null,
      });
      setRated(r => ({ ...r, [selected.id]: true }));
      setSuccess(`Rating sent for ${selected.coachName}! Thank you.`);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  const visibleLessons = isParent
    ? lessons.filter(lesson => lesson.childName === selectedChild)
    : lessons;
  const unratedCount = visibleLessons.filter(l => !rated[l.id]).length;
  const coaches = [...visibleLessons.reduce((grouped, lesson) => {
    const key = coachKey(lesson);
    const coach = grouped.get(key) || { key, name: lesson.coachName, lessons: [] };
    coach.lessons.push(lesson);
    grouped.set(key, coach);
    return grouped;
  }, new Map()).values()];
  const selectedCoachKey = selected ? coachKey(selected) : '';
  const selectedCoach = coaches.find(coach => coach.key === selectedCoachKey);
  const coachLessons = selectedCoach?.lessons || [];

  return (
    <div className="rp">
      <h1>{isParent ? "Rate your child’s coach" : 'Rate your coach'}</h1>
      <p className="rp__sub">
        {isParent
          ? 'Choose a child and coach, then rate one of their completed lessons.'
          : 'Tell us how the lesson went. You can rate each completed lesson once.'}
      </p>
      <Staff />

      {error && !selected && <p className="rp__alert">{error}</p>}

      {loading && <p className="rp__muted">Loading lessons…</p>}

      {!loading && !isParent && lessons.length === 0 && (
        <p className="rp__muted">You have no completed lessons to rate yet.</p>
      )}

      {!loading && (lessons.length > 0 || isParent) && (
          <div className="rp__content">
            <section className="rp__coachsection" aria-labelledby="rp-coach-heading">
              {isParent && (
                <label className="rp__childpicker">
                  <span>Rate for</span>
                  <select value={selectedChild} onChange={event => pickChild(event.target.value)}>
                    {children.length === 0 && <option value="">No children available</option>}
                    {children.map(child => <option key={child.id} value={child.name}>{child.name}</option>)}
                  </select>
                </label>
              )}
              <div className="rp__sectionhead">
                <div>
                  <h2 id="rp-coach-heading">Choose a coach</h2>
                  <p>Select who you’d like to rate.</p>
                </div>
                <span className="rp__remaining">
                  {unratedCount > 0
                    ? `${unratedCount} lesson${unratedCount === 1 ? '' : 's'} to rate`
                    : visibleLessons.length > 0 ? 'All lessons rated ✓' : 'No coach to rate'}
                </span>
              </div>
              {visibleLessons.length === 0
                ? <p className="rp__empty">{isParent ? 'No coach to rate for this child yet.' : 'No completed lessons to rate yet.'}</p>
                : (
                  <>
                    <div className="rp__coachchoices" role="group" aria-label="Choose a coach to rate">
                      {coaches.map((coach, index) => {
                        const hasUnratedLesson = coach.lessons.some(l => !rated[l.id]);
                        return (
                          <button
                            key={coach.key}
                            type="button"
                            className={`rp__coachchip ${selectedCoachKey === coach.key ? 'on' : ''}`}
                            onClick={() => pickCoach(coach)}
                            disabled={!hasUnratedLesson}
                            aria-pressed={selectedCoachKey === coach.key}
                            style={{ '--coach-color': COACH_COLORS[index % COACH_COLORS.length] }}
                          >
                            <span className="rp__coachdot" aria-hidden="true" />
                            <span>{coach.name}</span>
                          </button>
                        );
                      })}
                    </div>
                    {isParent && unratedCount === 0 && (
                      <p className="rp__empty">No coach to rate right now.</p>
                    )}
                  </>
                )}
            </section>

            <section className="rp__form" aria-label="Coach rating form">
              {!selected && !isParent && <p className="rp__empty">Choose a coach above to start rating.</p>}

              {selected && (
                <>
                  <div className="rp__lessonbanner">
                    <div className="rp__lessonmeta">
                      <span className="rp__formkicker">Lesson to rate</span>
                      <b>{selected.coachName} · {selected.instruments?.[0] || 'Drum'} Lesson</b>
                      <small>{[selected.dateLabel || selected.dateShort, selected.timeLabel].filter(Boolean).join(' · ')}</small>
                    </div>
                    <span className="rp__completed">Completed</span>
                  </div>

                  {coachLessons.length > 1 && (
                    <label className="rp__lessonpicker">
                      <span>Completed lesson</span>
                      <select
                        value={selected.id}
                        onChange={event => {
                          const lesson = coachLessons.find(l => String(l.id) === event.target.value);
                          if (lesson) pick(lesson);
                        }}
                      >
                        {coachLessons.map(lesson => (
                          <option key={lesson.id} value={lesson.id} disabled={!!rated[lesson.id]}>
                            {lesson.dateShort} · {lesson.instruments?.[0] || 'Drum'}{rated[lesson.id] ? ' · Rated' : ''}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}

                  {rated[selected.id] ? (
                    <div className="rp__success">{success || '✓ You’ve already rated this lesson.'}</div>
                  ) : (
                    <>
                      <div className="rp__criteria">
                        {CRITERIA.map(c => (
                          <div className="rp__criterion" key={c.key}>
                            <div className="rp__critlabel">{c.label}</div>
                            <div className="rp__crithint">{c.hint}</div>
                            <StarRow value={scores[c.key]} onChange={v => setScores(s => ({ ...s, [c.key]: v }))} />
                          </div>
                        ))}
                      </div>

                      <label className="rp__commentlabel" htmlFor="rp-comment">Anything to add? <span>(optional)</span></label>
                      <textarea
                        id="rp-comment"
                        className="rp__comment"
                        placeholder="Tell us what went well…"
                        value={comment}
                        onChange={e => setComment(e.target.value)}
                      />

                      {error && <div className="rp__error">{error}</div>}
                      {success && <div className="rp__success">{success}</div>}

                      <div className="rp__actions">
                        <button className="rp__submit" onClick={submit} disabled={busy}>
                          {busy ? 'Sending…' : 'Send rating'}
                        </button>
                      </div>
                      <p className="rp__note">You can rate each completed lesson once.</p>
                    </>
                  )}
                </>
              )}

              {!selected && isParent && (
                <>
                  <div className="rp__lessonbanner rp__lessonbanner--empty">
                    <div className="rp__lessonmeta">
                      <span className="rp__formkicker">Lesson to rate</span>
                      <b className="rp__lessonplaceholder">No lesson to rate</b>
                      <small>&nbsp;</small>
                    </div>
                  </div>

                  <label className="rp__lessonpicker">
                    <span>Completed lesson</span>
                    <select value="" disabled aria-label="Completed lesson">
                      <option value=""></option>
                    </select>
                  </label>

                  <div className="rp__criteria">
                    {CRITERIA.map(c => (
                      <div className="rp__criterion" key={c.key}>
                        <div className="rp__critlabel">{c.label}</div>
                        <div className="rp__crithint">{c.hint}</div>
                        <StarRow value={scores[c.key]} onChange={v => setScores(s => ({ ...s, [c.key]: v }))} />
                      </div>
                    ))}
                  </div>

                  <label className="rp__commentlabel" htmlFor="rp-comment">Anything to add? <span>(optional)</span></label>
                  <textarea
                    id="rp-comment"
                    className="rp__comment"
                    placeholder="Tell us what went well…"
                    value={comment}
                    onChange={e => setComment(e.target.value)}
                  />

                  {error && <div className="rp__error">{error}</div>}

                  <div className="rp__actions">
                    <button className="rp__submit" disabled>
                      Send rating
                    </button>
                  </div>
                  <p className="rp__note">You can rate each completed lesson once.</p>
                </>
              )}
            </section>
          </div>
      )}
    </div>
  );
}