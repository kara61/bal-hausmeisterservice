import { useState, useEffect } from 'react';
import { api } from '../api/client';

const TRASH_TYPE_LABELS = {
  restmuell: 'Restmuell (grau)',
  bio: 'Biomuell (braun)',
  papier: 'Papier (gruen)',
  gelb: 'Gelber Sack',
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
    <div>
      <h1 style={{ fontSize: '1.5rem', marginBottom: '1.5rem' }}>Muellplan (AWP)</h1>

      {/* Upload Section */}
      <div style={{
        background: '#f7fafc', border: '1px solid #e2e8f0', borderRadius: '8px',
        padding: '1.25rem', marginBottom: '1.5rem',
      }}>
        <h2 style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>PDF hochladen</h2>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.25rem' }}>PDF-Datei</label>
            <input
              type="file"
              accept=".pdf"
              onChange={e => setFile(e.target.files[0] || null)}
              style={{ fontSize: '0.9rem' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.25rem' }}>Jahr</label>
            <input
              type="number"
              value={year}
              onChange={e => setYear(e.target.value)}
              style={{
                padding: '0.5rem', border: '1px solid #e2e8f0', borderRadius: '4px',
                fontSize: '0.9rem', width: '80px',
              }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.25rem' }}>Objekt</label>
            <select
              value={propertyId}
              onChange={e => setPropertyId(e.target.value)}
              style={{
                padding: '0.5rem', border: '1px solid #e2e8f0', borderRadius: '4px',
                fontSize: '0.9rem',
              }}
            >
              <option value="">-- Auto-Erkennung --</option>
              {properties.map(p => (
                <option key={p.id} value={p.id}>{p.address}, {p.city}</option>
              ))}
            </select>
          </div>
          <button
            onClick={handleUpload}
            style={{
              padding: '0.5rem 1.25rem', background: '#2b6cb0', color: 'white',
              border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.9rem',
            }}
          >Hochladen</button>
        </div>
        {uploadResult && (
          <div style={{
            marginTop: '1rem', padding: '0.75rem', borderRadius: '4px',
            background: uploadResult.error ? '#fed7d7' : uploadResult.needs_mapping ? '#fefcbf' : '#c6f6d5',
            fontSize: '0.9rem',
          }}>
            {uploadResult.error
              ? `Fehler: ${uploadResult.error}`
              : uploadResult.needs_mapping
                ? (
                  <div>
                    <p style={{ marginBottom: '0.5rem' }}>
                      Automatische Zuordnung fehlgeschlagen.
                      {uploadResult.extracted_address && ` Erkannte Adresse: "${uploadResult.extracted_address}".`}
                      {' '}{uploadResult.total_dates} Termine gefunden. Bitte Objekt manuell zuordnen:
                    </p>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <select
                        value={mappingPropertyId}
                        onChange={e => setMappingPropertyId(e.target.value)}
                        style={{
                          padding: '0.4rem', border: '1px solid #e2e8f0', borderRadius: '4px',
                          fontSize: '0.9rem',
                        }}
                      >
                        <option value="">-- Objekt waehlen --</option>
                        {properties.map(p => (
                          <option key={p.id} value={p.id}>{p.address}, {p.city}</option>
                        ))}
                      </select>
                      <button
                        onClick={handleMap}
                        disabled={!mappingPropertyId}
                        style={{
                          padding: '0.4rem 1rem', background: mappingPropertyId ? '#2b6cb0' : '#a0aec0',
                          color: 'white', border: 'none', borderRadius: '4px', cursor: mappingPropertyId ? 'pointer' : 'default',
                          fontSize: '0.9rem',
                        }}
                      >Zuordnen</button>
                    </div>
                  </div>
                )
                : uploadResult.message || 'Upload erfolgreich'}
          </div>
        )}
      </div>

      {/* Summary Table */}
      <div style={{
        background: '#f7fafc', border: '1px solid #e2e8f0', borderRadius: '8px',
        padding: '1.25rem', marginBottom: '1.5rem',
      }}>
        <h2 style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>Importierte Muellplaene</h2>
        {summary.length === 0 ? (
          <p style={{ fontSize: '0.9rem', color: '#718096' }}>Keine Muellplaene vorhanden.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e2e8f0', textAlign: 'left' }}>
                <th style={{ padding: '0.5rem' }}>Objekt</th>
                <th style={{ padding: '0.5rem' }}>Termine</th>
                <th style={{ padding: '0.5rem' }}>Muellarten</th>
                <th style={{ padding: '0.5rem' }}>Zeitraum</th>
                <th style={{ padding: '0.5rem' }}>Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {summary.map(item => (
                <tr key={item.property_id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <td style={{ padding: '0.5rem' }}>{item.address}, {item.city}</td>
                  <td style={{ padding: '0.5rem' }}>{item.total_dates}</td>
                  <td style={{ padding: '0.5rem' }}>{item.trash_types}</td>
                  <td style={{ padding: '0.5rem' }}>{item.earliest_date} — {item.latest_date}</td>
                  <td style={{ padding: '0.5rem', display: 'flex', gap: '0.5rem' }}>
                    <button
                      onClick={() => handleShowDetail(item.property_id)}
                      style={{
                        padding: '0.3rem 0.75rem', background: '#2b6cb0', color: 'white',
                        border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem',
                      }}
                    >Anzeigen</button>
                    <button
                      onClick={() => handleDelete(item.property_id)}
                      style={{
                        padding: '0.3rem 0.75rem', background: '#e53e3e', color: 'white',
                        border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem',
                      }}
                    >Loeschen</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Detail View */}
      {detail && (
        <div style={{
          background: '#f7fafc', border: '1px solid #e2e8f0', borderRadius: '8px',
          padding: '1.25rem',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ fontSize: '1.1rem' }}>Termine</h2>
            <button
              onClick={() => { setDetail(null); setDetailPropertyId(null); }}
              style={{
                padding: '0.3rem 0.75rem', background: '#718096', color: 'white',
                border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem',
              }}
            >Schliessen</button>
          </div>
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
            gap: '0.5rem',
          }}>
            {detail.map((entry, i) => (
              <div key={i} style={{
                padding: '0.5rem 0.75rem', background: 'white', border: '1px solid #e2e8f0',
                borderRadius: '4px', fontSize: '0.9rem',
              }}>
                <span style={{ fontWeight: 600 }}>{entry.collection_date}</span>
                <span style={{ marginLeft: '0.5rem', color: '#4a5568' }}>
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
