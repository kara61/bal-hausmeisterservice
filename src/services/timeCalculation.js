const FULLTIME_MONTHLY_HOURS = 173.2; // 5 * 4.33 * 8
const HARCIRAH_THRESHOLD_HOURS = 8.5;
const HARCIRAH_AMOUNT = 14;

export function calculateDailyHours(checkIn, checkOut) {
  if (!checkIn || !checkOut) return 0;
  const diffMs = new Date(checkOut) - new Date(checkIn);
  return Math.round((diffMs / (1000 * 60 * 60)) * 100) / 100;
}

export function calculateHarcirah(dailyHours) {
  return dailyHours >= HARCIRAH_THRESHOLD_HOURS ? HARCIRAH_AMOUNT : 0;
}

export function calculateMonthlyHours(entries) {
  return entries.reduce((sum, entry) => {
    return sum + calculateDailyHours(entry.check_in, entry.check_out);
  }, 0);
}

export function splitOfficialAndUnofficial(totalHours, workerType, minijobMonthlyMax = null) {
  const cap = workerType === 'fulltime'
    ? FULLTIME_MONTHLY_HOURS
    : minijobMonthlyMax || FULLTIME_MONTHLY_HOURS;

  if (totalHours <= cap) {
    return { official: totalHours, unofficial: 0 };
  }

  return {
    official: cap,
    unofficial: Math.round((totalHours - cap) * 100) / 100,
  };
}

export function calculateMonthlyHarcirah(entries) {
  let totalDays = 0;
  let totalAmount = 0;
  for (const entry of entries) {
    const hours = calculateDailyHours(entry.check_in, entry.check_out);
    if (hours >= HARCIRAH_THRESHOLD_HOURS) {
      totalDays++;
      totalAmount += HARCIRAH_AMOUNT;
    }
  }
  return { days: totalDays, amount: totalAmount };
}
