import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await login(username, password);
      navigate('/');
    } catch (err) {
      setError('Ungueltige Anmeldedaten');
    }
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
      <form onSubmit={handleSubmit} style={{
        background: 'white', padding: '2rem', borderRadius: '8px', boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
        width: '100%', maxWidth: '360px',
      }}>
        <h1 style={{ fontSize: '1.5rem', marginBottom: '0.5rem', textAlign: 'center' }}>Bal Hausmeisterservice</h1>
        <p style={{ textAlign: 'center', color: '#666', marginBottom: '1.5rem' }}>Admin Login</p>
        {error && <p style={{ color: 'red', marginBottom: '1rem' }}>{error}</p>}
        <input type="text" placeholder="Benutzername" value={username}
          onChange={e => setUsername(e.target.value)}
          style={{ width: '100%', padding: '0.75rem', marginBottom: '0.75rem', border: '1px solid #ddd', borderRadius: '4px' }} />
        <input type="password" placeholder="Passwort" value={password}
          onChange={e => setPassword(e.target.value)}
          style={{ width: '100%', padding: '0.75rem', marginBottom: '1rem', border: '1px solid #ddd', borderRadius: '4px' }} />
        <button type="submit" style={{
          width: '100%', padding: '0.75rem', background: '#1a365d', color: 'white',
          border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '1rem',
        }}>Anmelden</button>
      </form>
    </div>
  );
}
