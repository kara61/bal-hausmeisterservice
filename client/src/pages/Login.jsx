import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LanguageContext';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { login } = useAuth();
  const { t } = useLang();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await login(username, password);
      navigate('/');
    } catch (err) {
      setError(t('login.error'));
    }
  };

  return (
    <div className="login-screen">
      <div className="login-bg" />
      <div className="login-grid" />

      <form onSubmit={handleSubmit} className="login-card animate-fade-in">
        <div className="login-brand">
          <img src="/logo.png" alt="Bal Hausmeisterservice" className="login-logo" />
          <div className="login-brand-bar" />
          <div className="login-brand-sub">{t('login.subtitle')}</div>
        </div>

        {error && <div className="login-error">{error}</div>}

        <input
          type="text"
          placeholder={t('login.username')}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="login-input"
          autoComplete="username"
        />

        <input
          type="password"
          placeholder={t('login.password')}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="login-input"
          autoComplete="current-password"
        />

        <button type="submit" className="login-btn">
          {t('login.submit')}
        </button>
      </form>
    </div>
  );
}
