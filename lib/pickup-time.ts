/**
 * Calculate pickup time for an order
 * Logic: Next working day at 12:30 PM
 * - If placed Mon-Thu: Next day at 12:30 PM
 * - If placed Fri/Sat: Monday at 12:30 PM
 * - If placed Sun: Monday at 12:30 PM
 */
export function calculatePickupTime(): Date {
  const now = new Date();
  const pickupTime = new Date(now);

  // Set time to 12:30 PM
  pickupTime.setHours(12, 30, 0, 0);

  // Get current day of week (0 = Sunday, 6 = Saturday)
  const dayOfWeek = now.getDay();

  // Calculate days to add
  let daysToAdd = 1; // Default: next day

  if (dayOfWeek === 5) {
    // Friday -> Monday (3 days)
    daysToAdd = 3;
  } else if (dayOfWeek === 6) {
    // Saturday -> Monday (2 days)
    daysToAdd = 2;
  } else if (dayOfWeek === 0) {
    // Sunday -> Monday (1 day)
    daysToAdd = 1;
  }

  // Add the calculated days
  pickupTime.setDate(pickupTime.getDate() + daysToAdd);

  return pickupTime;
}

/**
 * Format pickup time for display
 */
export function formatPickupTime(pickupTime: Date): string {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const pickupDate = new Date(pickupTime);

  // Check if it's tomorrow
  if (
    pickupDate.getDate() === tomorrow.getDate() &&
    pickupDate.getMonth() === tomorrow.getMonth() &&
    pickupDate.getFullYear() === tomorrow.getFullYear()
  ) {
    return 'Tomorrow';
  }

  // Check if it's today (shouldn't happen with our logic, but just in case)
  if (
    pickupDate.getDate() === now.getDate() &&
    pickupDate.getMonth() === now.getMonth() &&
    pickupDate.getFullYear() === now.getFullYear()
  ) {
    return 'Today';
  }

  // Format as day name (e.g., "Monday")
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[pickupDate.getDay()];
}

/**
 * Get full pickup message for display
 */
export function getPickupMessage(pickupTime: Date): string {
  const dayLabel = formatPickupTime(pickupTime);
  return `Ready for pickup ${dayLabel} at 12:30 PM at the main cafeteria`;
}
