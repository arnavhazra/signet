export const TOUR_STORAGE_KEY = 'signet.tour.v1';

export function clearTourStorage(): void {
  try {
    localStorage.removeItem(TOUR_STORAGE_KEY);
  } catch {
    /* private mode */
  }
}
