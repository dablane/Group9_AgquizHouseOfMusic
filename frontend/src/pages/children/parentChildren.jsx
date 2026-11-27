import { useEffect, useState } from 'react';
import { api } from '../../../services/api.js';
import Staff from '../../student/Staff.jsx';
import '../../student/staff.css';
import '../parent.css';
import './parentChildren.css';

const CHILD_COLORS = ['var(--avatar-coral)','var(--avatar-orange)','var(--avatar-yellow)','var(--avatar-green)','var(--avatar-blue)','var(--avatar-purple)','var(--avatar-pink)'];
const INSTRUMENT_OPTIONS = ['Guitar', 'Bass', 'Voice', 'Piano', 'Drums'];
const EXPERIENCE_OPTIONS = ['Never played', 'A few lessons', 'Played a while'];
const childColor  = name => CHILD_COLORS[(name?.charCodeAt(0)||0) % CHILD_COLORS.length];
const initials    = name => name?.split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase() || '?';
const birthdayLabel = value => {
  if (!value) return 'Not set';
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime())
    ? 'Not set'
    : date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
};
const experienceLabel = level => ({
  'Never played': 'New',
  'A few lessons': 'Some',
  'Played a while': 'Regular',
}[level] || level || '—');

function ChildModal({ child, onClose, onSaved }) {
  const [form, setForm] = useState(() => ({
    childName: child?.name || '',
    birthday: child?.birthday ? String(child.birthday).slice(0, 10) : '',
    instruments: child?.instruments || [],
    level: child?.level || 'Never played',
    notes: child?.notes || ''
  }));
  const [saving, setSaving] = useState(false);
  const [err, setErr]       = useState('');
  const experienceOptions = form.level && !EXPERIENCE_OPTIONS.includes(form.level)
    ? [form.level, ...EXPERIENCE_OPTIONS]
    : EXPERIENCE_OPTIONS;

  const save = async () => {
    if (!form.childName.trim()) return setErr("Enter your child's name.");
    setSaving(true); setErr('');
    try {
      if (child) {
        await api.patch(`/parent/children/${child.id}`, {
          birthday: form.birthday,
          instruments: form.instruments,
          level: form.level,
          notes: form.notes
        });
      } else {
        await api.post('/parent/children', { ...form });
      }
      await onSaved(form.childName.trim(), child?.id || null);
    } catch(e) { setErr(e.message); setSaving(false); }
  };

  return (
    <div className="pc__overlay">
      <button type="button" className="pc__backdrop" onClick={onClose} aria-label="Close child profile dialog" />
      <div className="pc__modal" role="dialog" aria-modal="true" aria-labelledby="child-modal-title">
        <div className="pc__modalhead">
          <div className="pc__modaltitle" id="child-modal-title">{child ? 'Edit child profile' : 'Add a child'}</div>
          <button className="btn-icon pc__modalclose" onClick={onClose} aria-label="Close dialog">×</button>
        </div>

        {err && <p className="pc__formerr">{err}</p>}

        <div className="pc__field">
          <label>Child's name</label>
          <input placeholder="First and last name" value={form.childName}
            readOnly={Boolean(child)}
            onChange={e => setForm(f=>({...f,childName:e.target.value}))} autoFocus={!child} />
          {child && <small className="pc__fieldhint">The name is linked to lesson records and cannot be changed here.</small>}
        </div>
        <div className="pc__field">
          <label>Birthday</label>
          <input type="date" value={form.birthday}
            onChange={e => setForm(f=>({...f,birthday:e.target.value}))} />
        </div>
        <div className="pc__field">
          <label>Have they played before?</label>
          <div className="pc__pills">
            {experienceOptions.map(l => (
              <button type="button" key={l} className={`pc__pill-btn ${form.level===l?'on':''}`}
                aria-pressed={form.level === l}
                onClick={() => setForm(f=>({...f,level:l}))}>{l}</button>
            ))}
          </div>
        </div>
        <div className="pc__field">
          <label>Instruments</label>
          <div className="pc__pills">
            {INSTRUMENT_OPTIONS.map(instrument => (
              <button type="button" key={instrument}
                className={`pc__pill-btn ${form.instruments.includes(instrument) ? 'on' : ''}`}
                aria-pressed={form.instruments.includes(instrument)}
                onClick={() => setForm(f => ({
                  ...f,
                  instruments: f.instruments.includes(instrument)
                    ? f.instruments.filter(item => item !== instrument)
                    : [...f.instruments, instrument]
                }))}>
                {instrument}
              </button>
            ))}
          </div>
        </div>
        <div className="pc__field">
          <label>Anything the coach should know? (optional)</label>
          <textarea placeholder="e.g. shy at first, left-handed" rows={3} maxLength={2000}
            value={form.notes} onChange={e => setForm(f=>({...f,notes:e.target.value}))} />
        </div>
        <div className="pc__modalbtns">
          <button className="btn-secondary pc__cancelbtn" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn-primary pc__savebtn" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : child ? 'Save changes' : 'Save child'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ParentChildren() {
  const [children, setChildren]           = useState([]);
  const [loading, setLoading]             = useState(true);
  const [selectedId, setSelectedId]       = useState('');
  const [showAdd, setShowAdd]             = useState(false);
  const [editingChild, setEditingChild]   = useState(null);
  const [flash, setFlash]                 = useState('');
  const [flashType, setFlashType]         = useState('ok');
  const [error, setError]                 = useState('');
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removing, setRemoving]           = useState(false);
  const [showActions, setShowActions]     = useState(false);

  const load = (keepSelected = false) => {
    setLoading(true);
    api.get('/parent/children')
      .then(d => {
        const kids = d.children || [];
        setChildren(kids);
        if (!keepSelected && kids.length) setSelectedId(String(kids[0].id));
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const child = children.find(c => String(c.id) === String(selectedId)) || null;

  const showFlash = (msg, type = 'ok') => {
    setFlash(msg); setFlashType(type);
    setTimeout(() => setFlash(''), 3500);
  };

  const handleSaved = async (name, editedChildId = null) => {
    setShowAdd(false);
    setEditingChild(null);
    setLoading(true);
    setError('');
    showFlash(`${name} has been ${editedChildId ? 'updated' : 'added'}!`);
    try {
      const d = await api.get('/parent/children');
      const kids = d.children || [];
      setChildren(kids);
      if (editedChildId) setSelectedId(String(editedChildId));
      else if (kids.length) setSelectedId(String(kids[kids.length - 1].id));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async () => {
    if (!child) return;
    setRemoving(true);
    try {
      await api.delete(`/parent/children/${child.id}`);
      setConfirmRemove(false);
      setShowActions(false);
      showFlash(`${child.name.split(' ')[0]} has been removed.`);
      const d = await api.get('/parent/children');
      const kids = d.children || [];
      setChildren(kids);
      setSelectedId(kids.length ? String(kids[0].id) : '');
    } catch(e) { showFlash(e.message, 'err'); }
    finally { setRemoving(false); }
  };

  return (
    <div className="pp">
      {/* Header */}
      <div className="pc__pageheader">
        <div>
          <h1>My Children</h1>
          <p className="pp__sub">View your children’s profiles, experience, and learning notes.</p>
          <Staff />
        </div>
      </div>

      {error && <p className="pp__alert">{error}</p>}
      {flash && <div className={`pc__flash pc__flash--${flashType}`}>{flash}</div>}
      {loading && <p className="pc__muted">Loading…</p>}

      {(showAdd || editingChild) && (
        <ChildModal
          child={editingChild}
          onClose={() => { setShowAdd(false); setEditingChild(null); }}
          onSaved={handleSaved}
        />
      )}

      {!loading && children.length === 0 && (
        <div className="pc__emptystate">
          <div className="pc__emptyicon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--yellow)" strokeWidth="1.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          </div>
          <h2>No children enrolled yet</h2>
          <p>Add a child to create a profile with their experience, instruments, and notes for the coach.</p>
        </div>
      )}

      {!loading && (
        <div className="pc__childrengrid">
          {children.map(c => {
            const isSelected = String(c.id) === String(selectedId);
            return (
              <article key={c.id} className="pc__profilecard">
                <div className="pc__profiletop">
                  <div className="pc__bigavatar" style={{ background: childColor(c.name) }}>
                    {initials(c.name)}
                  </div>
                  <div className="pc__profileinfo">
                    <h2 className="pc__profilename">{c.name}</h2>
                    <div className="pc__profilemeta">
                      {c.age ? `${c.age} yrs old` : 'Age not set'}
                    </div>
                  </div>
                  <div className="pc__profileactions">
                    <span className="pc__activebadge">Active</span>
                    <div className="pc__actionmenu"
                      onBlur={event => {
                        if (!event.currentTarget.contains(event.relatedTarget)) setShowActions(false);
                      }}
                      onKeyDown={event => {
                        if (event.key === 'Escape') setShowActions(false);
                      }}>
                      <button className="btn-icon"
                        aria-label={`Actions for ${c.name}`}
                        aria-haspopup="menu"
                        aria-expanded={showActions && isSelected}
                        onClick={() => {
                          setSelectedId(String(c.id));
                          setShowActions(isSelected ? !showActions : true);
                          setConfirmRemove(false);
                        }}>
                        <span aria-hidden="true">⋯</span>
                      </button>
                      {showActions && isSelected && (
                        <div className="pc__actionmenuitems" role="menu">
                          <button type="button" role="menuitem"
                            onClick={() => { setShowActions(false); setEditingChild(c); }}>
                            Edit
                          </button>
                          <button type="button" role="menuitem"
                            onClick={() => { setShowActions(false); setConfirmRemove(true); }}>
                            Remove child
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {confirmRemove && isSelected && (
                  <div className="pc__removeconfirm">
                    <p>Remove {c.name.split(' ')[0]} from your account?</p>
                    <small>Their lesson history will stay in the system.</small>
                    <div className="pc__removeacts">
                      <button className="pc__removecancelbtn" onClick={() => setConfirmRemove(false)}>Cancel</button>
                      <button className="pc__removeyesbtn" onClick={handleRemove} disabled={removing}>
                        {removing ? '…' : 'Yes, remove'}
                      </button>
                    </div>
                  </div>
                )}

                <div className="pc__profilefacts">
                  <div className="pc__fact">
                    <span>Experience</span>
                    <b>{experienceLabel(c.level)}</b>
                  </div>
                  <div className="pc__fact">
                    <span>Lessons done</span>
                    <b>{c.completedCount ?? 0}</b>
                  </div>
                  <div className="pc__fact">
                    <span>Birthday</span>
                    <b>{birthdayLabel(c.birthday)}</b>
                  </div>
                  <div className="pc__fact">
                    <span>Enrolled</span>
                    <b>{c.joinedLabel || '—'}</b>
                  </div>
                  <div className="pc__fact pc__fact--wide">
                    <span>Instruments</span>
                    <div className="pc__instrumentrow">
                      {c.instruments?.length > 0
                        ? c.instruments.map(ins => <span key={ins} className="pc__insbadge">{ins}</span>)
                        : <span className="pc__instrumentempty">No instruments added</span>}
                    </div>
                  </div>
                  {c.notes?.trim() && (
                    <div className="pc__fact pc__fact--wide">
                      <span>Notes for coach</span>
                      <p>{c.notes}</p>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
          <button type="button" className="pc__addcard" onClick={() => { setEditingChild(null); setShowAdd(true); }}>
            <span className="pc__addcardicon" aria-hidden="true">+</span>
            <span>{children.length > 0 ? 'Add another child' : 'Add a child'}</span>
          </button>
        </div>
      )}
    </div>
  );
}
