import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../../services/api.js';
import './coachSchedules.css';

const HOURS = [7,8,9,10,11,12,13,14,15,16,17];

const fmtHour = h => {
  const ap = h < 12 ? 'AM' : 'PM';
  const d  = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${d}:00 ${ap}`;
};

function toMonday(isoDate) {
  const d = new Date(`${isoDate}T12:00:00`);
  const dow = d.getDay();
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
  return d.toLocaleDateString('en-CA');
}

function addDays(isoDate, n) {
  const d = new Date(`${isoDate}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString('en-CA');
}

function getMonthLabel(weekStart) {
  const d = new Date(`${weekStart}T12:00:00`);
  return d.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });
}

const COACH_COLORS = [
  { bg: '#fee2e2', text: '#991b1b', dot: '#ef4444' },
  { bg: '#dbeafe', text: '#1e40af', dot: '#3b82f6' },
  { bg: '#d1fae5', text: '#065f46', dot: '#10b981' },
  { bg: '#ede9fe', text: '#5b21b6', dot: '#8b5cf6' },
  { bg: '#fef3c7', text: '#92400e', dot: '#f59e0b' },
];

/* ── Slot detail overlay (read-only for admin) ── */
function SlotDetail({ slot, onClose }) {
  const dateLabel = new Date(slot.date + 'T12:00:00').toLocaleDateString('en-PH', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
  });

  return (
    <div className="cs__overlay" onClick={onClose}>
      <div className="cs__slotdetail" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="cs__slotdetailhead">
          <div className="cs__slotdetailicon" style={{ background: slot.color.bg }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={slot.color.dot} strokeWidth="2">
              <circle cx="12" cy="8" r="4"/><path d="M4 20c1-4 4-6 8-6s7 2 8 6"/>
            </svg>
          </div>
          <div>
            <div className="cs__slotdetailtitle">Booked Lesson</div>
            <div className="cs__slotdetailsub">{dateLabel}</div>
          </div>
          <button className="cs__slotdetailclose" onClick={onClose}>×</button>
        </div>

        {/* Detail rows */}
        <div className="cs__slotdetailrows">
          <div className="cs__slotdetailrow">
            <span>Coach</span>
            <b style={{ display:'flex', alignItems:'center', gap:6 }}>
              <span style={{ width:8, height:8, borderRadius:'50%', background:slot.color.dot, display:'inline-block', flexShrink:0 }} />
              {slot.coachName}
            </b>
          </div>
          <div className="cs__slotdetailrow">
            <span>Time</span>
            <b>{fmtHour(slot.hour)} – {fmtHour(slot.hour + 1)}</b>
          </div>
          <div className="cs__slotdetailrow">
            <span>Duration</span>
            <b>60 minutes</b>
          </div>
          <div className="cs__slotdetailrow">
            <span>Status</span>
            <span className="cs__detailbadge cs__detailbadge--booked">Booked</span>
          </div>
        </div>

        <button className="cs__slotdetailbtn" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

export default function CoachSchedulesPage() {
  const [params, setParams]           = useSearchParams();
  const initWeek                      = params.get('week') || toMonday(new Date().toLocaleDateString('en-CA'));
  const [weekStart, setWeekStart]     = useState(initWeek);
  const [data, setData]               = useState(null);
  const [error, setError]             = useState('');
  const [activeCoach, setActiveCoach] = useState(null);
  const [activeSlot, setActiveSlot]   = useState(null); // { date, hour, coachName, color }

  const load = useCallback(ws => {
    setError('');
    api.get(`/admin/schedules?weekStart=${ws}`)
      .then(d => setData(d))
      .catch(e => setError(e.message));
  }, []);

  useEffect(() => { load(weekStart); }, [weekStart, load]);

  const shiftWeek = dir => {
    const ws = addDays(weekStart, dir * 7);
    setWeekStart(ws); setParams({ week: ws });
  };

  const today   = new Date().toLocaleDateString('en-CA');
  const days    = data?.days    || [];
  const coaches = data?.coaches || [];

  const coachColorMap = {};
  coaches.forEach((c, i) => { coachColorMap[c.id] = COACH_COLORS[i % COACH_COLORS.length]; });

  const getBookedCoaches = (date, hour) => {
    const day = days.find(d => d.date === date);
    if (!day) return [];
    const h = day.hours?.find(h2 => h2.hour === hour);
    if (!h) return [];
    return h.coaches.filter(c => c.booked && (!activeCoach || c.id === activeCoach));
  };

  return (
    <div className="cs">
      {/* ── Header ── */}
      <div className="cs__head">
        <div>
          <h1>Coach Schedules</h1>
          <p className="cs__sub">View and manage coach availability for the week.</p>
        </div>
      </div>

      {/* ── Controls row ── */}
      <div className="cs__controls">
        <div className="cs__pillscroll">
          <button
            className={`cs__coachpill ${!activeCoach ? 'on' : ''}`}
            onClick={() => setActiveCoach(null)}>
            All Coaches
          </button>
          {coaches.map(c => (
            <button key={c.id}
              className={`cs__coachpill ${activeCoach === c.id ? 'on' : ''}`}
              style={activeCoach === c.id
                ? { background: coachColorMap[c.id]?.dot, borderColor: coachColorMap[c.id]?.dot, color: '#fff' }
                : {}}
              onClick={() => setActiveCoach(activeCoach === c.id ? null : c.id)}>
              <span className="cs__coachpilldot" style={{ background: coachColorMap[c.id]?.dot }} />
              {c.name.split(' ')[0]}
            </button>
          ))}
          <button className="cs__scrollarrow" onClick={() => {
            document.querySelector('.cs__pillscroll').scrollBy({ left: 120, behavior: 'smooth' });
          }}>›</button>
        </div>

        <div className="cs__monthnav">
          <button className="cs__mnavbtn" onClick={() => shiftWeek(-1)}>‹</button>
          <span className="cs__monthlabel">{getMonthLabel(weekStart)}</span>
          <button className="cs__mnavbtn" onClick={() => shiftWeek(1)}>›</button>
        </div>
      </div>

      {error && <p className="cs__alert">{error}</p>}
      {!data && !error && <p className="cs__muted">Loading…</p>}

      {data && coaches.length === 0 && (
        <div className="cs__empty">
          No coaches set up yet. Go to <Link to="/admin/coaches" className="cs__link">Coaches</Link>.
        </div>
      )}

      {/* Slot detail overlay */}
      {activeSlot && (
        <SlotDetail slot={activeSlot} onClose={() => setActiveSlot(null)} />
      )}

      {/* ── Calendar ── */}
      {data && coaches.length > 0 && (
        <div className="cs__calendar">
          <div className="cs__calscroll">
            {/* Header */}
            <div className="cs__calhead">
              <div className="cs__timecol">TIME</div>
              {days.map(d => {
                const dt      = new Date(`${d.date}T12:00:00`);
                const isToday = d.date === today;
                return (
                  <div key={d.date} className={`cs__daycol ${isToday ? 'today' : ''}`}>
                    <span className="cs__caldayname">
                      {dt.toLocaleDateString('en-PH', { weekday: 'short' }).toUpperCase()}
                    </span>
                    <span className={`cs__daynum ${isToday ? 'today' : ''}`}>{dt.getDate()}</span>
                  </div>
                );
              })}
            </div>

            {/* Body */}
            <div className="cs__calbody">
              {HOURS.map(hour => (
                <div key={hour} className="cs__calrow">
                  <div className="cs__timecell">{fmtHour(hour)}</div>
                  {days.map(d => {
                    const booked  = getBookedCoaches(d.date, hour);
                    const isToday = d.date === today;

                    return (
                      <div key={d.date}
                        className={`cs__cell ${isToday ? 'today' : ''} ${booked.length ? 'haslesson' : ''}`}>
                        {booked.map(c => {
                          const color = coachColorMap[c.id];
                          return (
                            <div key={c.id}
                              className="cs__bookchip cs__bookchip--clickable"
                              style={{ background: color.bg, color: color.text }}
                              onClick={() => setActiveSlot({
                                date: d.date,
                                hour,
                                coachName: c.name,
                                color,
                              })}>
                              <span className="cs__bookdot" style={{ background: color.dot }} />
                              <div className="cs__bookbody">
                                <span className="cs__bookname">{c.name.split(' ')[0]}</span>
                                <span className="cs__booktime">{fmtHour(hour)} – {fmtHour(hour + 1)}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}