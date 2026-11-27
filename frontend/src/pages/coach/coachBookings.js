import { useEffect, useState } from 'react';
import { api } from '../../../services/api.js';
import '../coach.css';
import './coachBookings.css';

const PAGE_SIZE = 6;

const fmtMonth = d => new Date(`${d}T12:00:00`).toLocaleDateString('en-PH',{month:'short'}).toUpperCase();
const fmtDay   = d => new Date(`${d}T12:00:00`).getDate();
const fmtDow   = d => new Date(`${d}T12:00:00`).toLocaleDateString('en-PH',{weekday:'short'}).toUpperCase();
const initials = n => (n||'').split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase();
const toAmPm = time => {
  if (!time) return '';
  const [hour, minute] = time.split(':').map(Number);
  const suffix = hour < 12 ? 'AM' : 'PM';
  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${displayHour}:${String(minute).padStart(2, '0')} ${suffix}`;
};
const AVATAR_COLORS = ['#dbeafe','#d1fae5','#ede9fe','#fce7f3','#fef3c7'];
const avatarColor = n => AVATAR_COLORS[(n?.charCodeAt(0)||0) % AVATAR_COLORS.length];

// Pull YYYY-MM-DD from a full datetime string or Date object
const toDateStr = val => {
  if (!val) return null;
  const s = val instanceof Date ? val.toISOString() : String(val);
  // If it already looks like YYYY-MM-DD return it; otherwise slice before T
  return s.length === 10 ? s : s.slice(0, 10);
};

function Avatar({ name }) {
  return <span className="cb__avatar" style={{ background: avatarColor(name) }}>{initials(name)}</span>;
}

function DateChip({ dateStr }) {
  if (!dateStr) return <div className="cb__datechip">—</div>;
  return (
    <div className="cb__datechip">
      <span className="month">{fmtMonth(dateStr)}</span>
      <span className="day">{fmtDay(dateStr)}</span>
      <span className="dow">{fmtDow(dateStr)}</span>
    </div>
  );
}

function PlaceholderRows({ count, rescheduled = false }) {
  return Array.from({ length: count }, (_, index) => (
    <div
      key={`placeholder-${index}`}
      className={`cb__trow cb__trow--placeholder ${rescheduled ? 'cb__trow--resc' : ''}`}
      aria-hidden="true"
    />
  ));
}

function Pagination({ total, page, onPage }) {
  const totalPages = Math.ceil(total / PAGE_SIZE) || 1;
  return (
    <div className="cb__pagination">
      <span className="cb__paginfo">
        {total === 0 ? 'No records' : `Page ${page} of ${totalPages}`}
      </span>
      <div className="cb__pagbtns">
        <button className="cb__pagbtn" disabled={page <= 1} onClick={() => onPage(page - 1)}>‹</button>
        <button className="cb__pagbtn" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>›</button>
      </div>
    </div>
  );
}

export default function CoachBookings() {
  const [data, setData]       = useState(null);
  const [subTab, setSubTab]   = useState('inprogress');
  const [error, setError]     = useState('');
  const [flash, setFlash]     = useState('');
  const [confirm, setConfirm] = useState(null);
  const [suggest, setSuggest] = useState(null);
  const [suggestTime, setSuggestTime] = useState('');
  const [busy, setBusy]       = useState(false);
  const [pageIP, setPageIP]   = useState(1);
  const [pageC, setPageC]     = useState(1);
  const [pageR, setPageR]     = useState(1);
  const [pageP, setPageP]     = useState(1);
  const [rescheduleRequest, setRescheduleRequest] = useState(null);
  const [requestDate, setRequestDate] = useState('');
  const [requestTime, setRequestTime] = useState('');

  const load = () => api.get('/coach/bookings').then(d => {
    setData(d);
    setPageIP(page => Math.min(page, Math.max(1, Math.ceil(d.inProgress.length / PAGE_SIZE))));
    setPageC(page => Math.min(page, Math.max(1, Math.ceil(d.completed.length / PAGE_SIZE))));
    setPageR(page => Math.min(page, Math.max(1, Math.ceil(d.reschedules.length / PAGE_SIZE))));
    setPageP(page => Math.min(page, Math.max(1, Math.ceil((d.pending || []).length / PAGE_SIZE))));
  }).catch(e => setError(e.message));
  useEffect(() => { load(); }, []);

  const run = async (fn, msg) => {
    setBusy(true); setError(''); setFlash('');
    try { await fn(); setFlash(msg); load(); }
    catch(e) { setError(e.message); }
    finally { setBusy(false); }
  };

  const doComplete = id => run(() => api.post(`/coach/bookings/${id}/complete`), 'Lesson marked as completed.');
  const doAccept   = id => run(() => api.post(`/coach/bookings/reschedule/${id}/accept`), 'Reschedule accepted.');
  const doSuggest  = id => {
    if (!suggestTime.trim()) return;
    run(() => api.post(`/coach/bookings/reschedule/${id}/suggest`, { suggestedTime: suggestTime }), 'Suggestion sent to student.');
    setSuggest(null); setSuggestTime('');
  };
  const doPublishRequest = id =>
    run(() => api.post(`/coach/schedule-requests/${id}/publish`, {}), 'Schedule request accepted.');
  const doRescheduleRequest = id => {
    if (!requestDate || !requestTime) return;
    run(
      () => api.post(`/coach/schedule-requests/${id}/reschedule`, { date: requestDate, startTime: requestTime }),
      'Alternative schedule sent.'
    );
    setRescheduleRequest(null);
    setRequestDate('');
    setRequestTime('');
  };

  if (error) return <div className="cp"><p className="cp__alert">{error}</p></div>;
  if (!data)  return <div className="cp"><p className="cp__muted">Loading…</p></div>;

  const { inProgress, completed, reschedules } = data;
  const pending = data.pending || [];

  // Paged data
  const pagedIP = inProgress.slice((pageIP-1)*PAGE_SIZE, pageIP*PAGE_SIZE);
  const pagedC  = completed.slice((pageC-1)*PAGE_SIZE, pageC*PAGE_SIZE);
  const pagedR  = reschedules.slice((pageR-1)*PAGE_SIZE, pageR*PAGE_SIZE);
  const pagedP  = pending.slice((pageP-1)*PAGE_SIZE, pageP*PAGE_SIZE);

  const rescheduledCount = reschedules.length;

  return (
    <div className="cp cb">
      <div className="cb__head">
        <div>
          <h1>Bookings</h1>
          <p className="cp__sub">Every lesson booked with you, grouped by status.</p>
        </div>
      </div>

      {/* Sub-nav tabs */}
      <div className="cb__subnav">
        <button className={`cb__subnavtab ${subTab==='inprogress'?'on':''}`}
          onClick={() => { setSubTab('inprogress'); setConfirm(null); setSuggest(null); }}>
          In Progress
          {inProgress.length > 0 && <span className="cb__subnavbadge">{inProgress.length}</span>}
        </button>
        <button className={`cb__subnavtab ${subTab==='pending'?'on':''}`}
          onClick={() => { setSubTab('pending'); setConfirm(null); setSuggest(null); setRescheduleRequest(null); }}>
          Pending
          {pending.length > 0 && <span className="cb__subnavbadge">{pending.length}</span>}
        </button>
        <button className={`cb__subnavtab ${subTab==='completed'?'on':''}`}
          onClick={() => { setSubTab('completed'); setConfirm(null); setSuggest(null); }}>
          Completed
        </button>
        <button className={`cb__subnavtab ${subTab==='rescheduled'?'on':''}`}
          onClick={() => { setSubTab('rescheduled'); setConfirm(null); setSuggest(null); }}>
          Reschedule Requests
          {rescheduledCount > 0 && <span className="cb__subnavbadge">{rescheduledCount}</span>}
        </button>
      </div>
      <div className="cb__subnavdivider" />

      {error && <p className="cp__alert">{error}</p>}
      {flash && <p className="cb__flash">{flash}</p>}

      {/* ── IN PROGRESS ── */}
      {subTab === 'inprogress' && (
        <div className="cb__outer">
          <div className="cb__inner">
            <div className="cb__innerthead">
              <div className="cb__trow cb__trow--head">
                <span>Date</span>
                <span>Student</span>
                <span>Lesson</span>
                <span>Time</span>
                <span>Payment</span>
                <span>Action</span>
              </div>
            </div>
            <div className="cb__innerbody">
              {inProgress.length === 0 && <div className="cb__innerempty">No lessons in progress.</div>}
              {pagedIP.map(l => (
                <div key={l.id}>
                  <div className="cb__trow">
                    <DateChip dateStr={toDateStr(l.startsAt)} />
                    <div className="cb__tcustomer">
                      <Avatar name={l.studentName} />
                      <b>{l.studentName}</b>
                    </div>
                    <div><b>{l.instruments?.[0] || 'Drum'} Lesson</b></div>
                    <div><small>{l.timeLabel}</small></div>
                    <span className={`cb__badge ${l.paymentStatus==='paid'?'cb__badge--paid':'cb__badge--unpaid'}`}>
                      {l.paymentStatus === 'paid' ? 'Paid' : 'Unpaid'}
                    </span>
                    <div className="cb__tacts">
                      <button className="cb__btn cb__btn--p"
                        onClick={() => setConfirm(confirm?.id===l.id?null:{ type:'complete', id:l.id, name:l.studentName })}>
                        Mark Completed
                      </button>
                    </div>
                  </div>
                  {confirm?.id === l.id && confirm.type === 'complete' && (
                    <div className="cb__strip cb__strip--warn">
                      <div>
                        <b>Mark {confirm.name}'s lesson as completed?</b>
                        <small>The student will be notified.</small>
                      </div>
                      <div className="cb__stripacts">
                        <button className="cb__btn" onClick={() => setConfirm(null)}>Cancel</button>
                        <button className="cb__btn cb__btn--p" onClick={() => { doComplete(l.id); setConfirm(null); }} disabled={busy}>
                          {busy ? '…' : 'Yes, mark completed'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {pagedIP.length > 0 && <PlaceholderRows count={PAGE_SIZE - pagedIP.length} />}
            </div>
          </div>
          <Pagination total={inProgress.length} page={pageIP} onPage={p => { setPageIP(p); setConfirm(null); }} />
        </div>
      )}

      {/* ── PENDING SCHEDULE REQUESTS ── */}
      {subTab === 'pending' && (
        <div className="cb__outer">
          <div className="cb__inner">
            <div className="cb__innerthead">
              <div className="cb__trow cb__trow--resc cb__trow--head">
                <span>Requested Date</span>
                <span>Requested For</span>
                <span>Instrument</span>
                <span>Time</span>
                <span>Requested By</span>
                <span>Actions</span>
              </div>
            </div>
            <div className="cb__innerbody">
              {pending.length === 0 && <div className="cb__innerempty">No pending schedule requests.</div>}
              {pagedP.map(r => (
                <div key={r.id}>
                  <div className="cb__trow cb__trow--resc">
                    <DateChip dateStr={r.date} />
                    <div><b>{r.requestedFor}</b></div>
                    <div><b>{r.instrument}</b></div>
                    <div><small>{toAmPm(r.startTime)} - {toAmPm(r.endTime)}</small></div>
                    <div>
                      <b>{r.requesterName}</b>
                      <small>{r.requesterRole === 'parent' ? 'Parent' : 'Student'}</small>
                    </div>
                    <div className="cb__tacts">
                      <button className="cb__btn"
                        onClick={() => {
                          setRescheduleRequest(rescheduleRequest===r.id ? null : r.id);
                          setRequestDate(r.date);
                          setRequestTime(r.startTime);
                        }}>
                        Reschedule
                      </button>
                      <button className="cb__btn cb__btn--p"
                        onClick={() => setConfirm(confirm?.id===r.id ? null : { type:'publish', id:r.id, name:r.requestedFor })}>
                        Accept
                      </button>
                    </div>
                  </div>
                  {confirm?.id === r.id && confirm.type === 'publish' && (
                    <div className="cb__strip cb__strip--warn">
                      <div>
                        <b>Accept {confirm.name}'s schedule request?</b>
                        <small>This time will be published as available.</small>
                      </div>
                      <div className="cb__stripacts">
                        <button className="cb__btn" onClick={() => setConfirm(null)}>Cancel</button>
                        <button className="cb__btn cb__btn--p" onClick={() => { doPublishRequest(r.id); setConfirm(null); }} disabled={busy}>
                          {busy ? '…' : 'Yes, accept'}
                        </button>
                      </div>
                    </div>
                  )}
                  {rescheduleRequest === r.id && (
                    <div className="cb__strip cb__strip--suggest">
                      <b>Suggest an alternative schedule</b>
                      <small>Choose another date and time for {r.requestedFor}.</small>
                      <div className="cb__reschedulefields">
                        <input className="cb__suggestinput" type="date" value={requestDate}
                          min={new Date().toLocaleDateString('en-CA')} onChange={e => setRequestDate(e.target.value)} />
                        <select className="cb__suggestinput" value={requestTime} onChange={e => setRequestTime(e.target.value)}>
                          {Array.from({ length: 11 }, (_, i) => i + 7).map(hour => {
                            const value = `${String(hour).padStart(2, '0')}:00`;
                            return <option key={value} value={value}>{toAmPm(value)}</option>;
                          })}
                        </select>
                      </div>
                      <div className="cb__stripacts">
                        <button className="cb__btn" onClick={() => setRescheduleRequest(null)}>Cancel</button>
                        <button className="cb__btn cb__btn--p" onClick={() => doRescheduleRequest(r.id)}
                          disabled={busy || !requestDate || !requestTime}>
                          {busy ? '…' : 'Send alternative'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {pagedP.length > 0 && <PlaceholderRows count={PAGE_SIZE - pagedP.length} rescheduled />}
            </div>
          </div>
          <Pagination total={pending.length} page={pageP} onPage={p => { setPageP(p); setConfirm(null); setRescheduleRequest(null); }} />
        </div>
      )}

      {/* ── COMPLETED ── */}
      {subTab === 'completed' && (
        <div className="cb__outer">
          <div className="cb__inner">
            <div className="cb__innerthead">
              <div className="cb__trow cb__trow--head">
                <span>Date</span>
                <span>Student</span>
                <span>Lesson</span>
                <span>Time</span>
                <span>Payment</span>
                <span>Status</span>
              </div>
            </div>
            <div className="cb__innerbody">
              {completed.length === 0 && <div className="cb__innerempty">No completed lessons yet.</div>}
              {pagedC.map(l => (
                <div key={l.id} className="cb__trow">
                  <DateChip dateStr={toDateStr(l.startsAt)} />
                  <div className="cb__tcustomer">
                    <Avatar name={l.studentName} />
                    <b>{l.studentName}</b>
                  </div>
                  <div><b>{l.instruments?.[0] || 'Drum'} Lesson</b></div>
                  <div><small>{l.timeLabel}</small></div>
                  <span className={`cb__badge ${l.paymentStatus==='paid'?'cb__badge--paid':'cb__badge--unpaid'}`}>
                    {l.paymentStatus === 'paid' ? 'Paid' : 'Unpaid'}
                  </span>
                  <span className="cb__badge cb__badge--completed">Completed</span>
                </div>
              ))}
              {pagedC.length > 0 && <PlaceholderRows count={PAGE_SIZE - pagedC.length} />}
            </div>
          </div>
          <Pagination total={completed.length} page={pageC} onPage={setPageC} />
        </div>
      )}

      {/* ── RESCHEDULE REQUESTS ── */}
      {subTab === 'rescheduled' && (
        <div className="cb__outer">
          <div className="cb__inner">
            <div className="cb__innerthead">
              <div className="cb__trow cb__trow--resc cb__trow--head">
                <span>Orig. Date</span>
                <span>Student</span>
                <span>Lesson</span>
                <span>Orig. Time</span>
                <span>Requested</span>
                <span>Actions</span>
              </div>
            </div>
            <div className="cb__innerbody">
              {reschedules.length === 0 && <div className="cb__innerempty">No reschedule requests.</div>}
              {pagedR.map(r => (
                <div key={r.id}>
                  <div className="cb__trow cb__trow--resc">
                    <DateChip dateStr={r.origDate} />
                    <div className="cb__tcustomer">
                      <Avatar name={r.studentName} />
                      <b>{r.studentName}</b>
                    </div>
                    <div><b>{r.instruments?.[0] || 'Drum'} Lesson</b></div>
                    <div><small>{r.origTimeLabel}</small></div>
                    <div>
                      <b>{r.newDateLabel}</b>
                      <small>{r.newTimeLabel}</small>
                    </div>
                    <div className="cb__tacts">
                      <button className="cb__btn" disabled={!r.canReschedule}
                        title={!r.canReschedule ? 'Rescheduling is unavailable within 24 hours of the lesson.' : ''}
                        onClick={() => { setSuggest(suggest===r.id?null:r.id); setSuggestTime(''); }}>
                        Suggest
                      </button>
                      <button className="cb__btn cb__btn--p"
                        disabled={!r.canReschedule}
                        title={!r.canReschedule ? 'Rescheduling is unavailable within 24 hours of the lesson.' : ''}
                        onClick={() => setConfirm(confirm?.id===r.id?null:{ type:'accept', id:r.id, name:r.studentName })}>
                        Accept
                      </button>
                    </div>
                  </div>
                  {!r.canReschedule && (
                    <div className="cb__strip cb__strip--warn">
                      Rescheduling closes 24 hours before the lesson.
                    </div>
                  )}

                  {/* Accept confirm strip */}
                  {confirm?.id === r.id && confirm.type === 'accept' && (
                    <div className="cb__strip cb__strip--warn">
                      <div>
                        <b>Accept {confirm.name}'s reschedule request?</b>
                        <small>The lesson will move to the new time.</small>
                      </div>
                      <div className="cb__stripacts">
                        <button className="cb__btn" onClick={() => setConfirm(null)}>Cancel</button>
                        <button className="cb__btn cb__btn--p" onClick={() => { doAccept(r.id); setConfirm(null); }} disabled={busy}>
                          {busy ? '…' : 'Yes, accept'}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Suggest another time strip */}
                  {suggest === r.id && (
                    <div className="cb__strip cb__strip--suggest">
                      <b>Suggest a different time</b>
                      <small>Send an alternative time for {r.studentName} to consider.</small>
                      <input className="cb__suggestinput"
                        placeholder="e.g. Nov 5, 10:00 AM"
                        value={suggestTime}
                        onChange={e => setSuggestTime(e.target.value)} />
                      <div className="cb__stripacts">
                        <button className="cb__btn" onClick={() => setSuggest(null)}>Cancel</button>
                        <button className="cb__btn cb__btn--p" onClick={() => doSuggest(r.id)} disabled={busy || !suggestTime.trim()}>
                          {busy ? '…' : 'Send suggestion'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {pagedR.length > 0 && <PlaceholderRows count={PAGE_SIZE - pagedR.length} rescheduled />}
            </div>
          </div>
          <Pagination total={reschedules.length} page={pageR} onPage={p => { setPageR(p); setConfirm(null); setSuggest(null); }} />
        </div>
      )}
    </div>
  );
}