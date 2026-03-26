import { describe, it, expect } from 'vitest';
import {
  computeWorkerDailyStats,
  computePropertyMonthlyStats,
  computeOperationsOverview,
  computeCostInsights,
} from '../../src/services/analytics.js';

describe('computeWorkerDailyStats', () => {
  it('aggregates daily rows into worker performance summary', () => {
    const rows = [
      { worker_id: 1, worker_name: 'Ali', date: '2026-03-20', properties_completed: 3, properties_scheduled: 4, total_duration_minutes: 180, photos_submitted: 2, photos_required: 3, overtime_minutes: 30, check_in_time: '2026-03-20T07:00:00Z', sick_leave_declared: false },
      { worker_id: 1, worker_name: 'Ali', date: '2026-03-21', properties_completed: 4, properties_scheduled: 4, total_duration_minutes: 200, photos_submitted: 3, photos_required: 3, overtime_minutes: 0, check_in_time: '2026-03-21T07:15:00Z', sick_leave_declared: false },
      { worker_id: 2, worker_name: 'Mehmet', date: '2026-03-20', properties_completed: 2, properties_scheduled: 3, total_duration_minutes: 150, photos_submitted: 1, photos_required: 2, overtime_minutes: 0, check_in_time: '2026-03-20T07:30:00Z', sick_leave_declared: false },
    ];

    const result = computeWorkerDailyStats(rows);

    expect(result).toHaveLength(2);
    const ali = result.find(w => w.workerId === 1);
    expect(ali.name).toBe('Ali');
    expect(ali.totalCompleted).toBe(7);
    expect(ali.totalScheduled).toBe(8);
    expect(ali.daysWorked).toBe(2);
    expect(ali.avgDurationMinutes).toBe(190);
    expect(ali.photoCompliance).toBeCloseTo(83.33, 1);
    expect(ali.totalOvertimeMinutes).toBe(30);
    expect(ali.sickDays).toBe(0);
  });

  it('counts sick days correctly', () => {
    const rows = [
      { worker_id: 1, worker_name: 'Ali', date: '2026-03-20', properties_completed: 0, properties_scheduled: 0, total_duration_minutes: 0, photos_submitted: 0, photos_required: 0, overtime_minutes: 0, check_in_time: null, sick_leave_declared: true },
      { worker_id: 1, worker_name: 'Ali', date: '2026-03-21', properties_completed: 3, properties_scheduled: 3, total_duration_minutes: 180, photos_submitted: 0, photos_required: 0, overtime_minutes: 0, check_in_time: '2026-03-21T07:00:00Z', sick_leave_declared: false },
    ];

    const result = computeWorkerDailyStats(rows);
    expect(result[0].sickDays).toBe(1);
    expect(result[0].daysWorked).toBe(1);
  });

  it('returns empty array for empty input', () => {
    expect(computeWorkerDailyStats([])).toEqual([]);
  });
});

describe('computePropertyMonthlyStats', () => {
  it('formats property monthly rows with worker names', () => {
    const rows = [
      { property_id: 1, address: 'Mozartstraße 12', city: 'Pfaffenhofen', month: '2026-03-01', avg_duration_minutes: 45, completion_rate: '92.50', visit_count: 4, postponement_count: 0, top_worker_name: 'Ali' },
      { property_id: 2, address: 'Am Stadtpark 5', city: 'München', month: '2026-03-01', avg_duration_minutes: 60, completion_rate: '75.00', visit_count: 3, postponement_count: 1, top_worker_name: 'Mehmet' },
    ];

    const result = computePropertyMonthlyStats(rows);
    expect(result).toHaveLength(2);
    expect(result[0].avgDurationMinutes).toBe(45);
    expect(result[0].completionRate).toBe(92.5);
    expect(result[0].topWorker).toBe('Ali');
    expect(result[1].postponementCount).toBe(1);
  });

  it('returns empty array for empty input', () => {
    expect(computePropertyMonthlyStats([])).toEqual([]);
  });
});

describe('computeOperationsOverview', () => {
  it('computes aggregate operations metrics', () => {
    const dailyRows = [
      { date: '2026-03-20', total_completed: 8, total_scheduled: 10, workers_active: 3, total_overtime: 30 },
      { date: '2026-03-21', total_completed: 10, total_scheduled: 10, workers_active: 3, total_overtime: 0 },
      { date: '2026-03-22', total_completed: 7, total_scheduled: 9, workers_active: 2, total_overtime: 15 },
    ];
    const sickCount = 2;

    const result = computeOperationsOverview(dailyRows, sickCount);

    expect(result.totalCompleted).toBe(25);
    expect(result.totalScheduled).toBe(29);
    expect(result.planAdherence).toBeCloseTo(86.21, 1);
    expect(result.avgWorkersPerDay).toBeCloseTo(2.67, 1);
    expect(result.totalOvertimeMinutes).toBe(45);
    expect(result.sickLeaveCount).toBe(2);
    expect(result.daysTracked).toBe(3);
  });

  it('handles empty input', () => {
    const result = computeOperationsOverview([], 0);
    expect(result.totalCompleted).toBe(0);
    expect(result.planAdherence).toBe(0);
  });
});

describe('computeCostInsights', () => {
  it('computes per-worker cost metrics', () => {
    const rows = [
      { worker_id: 1, worker_name: 'Ali', hourly_rate: 14, total_duration_minutes: 2400, overtime_minutes: 120, properties_completed: 20 },
      { worker_id: 2, worker_name: 'Mehmet', hourly_rate: 12, total_duration_minutes: 2000, overtime_minutes: 0, properties_completed: 15 },
    ];
    const standardHoursPerMonth = 160;

    const result = computeCostInsights(rows, standardHoursPerMonth);

    expect(result).toHaveLength(2);
    const ali = result.find(w => w.workerId === 1);
    expect(ali.totalHours).toBe(40);
    expect(ali.overtimeHours).toBe(2);
    expect(ali.regularCost).toBe(532);
    expect(ali.overtimeCost).toBe(28);
    expect(ali.costPerProperty).toBeCloseTo(28, 0);
    expect(ali.utilization).toBe(25);
  });

  it('handles empty input', () => {
    expect(computeCostInsights([], 160)).toEqual([]);
  });
});
