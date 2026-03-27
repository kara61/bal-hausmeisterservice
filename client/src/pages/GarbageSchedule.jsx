import { useState, useEffect, useRef, useMemo } from 'react';
import { api } from '../api/client';
import { useLang } from '../context/LanguageContext';

const DAY_NAMES_DE = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const DAY_NAMES_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function GarbageSchedule() {
  const [files, setFiles] = useState([]);
  const [year, setYear] = useState(new Date().getFullYear());
  const [propertyId, setPropertyId] = useState('');
  const [properties, setProperties] = useState([]);
  const [uploadProgress, setUploadProgress] = useState(null);
  const [summary, setSummary] = useState([]);
  const [upcoming, setUpcoming] = useState([]);
  const [weekOffset, setWeekOffset] = useState(0);
  const [detail, setDetail] = useState(null);
  const [detailPropertyId, setDetailPropertyId] = useState(null);
  const [mappingPropertyId, setMappingPropertyId] = useState('');
  const [mappingResult, setMappingResult] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [showImported, setShowImported] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);
  const { t, lang } = useLang();

  const dayNames = lang === 'de' ? DAY_NAMES_DE : DAY_NAMES_EN;
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

  const fmtShortDate = (dateStr) => {
    const [, m, d] = String(dateStr).split('T')[0].split('-');
    return `${d}.${m}.`;
  };

  const loadProperties = async () => {
    try { setProperties(await api.get('/properties')); } catch (err) { setError(err.message); }
  };
  const loadSummary = async () => {
    try { setSummary(await api.get('/garbage/summary')); } catch (err) { setError(err.message); }
  };
  const loadUpcoming = async () => {
    try { setUpcoming(await api.get('/garbage/upcoming?days=90')); } catch (err) { setError(err.message); }
  };

  useEffect(() => { loadProperties(); loadSummary(); loadUpcoming(); }, []);

  // Group upcoming entries by date string for quick lookup
  const upcomingByDate = useMemo(() => {
    const map = new Map();
    for (const u of upcoming) {
      const d = String(u.collection_date).split('T')[0];
      if (!map.has(d)) map.set(d, []);
      map.get(d).push(u);
    }
    return map;
  }, [upcoming]);

  const groupByProperty = (entries) => {
    const map = new Map();
    for (const e of entries) {
      if (!map.has(e.property_id)) map.set(e.property_id, { address: e.address, city: e.city, types: [] });
      map.get(e.property_id).types.push(e.trash_type);
    }
    return [...map.values()];
  };

  // Build weekly view: each day shows "take out" (collection tomorrow) and "take in" (collection today)
  const weekData = useMemo(() => {
    if (upcoming.length === 0) return [];

    const now = new Date();
    const dayOfWeek = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1) + weekOffset * 7);
    monday.setHours(0, 0, 0, 0);

    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const dateStr = d.toISOString().split('T')[0];
      const dayNum = d.getDay();

      // Tomorrow's date (collections tomorrow → take out today)
      const tomorrow = new Date(d);
      tomorrow.setDate(d.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().split('T')[0];

      const takeIn = groupByProperty(upcomingByDate.get(dateStr) || []);
      const takeOut = groupByProperty(upcomingByDate.get(tomorrowStr) || []);

      days.push({
        dateStr,
        dayName: dayNames[dayNum],
        shortDate: fmtShortDate(dateStr),
        isToday: dateStr === new Date().toISOString().split('T')[0],
        isWeekend: dayNum === 0 || dayNum === 6,
        takeOut,
        takeIn,
      });
    }
    return days;
  }, [upcoming, upcomingByDate, weekOffset, dayNames]);

  const weekLabel = useMemo(() => {
    if (weekData.length === 0) return '';
    const from = weekData[0].shortDate;
    const to = weekData[6].shortDate;
    const kwDate = new Date(weekData[0].dateStr);
    const startOfYear = new Date(kwDate.getFullYear(), 0, 1);
    const diff = kwDate - startOfYear;
    const oneWeek = 7 * 24 * 60 * 60 * 1000;
    const kw = Math.ceil((diff / oneWeek) + 1);
    return `KW ${kw} — ${from} - ${to}`;
  }, [weekData]);

  // Upload & management handlers (unchanged)
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
        if (!res.ok) results.push({ file: file.name, error: data.error || 'Upload failed' });
        else results.push({ file: file.name, ...data });
      } catch (err) {
        results.push({ file: file.name, error: err.message });
      }
    }
    setUploadProgress({ current: files.length, total: files.length, fileName: '', results });
    loadSummary();
    loadUpcoming();
    setFiles([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
    const needsMapping = results.filter(r => r.needs_mapping);
    if (needsMapping.length === 1) setMappingResult(needsMapping[0]);
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
      loadUpcoming();
    } catch (err) { setError(err.message); }
  };

  const handleShowDetail = async (pid) => {
    try {
      setError(null);
      setDetail(await api.get(`/garbage/schedule/${pid}`));
      setDetailPropertyId(pid);
    } catch (err) { setError(err.message); }
  };

  const toggleSelect = (pid) => {
    setSelected(prev => { const next = new Set(prev); next.has(pid) ? next.delete(pid) : next.add(pid); return next; });
  };
  const toggleSelectAll = () => {
    selected.size === summary.length ? setSelected(new Set()) : setSelected(new Set(summary.map(s => s.property_id)));
  };
  const handleDelete = async (pid) => {
    if (!confirm(t('garbage.confirmDelete'))) return;
    try {
      setError(null);
      await api.delete(`/garbage/schedule/${pid}`);
      loadSummary();
      loadUpcoming();
      setSelected(prev => { const next = new Set(prev); next.delete(pid); return next; });
      if (detailPropertyId === pid) { setDetail(null); setDetailPropertyId(null); }
    } catch (err) { setError(err.message); }
  };
  const handleBulkDelete = async () => {
    if (selected.size === 0) return;
    if (!confirm(`${selected.size} ${t('garbage.confirmDelete')}`)) return;
    setError(null);
    for (const pid of selected) {
      try { await api.delete(`/garbage/schedule/${pid}`); } catch (err) { setError(err.message); }
    }
    setSelected(new Set());
    if (selected.has(detailPropertyId)) { setDetail(null); setDetailPropertyId(null); }
    loadSummary();
    loadUpcoming();
  };

  const isUploading = uploadProgress && uploadProgress.current < uploadProgress.total;
  const progressPct = uploadProgress ? Math.round((uploadProgress.current / uploadProgress.total) * 100) : 0;

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <h1 className="page-title">{t('garbage.title')}</h1>
      </div>

      {error && <div className="alert alert-danger mb-md animate-fade-in">{error}</div>}

      {/* ===== WEEKLY SUMMARY (main view) ===== */}
      <div className="card mb-lg">
        <div className="flex justify-between items-center mb-md">
          <button onClick={() => setWeekOffset(w => w - 1)} className="btn btn-secondary btn-sm">← {lang === 'de' ? 'Vorherige' : 'Previous'}</button>
          <div className="card-title" style={{ margin: 0 }}>{weekLabel}</div>
          <div className="flex gap-xs">
            {weekOffset !== 0 && (
              <button onClick={() => setWeekOffset(0)} className="btn btn-secondary btn-sm">{lang === 'de' ? 'Heute' : 'Today'}</button>
            )}
            <button onClick={() => setWeekOffset(w => w + 1)} className="btn btn-secondary btn-sm">{lang === 'de' ? 'Naechste' : 'Next'} →</button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.75rem' }}>
          {weekData.map(day => (
            <div
              key={day.dateStr}
              style={{
                border: day.isToday ? '2px solid var(--accent)' : '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
                padding: '0.75rem',
                background: day.isToday ? 'var(--accent-soft)' : day.isWeekend ? 'var(--bg-surface-2)' : 'var(--bg-surface)',
                opacity: day.isWeekend && day.takeOut.length === 0 && day.takeIn.length === 0 ? 0.5 : 1,
              }}
            >
              <div className="flex justify-between items-center mb-sm">
                <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>
                  {day.dayName}
                </span>
                <span className="mono text-muted text-sm">{day.shortDate}</span>
              </div>

              {day.takeOut.length === 0 && day.takeIn.length === 0 ? (
                <p className="text-muted text-sm" style={{ margin: 0 }}>—</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {day.takeOut.length > 0 && (
                    <div>
                      <div className="flex items-center gap-xs mb-xs">
                        <span style={{ fontSize: '0.85rem' }}>↗</span>
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--warning)' }}>
                          {lang === 'de' ? 'Rausstellen' : 'Take out'}
                        </span>
                      </div>
                      {day.takeOut.map((prop, j) => (
                        <div key={`out-${j}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', padding: '0.2rem 0', borderBottom: j < day.takeOut.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}>
                          <span className="text-sm" style={{ fontWeight: 500 }}>{prop.address}</span>
                          <div className="flex gap-xs flex-wrap" style={{ flexShrink: 0 }}>
                            {prop.types.map(type => (
                              <span key={type} className={`badge ${trashBadgeClass[type] || ''}`} style={{ ...trashBadgeStyle[type], fontSize: '0.7rem', padding: '0.1rem 0.4rem' }}>{trashLabel(type)}</span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {day.takeIn.length > 0 && (
                    <div>
                      <div className="flex items-center gap-xs mb-xs">
                        <span style={{ fontSize: '0.85rem' }}>↙</span>
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--success)' }}>
                          {lang === 'de' ? 'Reinholen' : 'Take in'}
                        </span>
                      </div>
                      {day.takeIn.map((prop, j) => (
                        <div key={`in-${j}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', padding: '0.2rem 0', borderBottom: j < day.takeIn.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}>
                          <span className="text-sm" style={{ fontWeight: 500 }}>{prop.address}</span>
                          <div className="flex gap-xs flex-wrap" style={{ flexShrink: 0 }}>
                            {prop.types.map(type => (
                              <span key={type} className={`badge ${trashBadgeClass[type] || ''}`} style={{ ...trashBadgeStyle[type], fontSize: '0.7rem', padding: '0.1rem 0.4rem' }}>{trashLabel(type)}</span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ===== UPLOAD (collapsible) ===== */}
      <div className="card mb-lg">
        <div
          className="flex justify-between items-center"
          style={{ cursor: 'pointer' }}
          onClick={() => setShowUpload(!showUpload)}
        >
          <div className="card-title" style={{ margin: 0 }}>{t('garbage.uploadPdf')}</div>
          <span style={{ fontSize: '1.2rem', color: 'var(--text-muted)' }}>{showUpload ? '▲' : '▼'}</span>
        </div>

        {showUpload && (
          <div className="mt-md">
            <div className="flex gap-md flex-wrap items-center">
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">{t('garbage.pdfFile')}</label>
                <input ref={fileInputRef} type="file" accept=".pdf" multiple onChange={e => setFiles(Array.from(e.target.files))} style={{ fontSize: '0.88rem', color: 'var(--text-secondary)' }} />
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

            {uploadProgress && !isUploading && uploadProgress.results.length > 0 && (
              <div className="mt-md">
                {uploadProgress.results.map((r, i) => (
                  <div key={i} className={`alert mb-xs ${r.error ? 'alert-danger' : 'alert-success'}`} style={{ padding: '0.4rem 0.75rem', fontSize: '0.85rem' }}>
                    <strong>{r.file}:</strong>{' '}
                    {r.error ? r.error : r.auto_matched ? `${r.dates_count} ${t('garbage.datesFound')} → ${r.property_address}` : r.imported ? `${r.dates_count} ${t('garbage.datesFound')}` : r.needs_mapping ? `${r.total_dates} ${t('garbage.datesFound')} — ${t('garbage.autoFail')}` : t('garbage.uploadSuccess')}
                  </div>
                ))}
              </div>
            )}

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
        )}
      </div>

      {/* ===== IMPORTED SCHEDULES (collapsible) ===== */}
      <div className="card mb-lg">
        <div
          className="flex justify-between items-center"
          style={{ cursor: 'pointer' }}
          onClick={() => setShowImported(!showImported)}
        >
          <div className="flex items-center gap-sm">
            <div className="card-title" style={{ margin: 0 }}>{t('garbage.importedSchedules')}</div>
            {summary.length > 0 && <span className="badge badge-neutral">{summary.length}</span>}
          </div>
          <div className="flex items-center gap-sm">
            {selected.size > 0 && (
              <button onClick={(e) => { e.stopPropagation(); handleBulkDelete(); }} className="btn btn-danger btn-sm">
                {t('common.delete')} ({selected.size})
              </button>
            )}
            <span style={{ fontSize: '1.2rem', color: 'var(--text-muted)' }}>{showImported ? '▲' : '▼'}</span>
          </div>
        </div>

        {showImported && (
          <div className="mt-md">
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
                      <th style={{ width: '36px' }}>#</th>
                      <th>{t('garbage.property')}</th>
                      <th>{t('garbage.totalDates')}</th>
                      <th>{t('garbage.trashTypes')}</th>
                      <th>{t('garbage.period')}</th>
                      <th>{t('common.actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.map((item, i) => (
                      <tr key={item.property_id} style={selected.has(item.property_id) ? { background: 'var(--accent-soft)' } : {}}>
                        <td><input type="checkbox" checked={selected.has(item.property_id)} onChange={() => toggleSelect(item.property_id)} /></td>
                        <td className="mono text-muted">{i + 1}</td>
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
        )}
      </div>

      {/* ===== DETAIL VIEW ===== */}
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
