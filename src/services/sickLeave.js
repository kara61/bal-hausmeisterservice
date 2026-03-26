import { pool } from '../db/pool.js';

export async function adjustSickLeave(sickLeaveId, adjustments) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const slResult = await client.query('SELECT * FROM sick_leave WHERE id = $1', [sickLeaveId]);
    if (slResult.rows.length === 0) throw new Error('Sick leave not found');

    const sl = slResult.rows[0];

    if (adjustments.status === 'overridden') {
      const result = await client.query(
        `UPDATE sick_leave SET
          aok_approved_days = $1,
          vacation_deducted_days = $2,
          unpaid_days = $3,
          status = 'overridden',
          updated_at = NOW()
         WHERE id = $4 RETURNING *`,
        [adjustments.aok_approved_days, adjustments.vacation_deducted_days, adjustments.unpaid_days, sickLeaveId]
      );

      if (adjustments.vacation_deducted_days > 0) {
        await deductVacation(client, sl.worker_id, adjustments.vacation_deducted_days);
      }

      await client.query('COMMIT');
      return result.rows[0];
    }

    const aokApproved = adjustments.aok_approved_days;
    const remainingDays = sl.declared_days - aokApproved;

    let vacationDeducted = 0;
    let unpaidDays = 0;

    if (remainingDays > 0) {
      const year = new Date(sl.start_date).getFullYear();
      const vacResult = await client.query(
        'SELECT * FROM vacation_balances WHERE worker_id = $1 AND year = $2',
        [sl.worker_id, year]
      );

      if (vacResult.rows.length > 0) {
        const available = vacResult.rows[0].entitlement_days - vacResult.rows[0].used_days;
        vacationDeducted = Math.min(remainingDays, available);
        unpaidDays = remainingDays - vacationDeducted;

        if (vacationDeducted > 0) {
          await deductVacation(client, sl.worker_id, vacationDeducted, year);
        }
      } else {
        unpaidDays = remainingDays;
      }
    }

    const result = await client.query(
      `UPDATE sick_leave SET
        aok_approved_days = $1,
        vacation_deducted_days = $2,
        unpaid_days = $3,
        status = 'approved',
        updated_at = NOW()
       WHERE id = $4 RETURNING *`,
      [aokApproved, vacationDeducted, unpaidDays, sickLeaveId]
    );

    await client.query('COMMIT');
    return result.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function deductVacation(client, workerId, days, year = null) {
  const y = year || new Date().getFullYear();
  await client.query(
    'UPDATE vacation_balances SET used_days = used_days + $1, updated_at = NOW() WHERE worker_id = $2 AND year = $3',
    [days, workerId, y]
  );
}
