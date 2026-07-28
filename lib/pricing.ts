// Tiered pricing structure starting at ₹4.00 and going down to ₹3.50 per page
export function getPricePerPage(pageCount: number): number {
  if (pageCount >= 30) return 3.50; // 30+ pages: ₹3.50/page
  if (pageCount >= 10) return 3.75; // 10-29 pages: ₹3.75/page
  return 4.00;                      // 1-9 pages: ₹4.00/page
}
