import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../../services/api.js';
import Staff from '../Staff.jsx';
import '../staff.css';
import './myLessons.css';

const PAGE_SIZE = 5;
const dow = d => new Date(d).toLocaleDateString('en-PH', { weekday: 'short' });

const getRowsForTab = (tab, data) => {
  const upcoming = data?.upcoming || [];
  const completed = data?.completed || [];
  if (tab === 'all') return [...upcoming, ...completed];
  if (tab === 'upcoming') return upcoming;
  if (tab === 'pending') return upcoming.filter(l => !!l.reschedule);
  return completed;
};

function Pagination({ total, page, onPage }) {
  const totalPages = Math.ceil(total / PAGE_SIZE) || 1;
  return (
    <div className="ml__pagination">
      <span className="ml__paginfo">{total === 0 ? 'No records' : `Page ${page} of ${totalPages}`}</span>
      <div className="ml__pagbtns">
        <button aria-label="Previous page" className="ml__pagbtn" disabled={page <= 1} onClick={() => onPage(page - 1)}>‹</button>
        <button aria-label="Next page" className="ml__pagbtn" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>›</button>
      </div>
    </div>
  );
}

function LessonRow({ lesson, onRespond, responding, lastWithPlaceholders }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const isReschedulePending = !!lesson.reschedule;
  const isTutorProposal = lesson.reschedule?.requester === 'coach';
  const statusLabel = isReschedulePending ? 'Pending'
    : lesson.status === 'scheduled' ? 'Confirmed'
    : 'Completed';
  const statusClass = isReschedulePending ? 'pending'
    : lesson.status === 'scheduled' ? 'confirmed'
    : 'completed';
  const payClass = lesson.paymentStatus === 'paid' ? 'paid' : 'unpaid';

  return (
    <div className={`ml__rowgroup ${lastWithPlaceholders ? 'ml__rowgroup--last-content' : ''}`}>
      <div className={`ml__row ${open ? 'ml__row--open' : ''}`} onClick={() => setOpen(o => !o)}>
        {/* Date */}
        <div className="ml__datecell">
          <div className="month">{lesson.monthAbbr}</div>
          <div className="day">{lesson.dayNum}</div>
          <div className="dow">{dow(lesson.startsAt)}</div>
        </div>

        {/* Info */}
        <div className="ml__info">
          <b>{lesson.instruments?.[0] || 'Drum'} Lesson</b>
          <small>{lesson.dateShort} · {lesson.timeLabel} · {lesson.coachName}</small>
          {isReschedulePending && (
            <div className="ml__infopending">
              {isTutorProposal ? 'Your tutor proposed a new time — your approval is needed' : 'Reschedule requested — waiting for coach'}
            </div>
          )}
        </div>

        {/* Payment */}
        <span className={`ml__badge ml__badge--${payClass}`}>
          {lesson.paymentStatus === 'paid' ? 'Paid' : 'Unpaid'}
        </span>

        {/* Status */}
        {lesson.status === 'scheduled' && !isReschedulePending ? (
          <button
            className="ml__statusbtn"
            onClick={event => {
              event.stopPropagation();
              navigate(`/student/lessons/${lesson.id}/reschedule`);
            }}
            disabled={!lesson.canReschedule}
            title={!lesson.canReschedule ? 'Rescheduling is unavailable within 24 hours of the lesson.' : ''}>
            Reschedule
          </button>
        ) : (
          <span className={`ml__badge ml__badge--${statusClass}`}>
            {statusLabel}
          </span>
        )}
      </div>

      {/* Expandable detail */}
      {open && (
        <>
          <div className="ml__detail" onClick={e => e.stopPropagation()}>
            <div className="ml__detailitem"><span>Student</span><b>{lesson.studentName}</b></div>
            <div className="ml__detailitem"><span>When</span><b>{lesson.dateShort} · {lesson.timeLabel}</b></div>
            <div className="ml__detailitem"><span>Tutor</span><b>{lesson.coachName}</b></div>
            <div className="ml__detailitem"><span>Fee</span><b>₱ {lesson.amount}</b></div>
            {isTutorProposal && (
              <div className="ml__detailitem">
                <span>Proposed time</span>
                <b>{lesson.reschedule.newDateLabel} · {lesson.reschedule.newTimeLabel}</b>
              </div>
            )}
            {isTutorProposal && lesson.reschedule.reason && (
              <div className="ml__detailitem">
                <span>Message from tutor</span>
                <b>{lesson.reschedule.reason}</b>
              </div>
            )}
          </div>
          {isTutorProposal ? (
            <div className="ml__detailactions" onClick={e => e.stopPropagation()}>
              <button
                className="ml__reschedule"
                onClick={() => onRespond(lesson.id, 'approve')}
                disabled={responding || !lesson.canReschedule}
                title={!lesson.canReschedule ? 'Rescheduling is unavailable within 24 hours of the lesson.' : ''}>
                {responding ? 'Please wait…' : 'Approve New Time'}
              </button>
              <button
                className="ml__reschedule ml__reschedule--decline"
                onClick={() => onRespond(lesson.id, 'decline')}
                disabled={responding}>
                Decline
              </button>
            </div>
          ) : lesson.status === 'scheduled' && !isReschedulePending && !lesson.canReschedule ? (
            <div className="ml__detailactions" onClick={e => e.stopPropagation()}>
              <small className="ml__cutoffnote">Rescheduling closes 24 hours before the lesson.</small>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

export default function MyLessons() {
  const [tab, setTab]       = useState('all');
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState('');
  const [responding, setResponding] = useState(false);
  const [page, setPage] = useState(1);

  useEffect(() => {
    // Fetch both upcoming and past in one shot
    Promise.all([
      api.get('/student/lessons?tab=upcoming'),
      api.get('/student/lessons?tab=past')
    ])
      .then(([u, p]) => setData({ upcoming: u.lessons, completed: p.lessons.filter(l => l.status === 'completed') }))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const upcoming = data?.upcoming || [];
  const completed = data?.completed || [];
  const pending = upcoming.filter(l => !!l.reschedule);

  const TABS = [
    { key: 'all',       label: 'All',             count: upcoming.length + completed.length },
    { key: 'upcoming',  label: 'Upcoming',         count: upcoming.length },
    { key: 'pending',   label: 'Pending',          count: pending.length },
    { key: 'completed', label: 'Completed',        count: completed.length },
  ];

  const rows = getRowsForTab(tab, data);

  const totalPages = Math.ceil(rows.length / PAGE_SIZE) || 1;
  const currentPage = Math.min(page, totalPages);
  const pagedRows = rows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const respondToProposal = async (lessonId, decision) => {
    setResponding(true);
    setError('');
    try {
      await api.post(`/student/lessons/${lessonId}/reschedule/respond`, { decision });
      const [u, p] = await Promise.all([
        api.get('/student/lessons?tab=upcoming'),
        api.get('/student/lessons?tab=past')
      ]);
      const nextData = { upcoming: u.lessons, completed: p.lessons.filter(l => l.status === 'completed') };
      setData(nextData);
      const nextTotalPages = Math.ceil(getRowsForTab(tab, nextData).length / PAGE_SIZE) || 1;
      setPage(current => Math.min(current, nextTotalPages));
    } catch (e) {
      setError(e.message);
    } finally {
      setResponding(false);
    }
  };

  if (error)   return <div className="ml"><p className="ml__alert">{error}</p></div>;
  if (loading || !data) return <div className="ml"><p className="ml__muted">Loading…</p></div>;

  const sectionTitle = tab === 'all'       ? 'All Lessons'
                     : tab === 'upcoming'  ? 'Upcoming Lessons'
                     : tab === 'pending'   ? 'Pending Reschedule Requests'
                     :                      'Completed Lessons';

  return (
    <div className="ml">
      <h1>My Lessons</h1>
      <p className="ml__sub">Your booked lessons, times and details.</p>
      <Staff />

      {/* Tabs */}
      <div className="ml__tabs">
        {TABS.map(t => (
          <button key={t.key} className={`ml__tab ${tab === t.key ? 'on' : ''}`} onClick={() => { setTab(t.key); setPage(1); }}>
            {t.label}
            {t.count > 0 && <span className="ml__tabcount">· {t.count}</span>}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="ml__section">
        <div className="ml__sectiontitle">{sectionTitle}</div>
        <div className="ml__table">
          <div className="ml__thead">
            <span>Date</span>
            <span>Lesson / Schedule</span>
            <span>Payment</span>
            <span>Status</span>
          </div>

          {rows.length === 0 && (
            <p className="ml__empty">
              {tab === 'pending' ? 'No pending reschedule requests.' : `No ${tab} lessons yet.`}
            </p>
          )}

          {pagedRows.map((l, index) => (
            <LessonRow
              key={l.id}
              lesson={l}
              onRespond={respondToProposal}
              responding={responding}
              lastWithPlaceholders={index === pagedRows.length - 1 && pagedRows.length < PAGE_SIZE}
            />
          ))}
          {Array.from(
            { length: Math.max(0, PAGE_SIZE - pagedRows.length - (rows.length === 0 ? 1 : 0)) },
            (_, index) => <div key={`lesson-placeholder-${index}`} className="ml__row ml__row--placeholder" aria-hidden="true" />
          )}
        </div>
        <Pagination total={rows.length} page={currentPage} onPage={setPage} />
      </div>
    </div>
  );
}