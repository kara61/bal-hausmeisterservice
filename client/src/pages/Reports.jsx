import { useState, useEffect } from 'react';
import { api } from '../api/client';
import { useLang } from '../context/LanguageContext';
import MonthPicker from '../components/MonthPicker';

export default function Reports() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [reports, setReports] = useState([]);
  const [generating, setGenerating] = useState(false);
  const { t, lang } = useLang();

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

  const statusBadge = { draft: 'badge-warning', reviewed: 'badge-info', sent: 'badge-success' };
  const statusLabel = (s) => t(`common.${s}`);

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <h1 className="page-title">{t('reports.title')}</h1>
      </div>

      <div className="card mb-lg">
        <div className="card-title mb-md">{t('reports.createNew')}</div>
        <div className="flex gap-md items-center flex-wrap">
          <MonthPicker month={month} year={year} onChange={(m, y) => { setMonth(m); setYear(y); }} />
          <button onClick={handleGenerate} disabled={generating} className="btn btn-primary">
            {generating ? t('reports.generating') : t('reports.generate')}
          </button>
        </div>
      </div>

      <div className="data-table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>{t('reports.month')}</th>
              <th>{t('reports.createdAt')}</th>
              <th>{t('common.status')}</th>
              <th>{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {reports.map(r => (
              <tr key={r.id}>
                <td style={{ fontWeight: 600 }}>{t(`month.${r.month}`)} {r.year}</td>
                <td><span className="mono">{r.generated_at ? new Date(r.generated_at).toLocaleDateString(lang === 'en' ? 'en-GB' : 'de-DE') : '—'}</span></td>
                <td><span className={`badge ${statusBadge[r.status] || 'badge-neutral'}`}>{statusLabel(r.status)}</span></td>
                <td>
                  <div className="flex gap-xs">
                    {r.pdf_path && (
                      <button onClick={() => handleDownload(r.id)} className="btn btn-secondary btn-sm">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                        {t('reports.downloadPdf')}
                      </button>
                    )}
                    {r.status === 'draft' && (
                      <button onClick={() => handleStatusUpdate(r.id, 'reviewed')} className="btn btn-sm" style={{ background: 'var(--info-soft)', color: 'var(--info)', borderColor: 'var(--info-border)', border: '1px solid' }}>
                        {t('reports.markReviewed')}
                      </button>
                    )}
                    {r.status === 'reviewed' && (
                      <button onClick={() => handleStatusUpdate(r.id, 'sent')} className="btn btn-success btn-sm">
                        {t('reports.markSent')}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {reports.length === 0 && (
              <tr><td colSpan={4}><div className="empty-state"><div className="empty-state-text">{t('reports.none')}</div></div></td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
