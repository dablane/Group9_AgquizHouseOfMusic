import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../services/api.js';
import './paymentsPage.css';

const peso = n => `₱${Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = iso => iso ? new Date(`${iso}T12:00:00`).toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : '—';
const today = () => new Date().toLocaleDateString('en-CA');

export default function PaymentsPage() {
  const [payments, setPayments] = useState([]);
  const [unpaidBookings, setUnpaidBookings] = useState([]);
  const [bandCoaches, setBandCoaches] = useState([]);
  const [form, setForm] = useState({ bandBookingId: '', amount: '', receivedAt: today() });
  const [error, setError] = useState('');
  const [flash, setFlash] = useState('');
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState(null); // payment row for division
  const [shares, setShares] = useState(null);     // division preview shares
  const [dividing, setDividing] = useState(false);
  const [loading, setLoading] = useState(true);

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.get('/admin/payments'),
      api.get('/admin/coaches')
    ])
      .then(([d, c]) => {
        setPayments(d.payments);
        setUnpaidBookings(d.unpaidBookings);
        // Only band coaches (inBand = true)
        setBandCoaches((c.coaches || []).filter(coach => coach.inBand));
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  // Compute share preview when a payment is selected
  useEffect(() => {
    if (!selected) { setShares(null); return; }
    if (selected.divided) {
      // Fetch existing shares from server? We don't have an endpoint for that — recompute client-side
      // The divide endpoint would have returned shares; but here we just show the amount
      setShares(null);
      return;
    }
    // We'll show a preview using the same division logic
    setShares(null); // will be fetched after divide
  }, [selected]);

  const previewShares = payment => {
    if (!payment) return [];
    const coaches = bandCoaches.length > 0 ? bandCoaches : Array.from({ length: 4 }, (_, i) => ({ name: `Coach ${i + 1}` }));
    const totalCents = Math.round(payment.amount * 100);
    const count = coaches.length || 4;
    const base = Math.floor(totalCents / count);
    const remainder = totalCents % count;
    return coaches.map((c, i) => ({
      name: c.name,
      amount: (base + (i === 0 ? remainder : 0)) / 100
    }));
  };

  // Empty shares using coach names (for when no payment is selected)
  const emptyShares = bandCoaches.length > 0
    ? bandCoaches.map(c => ({ name: c.name, amount: null }))
    : Array.from({ length: 4 }, (_, i) => ({ name: `Coach ${i + 1}`, amount: null }));

  const record = async () => {
    setError(''); setFlash('');
    if (!form.bandBookingId) return setError('Choose a band booking.');
    if (!form.amount || Number(form.amount) <= 0) return setError('Enter a positive amount.');
    if (!form.receivedAt) return setError('Choose a date received.');
    setBusy(true);
    try {
      await api.post('/admin/payments', {
        bandBookingId: Number(form.bandBookingId),
        amount: Number(form.amount),
        receivedAt: form.receivedAt
      });
      setFlash('Payment recorded.');
      setForm({ bandBookingId: '', amount: '', receivedAt: today() });
      load();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  const confirmDivide = async () => {
    if (!selected) return;
    setDividing(true); setError(''); setFlash('');
    try {
      const res = await api.post(`/admin/payments/${selected.id}/divide`);
      setShares(res.shares);
      setFlash('Payment divided between band members.');
      load();
      setSelected(prev => ({ ...prev, divided: true }));
    } catch (e) { setError(e.message); } finally { setDividing(false); }
  };

  const selectPayment = p => {
    if (selected?.id === p.id) { setSelected(null); setShares(null); return; }
    setSelected(p);
    setShares(null);
  };

  return (
    <div className="bp">
      <div className="bp__head">
        <div>
          <div className="bp__eyebrow">Payments</div>
          <h1>Band payments</h1>
          <p className="bp__sub">Record cash collected for band lessons and divide it between coaches.</p>
        </div>
      </div>

      {error && <p className="bp__alert" role="alert">{error}</p>}
      {flash && <p className="bp__flash" role="status">{flash}</p>}

      <div className="bp__layout">
        {/* Left column */}
        <div className="bp__left">
          {/* Record form */}
          <section className="bp__card bp__form">
            <h2>Record a payment</h2>
            <label>Band booking
              <select value={form.bandBookingId} onChange={set('bandBookingId')}>
                <option value="">— Choose an approved booking —</option>
                {unpaidBookings.map(b => (
                  <option key={b.id} value={b.id}>
                    {b.date_label} · {b.for_name} · Band lesson
                  </option>
                ))}
              </select>
            </label>
            {unpaidBookings.length === 0 && !loading && (
              <p className="bp__hint">No approved bookings without a payment yet.</p>
            )}
            <div className="bp__formrow">
              <label>Amount received (₱)
                <input type="number" min="1" step="0.01" value={form.amount} onChange={set('amount')} placeholder="0.00" />
              </label>
              <label>Date received
                <input type="date" value={form.receivedAt} onChange={set('receivedAt')} max={today()} />
              </label>
            </div>
            <div className="bp__formacts">
              <button className="bp__btn bp__btn--p" onClick={record} disabled={busy}>
                {busy ? 'Saving…' : 'Record payment'}
              </button>
            </div>
          </section>

          {/* Payment list — stretches to match division summary height */}
          <section className="bp__card bp__table bp__table--stretch">
            <h2 className="bp__tabletitle">All payments</h2>
            <div className="bp__row bp__row--head">
              <span>Date</span><span>Booking</span><span>Amount</span><span>Status</span>
            </div>
            <div className="bp__tablebody">
              {loading && <div className="bp__empty">Loading…</div>}
              {!loading && payments.length === 0 && <div className="bp__empty">No payments recorded yet.</div>}
              {payments.map(p => (
                <div
                  key={p.id}
                  className={`bp__row ${!p.divided ? 'bp__row--link' : ''} ${selected?.id === p.id ? 'bp__row--sel' : ''}`}
                  onClick={() => !p.divided && selectPayment(p)}
                  role={!p.divided ? 'button' : undefined}
                  tabIndex={!p.divided ? 0 : undefined}
                  onKeyDown={e => !p.divided && e.key === 'Enter' && selectPayment(p)}>
                  <span>{fmtDate(p.receivedAt)}</span>
                  <div>
                    <b>{p.forName}</b>
                    <small>{fmtDate(p.bookingDate)} · {p.bookingStart}</small>
                  </div>
                  <span className="bp__amount">{peso(p.amount)}</span>
                  <span>
                    {p.divided
                      ? <span className="bp__badge bp__badge--green">Divided</span>
                      : <span className="bp__badge bp__badge--amber">Not divided</span>}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Right panel — always visible */}
        <aside className="bp__panel">
          <div className="bp__panelcard">
            <h2 className="bp__paneltitle">Division summary</h2>

            {/* Meta — blank when no payment selected */}
            <div className="bp__panelmeta">
              {selected ? (
                <>
                  <div><b>{selected.forName}</b></div>
                  <div className="bp__muted">{fmtDate(selected.bookingDate)} · {selected.bookingStart}</div>
                  <div className="bp__paneltotal">{peso(selected.amount)}</div>
                </>
              ) : (
                <>
                  <div className="bp__panelblank bp__panelblank--name" />
                  <div className="bp__panelblank bp__panelblank--sub" />
                  <div className="bp__panelblank bp__panelblank--amt" />
                </>
              )}
            </div>

            {/* Coach shares — always show coaches, blank amounts when no payment */}
            <div className="bp__shares">
              {(selected ? previewShares(selected) : emptyShares).map((s, i) => (
                <div key={i} className="bp__share">
                  <span>{s.name}</span>
                  <span className="bp__shareamount">
                    {s.amount !== null ? peso(s.amount) : <span className="bp__blankamt">—</span>}
                  </span>
                </div>
              ))}
            </div>

            {/* Total */}
            <div className="bp__sharetotal">
              <span>Total</span>
              <span>{selected ? peso(selected.amount) : '—'}</span>
            </div>

            <p className="bp__panelnote">
              {selected
                ? 'Shares use exact centavos. A leftover centavo goes to the first band member.'
                : 'Select a payment from the list to preview the division.'}
            </p>

            {selected && !selected.divided && (
              <div className="bp__panelacts">
                <button className="bp__btn" onClick={() => { setSelected(null); setShares(null); }}>Cancel</button>
                <button className="bp__btn bp__btn--p" onClick={confirmDivide} disabled={dividing}>
                  {dividing ? 'Dividing…' : 'Confirm division'}
                </button>
              </div>
            )}
            {selected?.divided && (
              <div className="bp__badge bp__badge--green" style={{ marginTop: 14 }}>Already divided</div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}