import { useEffect, useState } from 'react';
import { api } from '../../../services/api.js';
import '../coach.css';
import './coachPayments.css';

const PAGE_SIZE = 5;
const peso = n => `₱${Number(n).toLocaleString('en-PH')}`;

const fmtMonth = d => new Date(`${d}T12:00:00`).toLocaleDateString('en-PH',{month:'short'}).toUpperCase();
const fmtDay   = d => new Date(`${d}T12:00:00`).getDate();
const fmtDow   = d => new Date(`${d}T12:00:00`).toLocaleDateString('en-PH',{weekday:'short'}).toUpperCase();
const toDateStr = val => {
  if (!val) return null;
  const s = val instanceof Date ? val.toISOString() : String(val);
  return s.length === 10 ? s : s.slice(0, 10);
};
const initials = n => (n||'').split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase();
const AVATAR_COLORS = ['#dbeafe','#d1fae5','#ede9fe','#fce7f3','#fef3c7'];
const avatarColor = n => AVATAR_COLORS[(n?.charCodeAt(0)||0) % AVATAR_COLORS.length];

function DateChip({ dateStr }) {
  if (!dateStr) return <div className="cpay__datechip">—</div>;
  return (
    <div className="cpay__datechip">
      <span className="month">{fmtMonth(dateStr)}</span>
      <span className="day">{fmtDay(dateStr)}</span>
      <span className="dow">{fmtDow(dateStr)}</span>
    </div>
  );
}

function Avatar({ name }) {
  return <span className="cpay__avatar" style={{ background: avatarColor(name) }}>{initials(name)}</span>;
}

function Pagination({ total, page, onPage }) {
  const totalPages = Math.ceil(total / PAGE_SIZE) || 1;
  return (
    <div className="cpay__pagination">
      <span className="cpay__paginfo">
        {total === 0 ? 'No records' : `Page ${page} of ${totalPages}`}
      </span>
      <div className="cpay__pagbtns">
        <button className="cpay__pagbtn" disabled={page <= 1} onClick={() => onPage(page - 1)}>‹</button>
        <button className="cpay__pagbtn" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>›</button>
      </div>
    </div>
  );
}

export default function CoachPayments() {
  const [data, setData]       = useState(null);
  const [error, setError]     = useState('');
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy]       = useState(false);
  const [tab, setTab]         = useState('all');
  const [page, setPage]       = useState(1);

  const load = () => api.get('/coach/payments').then(setData).catch(e => setError(e.message));
  useEffect(() => { load(); }, []);

  const markPaid = async id => {
    setBusy(true);
    try { await api.post(`/coach/payments/${id}/paid`); load(); setConfirm(null); }
    catch(e) { setError(e.message); }
    finally { setBusy(false); }
  };

  if (error) return <div className="cp"><p className="cp__alert">{error}</p></div>;
  if (!data)  return <div className="cp"><p className="cp__muted">Loading…</p></div>;

  const { payments, stats } = data;

  const filtered = tab === 'all'    ? payments
                 : tab === 'unpaid' ? payments.filter(p => p.paymentStatus === 'unpaid')
                 :                    payments.filter(p => p.paymentStatus === 'paid');

  const total  = filtered.length;
  const paged  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const unpaidCount = payments.filter(p => p.paymentStatus === 'unpaid').length;

  return (
    <div className="cp cpay">
      <h1>Payments</h1>
      <p className="cp__sub">View lesson payment records and mark cash payments as received.</p>

      {/* Stats */}
      <div className="cpay__stats">
        <div className="cpay__stat">
          <div className="cpay__statlabel">Collected</div>
          <div className="cpay__statval cpay__statval--green">{peso(stats.collected)}</div>
        </div>
        <div className="cpay__stat">
          <div className="cpay__statlabel">Still Unpaid</div>
          <div className="cpay__statval cpay__statval--red">{peso(stats.unpaid)}</div>
        </div>
        <div className="cpay__stat">
          <div className="cpay__statlabel">Lesson Fee</div>
          <div className="cpay__statval">{peso(stats.lessonFee)}</div>
        </div>
      </div>

      {/* Sub-nav tabs */}
      <div className="cpay__subnav">
        <button className={`cpay__subnavtab ${tab==='all'?'on':''}`}
          onClick={() => { setTab('all'); setPage(1); setConfirm(null); }}>
          All
        </button>
        <button className={`cpay__subnavtab ${tab==='unpaid'?'on':''}`}
          onClick={() => { setTab('unpaid'); setPage(1); setConfirm(null); }}>
          Unpaid
          {unpaidCount > 0 && <span className="cpay__subnavbadge">{unpaidCount}</span>}
        </button>
        <button className={`cpay__subnavtab ${tab==='paid'?'on':''}`}
          onClick={() => { setTab('paid'); setPage(1); setConfirm(null); }}>
          Paid
        </button>
      </div>
      <div className="cpay__subnavdivider" />

      {/* Table */}
      <div className="cpay__outer">
        <div className="cpay__inner">
          <div className="cpay__innerthead">
            <div className={`cpay__trow cpay__trow--head ${tab === 'paid' ? 'cpay__trow--noaction' : ''}`}>
              <span>Date</span>
              <span>Student</span>
              <span>Lesson</span>
              <span>Time</span>
              <span>Amount</span>
              <span>Status</span>
              {tab !== 'paid' && <span>Action</span>}
            </div>
          </div>
          <div className="cpay__innerbody">
            {total === 0 && (
              <div className="cpay__emptyrow">No payment records yet.</div>
            )}
            {paged.map(p => (
              <div key={p.id}>
                <div className={`cpay__trow cpay__paymentrow ${tab === 'paid' ? 'cpay__trow--noaction' : ''}`}>
                  <DateChip dateStr={toDateStr(p.startsAt)} />
                  <div className="cpay__tcustomer">
                    <Avatar name={p.studentName} />
                    <b>{p.studentName}</b>
                  </div>
                  <div><b>{p.instruments?.[0] || 'Drum'} Lesson</b></div>
                  <div><small>{p.timeLabel}</small></div>
                  <div><b>{peso(p.amount)}</b></div>
                  <span className={`cpay__badge ${p.paymentStatus === 'paid' ? 'cpay__badge--paid' : 'cpay__badge--unpaid'}`}>
                    {p.paymentStatus === 'paid' ? 'Paid' : 'Unpaid'}
                  </span>
                  {tab !== 'paid' && (
                    <div className="cpay__tacts">
                      {p.paymentStatus === 'unpaid' && (
                        <button className="cpay__markbtn"
                          onClick={() => setConfirm(confirm === p.id ? null : p.id)}>
                          Mark Paid
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Confirm strip */}
                {confirm === p.id && (
                  <div className="cpay__strip">
                    <div>
                      <b>Received {peso(p.amount)} cash from {p.studentName}?</b>
                      <small>The student will be notified.</small>
                    </div>
                    <div className="cpay__stripacts">
                      <button className="cpay__cancelbtn" onClick={() => setConfirm(null)}>Cancel</button>
                      <button className="cpay__confirmbtn" onClick={() => markPaid(p.id)} disabled={busy}>
                        {busy ? '…' : 'Yes, Mark as Paid'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
            {Array.from(
              { length: Math.max(0, PAGE_SIZE - paged.length - (total === 0 ? 1 : 0)) },
              (_, index) => (
                <div
                  key={`payment-placeholder-${index}`}
                  className={`cpay__trow cpay__paymentrow cpay__trow--placeholder ${tab === 'paid' ? 'cpay__trow--noaction' : ''}`}
                  aria-hidden="true"
                />
              )
            )}
          </div>
        </div>
        <Pagination total={total} page={page} onPage={p => { setPage(p); setConfirm(null); }} />
      </div>
    </div>
  );
}