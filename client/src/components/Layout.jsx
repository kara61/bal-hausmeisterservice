import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const navItems = [
  { path: '/', label: 'Dashboard' },
  { path: '/workers', label: 'Mitarbeiter' },
  { path: '/time-entries', label: 'Zeiterfassung' },
  { path: '/sick-leave', label: 'Krankmeldungen' },
  { path: '/vacation', label: 'Urlaub' },
  { path: '/reports', label: 'Berichte' },
  { path: '/properties', label: 'Objekte' },
  { path: '/daily-tasks', label: 'Tagesansicht' },
  { path: '/extra-jobs', label: 'Zusatzauftraege' },
];

export default function Layout() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <nav style={{
        width: '220px', background: '#1a365d', color: 'white', padding: '1rem 0',
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ padding: '0 1rem 1.5rem', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          <h2 style={{ fontSize: '1rem' }}>Bal HMS</h2>
          <p style={{ fontSize: '0.75rem', opacity: 0.7 }}>Admin Panel</p>
        </div>
        <div style={{ flex: 1, padding: '1rem 0' }}>
          {navItems.map(item => (
            <Link key={item.path} to={item.path} style={{
              display: 'block', padding: '0.6rem 1rem', color: 'white',
              textDecoration: 'none', fontSize: '0.9rem',
            }}>
              {item.label}
            </Link>
          ))}
        </div>
        <button onClick={handleLogout} style={{
          margin: '1rem', padding: '0.5rem', background: 'rgba(255,255,255,0.1)',
          color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer',
        }}>Abmelden</button>
      </nav>
      <main style={{ flex: 1, padding: '1.5rem' }}>
        <Outlet />
      </main>
    </div>
  );
}
