import { useState, useEffect } from 'react';
import { api } from '../api/client';

const TRASH_TYPE_LABELS = {
  restmuell: 'Restmuell (grau)',
  bio: 'Biomuell (braun)',
  papier: 'Papier (gruen)',
  gelb: 'Gelber Sack',
};

const TRASH_TYPE_BADGES = {
  restmuell: 'badge-neutral',
  bio: 'badge-success',
  papier: 'badge-info',
  gelb: 'badge-warning',
};

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

  const loadProperties = async () => {
    try {
      const data = await api.get('/properties');
      setProperties(data);
    } catch (e) {
      console.error('Fehler beim Laden der Objekte:', e);
    }
  };

  const loadSummary = async () => {
    try {
      const data = await api.get('/garbage/summary');
      setSummary(data);
    } catch (e) {
      console.error('Fehler beim Laden der Zusammenfassung:', e);
    }
  };

  useEffect(() => {
    loadProperties();
    loadSummary();
  }, []);

  const handleUpload = async () => {
    if (!file) return;
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
      if (!res.ok) throw new Error(data.error || 'Upload fehlgeschlagen');
      setUploadResult(data);
      loadSummary();
    } catch (e) {
      setUploadResult({ error: e.message });
    }
  };

  const handleMap = async () => {
    if (!mappingPropertyId || !uploadResult) return;
    try {
      await api.post('/garbage/map', {
        property_id: parseInt(mappingPropertyId, 10),
        dates: uploadResult.dates,
        source_pdf: uploadResult.source_pdf,
      });
      setUploadResult({ message: 'Zuordnung erfolgreich' });
      setMappingPropertyId('');
      loadSummary();
    } catch (e) {
      setUploadResult({ error: e.message });
    }
  };

  const handleShowDetail = async (pid) => {
    try {
      const data = await api.get(`/garbage/schedule/${pid}`);
      setDetail(data);
      setDetailPropertyId(pid);
    } catch (e) {
      console.error('Fehler beim Laden des Muellplans:', e);
    }
  };

  const handleDelete = async (pid) => {
    if (!confirm('Muellplan fuer dieses Objekt wirklich loeschen?')) return;
    try {
      await api.delete(`/garbage/schedule/${pid}`);
      loadSummary();
      if (detailPropertyId === pid) {
        setDetail(null);
        setDetailPropertyId(null);
      }
    } catch (e) {
      console.error('Fehler beim Loeschen:', e);
    }
  };

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <h1 className="page-title">Muellplan (AWP)</h1>
      </div>

      {/* Upload Section */}
      <div className="card mb-lg">
        <div className="card-title mb-md">PDF hochladen</div>
        <div className="flex gap-md flex-wrap items-center">
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">PDF-Datei</label>
            <input
              type="file"
              accept=".pdf"
              onChange={e => setFile(e.target.files[0] || null)}
              style={{ fontSize: '0.88rem', color: 'var(--text-secondary)' }}
            />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Jahr</label>
            <input
              type="number"
              value={year}
              onChange={e => setYear(e.target.value)}
              className="input"
              style={{ width: '90px' }}
            />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Objekt</label>
            <select value={propertyId} onChange={e => setPropertyId(e.target.value)} className="select" style={{ width: 'auto', minWidth: '180px' }}>
              <option value="">-- Auto-Erkennung --</option>
              {properties.map(p => (
                <option key={p.id} value={p.id}>{p.address}, {p.city}</option>
              ))}
            </select>
          </div>
          <button onClick={handleUpload} className="btn btn-primary" style={{ alignSelf: 'flex-end' }}>
            Hochladen
          </button>
        </div>

        {uploadResult && (
          <div className={`alert mt-md ${uploadResult.error ? 'alert-danger' : uploadResult.needs_mapping ? 'alert-warning' : 'alert-success'}`}>
            {uploadResult.error
              ? `Fehler: ${uploadResult.error}`
              : uploadResult.needs_mapping
                ? (
                  <div>
                    <p className="mb-sm">
                      Automatische Zuordnung fehlgeschlagen.
                      {uploadResult.extracted_address && ` Erkannte Adresse: "${uploadResult.extracted_address}".`}
                      {' '}{uploadResult.total_dates} Termine gefunden. Bitte Objekt manuell zuordnen:
                    </p>
                    <div className="flex gap-sm items-center">
                      <select value={mappingPropertyId} onChange={e => setMappingPropertyId(e.target.value)} className="select" style={{ width: 'auto', minWidth: '180px' }}>
                        <option value="">-- Objekt waehlen --</option>
                        {properties.map(p => (
                          <option key={p.id} value={p.id}>{p.address}, {p.city}</option>
                        ))}
                      </select>
                      <button onClick={handleMap} disabled={!mappingPropertyId} className="btn btn-primary btn-sm">Zuordnen</button>
                    </div>
                  </div>
                )
                : uploadResult.message || 'Upload erfolgreich'}
          </div>
        )}
      </div>

      {/* Summary Table */}
      <div className="card mb-lg">
        <div className="card-title mb-md">Importierte Muellplaene</div>
        {summary.length === 0 ? (
          <p className="text-muted text-sm">Keine Muellplaene vorhanden.</p>
        ) : (
          <div className="data-table-wrapper" style={{ border: 'none' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Objekt</th>
                  <th>Termine</th>
                  <th>Muellarten</th>
                  <th>Zeitraum</th>
                  <th>Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {summary.map(item => (
                  <tr key={item.property_id}>
                    <td style={{ fontWeight: 600 }}>{item.address}, {item.city}</td>
                    <td><span className="mono">{item.total_dates}</span></td>
                    <td>{item.trash_types}</td>
                    <td><span className="mono text-sm">{item.earliest_date} — {item.latest_date}</span></td>
                    <td>
                      <div className="flex gap-xs">
                        <button onClick={() => handleShowDetail(item.property_id)} className="btn btn-secondary btn-sm">Anzeigen</button>
                        <button onClick={() => handleDelete(item.property_id)} className="btn btn-danger btn-sm">Loeschen</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail View */}
      {detail && (
        <div className="card animate-slide-in">
          <div className="card-header">
            <div className="card-title">Termine</div>
            <button onClick={() => { setDetail(null); setDetailPropertyId(null); }} className="btn btn-secondary btn-sm">Schliessen</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '0.5rem' }}>
            {detail.map((entry, i) => (
              <div key={i} style={{
                padding: '0.5rem 0.85rem',
                background: 'var(--bg-surface-2)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}>
                <span className="mono fw-bold">{entry.collection_date}</span>
                <span className={`badge ${TRASH_TYPE_BADGES[entry.trash_type] || 'badge-neutral'}`}>
                  {TRASH_TYPE_LABELS[entry.trash_type] || entry.trash_type}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
