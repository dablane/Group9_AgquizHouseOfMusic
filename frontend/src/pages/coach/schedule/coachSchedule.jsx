import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../../services/api.js';
import '../coach.css';
import './coachSchedule.css';

const DAYS_ORDER = ['MON','TUE','WED','THU','FRI','SAT','SUN'];
const DAY_LABEL  = { MON:'Mon', TUE:'Tue', WED:'Wed', THU:'Thu', FRI:'Fri', SAT:'Sat', SUN:'Sun' };
const HOURS      = [7,8,9,10,11,12,13,14,15,16,17];

const toAmPm = t => {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ap = h < 12 ? 'AM' : 'PM';
  const hr = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hr}:${String(m).padStart(2,'0')} ${ap}`;
};
const slotStartDate = slot => {
  const [year, month, day] = slot.date.split('-').map(Number);
  const [hours, minutes] = slot.startTime.split(':').map(Number);
  return new Date(year, month - 1, day, hours, minutes);
};
const isFutureManilaSlot = (date, time) => {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  return Date.UTC(year, month - 1, day, hour - 8, minute) > Date.now();
};
const localIsoDate = date =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const weekStartForDate = isoDate => {
  const date = new Date(`${isoDate}T12:00:00`);
  const day = date.getDay();
  date.setDate(date.getDate() - (day === 0 ? 6 : day - 1));
  return localIsoDate(date);
};
const slotDurationMinutes = (start, end) => {
  const [startHour, startMinute] = start.split(':').map(Number);
  const [endHour, endMinute] = end.split(':').map(Number);
  return endHour * 60 + endMinute - startHour * 60 - startMinute;
};
const addMinutesToTime = (time, minutes) => {
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) return null;
  const [hour, minute] = time.split(':').map(Number);
  const totalMinutes = hour * 60 + minute + minutes;
  if (totalMinutes >= 24 * 60) return null;
  return `${String(Math.floor(totalMinutes / 60)).padStart(2, '0')}:${String(totalMinutes % 60).padStart(2, '0')}`;
};
const parseAmPmTime = value => {
  const match = /^(\d{1,2}):([0-5]\d)\s*(AM|PM)$/i.exec(value.trim());
  if (!match) return null;
  const hour12 = Number(match[1]);
  if (hour12 < 1 || hour12 > 12) return null;
  const hour24 = (hour12 % 12) + (match[3].toUpperCase() === 'PM' ? 12 : 0);
  return `${String(hour24).padStart(2, '0')}:${match[2]}`;
};
const getManilaDayAndTime = () => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Manila',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23'
    }).formatToParts(new Date()).map(part => [part.type, part.value])
  );
  return { day: parts.weekday.toUpperCase(), time: `${parts.hour}:${parts.minute}` };
};

/* ── Slot detail overlay ── */
function SlotDetail({ slot, date, onClose, onDelete, onReschedule, busy }) {
  const dt = new Date(date + 'T12:00:00');
  const dateLabel = dt.toLocaleDateString('en-PH', { weekday:'long', month:'long', day:'numeric', year:'numeric' });

  return (
    <div className="csch__overlay" onClick={onClose}>
      <div className="csch__slotdetail" onClick={e => e.stopPropagation()}>
        <div className="csch__slotdetailhead">
          <div>
            <div className="csch__slotdetailtitle">
              {slot.proposalPending ? 'Pending Reschedule Proposal' : slot.isBooked ? 'Booked Lesson' : 'Available Slot'}
            </div>
            <div className="csch__slotdetailsub">{dateLabel}</div>
          </div>
        </div>

        <div className="csch__slotdetailrows">
          <div className="csch__slotdetailrow">
            <span>Time</span>
            <b>{toAmPm(slot.startTime)} – {toAmPm(slot.endTime)}</b>
          </div>
          <div className="csch__slotdetailrow">
            <span>Duration</span>
            <b>{slotDurationMinutes(slot.startTime, slot.endTime)} minutes</b>
          </div>
          <div className="csch__slotdetailrow">
            <span>Status</span>
            <span className={`csch__badge ${slot.proposalPending ? 'csch__badge--pending' : slot.isBooked ? 'csch__badge--booked' : 'csch__badge--open'}`}>
              {slot.proposalPending ? 'Awaiting student' : slot.isBooked ? 'Booked' : 'Available'}
            </span>
          </div>
          {slot.isBooked && (
            <div className="csch__slotdetailrow">
              <span>Student</span>
              <b>{slot.studentName || '—'}</b>
            </div>
          )}
        </div>

        {slot.proposalPending ? (
          <>
            <div className="csch__slotdetailnote">
              This time is reserved while the student reviews the reschedule proposal.
            </div>
            <div className="csch__slotdetailbtns">
              <button className="csch__slotdetailcancel" onClick={onClose}>Close</button>
            </div>
          </>
        ) : slot.isBooked ? (
          <>
            <div className="csch__slotdetailnote">
              {slot.canReschedule
                ? 'Choose a new available time to request a reschedule from the student.'
                : 'Rescheduling closes 24 hours before the lesson.'}
            </div>
            <div className="csch__slotdetailbtns">
              <button className="csch__slotdetailcancel" onClick={onClose}>Close</button>
              <button className="csch__slotdetailreschedule" onClick={onReschedule} disabled={busy || !slot.canReschedule}>
                {busy ? 'Loading…' : 'Reschedule'}
              </button>
            </div>
          </>
        ) : (
          <div className="csch__slotdetailbtns">
            <button className="csch__slotdetailcancel" onClick={onClose}>Close</button>
            <button className="csch__slotdetaildel" onClick={onDelete} disabled={busy}>
              {busy ? 'Deleting…' : 'Delete Slot'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function CreateSlotModal({ date, startTime, onClose, onCreate, busy }) {
  const endTime = addMinutesToTime(startTime, 60);
  const dateLabel = new Date(`${date}T12:00:00`).toLocaleDateString('en-PH', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
  });

  return (
    <div className="csch__overlay" onClick={busy ? undefined : onClose}>
      <div className="csch__slotdetail" role="dialog" aria-modal="true" aria-labelledby="csch-create-title"
        onClick={event => event.stopPropagation()}>
        <div className="csch__slotdetailhead">
          <div>
            <div className="csch__slotdetailtitle" id="csch-create-title">Create a schedule</div>
            <div className="csch__slotdetailsub">{dateLabel}</div>
          </div>
          <button className="csch__modalclose" onClick={onClose} disabled={busy} aria-label="Close dialog">×</button>
        </div>

        <div className="csch__slotdetailrows">
          <div className="csch__slotdetailrow">
            <span>Time</span>
            <b>{toAmPm(startTime)} – {toAmPm(endTime)}</b>
          </div>
          <div className="csch__slotdetailrow">
            <span>Duration</span>
            <b>60 minutes</b>
          </div>
        </div>
        <div className="csch__slotdetailnote">
          This time will be added to your availability for students to book.
        </div>
        <div className="csch__slotdetailbtns">
          <button className="csch__slotdetailcancel" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="csch__createconfirm" onClick={onCreate} disabled={busy || !endTime}>
            {busy ? 'Creating…' : 'Create schedule'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ScheduleRequestModal({ request, onClose, onPublish, onDecline, busy }) {
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState('');
  const dateLabel = new Date(`${request.date}T12:00:00`).toLocaleDateString('en-PH', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
  });

  return (
    <div className="csch__overlay" onClick={busy ? undefined : onClose}>
      <div className="csch__slotdetail" role="dialog" aria-modal="true" aria-labelledby="csch-request-title"
        onClick={event => event.stopPropagation()}>
        <div className="csch__slotdetailhead">
          <div>
            <div className="csch__slotdetailtitle" id="csch-request-title">Schedule request</div>
            <div className="csch__slotdetailsub">{dateLabel}</div>
          </div>
          <button className="csch__modalclose" onClick={onClose} disabled={busy} aria-label="Close dialog">×</button>
        </div>
        <div className="csch__slotdetailrows">
          <div className="csch__slotdetailrow"><span>Requested by</span><b>{request.requesterName}</b></div>
          <div className="csch__slotdetailrow"><span>Account</span><b>{request.requesterRole === 'parent' ? 'Parent' : 'Student'}</b></div>
          <div className="csch__slotdetailrow"><span>For</span><b>{request.requestedFor}</b></div>
          <div className="csch__slotdetailrow"><span>Instrument</span><b>{request.instrument}</b></div>
          <div className="csch__slotdetailrow"><span>Time</span><b>{toAmPm(request.startTime)} – {toAmPm(request.endTime)}</b></div>
        </div>
        {declining ? (
          <div className="csch__requestdecline">
            <label htmlFor="csch-request-reason">Reason for declining</label>
            <textarea id="csch-request-reason" maxLength={500} value={reason}
              onChange={event => setReason(event.target.value)} />
            <div className="csch__requestreasonhint">{reason.length}/500 characters</div>
          </div>
        ) : (
          <div className="csch__slotdetailnote">
            Publishing adds this one-hour time to your availability. The requester will still need to book it.
          </div>
        )}
        <div className="csch__slotdetailbtns">
          <button className="csch__slotdetailcancel" onClick={declining ? () => setDeclining(false) : onClose} disabled={busy}>
            {declining ? 'Back' : 'Close'}
          </button>
          {declining ? (
            <button className="csch__requestdeclinebtn" onClick={() => onDecline(reason)} disabled={busy || !reason.trim()}>
              {busy ? 'Declining…' : 'Confirm decline'}
            </button>
          ) : (
            <>
              <button className="csch__requestdeclinebtn" onClick={() => setDeclining(true)} disabled={busy}>Decline</button>
              <button className="csch__createconfirm" onClick={onPublish} disabled={busy}>
                {busy ? 'Publishing…' : 'Publish slot'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function RescheduleRequestModal({ slot, date, availableSlots, onClose, onSubmit, busy }) {
  const [selectedTime, setSelectedTime] = useState('');
  const [customDate, setCustomDate] = useState('');
  const [customStartTime, setCustomStartTime] = useState('');
  const [customEndTime, setCustomEndTime] = useState('');
  const [reason, setReason] = useState('');
  const isCustomTime = selectedTime === 'custom';
  const selectedSlot = availableSlots.find(s => String(s.id) === selectedTime);
  const [earliestMinute] = useState(() => new Date(Math.floor(Date.now() / 60000) * 60000 + 60000));
  const manilaParts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(earliestMinute)
      .filter(part => part.type !== 'literal')
      .map(part => [part.type, part.value])
  );
  const today = `${manilaParts.year}-${manilaParts.month}-${manilaParts.day}`;
  const currentTime = `${manilaParts.hour}:${manilaParts.minute}`;
  const canSubmit = isCustomTime
    ? Boolean(
      customDate >= today &&
      (customDate > today || customStartTime >= currentTime) &&
      customStartTime &&
      customEndTime &&
      customEndTime > customStartTime
    )
    : Boolean(selectedSlot);
  const minEndTime = customStartTime
    ? (() => {
      const [hours, minutes] = customStartTime.split(':').map(Number);
      const nextMinute = hours * 60 + minutes + 1;
      return nextMinute < 24 * 60
        ? `${String(Math.floor(nextMinute / 60)).padStart(2, '0')}:${String(nextMinute % 60).padStart(2, '0')}`
        : undefined;
    })()
    : customDate === today ? currentTime : undefined;
  const lessonDate = new Date(`${date}T12:00:00`).toLocaleDateString('en-PH', {
    weekday: 'short', month: 'short', day: 'numeric'
  });

  return (
    <div className="csch__overlay" onClick={onClose}>
      <div className="csch__modal csch__reschedulemodal" onClick={e => e.stopPropagation()}>
        <div className="csch__modalhead">
          <div>
            <div className="csch__modaltitle">Request Reschedule</div>
            <div className="csch__modalsub">
              {slot.studentName || 'Student'} · {lessonDate} · {toAmPm(slot.startTime)}
            </div>
          </div>
        </div>

        <div className="csch__reschedulefield">
          <label htmlFor="csch-reschedule-slot">New time</label>
          <select
            id="csch-reschedule-slot"
            value={selectedTime}
            onChange={e => setSelectedTime(e.target.value)}
            disabled={busy}>
            <option value="">Choose a new time</option>
            {availableSlots.map(option => {
              const optionDate = new Date(`${option.date}T12:00:00`).toLocaleDateString('en-PH', {
                weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
              });
              return (
                <option key={option.id} value={option.id}>
                  {optionDate} · {toAmPm(option.startTime)} – {toAmPm(option.endTime)}
                </option>
              );
            })}
            <option value="custom">Other — enter a date and time</option>
          </select>
          {availableSlots.length === 0 && (
            <p className="csch__rescheduleempty">
              No posted open times are available. Choose “Other” to enter a custom time.
            </p>
          )}
        </div>

        {isCustomTime && (
          <>
            <div className="csch__customtimefields">
              <div className="csch__reschedulefield">
                <label htmlFor="csch-custom-date">Date</label>
                <input
                  id="csch-custom-date"
                  type="date"
                  min={today}
                  value={customDate}
                  onChange={e => {
                    setCustomDate(e.target.value);
                    setCustomStartTime('');
                    setCustomEndTime('');
                  }}
                  disabled={busy}
                />
              </div>
              <div className="csch__reschedulefield">
                <label htmlFor="csch-custom-time">Start time</label>
                <input
                  id="csch-custom-time"
                  type="time"
                  min={customDate === today ? currentTime : undefined}
                  value={customStartTime}
                  onChange={e => {
                    setCustomStartTime(e.target.value);
                    if (customEndTime && customEndTime <= e.target.value) setCustomEndTime('');
                  }}
                  disabled={busy}
                />
              </div>
              <div className="csch__reschedulefield">
                <label htmlFor="csch-custom-end-time">End time</label>
                <input
                  id="csch-custom-end-time"
                  type="time"
                  min={minEndTime}
                  value={customEndTime}
                  onChange={e => setCustomEndTime(e.target.value)}
                  disabled={busy}
                />
              </div>
            </div>
            <p className="csch__rescheduleempty">
              This time will be reserved on your calendar while the student decides.
            </p>
          </>
        )}

        <div className="csch__reschedulefield">
          <label htmlFor="csch-reschedule-reason">Message to student (optional)</label>
          <textarea
            id="csch-reschedule-reason"
            className="csch__reschedulereason"
            rows={3}
            value={reason}
            onChange={e => setReason(e.target.value)}
            disabled={busy}
            placeholder="Add a note about the proposed change."
          />
        </div>

        <div className="csch__rescheduleactions">
          <button className="csch__reschedulecancel" onClick={onClose} disabled={busy}>Cancel</button>
          <button
            className="csch__reschedulesend"
            onClick={() => onSubmit(
              isCustomTime
                ? { custom: true, date: customDate, startTime: customStartTime, endTime: customEndTime }
                : selectedSlot,
              reason
            )}
            disabled={!canSubmit || busy}>
            {busy ? 'Sending…' : 'Send Request'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Weekly Template Modal ── */
function TemplateModal({ initial, onClose, onApplied }) {
  const initialStartTime = initial?.start_time || '';
  const existingEndIsOneHour = initial?.end_time
    && slotDurationMinutes(initialStartTime, initial.end_time) === 60;
  const suggestedEndTime = addMinutesToTime(initialStartTime, 60);
  const initialEndTime = existingEndIsOneHour ? initial.end_time : suggestedEndTime;
  const [tplDays, setTplDays]         = useState(initial?.days ? initial.days.split(',').map(x=>x.trim()) : []);
  const [tplStart, setTplStart]       = useState(toAmPm(initialStartTime));
  const [tplEnd, setTplEnd]           = useState(toAmPm(initialEndTime || ''));
  const [tplWeeks, setTplWeeks]       = useState(4);
  const [tplSaved, setTplSaved]       = useState(!!initial);
  const [templateStep, setTemplateStep] = useState(1);
  const [busy, setBusy]               = useState(false);
  const [flash, setFlash]             = useState('');
  const [flashType, setFlashType]     = useState('ok');

  const showFlash = (msg, type='ok') => { setFlash(msg); setFlashType(type); };

  const toggleDay = d => {
    setTplDays(prev => prev.includes(d) ? prev.filter(x=>x!==d) : [...prev,d]);
    setTplSaved(false);
  };

  const tplStartTime = parseAmPmTime(tplStart);
  const tplEndTime = parseAmPmTime(tplEnd);
  const slotPreviewCount = (() => {
    if (!tplDays.length || !tplStartTime || !tplEndTime || slotDurationMinutes(tplStartTime, tplEndTime) !== 60) return 0;
    return tplDays.length;
  })();

  const manilaNow = getManilaDayAndTime();
  const timeError = !tplStartTime || !tplEndTime
    ? 'Enter a valid start time in AM/PM format.'
    : !addMinutesToTime(tplStartTime, 60)
      ? 'Choose a start time that leaves room for a one-hour slot before midnight.'
      : tplEndTime !== addMinutesToTime(tplStartTime, 60)
        ? 'End time must be exactly one hour after the start time.'
        : tplDays.includes(manilaNow.day) && tplStartTime <= manilaNow.time
          ? `Since ${DAY_LABEL[manilaNow.day]} is selected, start time must be later than ${toAmPm(manilaNow.time)} Manila time.`
          : '';

  const saveTemplate = async () => {
    if (!tplDays.length) {
      showFlash('Pick at least one day.','err');
      return false;
    }
    if (timeError) {
      showFlash(timeError,'err');
      return false;
    }
    setBusy(true);
    try {
      await api.post('/coach/schedule/template', {
        days: tplDays.join(','), startTime: tplStartTime,
        endTime: tplEndTime, slotDuration: 60
      });
      setTplSaved(true);
      showFlash('Template saved!');
      return true;
    } catch(e) { showFlash(e.message,'err'); }
    finally { setBusy(false); }
    return false;
  };

  const continueToPublish = async () => {
    if (await saveTemplate()) setTemplateStep(3);
  };

  const applyTemplate = async () => {
    if (!tplSaved) return showFlash('Save your template first.','err');
    setBusy(true);
    try {
      const r = await api.post('/coach/schedule/apply-template', { weeks: tplWeeks });
      showFlash(`Done! ${r.created} slot${r.created!==1?'s':''} created across ${tplWeeks} week${tplWeeks!==1?'s':''}.`);
      onApplied();
    } catch(e) { showFlash(e.message,'err'); }
    finally { setBusy(false); }
  };

  return (
    <div className="csch__overlay" onClick={onClose}>
      <div className="csch__modal" onClick={e => e.stopPropagation()}>
        <div className="csch__modalhead">
          <div>
            <div className="csch__modaltitle">Set Weekly Availability</div>
          </div>
          <button className="csch__modalclose" onClick={onClose}>×</button>
        </div>

        {flash && <div className={`csch__flash csch__flash--${flashType}`}>{flash}</div>}

        <div className="csch__stepindicator" aria-live="polite">
          <div className="csch__stepmeta">Step {templateStep} of 3</div>
          <div className="csch__steptitle">
            {templateStep === 1 ? 'Choose your days' : templateStep === 2 ? 'Set your hours' : 'Publish availability'}
          </div>
          <div className="csch__steptrack" role="progressbar" aria-valuemin="1" aria-valuemax="3" aria-valuenow={templateStep}>
            <span style={{ width: `${(templateStep / 3) * 100}%` }} />
          </div>
        </div>

        {templateStep === 1 && (
          <div className="csch__section">
            <div className="csch__seclabel">Choose your regular teaching days</div>
            <p className="csch__templatehint">Select every day of the week when you are usually available.</p>
            <div className="csch__daypills">
              {DAYS_ORDER.map(d => (
                <button key={d} type="button"
                  className={`csch__daypill ${tplDays.includes(d) ? 'on' : ''}`}
                  aria-pressed={tplDays.includes(d)}
                  onClick={() => toggleDay(d)}>
                  {DAY_LABEL[d]}
                </button>
              ))}
            </div>
            <div className="csch__stepactions csch__stepactions--end">
              <button type="button" className="csch__stepnext" onClick={() => {
                if (!tplDays.length) return showFlash('Pick at least one day.','err');
                setFlash('');
                setTemplateStep(2);
              }}>
                Continue
              </button>
            </div>
          </div>
        )}

        {templateStep === 2 && (
          <div className="csch__section">
            <div className="csch__seclabel">Set your available hours</div>
            <p className="csch__templatehint">Enter a start time; the end time will fill in automatically one hour later.</p>
            <div className="csch__timerow">
              <div className="csch__timefield">
                <label htmlFor="csch-template-start">Start time</label>
                <input id="csch-template-start" type="text" inputMode="text" autoComplete="off"
                  placeholder="h:mm AM/PM" maxLength={8}
                  aria-invalid={!!timeError}
                  value={tplStart}
                  onChange={e => {
                    setTplStart(e.target.value);
                    const startTime = parseAmPmTime(e.target.value);
                    const nextHour = startTime && addMinutesToTime(startTime, 60);
                    if (nextHour) setTplEnd(toAmPm(nextHour));
                    setTplSaved(false);
                  }}
                  onBlur={() => {
                    if (tplStartTime) setTplStart(toAmPm(tplStartTime));
                  }} />
              </div>
              <span className="csch__timedash">–</span>
              <div className="csch__timefield">
                <label htmlFor="csch-template-end">End time</label>
                <input id="csch-template-end" type="text" inputMode="text" autoComplete="off"
                  placeholder="Auto-filled" maxLength={8} readOnly
                  aria-invalid={!!timeError}
                  value={tplEnd} />
              </div>
            </div>
            {timeError && <p className="csch__timeerror" role="alert">{timeError}</p>}
            {tplDays.length > 0 && tplStartTime && tplEndTime && slotDurationMinutes(tplStartTime, tplEndTime) === 60 && (
              <div className="csch__preview">
                This will create {slotPreviewCount} bookable slot{slotPreviewCount!==1?'s':''} per week on {tplDays.map(d=>DAY_LABEL[d]).join(', ')} from {toAmPm(tplStartTime)} to {toAmPm(tplEndTime)}.
              </div>
            )}
            <div className="csch__stepactions">
              <button type="button" className="csch__stepback" onClick={() => { setFlash(''); setTemplateStep(1); }}>
                Back
              </button>
              <button type="button" className="csch__stepnext" onClick={continueToPublish} disabled={busy || !!timeError}>
                {busy ? 'Saving…' : 'Save and continue'}
              </button>
            </div>
          </div>
        )}

        {templateStep === 3 && (
          <div className="csch__applysection csch__applysection--wizard">
            <div className="csch__seclabel">Publish dated slots to your calendar</div>
            <p className="csch__templatehint">Your weekly pattern is saved. Choose how many weeks of actual bookable dates to add.</p>
            <div className="csch__templatesummary">
              <strong>{tplDays.map(d=>DAY_LABEL[d]).join(', ')}</strong>
              <span>{toAmPm(tplStartTime)}–{toAmPm(tplEndTime)} · 1-hour slot</span>
            </div>
            <div className="csch__applyrow">
              <label className="csch__applylabel" htmlFor="csch-template-weeks">Create slots for the next</label>
              <select id="csch-template-weeks" className="csch__weekselect" value={tplWeeks}
                onChange={e => setTplWeeks(Number(e.target.value))}>
                {[1,2,3,4,6,8,12].map(w => (
                  <option key={w} value={w}>{w} week{w!==1?'s':''}</option>
                ))}
              </select>
            </div>
            <p className="csch__applyhint">Only future times are added. Existing slots are skipped, not duplicated.</p>
            <div className="csch__stepactions">
              <button type="button" className="csch__stepback" onClick={() => { setFlash(''); setTemplateStep(2); }}>
                Back
              </button>
              <button type="button" className="csch__applybtn" onClick={applyTemplate} disabled={busy || !tplSaved}>
                {busy ? 'Publishing…' : 'Publish Availability'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function CoachSchedule() {
  const [data, setData]               = useState(null);
  const [error, setError]             = useState('');
  const [weekStart, setWeekStart]     = useState('');
  const [busy, setBusy]               = useState(false);
  const [flash, setFlash]             = useState('');
  const [flashType, setFlashType]     = useState('ok');
  const [showModal, setShowModal]     = useState(false);
  const [activeSlot, setActiveSlot]   = useState(null); // { slot, date }
  const [createSlotTarget, setCreateSlotTarget] = useState(null);
  const [activeScheduleRequest, setActiveScheduleRequest] = useState(null);
  const [rescheduleTarget, setRescheduleTarget] = useState(null);

  const showFlash = (msg, type='ok') => {
    setFlash(msg); setFlashType(type);
    setTimeout(() => setFlash(''), 3500);
  };

  const load = useCallback((ws = weekStart) =>
    api.get(`/coach/schedule${ws ? `?weekStart=${ws}` : ''}`)
      .then(d => {
        setData(d);
        if (!weekStart) setWeekStart(d.weekStart);
        if (d.expiredSlotsRemoved) {
          window.dispatchEvent(new Event('coach-notifications-updated'));
        }
      })
      .catch(e => setError(e.message)), [weekStart]);

  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  useEffect(() => {
    const refresh = () => loadRef.current();
    const refreshIfVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };

    refresh();
    const intervalId = window.setInterval(refreshIfVisible, 60_000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refreshIfVisible);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refreshIfVisible);
    };
  }, []);

  const shiftWeek = dir => {
    const d = new Date((weekStart || new Date().toLocaleDateString('en-CA')) + 'T12:00:00');
    d.setDate(d.getDate() + dir * 7);
    const nw = d.toLocaleDateString('en-CA');
    setWeekStart(nw); load(nw);
  };

  const deleteSlot = async id => {
    setBusy(true);
    try {
      await api.delete(`/coach/schedule/slots/${id}`);
      setActiveSlot(null);
      showFlash('Slot deleted.');
      load(weekStart);
    } catch(e) { showFlash(e.message,'err'); }
    finally { setBusy(false); }
  };

  const createSchedule = async () => {
    if (!createSlotTarget) return;
    const endTime = addMinutesToTime(createSlotTarget.startTime, 60);
    if (!endTime) {
      showFlash('Choose a time that leaves room for a one-hour schedule.', 'err');
      return;
    }

    setBusy(true);
    try {
      await api.post('/coach/schedule/slots', {
        date: createSlotTarget.date,
        startTime: createSlotTarget.startTime,
        endTime
      });
      setCreateSlotTarget(null);
      showFlash('Schedule created. Students can now book this time.');
      load(weekStart);
    } catch (e) {
      showFlash(e.message, 'err');
    } finally {
      setBusy(false);
    }
  };

  const publishScheduleRequest = async () => {
    if (!activeScheduleRequest) return;
    setBusy(true);
    try {
      await api.post(`/coach/schedule-requests/${activeScheduleRequest.id}/publish`, {});
      setActiveScheduleRequest(null);
      showFlash('Schedule published. The requester can now book it.');
      load(weekStart);
    } catch (e) {
      showFlash(e.message, 'err');
    } finally {
      setBusy(false);
    }
  };

  const declineScheduleRequest = async reason => {
    if (!activeScheduleRequest) return;
    setBusy(true);
    try {
      await api.post(`/coach/schedule-requests/${activeScheduleRequest.id}/decline`, { reason });
      setActiveScheduleRequest(null);
      showFlash('Schedule request declined.');
      load(weekStart);
    } catch (e) {
      showFlash(e.message, 'err');
    } finally {
      setBusy(false);
    }
  };

  const openReschedule = async target => {
    setBusy(true);
    try {
      const latest = await api.get(`/coach/schedule${weekStart ? `?weekStart=${weekStart}` : ''}`);
      setData(latest);
      setRescheduleTarget(target);
      setActiveSlot(null);
    } catch (e) {
      showFlash(e.message, 'err');
    } finally {
      setBusy(false);
    }
  };

  const requestReschedule = async (target, proposedTime, reason) => {
    if (!target.slot.lessonId) {
      showFlash('Could not find the booked lesson. Reload the schedule and try again.', 'err');
      return;
    }
    setBusy(true);
    try {
      await api.post(`/coach/bookings/${target.slot.lessonId}/reschedule`, {
        date: proposedTime.date,
        slotId: proposedTime.custom ? undefined : proposedTime.id,
        customStartTime: proposedTime.custom ? proposedTime.startTime : undefined,
        customEndTime: proposedTime.custom ? proposedTime.endTime : undefined,
        reason
      });
      setRescheduleTarget(null);
      showFlash('Reschedule request sent to the student for approval.');
      const newWeekStart = weekStartForDate(proposedTime.date);
      setWeekStart(newWeekStart);
      load(newWeekStart);
    } catch (e) {
      showFlash(e.message, 'err');
    } finally {
      setBusy(false);
    }
  };

  if (error) return <div className="cp"><p className="cp__alert">{error}</p></div>;
  if (!data)  return <div className="cp"><p className="cp__muted">Loading…</p></div>;

  const today = new Date().toLocaleDateString('en-CA');
  const now = new Date();
  const availableRescheduleSlots = (data.availableSlots || []).filter(slot =>
    slotStartDate(slot) > now
  );
  const scheduleHours = [...new Set([
    ...HOURS,
    ...data.days.flatMap(day => day.slots.map(slot => Number(slot.startTime.split(':')[0]))),
    ...(data.scheduleRequests || []).map(request => Number(request.startTime.split(':')[0]))
  ])].sort((a, b) => a - b);

  const getSlot = (date, hour) => {
    const day = data.days.find(d => d.date === date);
    if (!day) return null;
    return day.slots.find(s => {
      const [h] = s.startTime.split(':').map(Number);
      const hasBookingDetails = !s.isBooked || s.studentName || s.proposalPending;
      const isVisible = s.lessonId
        ? s.lessonStatus !== 'completed'
        : isFutureManilaSlot(date, s.startTime);
      return h === hour && hasBookingDetails
        && isVisible;
    }) || null;
  };
  const getScheduleRequest = (date, hour) =>
    (data.scheduleRequests || []).find(request =>
      request.date === date && Number(request.startTime.split(':')[0]) === hour
    ) || null;

  return (
    <div className="csch">
      {/* Header */}
      <div className="csch__head">
        <div>
          <h1>My Schedule</h1>
          <p className="cp__sub">Manage your available teaching slots.</p>
        </div>
        <button className="csch__createbtn" onClick={() => setShowModal(true)}>
          Set Weekly Template
        </button>
      </div>

      {flash && <div className={`csch__flash csch__flash--${flashType}`}>{flash}</div>}

      {/* Template modal */}
      {showModal && (
        <TemplateModal
          initial={data.template}
          onClose={() => setShowModal(false)}
          onApplied={() => { load(weekStart); showFlash('Slots generated!'); setShowModal(false); }}
        />
      )}

      {/* Slot detail overlay */}
      {activeSlot && (
        <SlotDetail
          slot={activeSlot.slot}
          date={activeSlot.date}
          onClose={() => setActiveSlot(null)}
          onDelete={() => deleteSlot(activeSlot.slot.id)}
          onReschedule={() => openReschedule(activeSlot)}
          busy={busy}
        />
      )}
      {createSlotTarget && (
        <CreateSlotModal
          date={createSlotTarget.date}
          startTime={createSlotTarget.startTime}
          onClose={() => setCreateSlotTarget(null)}
          onCreate={createSchedule}
          busy={busy}
        />
      )}
      {activeScheduleRequest && (
        <ScheduleRequestModal
          request={activeScheduleRequest}
          onClose={() => setActiveScheduleRequest(null)}
          onPublish={publishScheduleRequest}
          onDecline={declineScheduleRequest}
          busy={busy}
        />
      )}
      {rescheduleTarget && (
        <RescheduleRequestModal
          slot={rescheduleTarget.slot}
          date={rescheduleTarget.date}
          availableSlots={availableRescheduleSlots.filter(option =>
            String(option.id) !== String(rescheduleTarget.slot.id)
          )}
          onClose={() => setRescheduleTarget(null)}
          onSubmit={(proposedSlot, reason) => requestReschedule(rescheduleTarget, proposedSlot, reason)}
          busy={busy}
        />
      )}

      {/* Week nav */}
      <div className="csch__weeknav">
        <div className="csch__monthnav">
          <button className="csch__navbtn" onClick={() => shiftWeek(-1)}>‹</button>
          <span className="csch__weeklabel">
            {new Date(data.weekStart+'T12:00:00').toLocaleDateString('en-PH',{month:'long',year:'numeric'})}
          </span>
          <button className="csch__navbtn" onClick={() => shiftWeek(1)}>›</button>
        </div>
        <div className="csch__legend">
          <span className="csch__legenditem">
            <span className="csch__legenddot csch__legenddot--open" /> Available
          </span>
          <span className="csch__legenditem">
            <span className="csch__legenddot csch__legenddot--booked" /> Booked
          </span>
          <span className="csch__legenditem">
            <span className="csch__legenddot csch__legenddot--pending" /> Proposal pending
          </span>
          <span className="csch__legenditem">
            <span className="csch__legenddot csch__legenddot--request" /> Schedule request
          </span>
        </div>
      </div>

      {/* Calendar grid */}
      <div className="csch__calendar">
        <div className="csch__calhead">
          <div className="csch__timecol">TIME</div>
          {data.days.map(d => {
            const isToday = d.date === today;
            return (
              <div key={d.date} className={`csch__daycol ${isToday?'today':''}`}>
                <span className="csch__caldayname">{d.dayLabel}</span>
                <span className={`csch__caldaynum ${isToday?'today':''}`}>{d.dayNum}</span>
              </div>
            );
          })}
        </div>

        <div className="csch__calbody">
          {scheduleHours.map(hour => (
            <div key={hour} className="csch__calrow">
              <div className="csch__timecell">{toAmPm(`${String(hour).padStart(2,'00')}:00`)}</div>
              {data.days.map(d => {
                const slot    = getSlot(d.date, hour);
                const request = getScheduleRequest(d.date, hour);
                const isToday = d.date === today;
                const startTime = `${String(hour).padStart(2, '0')}:00`;
                return (
                  <div key={d.date} className={`csch__cell ${isToday?'today':''}`}>
                    {slot && (
                      <div
                        className={`csch__chip ${slot.proposalPending?'proposed':slot.isBooked?'booked':'free'} csch__chip--clickable`}
                        onClick={() => setActiveSlot({ slot, date: d.date })}>
                        <div className="csch__chipbody">
                          {(slot.proposalPending || !slot.isBooked || slot.studentName) && (
                            <span className="csch__chipname">
                              {slot.proposalPending ? 'Proposal pending' : slot.isBooked ? slot.studentName.split(' ')[0] : 'Available'}
                            </span>
                          )}
                          <span className="csch__chiptime">
                            {toAmPm(slot.startTime)} – {toAmPm(slot.endTime)}
                          </span>
                        </div>
                      </div>
                    )}
                    {!slot && request && (
                      <button
                        type="button"
                        className="csch__requestchip"
                        onClick={() => setActiveScheduleRequest(request)}
                        aria-label={`Review schedule request for ${request.requestedFor} on ${d.dayLabel} at ${toAmPm(startTime)}`}>
                        <span>{request.requesterName}</span>
                        <small>{toAmPm(request.startTime)} · Review</small>
                      </button>
                    )}
                    {!slot && !request && isFutureManilaSlot(d.date, startTime) && (
                      <button
                        type="button"
                        className="csch__addslot"
                        aria-label={`Create a schedule on ${d.dayLabel} at ${toAmPm(startTime)}`}
                        onClick={() => setCreateSlotTarget({ date: d.date, startTime })}>
                        + Create schedule
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}