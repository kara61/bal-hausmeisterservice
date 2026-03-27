import { useState, useEffect } from 'react';
import { api } from '../api/client';
import { useLang } from '../context/LanguageContext';
import MonthPicker from '../components/MonthPicker';

export default function Reports() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [reports, setReports] = useState([]);
  const [timesheets, setTimesheets] = useState([]);
  const [generating, setGenerating] = useState(false);
  const [generatingTs, setGeneratingTs] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('salary');
  const { t, lang } = useLang();

  const load = async () => {
    try {
      const data = await api.get('/reports');
      setReports(data);
    } catch (err) {
      setError(err.message || t('common.error'));
    }
  };

  const loadTimesheets = async () => {
    try {
      const data = await api.get(`/timesheets?month=${month}&year=${year}`);
      setTimesheets(data);
    } catch (err) {
      setError(err.message || t('common.error'));
    }
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { loadTimesheets(); }, [month, year]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      setError(null);
      await api.post('/reports/generate', { month, year });
      load();
    } catch (err) {
      setError(err.message || t('common.error'));
    } finally {
      setGenerating(false);
    }
  };

  const handleGenerateTimesheets = async () => {
    setGeneratingTs(true);
    try {
      setError(null);
      await api.post('/timesheets/generate', { month, year });
      loadTimesheets();
    } catch (err) {
      setError(err.message || t('common.error'));
    } finally {
      setGeneratingTs(false);
    }
  };

  // BUG-033: Use fetch with Bearer header instead of exposing JWT in URL query string
  const handleDownload = async (id) => {
    try {
      const authToken = localStorage.getItem('token');
      const res = await fetch(`/api/reports/${id}/download`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `report-${id}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(blobUrl);
    } catch (err) {
      setError(err.message || t('common.error'));
    }
  };

  const handleDownloadTimesheet = async (id) => {
    try {
      const authToken = localStorage.getItem('token');
      const res = await fetch(`/api/timesheets/${id}`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `timesheet-${id}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(blobUrl);
    } catch (err) {
      setError(err.message || t('common.error'));
    }
  };

  const handleStatusUpdate = async (id, status) => {
    try {
      setError(null);
      await api.put(`/reports/${id}`, { status });
      load();
    } catch (err) {
      setError(err.message || t('common.error'));
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm(t('reports.confirmDelete'))) return;
    try {
      setError(null);
      await api.delete(`/reports/${id}`);
      load();
    } catch (err) {
      setError(err.message || t('common.error'));
    }
  };

  const handleDeleteTimesheet = async (id) => {
    if (!window.confirm(t('timesheets.confirmDelete'))) return;
    try {
      setError(null);
      await api.delete(`/timesheets/${id}`);
      loadTimesheets();
    } catch (err) {
      setError(err.message || t('common.error'));
    }
  };

  const statusBadge = { draft: 'badge-warning', reviewed: 'badge-info', sent: 'badge-success' };
  const statusLabel = (s) => t(`common.${s}`);

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <h1 className="page-title">{t('reports.title')}</h1>
      </div>

      {error && (
        <div className="alert alert-danger mb-md animate-fade-in">
          {error}
        </div>
      )}

      {/* Tab nav */}
      <div className="flex gap-sm mb-lg">
        <button
          onClick={() => setActiveTab('salary')}
          className={`btn btn-sm ${activeTab === 'salary' ? 'btn-primary' : 'btn-ghost'}`}
        >
          {t('reports.salaryReports')}
        </button>
        <button
          onClick={() => setActiveTab('timesheets')}
          className={`btn btn-sm ${activeTab === 'timesheets' ? 'btn-primary' : 'btn-ghost'}`}
        >
          {t('timesheets.title')}
        </button>
      </div>

      {/* Salary Reports Tab */}
      {activeTab === 'salary' && (
        <>
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
                        <button onClick={() => handleDelete(r.id)} className="btn btn-danger btn-sm" title={t('common.delete')}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                        </button>
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
        </>
      )}

      {/* Timesheets Tab */}
      {activeTab === 'timesheets' && (
        <>
          <div className="card mb-lg">
            <div className="card-title mb-md">{t('timesheets.generateTitle')}</div>
            <div className="flex gap-md items-center flex-wrap">
              <MonthPicker month={month} year={year} onChange={(m, y) => { setMonth(m); setYear(y); }} />
              <button onClick={handleGenerateTimesheets} disabled={generatingTs} className="btn btn-primary">
                {generatingTs ? t('timesheets.generating') : t('timesheets.generate')}
              </button>
            </div>
            <p className="text-muted text-sm" style={{ marginTop: '0.5rem' }}>
              {t('timesheets.description')}
            </p>
          </div>

          <div className="data-table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('common.name')}</th>
                  <th>{t('timesheets.totalHours')}</th>
                  <th>{t('reports.createdAt')}</th>
                  <th>{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {timesheets.map(ts => (
                  <tr key={ts.id}>
                    <td style={{ fontWeight: 600 }}>{ts.worker_name}</td>
                    <td><span className="mono">{Number(ts.total_hours).toFixed(1)} h</span></td>
                    <td><span className="mono">{ts.created_at ? new Date(ts.created_at).toLocaleDateString(lang === 'en' ? 'en-GB' : 'de-DE') : '—'}</span></td>
                    <td>
                      <div className="flex gap-xs">
                        {ts.pdf_path && (
                          <button onClick={() => handleDownloadTimesheet(ts.id)} className="btn btn-secondary btn-sm">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                            PDF
                          </button>
                        )}
                        <button onClick={() => handleDeleteTimesheet(ts.id)} className="btn btn-danger btn-sm" title={t('common.delete')}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {timesheets.length === 0 && (
                  <tr><td colSpan={4}><div className="empty-state"><div className="empty-state-text">{t('timesheets.none')}</div></div></td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
