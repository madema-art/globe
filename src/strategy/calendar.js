// Historical calendar for the strategy prototype.
// Years are historical: negative = BCE, positive = CE. There is no year 0 (1 BCE is followed by 1 CE).
// Arithmetic goes through astronomical numbering (1 BCE = 0, 2 BCE = -1) so crossing the era boundary is exact.

export const toAstronomical = (year) => {
  if (!Number.isInteger(year) || year === 0) throw new RangeError('Historical years are non-zero integers.');
  return year < 0 ? year + 1 : year;
};
export const fromAstronomical = (value) => (value <= 0 ? value - 1 : value);

/** Add a signed number of years to a historical year, skipping the non-existent year 0. */
export function addYears(year, years) { return fromAstronomical(toAstronomical(year) + years); }

/** "6000 BCE", "1 CE". */
export function formatYear(year) { toAstronomical(year); return year < 0 ? `${-year} BCE` : `${year} CE`; }

// PROTOTYPE periodization for the southern Levant (approximate conventional archaeological periods, rounded).
// A placeholder for the permanent historical timeline; boundaries differ by region and scholarly convention.
const SOUTHERN_LEVANT_PERIODS = [
  { until: -4500, name: 'Neolithic' },
  { until: -3600, name: 'Chalcolithic' },
  { until: -2000, name: 'Early Bronze Age' },
  { until: -1550, name: 'Middle Bronze Age' },
  { until: -1200, name: 'Late Bronze Age' },
  { until: -586, name: 'Iron Age' },
  { until: Infinity, name: 'Later periods' },
];

/** Period name for a year (prototype table; the end year of a period belongs to the next one). */
export function periodOf(year) {
  toAstronomical(year);
  return SOUTHERN_LEVANT_PERIODS.find((p) => year < p.until).name;
}
