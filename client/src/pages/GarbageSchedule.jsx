import { useState, useEffect, useRef } from 'react';
import { api } from '../api/client';
import { useLang } from '../context/LanguageContext';

export default function GarbageSchedule() {
  const [files, setFiles] = useState([]);
  const [year, setYear] = useState(new Date().getFullYear());
  const [propertyId, setPropertyId] = useState('');
  const [properties, setProperties] = useState([]);
  const [uploadProgress, setUploadProgress] = useState(null); // { current, total, fileName, results }
  const [summary, setSummary] = useState([]);
  const [detail, setDetail] = useState(null);
  const [detailPropertyId, setDetailPropertyId] = useState(null);
  const [mappingPropertyId, setMappingPropertyId] = useState('');
  const [mappingResult, setMappingResult] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);
  const { t } = useLang();

  const trashLabel = (type) => t(`garbage.${type}`) || type;
  const trashBadgeClass = { restmuell: 'badge-neutral', gelb: 'badge-warning' };
  const trashBadgeStyle = {
    bio: { background: 'rgba(180, 60, 40, 0.15)', color: '#c0392b', border: '1px solid rgba(180, 60, 40, 0.3)' },
    papier: { background: 'rgba(34, 197, 94, 0.12)', color: '#22c55e', border: '1px solid rgba(34, 197, 94, 0.25)' },
  };

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
    if (files.length === 0) return;
    setError(null);
    setMappingResult(null);

    const results = [];
    setUploadProgress({ current: 0, total: files.length, fileName: '', results: [] });

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setUploadProgress({ current: i, total: files.length, fileName: file.name, results });

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
        if (!res.ok) {
          results.push({ file: file.name, error: data.error || 'Upload failed' });
        } else {
          results.push({ file: file.name, ...data });
        }
      } catch (err) {
        results.push({ file: file.name, error: err.message });
      }
    }

    setUploadProgress({ current: files.length, total: files.length, fileName: '', results });
    loadSummary();
    setFiles([]);
    if (fileInputRef.current) fileInputRef.current.value = '';

    // If there's exactly one result that needs mapping, show mapping UI
    const needsMapping = results.filter(r => r.needs_mapping);
    if (needsMapping.length === 1) {
      setMappingResult(needsMapping[0]);
    }
  };

  const handleMap = async () => {
    if (!mappingPropertyId || !mappingResult) return;
    try {
      setError(null);
      await api.post('/garbage/map', {
        property_id: parseInt(mappingPropertyId, 10),
        dates: mappingResult.dates,
        source_pdf: mappingResult.source_pdf,
      });
      setMappingResult(null);
      setMappingPropertyId('');
      loadSummary();
    } catch (err) {
      setError(err.message || t('common.error'));
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

  const toggleSelect = (pid) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(pid) ? next.delete(pid) : next.add(pid);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === summary.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(summary.map(s => s.property_id)));
    }
  };

  const handleDelete = async (pid) => {
    if (!confirm(t('garbage.confirmDelete'))) return;
    try {
      setError(null);
      await api.delete(`/garbage/schedule/${pid}`);
      loadSummary();
      setSelected(prev => { const next = new Set(prev); next.delete(pid); return next; });
      if (detailPropertyId === pid) { setDetail(null); setDetailPropertyId(null); }
    } catch (err) {
      setError(err.message || t('common.error'));
    }
  };

  const handleBulkDelete = async () => {
    if (selected.size === 0) return;
    if (!confirm(`${selected.size} ${t('garbage.confirmDelete')}`)) return;
    setError(null);
    for (const pid of selected) {
      try {
        await api.delete(`/garbage/schedule/${pid}`);
      } catch (err) {
        setError(err.message || t('common.error'));
      }
    }
    setSelected(new Set());
    if (selected.has(detailPropertyId)) { setDetail(null); setDetailPropertyId(null); }
    loadSummary();
  };

  const isUploading = uploadProgress && uploadProgress.current < uploadProgress.total;
  const progressPct = uploadProgress ? Math.round((uploadProgress.current / uploadProgress.total) * 100) : 0;

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
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              multiple
              onChange={e => setFiles(Array.from(e.target.files))}
              style={{ fontSize: '0.88rem', color: 'var(--text-secondary)' }}
            />
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
          <button onClick={handleUpload} disabled={files.length === 0 || isUploading} className="btn btn-primary" style={{ alignSelf: 'flex-end' }}>
            {isUploading ? `${uploadProgress.current}/${uploadProgress.total}...` : files.length > 1 ? `${t('common.upload')} (${files.length})` : t('common.upload')}
          </button>
        </div>

        {/* Progress bar */}
        {isUploading && (
          <div className="mt-md">
            <div className="flex justify-between text-sm mb-xs">
              <span>{uploadProgress.fileName}</span>
              <span className="mono">{uploadProgress.current}/{uploadProgress.total}</span>
            </div>
            <div style={{ height: '6px', background: 'var(--bg-surface-2)', borderRadius: '3px', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${progressPct}%`, background: 'var(--accent)', borderRadius: '3px', transition: 'width 0.3s ease' }} />
            </div>
          </div>
        )}

        {/* Upload results summary */}
        {uploadProgress && !isUploading && uploadProgress.results.length > 0 && (
          <div className="mt-md">
            {uploadProgress.results.map((r, i) => (
              <div key={i} className={`alert mb-xs ${r.error ? 'alert-danger' : 'alert-success'}`} style={{ padding: '0.4rem 0.75rem', fontSize: '0.85rem' }}>
                <strong>{r.file}:</strong>{' '}
                {r.error
                  ? r.error
                  : r.auto_matched
                    ? `${r.dates_count} ${t('garbage.datesFound')} → ${r.property_address}`
                    : r.imported
                      ? `${r.dates_count} ${t('garbage.datesFound')}`
                      : r.needs_mapping
                        ? `${r.total_dates} ${t('garbage.datesFound')} — ${t('garbage.autoFail')}`
                        : t('garbage.uploadSuccess')}
              </div>
            ))}
          </div>
        )}

        {/* Mapping UI for unmatched upload */}
        {mappingResult && (
          <div className="alert alert-warning mt-md">
            <p className="mb-sm">
              <strong>{mappingResult.file}:</strong> {t('garbage.autoFail')}
              {mappingResult.extracted_address && ` ${t('garbage.detectedAddress')} "${mappingResult.extracted_address}".`}
              {' '}{mappingResult.total_dates} {t('garbage.datesFound')}
            </p>
            <div className="flex gap-sm items-center">
              <select value={mappingPropertyId} onChange={e => setMappingPropertyId(e.target.value)} className="select" style={{ width: 'auto', minWidth: '180px' }}>
                <option value="">{t('garbage.selectProperty')}</option>
                {properties.map(p => <option key={p.id} value={p.id}>{p.address}, {p.city}</option>)}
              </select>
              <button onClick={handleMap} disabled={!mappingPropertyId} className="btn btn-primary btn-sm">{t('garbage.mapProperty')}</button>
            </div>
          </div>
        )}
      </div>

      <div className="card mb-lg">
        <div className="flex justify-between items-center mb-md">
          <div className="card-title">{t('garbage.importedSchedules')}</div>
          {selected.size > 0 && (
            <button onClick={handleBulkDelete} className="btn btn-danger btn-sm">
              {t('common.delete')} ({selected.size})
            </button>
          )}
        </div>
        {summary.length === 0 ? (
          <p className="text-muted text-sm">{t('garbage.noSchedules')}</p>
        ) : (
          <div className="data-table-wrapper" style={{ border: 'none' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: '36px' }}>
                    <input type="checkbox" checked={summary.length > 0 && selected.size === summary.length} onChange={toggleSelectAll} />
                  </th>
                  <th>{t('garbage.property')}</th>
                  <th>{t('garbage.totalDates')}</th>
                  <th>{t('garbage.trashTypes')}</th>
                  <th>{t('garbage.period')}</th>
                  <th>{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {summary.map(item => (
                  <tr key={item.property_id} style={selected.has(item.property_id) ? { background: 'var(--accent-soft)' } : {}}>
                    <td>
                      <input type="checkbox" checked={selected.has(item.property_id)} onChange={() => toggleSelect(item.property_id)} />
                    </td>
                    <td style={{ fontWeight: 600 }}>{item.address}, {item.city}</td>
                    <td><span className="mono">{item.total_dates}</span></td>
                    <td>
                      <div className="flex gap-xs flex-wrap">
                        {(Array.isArray(item.trash_types) ? item.trash_types : []).map(type => (
                          <span key={type} className={`badge ${trashBadgeClass[type] || ''}`} style={trashBadgeStyle[type] || {}}>{trashLabel(type)}</span>
                        ))}
                      </div>
                    </td>
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
