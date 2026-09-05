/**
 * SCARO ERP - Time-based greeting utility
 *
 * Rules (Local browser / device time):
 * 05:00–11:59 -> Good Morning
 * 12:00–16:59 -> Good Afternoon
 * 17:00–20:59 -> Good Evening
 * 21:00–04:59 -> Good Night
 */

export type GreetingPeriod = 'Good Morning' | 'Good Afternoon' | 'Good Evening' | 'Good Night';

export function getTimeGreeting(date: Date = new Date()): GreetingPeriod {
  const hours = date.getHours();

  if (hours >= 5 && hours < 12) {
    return 'Good Morning';
  }
  if (hours >= 12 && hours < 17) {
    return 'Good Afternoon';
  }
  if (hours >= 17 && hours < 21) {
    return 'Good Evening';
  }
  return 'Good Night';
}
