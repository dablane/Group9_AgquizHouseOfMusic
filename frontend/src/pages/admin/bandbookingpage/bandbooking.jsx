import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../../services/api.js';
import './bandbooking.css';

const REASONS = ['A band member is booked', 'Studio is closed', 'Outside lesson hours'];
const HOURS   = ['09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00'];
const hourEnd = s => `${String(Number(s.slice(0,2))+1).padStart(2,'0')}:00`;
const fmtDate = d => new Date(`${d}T12:00:00`).toLocaleDateString('en-PH',{month:'short',day:'numeric',year:'numeric'});
const fmtTime = (s,e) => `${s} – ${e}`;
const manilaNow = () => Object.fromEntries(
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(new Date()).filter(part => part.type !== 'literal').map(part => [part.type, part.value])
);
const today = () => {
  const now = manilaNow();
  return `${now.year}-${now.month}-${now.day}`;
};
const isPastStart = (date, start) => {
  const now = manilaNow();
  return date === today() && start <= `${now.hour}:${now.minute}`;
};
const initials = n => (n||'').split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase();
const fmtMonth = d => new Date(`${d}T12:00:00`).toLocaleDateString('en-PH',{month:'short'}).toUpperCase();
const fmtDay   = d => new Date(`${d}T12:00:00`).getDate();
const fmtDow   = d => new Date(`${d}T12:00:00`).toLocaleDateString('en-PH',{weekday:'short'}).toUpperCase();
const AVATAR_COLORS = ['#dbeafe','#d1fae5','#ede9fe','#fce7f3','#fef3c7'];
const avatarColor = name => AVATAR_COLORS[(name?.charCodeAt(0)||0) % AVATAR_COLORS.length];

function Avatar({ name }) {
  return <span className="bb__avatar" style={{ background: avatarColor(name) }}>{initials(name)}</span>;
}

/* ADD REQUEST FORM */
function AddRequest({ onBack }) {
  const [params] = useSearchParams();
  const prefillDate  = params.get('date')  || '';
  const prefillStart = params.get('start') || '14:00';

  const [people, setPeople]                     = useState([]);
  const [children, setChildren]                 = useState([]);
  const [childrenLoading, setChildrenLoading]   = useState(false);
  const [form, setForm] = useState({
    requestedBy: '', forName: '', date: prefillDate, start: prefillStart, note: ''
  });
  const [check, setCheck]       = useState(null);
  const [checking, setChecking] = useState(false);
  const [error, setError]       = useState('');
  const [flash, setFlash]       = useState('');
  const [busy, setBusy]         = useState(false);

  useEffect(() => {
    api.get('/admin/band-bookings/people')
      .then(r => setPeople(r.people))
      .catch(e => setError(e.message));
  }, []);

  useEffect(() => {
    setCheck(null);
    if (!form.date) return;
    setChecking(true);
    api.get(`/admin/band-bookings/check?date=${form.date}&start=${form.start}`)
      .then(setCheck)
      .catch(() => setCheck(null))
      .finally(() => setChecking(false));
  }, [form.date, form.start]);

  const pickRequester = async e => {
    const id = e.target.value;
    const person = people.find(x => String(x.id) === id);
    if (!id) {
      setForm(f => ({ ...f, requestedBy: '', forName: '' }));
      setChildren([]);
      return;
    }
    if (person?.role === 'student') {
      setForm(f => ({ ...f, requestedBy: id, forName: person.name }));
      setChildren([]);
    } else if (person?.role === 'parent') {
      setForm(f => ({ ...f, requestedBy: id, forName: '' }));
      setChildren([]);
      setChildrenLoading(true);
      try {
        const r = await api.get(`/admin/people/${id}/children`);
        setChildren(r.children || []);
      } catch { setChildren([]); }
      finally { setChildrenLoading(false); }
    }
  };

  const selectedPerson = people.find(x => String(x.id) === form.requestedBy);
  const isStudent = selectedPerson?.role === 'student';
  const isParent  = selectedPerson?.role === 'parent';

  const toAmPm = hr => {
    const ap = hr < 12 ? 'AM' : 'PM';
    const d  = hr === 0 ? 12 : hr > 12 ? hr - 12 : hr;
    return `${d}:00 ${ap}`;
  };

  const availTimeLabel = () => {
    if (!form.date) return '';
    const dateLabel = new Date(`${form.date}T12:00:00`).toLocaleDateString('en-PH',
      { month: 'long', day: 'numeric', year: 'numeric' });
    const h = Number(form.start.slice(0, 2));
    return `${dateLabel}, ${toAmPm(h)} – ${toAmPm(h + 1)}`;
  };

  const resetForm = () => {
    setForm({ requestedBy: '', forName: '', date: '', start: '14:00', note: '' });
    setChildren([]);
    setCheck(null);
    setError('');
  };

  const updateBookingDate = date => {
    setForm(current => ({
      ...current,
      date,
      start: isPastStart(date, current.start)
        ? HOURS.find(hour => !isPastStart(date, hour)) || current.start
        : current.start
    }));
  };

  const showFlash = msg => {
    setFlash(msg);
    setTimeout(() => setFlash(''), 3500);
  };

  const save = async approve => {
    setError('');
    if (!form.requestedBy) return setError('Select who is requesting.');
    if (!form.forName.trim()) return setError('Select who the lesson is for.');
    if (!form.date) return setError('Choose a date.');
    setBusy(true);
    try {
      await api.post('/admin/band-bookings', {
        requestedBy: Number(form.requestedBy),
        forName: form.forName,
        date: form.date,
        start: form.start,
        note: form.note || undefined,
        approve
      });
      showFlash(approve
        ? 'Booking saved and confirmed. It is now listed under Confirmed Bookings.'
        : 'Request saved as pending. It is now listed under Waiting for Approval.');
      resetForm();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="bb">
      <div className="bb__head">
        <div>
          <h1>Add a Band Booking</h1>
          <p className="bb__sub">Enter a walk-in request or one that came in by message.</p>
        </div>
        <button className="bb__btn" onClick={onBack}>← Back to bookings</button>
      </div>

      {/* Flash — auto-dismisses after 3.5s */}
      {flash && <p className="bb__flash bb__flash--top">{flash}</p>}

      <section className="bb__addcard">
        {prefillDate && (
          <div className="bb__prefillnote">
            Date and time pre-filled from Coach Schedules — all coaches are free at this time.
          </div>
        )}

        {/* Row 1: Requested by + Who is the lesson for */}
        <div className="bb__formgrid">
          <div className="bb__fieldblock">
            <label className="bb__fieldlabel">Requested by</label>
            <select className="bb__fieldinput" value={form.requestedBy} onChange={pickRequester}>
              <option value="">Select a parent or student</option>
              <optgroup label="Students">
                {people.filter(p=>p.role==='student').map(p=>
                  <option key={p.id} value={p.id}>{p.name}</option>)}
              </optgroup>
              <optgroup label="Parents">
                {people.filter(p=>p.role==='parent').map(p=>
                  <option key={p.id} value={p.id}>{p.name}</option>)}
              </optgroup>
            </select>
          </div>

          <div className="bb__fieldblock">
            <label className="bb__fieldlabel">Who is the lesson for</label>
            {(!form.requestedBy || isStudent) && (
              <input
                className={`bb__fieldinput ${isStudent ? 'bb__fieldinput--readonly' : ''}`}
                value={isStudent ? form.forName : ''}
                readOnly={isStudent}
                placeholder={isStudent ? '' : 'Select a requester first'}
                onChange={e => !isStudent && setForm(f=>({...f,forName:e.target.value}))}
              />
            )}
            {isParent && (
              childrenLoading
                ? <input className="bb__fieldinput bb__fieldinput--readonly" value="Loading children…" readOnly />
                : children.length === 0
                  ? <input className="bb__fieldinput bb__fieldinput--readonly" value="No children enrolled under this parent" readOnly />
                  : <select className="bb__fieldinput" value={form.forName}
                      onChange={e=>setForm(f=>({...f,forName:e.target.value}))}>
                      <option value="">Select a student</option>
                      {children.map(c=><option key={c.id} value={c.name}>{c.name}</option>)}
                    </select>
            )}
          </div>
        </div>

        {/* Row 2: Date + Start time */}
        <div className="bb__formgrid">
          <div className="bb__fieldblock">
            <label className="bb__fieldlabel">Booking date</label>
            <input type="date" className="bb__fieldinput" min={today()}
              value={form.date} onChange={e=>updateBookingDate(e.target.value)} />
          </div>
          <div className="bb__fieldblock">
            <label className="bb__fieldlabel">Start time</label>
            <select className="bb__fieldinput" value={form.start}
              onChange={e=>setForm(f=>({...f,start:e.target.value}))}>
              {HOURS.map(h=><option key={h} value={h} disabled={isPastStart(form.date,h)}>{h} – {hourEnd(h)} (60 minutes)</option>)}
            </select>
          </div>
        </div>

        {/* Row 3: Note */}
        <div className="bb__fieldblock" style={{marginBottom:20}}>
          <label className="bb__fieldlabel">Note (optional)</label>
          <textarea className="bb__fieldinput bb__fieldinput--textarea" rows={3}
            value={form.note} onChange={e=>setForm(f=>({...f,note:e.target.value}))}
            placeholder="Enter any additional instructions or preferences" />
        </div>

        {/* ── Coach Availability — inside form ── */}
        <div className="bb__availsection">
          <div className="bb__availhead">
            <span className="bb__availtitle">Coach Availability</span>
            {form.date && <span className="bb__availtime">{availTimeLabel()}</span>}
          </div>

          {!form.date && (
            <p className="bb__availhint">Select a date and time above to check coach availability.</p>
          )}
          {form.date && checking && (
            <p className="bb__availhint">Checking availability…</p>
          )}
          {check && !checking && (
            check.noBand ? (
              <p className="bb__availwarn">No band coaches have been set up. Go to Coaches and turn on the Band switch.</p>
            ) : (
              <>
                <div className="bb__coachlist">
                  {check.members.map(c => (
                    <div key={c.id} className={`bb__coachrow ${c.free?'free':'busy'}`}>
                      <span className={`bb__coachdot ${c.free?'free':'busy'}`} />
                      <span className="bb__coachname">{c.name}</span>
                      <span className="bb__coachstatus">{c.free?'Available':'Unavailable'}</span>
                    </div>
                  ))}
                </div>
                {check.free ? (
                  <div className="bb__availok">All required coaches are available for this schedule.</div>
                ) : (
                  <div className="bb__availbusy">
                    One or more coaches are unavailable at this time.
                    {check.suggestions.length > 0 && (
                      <div className="bb__availsugg">
                        <span className="bb__availsugglabel">Other available times on this day:</span>
                        <div className="bb__chips" style={{marginTop:6}}>
                          {check.suggestions.map(s => (
                            <button key={s} className="bb__chip" disabled={isPastStart(form.date,s)}
                              onClick={()=>setForm(f=>({...f,start:s}))}>
                              {s} – {hourEnd(s)}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </>
            )
          )}
        </div>

        {error && <p className="bb__alert">{error}</p>}

        {/* Actions */}
        <div className="bb__formacts">
          <button className="bb__btn bb__btn--p" disabled={busy||isPastStart(form.date,form.start)||!check?.free} onClick={()=>save(true)}>
            {busy ? 'Saving…' : 'Save and Confirm'}
          </button>
          <button className="bb__btn" disabled={busy||isPastStart(form.date,form.start)} onClick={()=>save(false)}>
            Save as Pending
          </button>
          <button className="bb__btn" onClick={onBack}>Cancel</button>
        </div>
      </section>
    </div>
  );
}

/* CONFIRMED BOOKINGS TABLE*/
const PAGE_SIZE = 5;

function Pagination({ total, page, onPage }) {
  const totalPages = Math.ceil(total / PAGE_SIZE) || 1;
  return (
    <div className="bb__pagination">
      <span className="bb__paginfo">
        {total === 0 ? 'No records' : `Showing page ${page} of ${totalPages}`}
      </span>
      <div className="bb__pagbtns">
        <button className="bb__pagbtn" disabled={page <= 1}
          onClick={() => onPage(page - 1)} aria-label="Previous page">‹</button>
        <button className="bb__pagbtn" disabled={page >= totalPages}
          onClick={() => onPage(page + 1)} aria-label="Next page">›</button>
      </div>
    </div>
  );
}

function ConfirmedTable({ bookings, loading, onCancel }) {
  const [confirmCancel, setConfirmCancel] = useState(null);
  const [page, setPage] = useState(1);

  // Reset to page 1 when bookings change
  useEffect(() => { setPage(1); }, [bookings?.length]);

  const total = bookings?.length || 0;
  const paged = bookings?.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE) || [];

  // If current page becomes empty after a deletion, go back one page
  useEffect(() => {
    if (page > 1 && paged.length === 0) setPage(p => p - 1);
  }, [paged.length, page]);

  return (
    <>
      <div className="bb__inner">
      <div className="bb__innerthead">
        <div className="bb__trow bb__trow--head">
          <span>Booking Date</span>
          <span>Band / Customer</span>
          <span>Schedule</span>
          <span>Assigned Coach</span>
          <span>Payment</span>
          <span>Status</span>
          <span>Actions</span>
        </div>
      </div>
      <div className="bb__innerbody">
        {loading && <div className="bb__innerempty">Loading bookings…</div>}
        {!loading && !bookings?.length && <div className="bb__innerempty">No confirmed bookings yet.</div>}
        {paged.map(b => (
          <div key={b.id}>
            <div className="bb__trow">
              <div className="bb__datechip">
                <span className="month">{fmtMonth(b.date)}</span>
                <span className="day">{fmtDay(b.date)}</span>
                <span className="dow">{fmtDow(b.date)}</span>
              </div>
              <div className="bb__tcustomer">
                <Avatar name={b.forName} />
                <div><b>{b.forName}</b><small>{b.requester}</small></div>
              </div>
              <div><small>{fmtTime(b.start,b.end)}</small></div>
              <div className="bb__tcoaches">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c1-4 4-6 8-6s7 2 8 6"/></svg>
                All coaches
              </div>
              <span className="bb__badge bb__badge--pending">Unpaid</span>
              <span className="bb__badge bb__badge--confirmed">
                <span className="bb__badgedot" />
                {b.completed ? 'Completed' : 'Confirmed'}
              </span>
              <div className="bb__tacts">
                <button className="bb__viewbtn">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  View
                </button>
                {!b.completed && <button className="bb__dotbtn" onClick={()=>setConfirmCancel(confirmCancel===b.id?null:b.id)}>⋮</button>}
              </div>
            </div>
            {confirmCancel===b.id && (
              <div className="bb__strip bb__strip--warn">
                <div><b>Cancel this confirmed band booking?</b><small>That time becomes free for the band again.</small></div>
                <div className="bb__acts">
                  <button className="bb__btn" onClick={()=>setConfirmCancel(null)}>Keep it</button>
                  <button className="bb__btn bb__btn--dr" onClick={()=>{onCancel(b.id);setConfirmCancel(null);}}>Yes, cancel</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
    <Pagination total={total} page={page} onPage={p => { setPage(p); setConfirmCancel(null); }} />
    </>
  );
}

/* PENDING TABLE */
function PendingTable({ bookings, loading, onApprove, onSuggest, onDecline }) {
  const [openAction, setOpenAction]           = useState(null);
  const [rescheduleForm, setRescheduleForm]   = useState({});
  const [declineReasons, setDeclineReasons]   = useState({});
  const [page, setPage]                       = useState(1);

  useEffect(() => { setPage(1); }, [bookings?.length]);

  const total = bookings?.length || 0;
  const paged = bookings?.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE) || [];

  useEffect(() => {
    if (page > 1 && paged.length === 0) setPage(p => p - 1);
  }, [paged.length, page]);

  return (
    <>
      <div className="bb__inner">
      <div className="bb__innerthead">
        <div className="bb__trow bb__trow--head bb__trow--pending">
          <span>Request Date</span>
          <span>Student</span>
          <span>Pref. Date</span>
          <span>Pref. Time</span>
          <span>Members</span>
          <span>Coaches</span>
          <span>Notes</span>
          <span>Actions</span>
        </div>
      </div>
      <div className="bb__innerbody">
        {loading && <div className="bb__innerempty">Loading requests…</div>}
        {!loading && !bookings?.length && <div className="bb__innerempty">No pending requests.</div>}
        {paged.map(b => {
          const a = b.availability;
          const canApprove = a?.free && !a?.noBand;
          const hasConflict = a && !a.free && !a.noBand;
          const isOpenReschedule = openAction?.id === b.id && openAction?.type === 'reschedule';
          const isOpenDecline = openAction?.id === b.id && openAction?.type === 'decline';

          return (
            <div key={b.id}>
              <div className="bb__trow bb__trow--pending">
                <div className="bb__datechip">
                  <span className="month">{fmtMonth(today())}</span>
                  <span className="day">{new Date().getDate()}</span>
                  <span className="dow">{new Date().toLocaleDateString('en-PH',{weekday:'short'}).toUpperCase()}</span>
                </div>
                <div className="bb__tcustomer">
                  <Avatar name={b.requester} />
                  <div><b>{b.requester}</b><small>{b.forName}</small></div>
                </div>
                <div><b>{fmtDate(b.date)}</b></div>
                <div><small>{fmtTime(b.start,b.end)}</small></div>
                <div className="bb__tmembers">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                  4
                </div>
                <div className="bb__tcoaches">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c1-4 4-6 8-6s7 2 8 6"/></svg>
                  All
                </div>
                <div className="bb__tnote" title={b.note||''}>{b.note||'—'}</div>
                <div className="bb__tacts">
                  <button className="bb__btn bb__btn--p" disabled={!canApprove}
                    title={!canApprove?(a?.noBand?'No coaches set up':'Coach unavailable at this time'):''}
                    onClick={()=>onApprove(b.id)}>Approve</button>
                  {b.canReschedule ? (
                    <button className="bb__btn bb__btn--reschedule"
                      onClick={()=>setOpenAction(openAction?.id===b.id&&openAction?.type==='reschedule'?null:{id:b.id,type:'reschedule'})}>
                      Reschedule
                    </button>
                  ) : (
                    <button className="bb__btn bb__btn--d"
                      onClick={()=>setOpenAction(openAction?.id===b.id&&openAction?.type==='decline'?null:{id:b.id,type:'decline'})}>
                      Decline
                    </button>
                  )}
                  <button className="bb__dotbtn">⋮</button>
                </div>
              </div>

              {/* Conflict info strip — shows which coaches are unavailable */}
              {hasConflict && (
                <div className="bb__strip bb__strip--conflict">
                  <div className="bb__conflictinfo">
                    <b className="bb__conflicttitle">Coach unavailable at requested time</b>
                    <div className="bb__conflictcoaches">
                      {a.members.map(m => (
                        <span key={m.id} className={`bb__coachstatus ${m.free?'free':'busy'}`}>
                          <span className="bb__coachdot2" />
                          {m.name} — {m.free ? 'Available' : 'Unavailable'}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {isOpenDecline && (
                <div className="bb__strip bb__strip--red bb__declinestrip">
                  <b>Decline this last-minute request</b>
                  <small>This request is within 24 hours of its start time. Enter a reason to share with the requester.</small>
                  <label htmlFor={`bb-decline-reason-${b.id}`}>Reason for declining</label>
                  <textarea
                    id={`bb-decline-reason-${b.id}`}
                    rows={3}
                    maxLength={500}
                    required
                    value={declineReasons[b.id] || ''}
                    onChange={event => setDeclineReasons(reasons => ({ ...reasons, [b.id]: event.target.value }))}
                    placeholder="For example: The coaches are unavailable on short notice."
                  />
                  <div className="bb__acts">
                    <button className="bb__btn" onClick={() => setOpenAction(null)}>Cancel</button>
                    <button className="bb__btn bb__btn--dr"
                      disabled={!declineReasons[b.id]?.trim()}
                      onClick={() => {
                        onDecline(b.id, declineReasons[b.id].trim());
                        setOpenAction(null);
                      }}>
                      Decline request
                    </button>
                  </div>
                </div>
              )}

              {/* Reschedule strip — admin picks a new date/time where all coaches are free */}
              {isOpenReschedule && (
                <div className="bb__strip bb__strip--reschedule">
                  <b>Suggest a new schedule to {b.requester}</b>
                  <small>Pick a future date and time when all coaches are available. Rescheduling closes 24 hours before the original booking.</small>
                  <div className="bb__rescheduleform">
                    <div className="bb__reschedulefield">
                      <label>New date</label>
                      <input type="date" min={today()}
                        value={rescheduleForm[b.id]?.date || ''}
                        onChange={e => {
                          const newDate = e.target.value;
                          const currentStart = rescheduleForm[b.id]?.start || b.start;
                          const nextStart = isPastStart(newDate, currentStart)
                            ? HOURS.find(hour => !isPastStart(newDate, hour)) || currentStart
                            : currentStart;
                          setRescheduleForm(f => ({...f, [b.id]: {...(f[b.id]||{}), date: newDate, start: nextStart, check: null}}));
                          if (newDate) {
                            const start = nextStart;
                            api.get(`/admin/band-bookings/check?date=${newDate}&start=${start}`)
                              .then(c => setRescheduleForm(f => ({...f, [b.id]: {...f[b.id], check: c}})))
                              .catch(() => {});
                          }
                        }}
                      />
                    </div>
                    <div className="bb__reschedulefield">
                      <label>New start time</label>
                      <select
                        value={rescheduleForm[b.id]?.start || b.start}
                        onChange={e => {
                          const start = e.target.value;
                          setRescheduleForm(f => ({...f, [b.id]: {...(f[b.id]||{}), start, check: null}}));
                          const date = rescheduleForm[b.id]?.date;
                          if (date) {
                            api.get(`/admin/band-bookings/check?date=${date}&start=${start}`)
                              .then(c => setRescheduleForm(f => ({...f, [b.id]: {...f[b.id], check: c}})))
                              .catch(() => {});
                          }
                        }}>
                        {HOURS.map(h => <option key={h} value={h} disabled={isPastStart(rescheduleForm[b.id]?.date,h)}>{h} – {hourEnd(h)}</option>)}
                      </select>
                    </div>
                  </div>

                  {/* Show availability for the new time */}
                  {rescheduleForm[b.id]?.check && (
                    <div className={`bb__reschedulecheck ${rescheduleForm[b.id].check.free?'ok':'busy'}`}>
                      {rescheduleForm[b.id].check.noBand
                        ? 'No band coaches set up.'
                        : rescheduleForm[b.id].check.free
                        ? 'All coaches are available at this time.'
                        : 'Some coaches are still unavailable at this time.'}
                      {!rescheduleForm[b.id].check.free && !rescheduleForm[b.id].check.noBand && (
                        <div className="bb__conflictcoaches" style={{marginTop:6}}>
                          {rescheduleForm[b.id].check.members.map(m => (
                            <span key={m.id} className={`bb__coachstatus ${m.free?'free':'busy'}`}>
                              <span className="bb__coachdot2" />{m.name} — {m.free?'Available':'Unavailable'}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="bb__acts">
                    <button className="bb__btn" onClick={()=>setOpenAction(null)}>Cancel</button>
                    <button className="bb__btn bb__btn--p"
                      disabled={!rescheduleForm[b.id]?.date || isPastStart(rescheduleForm[b.id]?.date,rescheduleForm[b.id]?.start || b.start) || !rescheduleForm[b.id]?.check?.free}
                      onClick={() => {
                        const f = rescheduleForm[b.id];
                        onSuggest(b.id, f.date, f.start, b.requester);
                        setOpenAction(null);
                      }}>
                      Send suggestion
                    </button>
                  </div>
                </div>
              )}

            </div>
          );
        })}
      </div>
    </div>
    <Pagination total={total} page={page} onPage={p => { setPage(p); setOpenAction(null); }} />
    </>
  );
}

/* MAIN PAGE */
export default function BandBookingsPage() {
  const [params]  = useSearchParams();
  const [subTab, setSubTab]   = useState('confirmed');
  const [view, setView]       = useState(params.get('add')==='1'?'add':'list');
  const [confirmed, setConfirmed] = useState(null);
  const [pending, setPending]     = useState(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [flash, setFlash]     = useState('');

  const loadConfirmed = useCallback(() => {
    setLoading(true);
    api.get('/admin/band-bookings?tab=approved')
      .then(d => setConfirmed(d.bookings))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const loadPending = useCallback(() => {
    setLoading(true);
    api.get('/admin/band-bookings?tab=pending')
      .then(d => { setPending(d.bookings); setPendingCount(d.counts?.pending||0); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (subTab==='confirmed') loadConfirmed(); else loadPending();
  }, [subTab, loadConfirmed, loadPending]);

  const run = async (fn, msg) => {
    setError(''); setFlash('');
    try { await fn(); setFlash(msg); } catch(e) { setError(e.message); }
    if (subTab==='confirmed') loadConfirmed(); else loadPending();
  };

  if (view==='add') {
    return <AddRequest onBack={()=>setView('list')} />;
  }

  return (
    <div className="bb">
      <div className="bb__head">
        <div>
          <h1>Band Bookings</h1>
          <p className="bb__sub">View and manage all band bookings and requests.</p>
        </div>
        <button className="bb__btn bb__btn--p" onClick={()=>setView('add')}>+ Add Band Booking</button>
      </div>

      <div className="bb__subnav">
        <button className={`bb__subnavtab ${subTab==='confirmed'?'on':''}`}
          onClick={()=>{setSubTab('confirmed');setError('');setFlash('');}}>
          Confirmed Bookings
        </button>
        <button className={`bb__subnavtab ${subTab==='pending'?'on':''}`}
          onClick={()=>{setSubTab('pending');setError('');setFlash('');}}>
          Waiting for Approval
          {pendingCount>0 && <span className="bb__subnavbadge">{pendingCount}</span>}
        </button>
      </div>
      <div className="bb__subnavdivider" />

      {error && <p className="bb__alert">{error}</p>}
      {flash && <p className="bb__flash">{flash}</p>}

      <div className="bb__outer">
        {subTab==='confirmed' && <ConfirmedTable bookings={confirmed} loading={loading} onCancel={id=>run(()=>api.post(`/admin/band-bookings/${id}/cancel`),'Booking cancelled.')} />}
        {subTab==='pending'   && <PendingTable  bookings={pending} loading={loading}
          onApprove={id=>run(()=>api.post(`/admin/band-bookings/${id}/approve`),'Request approved and confirmed.')}
          onDecline={(id, reason)=>run(
            ()=>api.post(`/admin/band-bookings/${id}/decline`, { reason }),
            'Request declined and reason recorded.'
          )}
          onSuggest={(id,date,start,requester)=>run(
            ()=>api.post(`/admin/band-bookings/${id}/suggest`, { date, start }),
            `Reschedule suggestion sent to ${requester}.`
          )} />}
      </div>
    </div>
  );
}