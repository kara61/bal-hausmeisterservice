export default function MonthPicker({ month, year, onChange }) {
  const months = [
    'Januar', 'Februar', 'Maerz', 'April', 'Mai', 'Juni',
    'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
  ];

  return (
    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
      <select value={month} onChange={e => onChange(parseInt(e.target.value), year)}
        style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #ddd' }}>
        {months.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
      </select>
      <input type="number" value={year} onChange={e => onChange(month, parseInt(e.target.value))}
        style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #ddd', width: '80px' }} />
    </div>
  );
}
