import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../services/api.js';
import './peoplePage.css';

const fmtDate = iso => iso
  ? new Date(`${iso}T12:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
  : '—';

const initials = name => (name || 'U').split(' ').map(w => w[0]).slice(0,2).join('').toUpperCase();

const AVATAR_COLORS = [
  '#1c2456','#2563eb','#7c3aed','#db2777','#059669',
  '#d97706','#dc2626','#0891b2','#65a30d','#9333ea'
];
const avatarColor = name => AVATAR_COLORS[(name?.charCodeAt(0) || 0) % AVATAR_COLORS.length];

export default function PeoplePage() {
  const [tab, setTab]           = useState('parent');
  const [people, setPeople]     = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [search, setSearch]     = useState('');
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [counts, setCounts]     = useState({ parent: 0, student: 0 });

  const load = useCallback(role => {
    setLoading(true); setError(''); setPeople([]); setFiltered([]);
    api.get(`/admin/people?role=${role}`)
      .then(d => {
        setPeople(d.people);
        setFiltered(d.people);
        setCounts(prev => ({ ...prev, [role]: d.people.length }));
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(tab); }, [tab, load]);

  useEffect(() => {
    const q = search.toLowerCase();
    setFiltered(people.filter(p =>
      p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q)));
  }, [search, people]);

  const totalBookings = filtered.reduce((s, p) => s + (p.bandBookings || 0), 0);

  return (
    <div className="ppl">
      {/* Header */}
      <div className="ppl__head">
        <div>
          <h1>Parents &amp; Students</h1>
          <p className="ppl__sub">Everyone registered in RemDrumStudio.</p>
        </div>
      </div>

      {error && <p className="ppl__alert">{error}</p>}

      {/* Stats strip */}
      <div className="ppl__stats">
        <div className="ppl__stat">
          <div className="ppl__statlabel">Total Parents</div>
          <div className="ppl__statval">{counts.parent}</div>
        </div>
        <div className="ppl__stat">
          <div className="ppl__statlabel">Total Students</div>
          <div className="ppl__statval">{counts.student}</div>
        </div>
        <div className="ppl__stat">
          <div className="ppl__statlabel">
            {tab === 'parent' ? 'Parents' : 'Students'} shown
          </div>
          <div className="ppl__statval">{filtered.length}</div>
        </div>
        <div className="ppl__stat">
          <div className="ppl__statlabel">Band bookings</div>
          <div className="ppl__statval">{totalBookings}</div>
        </div>
      </div>

      {/* Tabs + Search row */}
      <div className="ppl__toolbar">
        <div className="ppl__tabs">
          {[['parent','Parents'],['student','Students']].map(([key, label]) => (
            <button key={key}
              className={`ppl__tab ${tab === key ? 'on' : ''}`}
              onClick={() => { setTab(key); setSearch(''); }}>
              {label}
              <span className="ppl__tabcount">{counts[key]}</span>
            </button>
          ))}
        </div>

        <div className="ppl__searchbox">
          <svg className="ppl__searchicon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            className="ppl__search"
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={`Search ${tab === 'parent' ? 'parents' : 'students'}…`}
          />
        </div>
      </div>

      {/* Table */}
      <section className="ppl__card">
        <div className="ppl__row ppl__row--head">
          <span>Name</span>
          <span>Email</span>
          <span>Joined</span>
          <span>Band Bookings</span>
          <span>Status</span>
        </div>

        {loading && <div className="ppl__empty">Loading…</div>}

        {!loading && filtered.length === 0 && (
          <div className="ppl__empty">
            {search
              ? `No results for "${search}".`
              : `No ${tab === 'parent' ? 'parents' : 'students'} registered yet.`}
          </div>
        )}

        {filtered.map(p => (
          <div key={p.id} className="ppl__row ppl__row--hover">
            {/* Name + avatar */}
            <div className="ppl__who">
              <span className="ppl__avatar" style={{ background: avatarColor(p.name) }}>
                {initials(p.name)}
              </span>
              <div>
                <div className="ppl__name">{p.name}</div>
                <div className="ppl__role">{tab === 'parent' ? 'Parent account' : 'Student'}</div>
              </div>
            </div>

            {/* Email */}
            <div className="ppl__email">{p.email}</div>

            {/* Joined */}
            <div className="ppl__date">{fmtDate(p.joinedAt)}</div>

            {/* Band bookings */}
            <div>
              {p.bandBookings > 0
                ? <span className="ppl__badge ppl__badge--blue">
                    {p.bandBookings} booking{p.bandBookings !== 1 ? 's' : ''}
                  </span>
                : <span className="ppl__none">—</span>}
            </div>

            {/* Status */}
            <div>
              <span className="ppl__badge ppl__badge--green">Active</span>
            </div>
          </div>
        ))}
      </section>

      {/* Footer count */}
      {!loading && filtered.length > 0 && (
        <div className="ppl__footer">
          Showing {filtered.length} {tab === 'parent' ? 'parent' : 'student'}{filtered.length !== 1 ? 's' : ''}
          {search && ` matching "${search}"`}
        </div>
      )}
    </div>
  );
}