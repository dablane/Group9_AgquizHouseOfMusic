import { useEffect, useState } from 'react';
import { api } from '../../../services/api.js';
import { getSession } from '../../../services/auth.js';
import BandBookingRequest from '../../../components/BandBookingRequest.jsx';
import BookingCalendar, { ScheduleRequestModal } from '../../../components/BookingCalendar.jsx';
import './bookSession.css';

const LESSON_FEE     = 500;
const peso           = n => `₱${Number(n).toLocaleString('en-PH')}`;
const INSTRUMENT_CHOICES = ['Guitar', 'Bass', 'Voice', 'Piano', 'Drums'];

const DAYS   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const MONTHS = ['January','February','March','April','May','June','July',
                'August','September','October','November','December'];

function getWeekDates(offset = 0) {
  const today = new Date();
  today.setDate(today.getDate() + offset * 7);
  const dow = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1));
  const dates = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    dates.push({
      iso:   d.toLocaleDateString('en-CA'),
      day:   d.getDate(),
      name:  DAYS[d.getDay()],
      month: MONTHS[d.getMonth()],
      year:  d.getFullYear(),
    });
  }
  return dates;
}

const toDate   = iso => iso?.includes('T') ? new Date(iso) : new Date((iso||'') + 'T12:00:00');
const fmtShort = iso => toDate(iso).toLocaleDateString('en-PH', { month:'short', day:'numeric', year:'numeric' });
const toAmPm   = t => {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ap = h < 12 ? 'AM' : 'PM';
  const hr = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hr}:${String(m).padStart(2,'0')} ${ap}`;
};

/* ── Confirm booking overlay ── */
function BookConfirm({ slot, instrument, coach, user, onConfirm, onCancel, loading }) {
  return (
    <div className="bs__overlay" onClick={onCancel}>
      <div className="bs__confirmcard" onClick={e => e.stopPropagation()}>
        <div className="bs__confirmcardicon">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#1c2456" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2"/>
            <line x1="16" y1="2" x2="16" y2="6"/>
            <line x1="8" y1="2" x2="8" y2="6"/>
            <line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
        </div>
        <h3 className="bs__confirmcardtitle">Confirm Booking</h3>
        <p className="bs__confirmcardsub">Please review your session details before confirming.</p>

        <div className="bs__confirmcardrows">
          <div className="bs__confirmcardrow"><span>Student</span><b>{user?.name || '—'}</b></div>
          <div className="bs__confirmcardrow"><span>Teacher</span><b>Teacher {coach.name}</b></div>
          <div className="bs__confirmcardrow"><span>Instrument</span><b>{instrument}</b></div>
          <div className="bs__confirmcardrow"><span>Date</span><b>{slot.dateLabel}</b></div>
          <div className="bs__confirmcardrow"><span>Time</span><b>{toAmPm(slot.start)} – {toAmPm(slot.end)}</b></div>
          <div className="bs__confirmcardrow"><span>Duration</span><b>60 minutes</b></div>
          <div className="bs__confirmcardfee"><span>Lesson Fee</span><b>{peso(LESSON_FEE)}</b></div>
        </div>

        <div className="bs__confirmcardnote">
          Pay cash to Teacher {coach.name.split(' ')[0]} after the lesson. Nothing is charged now.
        </div>

        <div className="bs__confirmcardbtns">
          <button className="bs__confirmcardcancel" onClick={onCancel} disabled={loading}>
            Cancel
          </button>
          <button className="bs__confirmcardok" onClick={onConfirm} disabled={loading}>
            {loading ? 'Booking…' : 'Confirm Booking'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Receipt overlay — REMOVED (toast replaces it) ── */

export default function BookSession() {
  const user = getSession()?.user;

  const [coaches, setCoaches]           = useState([]);
  const [instrument, setInstrument]     = useState('Guitar');
  const [coachId, setCoachId]           = useState('');  // manually selected when multiple coaches
  const [allSlots, setAllSlots]         = useState([]);
  const [scheduleRequests, setScheduleRequests] = useState([]);
  const [loadedSlotsKey, setLoadedSlotsKey] = useState('');
  const [loadedRequestsKey, setLoadedRequestsKey] = useState('');
  const [weekOffset, setWeekOffset]     = useState(0);
  const [confirmSlot, setConfirmSlot]   = useState(null);
  const [requestSlot, setRequestSlot]   = useState(null);
  const [requestBusy, setRequestBusy]   = useState(false);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState('');
  const [flash, setFlash]               = useState('');
  const [bookingMode, setBookingMode]   = useState('solo');

  const weekDates  = getWeekDates(weekOffset);

  const availableInstruments = INSTRUMENT_CHOICES;

  // All coaches who teach the selected instrument
  const matchedCoaches = coaches.filter(c => c.instruments.includes(instrument));
  // The active coach — from dropdown selection or first match
  const coach = matchedCoaches.find(c => String(c.id) === String(coachId)) || matchedCoaches[0] || null;
  const activeCoachId = coach?.id ?? null;
  const dataKey = activeCoachId ? `${activeCoachId}:${weekOffset}` : '';
  const slotsLoaded = Boolean(dataKey && loadedSlotsKey === dataKey);
  const requestsLoaded = Boolean(dataKey && loadedRequestsKey === dataKey);
  const bookingDataLoading = Boolean(activeCoachId && (!slotsLoaded || !requestsLoaded));

  // Load coaches once — then auto-select the first available instrument
  useEffect(() => {
    api.get('/student/book/coaches')
      .then(d => {
        const list = d.coaches || [];
        setCoaches(list);
      })
      .catch(e => setError(e.message));
  }, []);

  // When coach changes (driven by instrument selection), reload slots
  useEffect(() => {
    if (!activeCoachId) return undefined;
    let active = true;
    const refresh = () => {
      api.get(`/student/book/schedule-requests?coachId=${activeCoachId}`)
        .then(d => {
          if (!active) return;
          setScheduleRequests(d.requests || []);
          setLoadedRequestsKey(dataKey);
        })
        .catch(e => {
          if (!active) return;
          setError(e.message);
          setLoadedRequestsKey(dataKey);
        });
      api.get(`/student/book/dates?coachId=${activeCoachId}`)
        .then(async d => {
          const currentWeek = new Set(getWeekDates(weekOffset).map(day => day.iso));
          const dates = (d.dates || []).filter(date => currentWeek.has(date));
          const results = await Promise.all(
            dates.map(date =>
              api.get(`/student/book/slots?coachId=${activeCoachId}&date=${date}`)
                .then(r => (r.slots || []).map(s => ({ ...s, date, dateLabel: fmtShort(date) })))
                .catch(() => [])
            )
          );
          if (!active) return;
          setAllSlots(results.flat());
          setLoadedSlotsKey(dataKey);
        })
        .catch(e => {
          if (!active) return;
          setError(e.message);
          setLoadedSlotsKey(dataKey);
        });
    };
    const refreshIfVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    refresh();
    const intervalId = window.setInterval(refreshIfVisible, 60_000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refreshIfVisible);
    return () => {
      active = false;
      window.clearInterval(intervalId);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refreshIfVisible);
    };
  }, [activeCoachId, dataKey, weekOffset]);

  const handleInstrumentPick = ins => {
    setInstrument(ins);
    setCoachId('');
    setConfirmSlot(null);
  };

  const handleBook = async () => {
    if (!confirmSlot || !coach) return;
    setLoading(true); setError('');
    try {
      await api.post('/student/book', {
        coachId: coach.id,
        instrument,
        date:    confirmSlot.date,
        hour:    confirmSlot.hour,
        slotId:  confirmSlot.slotId,
      });
      setConfirmSlot(null);
      // Refresh slots
      const d = await api.get(`/student/book/dates?coachId=${coach.id}`);
      const dates = d.dates || [];
      const results = await Promise.all(
        dates.map(date =>
          api.get(`/student/book/slots?coachId=${coach.id}&date=${date}`)
            .then(r => (r.slots || []).map(s => ({ ...s, date, dateLabel: fmtShort(date) })))
            .catch(() => [])
        )
      );
      setAllSlots(results.flat());
      setFlash('Booked successfully! Check My Lessons for details.');
      setTimeout(() => setFlash(''), 4000);
    } catch (e) { setError(e.message); setConfirmSlot(null); }
    finally { setLoading(false); }
  };

  const handleRequestSchedule = async () => {
    if (!requestSlot || !coach) return;
    setRequestBusy(true);
    setError('');
    try {
      const result = await api.post('/student/book/schedule-requests', {
        coachId: coach.id,
        instrument,
        ...requestSlot
      });
      setScheduleRequests(current => [result.request, ...current]);
      setRequestSlot(null);
      setFlash('Request sent! Your teacher will review it.');
      setTimeout(() => setFlash(''), 4000);
    } catch (e) {
      setError(e.message);
    } finally {
      setRequestBusy(false);
    }
  };

  const pageHeader = (
    <div className="bs__pagehead">
      <div>
        <h1>Book a Session</h1>
        <p className="bs__sub">
          {bookingMode === 'solo'
            ? 'Pick an instrument, choose a schedule, and confirm your booking.'
            : 'Send a band booking inquiry directly to the studio for approval.'}
        </p>
      </div>
      {bookingMode === 'solo' && (
        <button type="button" className="bs__modebtn" onClick={() => setBookingMode('band')}>
          Request a Band Booking
        </button>
      )}
    </div>
  );

  if (bookingMode === 'band') {
    return (
      <div className="bs">
        {pageHeader}
        <BandBookingRequest
          requesterRole="student"
          requesterName={user?.name}
          onBack={() => setBookingMode('solo')}
        />
      </div>
    );
  }

  return (
    <div className="bs">
      {pageHeader}

      {error && <p className="bs__alert">{error}</p>}
      {flash && <p className="bs__flash" role="status" aria-live="polite">{flash}</p>}

      {/* Confirm overlay */}
      {confirmSlot && coach && (
        <BookConfirm
          slot={confirmSlot}
          instrument={instrument}
          coach={coach}
          user={user}
          loading={loading}
          onConfirm={handleBook}
          onCancel={() => setConfirmSlot(null)}
        />
      )}
      {requestSlot && coach && (
        <ScheduleRequestModal
          request={requestSlot}
          coachName={coach.name}
          instrument={instrument}
          busy={requestBusy}
          onCancel={() => setRequestSlot(null)}
          onSubmit={handleRequestSchedule}
        />
      )}

      {/* ── Step 1 — Pick an Instrument ── */}
      <div className="bs__stepbox">
        <div className="bs__stephead">
          <div className="bs__stepnum">1</div>
          <div className="bs__steptitleblock">
            <span className="bs__steplabel">Pick an Instrument</span>
            <span className="bs__stepsub">We'll match you with the right teacher automatically.</span>
          </div>
        </div>
        <div className="bs__inspills">
          {availableInstruments.map(ins => (
            <button
              key={ins}
              className={`bs__inspill ${instrument === ins ? 'on' : ''}`}
              onClick={() => handleInstrumentPick(ins)}
            >
              {ins}
            </button>
          ))}
        </div>

        {/* Teacher — dropdown if multiple coaches, chip if one, warning if none */}
        {matchedCoaches.length > 1 ? (
          <div className="bs__teacherrow">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c1-4 4-6 8-6s7 2 8 6"/></svg>
            <span>Your teacher:</span>
            <select
              className="bs__teacherdrop"
              value={coachId || (coach ? String(coach.id) : '')}
              onChange={e => { setCoachId(e.target.value); setConfirmSlot(null); }}
            >
              {matchedCoaches.map(c => (
                <option key={c.id} value={String(c.id)}>Teacher {c.name}</option>
              ))}
            </select>
          </div>
        ) : matchedCoaches.length === 1 ? (
          <div className="bs__teacherchip">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c1-4 4-6 8-6s7 2 8 6"/></svg>
            Your teacher: <strong>Teacher {coach.name}</strong>
          </div>
        ) : (
          <div className="bs__teacherchip bs__teacherchip--none">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c1-4 4-6 8-6s7 2 8 6"/></svg>
            No teacher available for {instrument} yet.
          </div>
        )}
      </div>

      {/* ── Step 2 — Pick a Schedule ── */}
      <div className="bs__stepbox">
        <div className="bs__stephead">
          <div className="bs__stepnum">2</div>
          <div className="bs__steptitleblock">
            <span className="bs__steplabel">Pick a Schedule</span>
            <span className="bs__stepsub">Book an available slot or request a new time from your teacher.</span>
          </div>
        </div>

        <BookingCalendar
          weekDates={weekDates}
          weekOffset={weekOffset}
          onShiftWeek={setWeekOffset}
          slots={coach ? allSlots : []}
          requests={coach ? scheduleRequests : []}
          canRequest={Boolean(coach && !bookingDataLoading)}
          canBook={Boolean(coach && !bookingDataLoading)}
          loading={bookingDataLoading}
          hint="Choose a teacher to view available times or request a schedule."
          onBook={slot => setConfirmSlot({ ...slot, instrument })}
          onRequest={setRequestSlot}
        />
      </div>
    </div>
  );
}