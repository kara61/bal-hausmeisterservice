import { useLang } from '../context/LanguageContext';

export default function MonthPicker({ month, year, onChange }) {
  const { t } = useLang();

  return (
    <div className="flex gap-sm items-center">
      <select
        value={month}
        onChange={e => onChange(parseInt(e.target.value), year)}
        className="select"
        style={{ width: 'auto', minWidth: '130px' }}
      >
        {Array.from({ length: 12 }, (_, i) => <option key={i} value={i + 1}>{t(`month.${i + 1}`)}</option>)}
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
