import { checkAuth } from '../../_utils/auth.js';
import { withErrorHandler } from '../../_utils/handler.js';
import { getWorkerAnalytics, getPropertyAnalytics, getOperationsAnalytics, getCostAnalytics } from '../../../src/services/analytics.js';
import * as XLSX from 'xlsx';

export default withErrorHandler(async (req, res) => {
  if (checkAuth(req, res)) return;

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { from, to, month } = req.query;

  if (!from || !to) {
    return res.status(400).json({ error: 'Missing "from" and "to" parameters' });
  }

  const wb = XLSX.utils.book_new();

  // Workers sheet
  const workers = await getWorkerAnalytics(from, to);
  const wsWorkers = XLSX.utils.json_to_sheet(workers.map(w => ({
    'Mitarbeiter': w.name,
    'Objekte erledigt': w.totalCompleted,
    'Objekte geplant': w.totalScheduled,
    'Arbeitstage': w.daysWorked,
    'Ø Dauer (Min)': w.avgDurationMinutes,
    'Foto-Compliance (%)': w.photoCompliance,
    'Überstunden (Min)': w.totalOvertimeMinutes,
    'Krankheitstage': w.sickDays,
  })));
  XLSX.utils.book_append_sheet(wb, wsWorkers, 'Mitarbeiter');

  // Properties sheet
  if (month) {
    const properties = await getPropertyAnalytics(month);
    const wsProps = XLSX.utils.json_to_sheet(properties.map(p => ({
      'Adresse': p.address,
      'Stadt': p.city,
      'Ø Dauer (Min)': p.avgDurationMinutes,
      'Abschlussrate (%)': p.completionRate,
      'Besuche': p.visitCount,
      'Verschiebungen': p.postponementCount,
      'Häufigster MA': p.topWorker || '-',
    })));
    XLSX.utils.book_append_sheet(wb, wsProps, 'Objekte');
  }

  // Operations sheet
  const ops = await getOperationsAnalytics(from, to);
  const wsOps = XLSX.utils.json_to_sheet([{
    'Erledigt': ops.totalCompleted,
    'Geplant': ops.totalScheduled,
    'Plantreue (%)': ops.planAdherence,
    'Ø MA/Tag': ops.avgWorkersPerDay,
    'Überstunden (Min)': ops.totalOvertimeMinutes,
    'Krankheitstage': ops.sickLeaveCount,
    'Tage erfasst': ops.daysTracked,
  }]);
  XLSX.utils.book_append_sheet(wb, wsOps, 'Betrieb');

  // Costs sheet
  const costs = await getCostAnalytics(from, to);
  const wsCosts = XLSX.utils.json_to_sheet(costs.map(c => ({
    'Mitarbeiter': c.name,
    'Stunden gesamt': c.totalHours,
    'Überstunden': c.overtimeHours,
    'Reguläre Kosten (€)': c.regularCost,
    'Überstundenkosten (€)': c.overtimeCost,
    'Gesamtkosten (€)': c.totalCost,
    'Kosten/Objekt (€)': c.costPerProperty,
    'Auslastung (%)': c.utilization,
  })));
  XLSX.utils.book_append_sheet(wb, wsCosts, 'Kosten');

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="analytics-${from}-${to}.xlsx"`);
  res.send(buf);
});
