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
    <div className="login-screen">
      <div className="login-bg" />
      <div className="login-grid" />

      <form onSubmit={handleSubmit} className="login-card animate-fade-in">
        <div className="login-brand">
          <div className="login-brand-name">Bal Hausmeisterservice</div>
          <div className="login-brand-bar" />
          <div className="login-brand-sub">Admin Panel</div>
        </div>

        {error && <div className="login-error">{error}</div>}

        <input
          type="text"
          placeholder="Benutzername"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="login-input"
          autoComplete="username"
        />

        <input
          type="password"
          placeholder="Passwort"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="login-input"
          autoComplete="current-password"
        />

        <button type="submit" className="login-btn">
          Anmelden
        </button>
      </form>
    </div>
  );
}
