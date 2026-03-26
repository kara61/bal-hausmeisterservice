import { useState, useEffect } from 'react';
import { api } from '../api/client';
import MonthPicker from '../components/MonthPicker';

export default function Reports() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [reports, setReports] = useState([]);
  const [generating, setGenerating] = useState(false);

  const load = async () => {
    const data = await api.get('/reports');
    setReports(data);
  };

  useEffect(() => { load(); }, []);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      await api.post('/reports/generate', { month, year });
      load();
    } finally {
      setGenerating(false);
    }
  };

  const handleDownload = (id) => {
    const token = localStorage.getItem('token');
    window.open(`/api/reports/${id}/download?token=${token}`);
  };

  const handleStatusUpdate = async (id, status) => {
    await api.put(`/reports/${id}`, { status });
    load();
  };

  const statusLabels = { draft: 'Entwurf', reviewed: 'Geprueft', sent: 'Gesendet' };
  const statusColors = { draft: '#fefcbf', reviewed: '#bee3f8', sent: '#c6f6d5' };
  const monthNames = ['Januar', 'Februar', 'Maerz', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

  return (
    <div>
      <h1 style={{ marginBottom: '1rem' }}>Berichte</h1>
      <div style={{ background: 'white', padding: '1.5rem', borderRadius: '8px', boxShadow: '0 1px 4px rgba(0,0,0,0.1)', marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1rem', marginBottom: '0.75rem' }}>Neuen Bericht erstellen</h2>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <MonthPicker month={month} year={year} onChange={(m, y) => { setMonth(m); setYear(y); }} />
          <button onClick={handleGenerate} disabled={generating} style={{
            padding: '0.5rem 1.5rem', background: generating ? '#aaa' : '#1a365d',
            color: 'white', border: 'none', borderRadius: '4px', cursor: generating ? 'default' : 'pointer',
          }}>
            {generating ? 'Wird erstellt...' : 'Bericht erstellen'}
          </button>
        </div>
      </div>
      <table style={{ width: '100%', background: 'white', borderRadius: '8px', borderCollapse: 'collapse', boxShadow: '0 1px 4px rgba(0,0,0,0.1)' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
            <th style={{ padding: '0.75rem', textAlign: 'left' }}>Monat</th>
            <th style={{ padding: '0.75rem', textAlign: 'left' }}>Erstellt am</th>
            <th style={{ padding: '0.75rem', textAlign: 'left' }}>Status</th>
            <th style={{ padding: '0.75rem', textAlign: 'left' }}>Aktionen</th>
          </tr>
        </thead>
        <tbody>
          {reports.map(r => (
            <tr key={r.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
              <td style={{ padding: '0.75rem' }}>{monthNames[r.month - 1]} {r.year}</td>
              <td style={{ padding: '0.75rem' }}>{r.generated_at ? new Date(r.generated_at).toLocaleDateString('de-DE') : '-'}</td>
              <td style={{ padding: '0.75rem' }}>
                <span style={{ padding: '0.15rem 0.5rem', borderRadius: '12px', background: statusColors[r.status], fontSize: '0.8rem' }}>
                  {statusLabels[r.status]}
                </span>
              </td>
              <td style={{ padding: '0.75rem', display: 'flex', gap: '0.25rem' }}>
                {r.pdf_path && (
                  <button onClick={() => handleDownload(r.id)}
                    style={{ padding: '0.25rem 0.5rem', background: '#edf2f7', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Download PDF</button>
                )}
                {r.status === 'draft' && (
                  <button onClick={() => handleStatusUpdate(r.id, 'reviewed')}
                    style={{ padding: '0.25rem 0.5rem', background: '#bee3f8', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Als geprueft markieren</button>
                )}
                {r.status === 'reviewed' && (
                  <button onClick={() => handleStatusUpdate(r.id, 'sent')}
                    style={{ padding: '0.25rem 0.5rem', background: '#c6f6d5', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Als gesendet markieren</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
