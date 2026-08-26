import type { ForecastSlot } from "./types.ts";

function parseHour(time: string) {
  return Number(time.split(":")[0]);
}

function formatHour(hour: number) {
  return `${String(hour).padStart(2, "0")}:00`;
}

export function findBestTwoHourWindow(slots: ForecastSlot[]) {
  const ordered = [...slots]
    .filter((slot) => parseHour(slot.time) >= 8 && parseHour(slot.time) <= 21)
    .sort((a, b) => parseHour(a.time) - parseHour(b.time));

  const candidates = ordered.slice(0, -1).flatMap((slot, index) => {
    const next = ordered[index + 1];
    if (parseHour(next.time) !== parseHour(slot.time) + 1) return [];
    return [{ startHour: parseHour(slot.time), average: (slot.score + next.score) / 2 }];
  });

  if (candidates.length === 0) return null;
  const best = candidates.reduce((current, candidate) => (candidate.average < current.average ? candidate : current));
  return {
    start: formatHour(best.startHour),
    end: formatHour(best.startHour + 2),
    averageScore: Math.round(best.average),
    relativelyCalm: best.average >= 75,
  };
}
