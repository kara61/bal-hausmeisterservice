export default function handler(req, res) {
  res.json({ ok: true, env: Object.keys(process.env).filter(k => k.startsWith('DATABASE') || k.startsWith('SUPABASE') || k.startsWith('JWT') || k.startsWith('ADMIN')) });
}
