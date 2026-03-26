export default function MonthPicker({ month, year, onChange }) {
  const months = [
    'Januar', 'Februar', 'Maerz', 'April', 'Mai', 'Juni',
    'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
  ];

  return (
    <div className="flex gap-sm items-center">
      <select
        value={month}
        onChange={e => onChange(parseInt(e.target.value), year)}
        className="select"
        style={{ width: 'auto', minWidth: '130px' }}
      >
        {months.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
      </select>
      <input
        type="number"
        value={year}
        onChange={e => onChange(month, parseInt(e.target.value))}
        className="input"
        style={{ width: '90px' }}
      />
    </div>
  );
}
