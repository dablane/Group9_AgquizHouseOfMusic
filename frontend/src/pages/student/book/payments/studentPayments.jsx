import { useEffect, useState } from 'react';
import { api } from '../../../services/api.js';
import Staff from '../Staff.jsx';
import '../staff.css';
import './studentPayments.css';

const PAGE_SIZE = 5;
const peso = n => `₱${Number(n).toLocaleString('en-PH')}`;

function Pagination({ total, page, onPage }) {
  const totalPages = Math.ceil(total / PAGE_SIZE) || 1;
  return (
    <div className="sp__pagination">
      <span className="sp__paginfo">{total === 0 ? 'No records' : `Page ${page} of ${totalPages}`}</span>
      <div className="sp__pagbtns">
        <button aria-label="Previous page" className="sp__pagbtn" disabled={page <= 1} onClick={() => onPage(page - 1)}>‹</button>
        <button aria-label="Next page" className="sp__pagbtn" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>›</button>
      </div>
    </div>
  );
}

export default function StudentPayments() {
  const [data, setData] = useState(null);
  const [filter, setFilter] = useState('all');
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    api.get('/student/payments').then(setData).catch(e => setError(e.message));
  }, []);

  if (error) return <div className="sp"><p className="sp__alert">{error}</p></div>;
  if (!data) return <div className="sp"><p className="sp__muted">Loading…</p></div>;

  const { lessons, stats } = data;
  const filtered = filter === 'all' ? lessons : lessons.filter(l => l.paymentStatus === filter);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE) || 1;
  const currentPage = Math.min(page, totalPages);
  const paged = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <div className="sp">
      <div className="sp__header">
        <div>
          <h1>Payments</h1>
          <p className="sp__sub">Track your payments, one lesson at a time.</p>
        </div>
       
      </div>
      <Staff />

      {/* Stats */}
      <div className="sp__stats">
        <div className="sp__stat">
          <div className="sp__statlabel">Outstanding Balance</div>
          <div className="sp__statval">{peso(stats.outstanding)}</div>
          <div className="sp__stathint">{lessons.filter(l => l.paymentStatus === 'unpaid').length} unpaid balance</div>
        </div>
        <div className="sp__stat">
          <div className="sp__statlabel">Paid this Month</div>
          <div className="sp__statval">{peso(stats.paidThisMonth)}</div>
          <div className="sp__stathint">{stats.paidSessions} sessions</div>
        </div>
        <div className="sp__stat">
          <div className="sp__statlabel">Lesson Fee</div>
          <div className="sp__statval">{peso(stats.lessonFee)}</div>
          <div className="sp__stathint">60-minute Lesson</div>
        </div>
      </div>

      {/* History */}
      <div className="sp__section">
        <div className="sp__sectiontitle">Session Payment History</div>
        <div className="sp__filters">
          {['all', 'unpaid', 'paid'].map(f => (
            <button key={f} className={`sp__filter ${filter === f ? 'on' : ''}`} onClick={() => { setFilter(f); setPage(1); }}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <div className="sp__table">
          <div className="sp__thead">
            <span>Lesson / Schedule</span><span>Amount</span><span>Status</span>
          </div>
          {filtered.length === 0 && <p className="sp__empty">No {filter === 'all' ? '' : filter} payments.</p>}
          {paged.map((l, index) => (
            <div key={l.id} className={`sp__row ${index === paged.length - 1 && paged.length < PAGE_SIZE ? 'sp__row--last-content' : ''}`}>
              <div>
                <b>{l.dateLabel}</b>
                <small>{l.timeLabel} · {l.coachName}</small>
              </div>
              <span className="sp__amount">₱ {l.amount}</span>
              <span className={`sp__badge sp__badge--${l.paymentStatus}`}>
                {l.paymentStatus === 'paid' ? 'Paid' : 'Unpaid'}
              </span>
            </div>
          ))}
          {Array.from(
            { length: Math.max(0, PAGE_SIZE - paged.length - (filtered.length === 0 ? 1 : 0)) },
            (_, index) => <div key={`payment-placeholder-${index}`} className="sp__row sp__row--placeholder" aria-hidden="true" />
          )}
        </div>
        <Pagination total={filtered.length} page={currentPage} onPage={setPage} />
      </div>
    </div>
  );
}