import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../services/api.js';
import './coachesPage.css';

const INSTRUMENTS = ['Drums', 'Piano', 'Voice', 'Guitar', 'Bass'];

function daysLeft(isoDate) {
  if (!isoDate) return 0;
  return Math.max(0, Math.ceil((new Date(isoDate) - Date.now()) / 86400000));
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

function StatusBadge({ coach }) {
  if (coach.status === 'active') return <span className="co__badge co__badge--green">Active</span>;
  if (coach.status === 'invited') return <span className="co__badge co__badge--blue">Invited · {daysLeft(coach.inviteExpiresAt)}d left</span>;
  if (coach.status === 'expired') return <span className="co__badge co__badge--red">Invite expired</span>;
  return <span className="co__badge co__badge--grey">Inactive</span>;
}

function Toggle({ checked, onChange, label }) {
  return (
    <label className="co__toggle" aria-label={label}>
      <input type="checkbox" checked={checked} onChange={onChange} />
      <span className="co__track"><span className="co__thumb" /></span>
    </label>
  );
}

export default function CoachesPage() {
  const [coaches, setCoaches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [flash, setFlash] = useState('');
  const [inviteBanner, setInviteBanner] = useState(null);

  // Add form state
  const [form, setForm] = useState({ fullName: '', email: '', instruments: [], inBand: true });
  const [formError, setFormError] = useState('');
  const [sending, setSending] = useState(false);

  // Per-coach confirm state
  const [confirm, setConfirm] = useState(null); // { id, type: 'deactivate'|'reactivate' }

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const load = useCallback(() => {
    setLoading(true);
    api.get('/admin/coaches')
      .then(d => setCoaches(d.coaches))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleInstrument = inst => {
    setForm(f => ({
      ...f,
      instruments: f.instruments.includes(inst)
        ? f.instruments.filter(i => i !== inst)
        : [...f.instruments, inst]
    }));
  };

  const sendInvite = async () => {
    setFormError(''); setFlash(''); setInviteBanner(null);
    if (!form.fullName.trim()) return setFormError('Enter the coach\'s full name.');
    if (!form.email.trim()) return setFormError('Enter a valid email address.');
    if (!form.instruments.length) return setFormError('Choose at least one instrument.');
    setSending(true);
    try {
      const res = await api.post('/admin/coaches', { ...form });
      setInviteBanner({
        name: res.coach.name,
        email: res.coach.email,
        expires: res.inviteExpiresAt,
        link: res.inviteLink,
        emailSent: res.emailSent
      });
      setForm({ fullName: '', email: '', instruments: [], inBand: true });
      load();
    } catch (e) { setFormError(e.message); } finally { setSending(false); }
  };

  const resendInvite = async coach => {
    setError(''); setFlash(''); setInviteBanner(null);
    try {
      const res = await api.post(`/admin/coaches/${coach.id}/invite`);
      setInviteBanner({
        name: res.coach.name,
        email: res.coach.email,
        expires: res.inviteExpiresAt,
        link: res.inviteLink,
        emailSent: res.emailSent
      });
      load();
    } catch (e) { setError(e.message); }
  };

  const copyLink = link => {
    navigator.clipboard.writeText(link).then(() => setFlash('Invite link copied to clipboard.'));
  };

  const patchCoach = async (id, body) => {
    setError(''); setFlash('');
    try {
      await api.patch(`/admin/coaches/${id}`, body);
      setFlash('Coach updated.');
      load();
    } catch (e) { setError(e.message); }
  };

  const confirmAction = async () => {
    if (!confirm) return;
    const { id, type } = confirm;
    setConfirm(null);
    if (type === 'deactivate') await patchCoach(id, { isActive: false });
    if (type === 'reactivate') await patchCoach(id, { isActive: true });
  };

  return (
    <div className="co">
      <div className="co__eyebrow">Coaches</div>
      <h1>Coaches</h1>
      <p className="co__sub">Add coaches and manage their band membership and status.</p>

      {error && <p className="co__alert" role="alert">{error}</p>}
      {flash && <p className="co__flash" role="status">{flash}</p>}

      {inviteBanner && (
        <div className="co__banner">
          <div>
            <b>Invite {inviteBanner.emailSent ? 'sent' : 'ready'} for {inviteBanner.name} ({inviteBanner.email})</b>
            <span> — expires {fmtDate(inviteBanner.expires)}</span>
          </div>
          {!inviteBanner.emailSent && inviteBanner.link && (
            <div className="co__bannerlink">
              Email is not configured. Copy and send this link manually:
              <code className="co__code">{inviteBanner.link}</code>
              <button className="co__btn" onClick={() => copyLink(inviteBanner.link)}>Copy link</button>
            </div>
          )}
          <button className="co__bannerclose" onClick={() => setInviteBanner(null)} aria-label="Dismiss">✕</button>
        </div>
      )}

      {/* Add coach form */}
      <section className="co__card co__form">
        <h2>Add a coach</h2>
        <div className="co__formgrid">
          <label>Full name
            <input value={form.fullName} onChange={set('fullName')} placeholder="e.g. Juan dela Cruz" />
          </label>
          <label>Email
            <input type="email" value={form.email} onChange={set('email')} placeholder="coach@example.com" />
          </label>
        </div>
        <div className="co__formsection">
          <span className="co__formlabel">Instruments</span>
          <div className="co__instpills">
            {INSTRUMENTS.map(inst => (
              <button key={inst} type="button"
                className={`co__instpill ${form.instruments.includes(inst) ? 'on' : ''}`}
                onClick={() => toggleInstrument(inst)}>
                {inst}
              </button>
            ))}
          </div>
        </div>
        <label className="co__inbandrow">
          <input type="checkbox" checked={form.inBand} onChange={e => setForm(f => ({ ...f, inBand: e.target.checked }))} />
          In the studio band
        </label>
        {formError && <p className="co__alert" role="alert">{formError}</p>}
        <div className="co__formacts">
          <button className="co__btn co__btn--p" onClick={sendInvite} disabled={sending}>
            {sending ? 'Sending…' : 'Send invite'}
          </button>
        </div>
      </section>

      {/* Coach list */}
      <section className="co__card co__table">
        <div className="co__row co__row--head">
          <span>Coach</span><span>Instruments</span><span>Band</span><span>Status</span><span />
        </div>
        {loading && <div className="co__empty">Loading coaches…</div>}
        {!loading && coaches.length === 0 && <div className="co__empty">No coaches yet. Add one above.</div>}
        {coaches.map(c => (
          <div key={c.id}>
            <div className="co__row">
              <div>
                <b>{c.name}</b>
                <small>{c.email}</small>
              </div>
              <div className="co__insts">
                {c.instruments.length ? c.instruments.map(i => <span key={i} className="co__instchip">{i}</span>) : <span className="co__muted">—</span>}
              </div>
              <div>
                <Toggle
                  checked={c.inBand}
                  label={`${c.name} in band`}
                  onChange={() => patchCoach(c.id, { inBand: !c.inBand })}
                />
              </div>
              <div><StatusBadge coach={c} /></div>
              <div className="co__acts">
                {c.status === 'active' && (
                  <button className="co__btn co__btn--d" onClick={() => setConfirm({ id: c.id, type: 'deactivate' })}>
                    Deactivate
                  </button>
                )}
                {c.status === 'inactive' && (
                  <button className="co__btn" onClick={() => setConfirm({ id: c.id, type: 'reactivate' })}>
                    Reactivate
                  </button>
                )}
                {(c.status === 'invited' || c.status === 'expired') && (
                  <div className="co__acts">
                    {c.status === 'invited' && (
                      <button className="co__btn" onClick={() => copyLink(`${window.location.origin}/set-password/`)}>
                        Copy link
                      </button>
                    )}
                    <button className="co__btn co__btn--p" onClick={() => resendInvite(c)}>
                      Resend invite
                    </button>
                  </div>
                )}
              </div>
            </div>
            {confirm?.id === c.id && confirm.type === 'deactivate' && (
              <div className="co__strip co__strip--warn">
                <div>
                  <b>Deactivate {c.name}?</b>
                  <small>They will not be able to log in. Any upcoming lessons and band bookings will need a new coach.</small>
                </div>
                <div className="co__acts">
                  <button className="co__btn" onClick={() => setConfirm(null)}>Cancel</button>
                  <button className="co__btn co__btn--dr" onClick={confirmAction}>Yes, deactivate</button>
                </div>
              </div>
            )}
            {confirm?.id === c.id && confirm.type === 'reactivate' && (
              <div className="co__strip co__strip--warn">
                <div>
                  <b>Reactivate {c.name}?</b>
                  <small>They will be able to log in again.</small>
                </div>
                <div className="co__acts">
                  <button className="co__btn" onClick={() => setConfirm(null)}>Cancel</button>
                  <button className="co__btn co__btn--p" onClick={confirmAction}>Yes, reactivate</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}