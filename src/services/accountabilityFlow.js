export function formatPropertyPrompt(assignment) {
  return [
    `📍 ${assignment.address}, ${assignment.city}`,
    assignment.standardTasks ? `• ${assignment.standardTasks.split(',').map(s => s.trim()).join('\n• ')}` : '',
    '',
    'Druecke "Angekommen" wenn du vor Ort bist.',
  ].filter(Boolean).join('\n');
}

export function formatDaySummary(visits) {
  if (visits.length === 0) {
    return 'Keine Objekte heute besucht.';
  }

  let totalMinutes = 0;
  const lines = visits.map(v => {
    const mins = Math.round((new Date(v.completed_at) - new Date(v.arrived_at)) / 60000);
    totalMinutes += mins;
    const hours = Math.floor(mins / 60);
    const remMins = mins % 60;
    const duration = hours > 0 ? `${hours}h ${remMins}m` : `${remMins}m`;
    const photo = v.hasPhoto ? 'Foto' : 'Kein Foto';
    return `✅ ${v.address} — ${duration} — ${photo}`;
  });

  const totalH = Math.floor(totalMinutes / 60);
  const totalM = totalMinutes % 60;
  const totalStr = totalH > 0 ? `${totalH}h ${totalM}m` : `${totalM}m`;

  return [
    'Dein Tag:',
    ...lines,
    '',
    `Gesamtzeit: ${totalStr}`,
    'Gute Arbeit!',
  ].join('\n');
}

export function getNextAssignment(assignments) {
  return assignments.find(a => a.status !== 'completed') || null;
}
