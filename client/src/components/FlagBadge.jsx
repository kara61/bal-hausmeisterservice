export default function FlagBadge({ reason }) {
  return (
    <span style={{
      display: 'inline-block', padding: '0.15rem 0.5rem', background: '#fed7d7',
      color: '#c53030', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600,
    }}>
      {reason}
    </span>
  );
}
