import { useState, useEffect } from 'react';
import { api } from '../api/client';
import { useLang } from '../context/LanguageContext';

export default function GarbageSchedule() {
  const [file, setFile] = useState(null);
  const [year, setYear] = useState(new Date().getFullYear());
  const [propertyId, setPropertyId] = useState('');
  const [properties, setProperties] = useState([]);
  const [uploadResult, setUploadResult] = useState(null);
  const [summary, setSummary] = useState([]);
  const [detail, setDetail] = useState(null);
  const [detailPropertyId, setDetailPropertyId] = useState(null);
  const [mappingPropertyId, setMappingPropertyId] = useState('');
  const [error, setError] = useState(null);
  const { t } = useLang();

  const trashLabel = (type) => t(`garbage.${type}`) || type;
  const trashBadgeClass = { restmuell: 'badge-neutral', gelb: 'badge-warning' };
  const trashBadgeStyle = {
    bio: { background: 'rgba(160, 120, 70, 0.15)', color: '#b8860b', border: '1px solid rgba(160, 120, 70, 0.3)' },
    papier: { background: 'rgba(34, 197, 94, 0.12)', color: '#22c55e', border: '1px solid rgba(34, 197, 94, 0.25)' },
  };

  // Parse date string as local date (avoids UTC timezone shift)
  const fmtDate = (dateStr) => {
    const [y, m, d] = String(dateStr).split('T')[0].split('-');
    return `${d}.${m}.${y}`;
  };

  const loadProperties = async () => {
    try {
      setProperties(await api.get('/properties'));
    } catch (err) {
      setError(err.message || t('common.error'));
    }
  };

  const loadSummary = async () => {
    try {
      setSummary(await api.get('/garbage/summary'));
    } catch (err) {
      setError(err.message || t('common.error'));
    }
  };

  useEffect(() => { loadProperties(); loadSummary(); }, []);

  const handleUpload = async () => {
    if (!file) return;
    setError(null);
    const formData = new FormData();
    formData.append('pdf', file);
    formData.append('year', year);
    if (propertyId) formData.append('property_id', propertyId);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/garbage/upload', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      setUploadResult(data);
      loadSummary();
    } catch (err) {
      setError(err.message || t('common.error'));
      setUploadResult({ error: err.message });
    }
  };

  const handleMap = async () => {
    if (!mappingPropertyId || !uploadResult) return;
    try {
      setError(null);
      await api.post('/garbage/map', {
        property_id: parseInt(mappingPropertyId, 10),
        dates: uploadResult.dates,
        source_pdf: uploadResult.source_pdf,
      });
      setUploadResult({ message: t('garbage.mappingSuccess') });
      setMappingPropertyId('');
      loadSummary();
    } catch (err) {
      setError(err.message || t('common.error'));
      setUploadResult({ error: err.message });
    }
  };

  const handleShowDetail = async (pid) => {
    try {
      setError(null);
      setDetail(await api.get(`/garbage/schedule/${pid}`));
      setDetailPropertyId(pid);
    } catch (err) {
      setError(err.message || t('common.error'));
    }
  };

  const handleDelete = async (pid) => {
    if (!confirm(t('garbage.confirmDelete'))) return;
    try {
      setError(null);
      await api.delete(`/garbage/schedule/${pid}`);
      loadSummary();
      if (detailPropertyId === pid) { setDetail(null); setDetailPropertyId(null); }
    } catch (err) {
      setError(err.message || t('common.error'));
    }
  };

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <h1 className="page-title">{t('garbage.title')}</h1>
      </div>

      {error && (
        <div className="alert alert-danger mb-md animate-fade-in">
          {error}
        </div>
      )}

      <div className="card mb-lg">
        <div className="card-title mb-md">{t('garbage.uploadPdf')}</div>
        <div className="flex gap-md flex-wrap items-center">
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">{t('garbage.pdfFile')}</label>
            <input type="file" accept=".pdf" onChange={e => setFile(e.target.files[0] || null)} style={{ fontSize: '0.88rem', color: 'var(--text-secondary)' }} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">{t('garbage.year')}</label>
            <input type="number" value={year} onChange={e => setYear(e.target.value)} className="input" style={{ width: '90px' }} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">{t('garbage.property')}</label>
            <select value={propertyId} onChange={e => setPropertyId(e.target.value)} className="select" style={{ width: 'auto', minWidth: '180px' }}>
              <option value="">{t('garbage.autoDetect')}</option>
              {properties.map(p => <option key={p.id} value={p.id}>{p.address}, {p.city}</option>)}
            </select>
          </div>
          <button onClick={handleUpload} className="btn btn-primary" style={{ alignSelf: 'flex-end' }}>{t('common.upload')}</button>
        </div>

        {uploadResult && (
          <div className={`alert mt-md ${uploadResult.error ? 'alert-danger' : uploadResult.needs_mapping ? 'alert-warning' : 'alert-success'}`}>
            {uploadResult.error
              ? `${t('garbage.error')} ${uploadResult.error}`
              : uploadResult.needs_mapping
                ? (
                  <div>
                    <p className="mb-sm">
                      {t('garbage.autoFail')}
                      {uploadResult.extracted_address && ` ${t('garbage.detectedAddress')} "${uploadResult.extracted_address}".`}
                      {' '}{uploadResult.total_dates} {t('garbage.datesFound')}
                    </p>
                    <div className="flex gap-sm items-center">
                      <select value={mappingPropertyId} onChange={e => setMappingPropertyId(e.target.value)} className="select" style={{ width: 'auto', minWidth: '180px' }}>
                        <option value="">{t('garbage.selectProperty')}</option>
                        {properties.map(p => <option key={p.id} value={p.id}>{p.address}, {p.city}</option>)}
                      </select>
                      <button onClick={handleMap} disabled={!mappingPropertyId} className="btn btn-primary btn-sm">{t('garbage.mapProperty')}</button>
                    </div>
                  </div>
                )
                : uploadResult.message || t('garbage.uploadSuccess')}
          </div>
        )}
      </div>

      <div className="card mb-lg">
        <div className="card-title mb-md">{t('garbage.importedSchedules')}</div>
        {summary.length === 0 ? (
          <p className="text-muted text-sm">{t('garbage.noSchedules')}</p>
        ) : (
          <div className="data-table-wrapper" style={{ border: 'none' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('garbage.property')}</th>
                  <th>{t('garbage.totalDates')}</th>
                  <th>{t('garbage.trashTypes')}</th>
                  <th>{t('garbage.period')}</th>
                  <th>{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {summary.map(item => (
                  <tr key={item.property_id}>
                    <td style={{ fontWeight: 600 }}>{item.address}, {item.city}</td>
                    <td><span className="mono">{item.total_dates}</span></td>
                    <td>{item.trash_types}</td>
                    <td><span className="mono text-sm">{fmtDate(item.earliest_date)} — {fmtDate(item.latest_date)}</span></td>
                    <td>
                      <div className="flex gap-xs">
                        <button onClick={() => handleShowDetail(item.property_id)} className="btn btn-secondary btn-sm">{t('common.show')}</button>
                        <button onClick={() => handleDelete(item.property_id)} className="btn btn-danger btn-sm">{t('common.delete')}</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {detail && (
        <div className="card animate-slide-in">
          <div className="card-header">
            <div className="card-title">{t('garbage.dates')}</div>
            <button onClick={() => { setDetail(null); setDetailPropertyId(null); }} className="btn btn-secondary btn-sm">{t('common.close')}</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '0.5rem' }}>
            {detail.map((entry, i) => (
              <div key={i} style={{ padding: '0.5rem 0.85rem', background: 'var(--bg-surface-2)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="mono fw-bold">{fmtDate(entry.collection_date)}</span>
                <span className={`badge ${trashBadgeClass[entry.trash_type] || ''}`} style={trashBadgeStyle[entry.trash_type] || {}}>{trashLabel(entry.trash_type)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
