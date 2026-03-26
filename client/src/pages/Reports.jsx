import { useState, useEffect } from 'react';
import { api } from '../api/client';
import MonthPicker from '../components/MonthPicker';

const STATUS_BADGES = { draft: 'badge-warning', reviewed: 'badge-info', sent: 'badge-success' };
const STATUS_LABELS = { draft: 'Entwurf', reviewed: 'Geprueft', sent: 'Gesendet' };
const MONTH_NAMES = ['Januar', 'Februar', 'Maerz', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

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

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <h1 className="page-title">Berichte</h1>
      </div>

      <div className="card mb-lg">
        <div className="card-title mb-md">Neuen Bericht erstellen</div>
        <div className="flex gap-md items-center flex-wrap">
          <MonthPicker month={month} year={year} onChange={(m, y) => { setMonth(m); setYear(y); }} />
          <button onClick={handleGenerate} disabled={generating} className="btn btn-primary">
            {generating ? 'Wird erstellt...' : 'Bericht erstellen'}
          </button>
        </div>
      </div>

      <div className="data-table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>Monat</th>
              <th>Erstellt am</th>
              <th>Status</th>
              <th>Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {reports.map(r => (
              <tr key={r.id}>
                <td style={{ fontWeight: 600 }}>{MONTH_NAMES[r.month - 1]} {r.year}</td>
                <td><span className="mono">{r.generated_at ? new Date(r.generated_at).toLocaleDateString('de-DE') : '—'}</span></td>
                <td><span className={`badge ${STATUS_BADGES[r.status] || 'badge-neutral'}`}>{STATUS_LABELS[r.status]}</span></td>
                <td>
                  <div className="flex gap-xs">
                    {r.pdf_path && (
                      <button onClick={() => handleDownload(r.id)} className="btn btn-secondary btn-sm">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                        PDF
                      </button>
                    )}
                    {r.status === 'draft' && (
                      <button onClick={() => handleStatusUpdate(r.id, 'reviewed')} className="btn btn-info btn-sm" style={{ background: 'var(--info-soft)', color: 'var(--info)', borderColor: 'var(--info-border)' }}>
                        Als geprueft
                      </button>
                    )}
                    {r.status === 'reviewed' && (
                      <button onClick={() => handleStatusUpdate(r.id, 'sent')} className="btn btn-success btn-sm">
                        Als gesendet
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {reports.length === 0 && (
              <tr><td colSpan={4}><div className="empty-state"><div className="empty-state-text">Keine Berichte vorhanden</div></div></td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
