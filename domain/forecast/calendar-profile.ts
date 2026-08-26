import { findBestTwoHourWindow } from "./recommendation.ts";
import { CALENDAR_WEIGHT, clampScore, riskLabelForScore, riskLevelForScore } from "./score.ts";
import type { PublicForecastResponse, RegionForecast, RegionType } from "./types.ts";

const REGION_TYPES: Record<string, RegionType> = {
  seomyeon: "commercial",
  haeundae: "tourism",
  gwangalli: "tourism",
  centum: "commercial",
  sajik: "sports",
  "busan-station": "transit",
  nampo: "commercial",
  gijang: "tourism",
  jeonpo: "commercial",
  songjeong: "tourism",
  yeongdo: "tourism",
  pnu: "commercial",
  kyungsung: "commercial",
  dongnae: "commercial",
  dadaepo: "tourism",
  gamcheon: "tourism",
  songdo: "tourism",
  osiria: "tourism",
  taejongdae: "tourism",
  huinnyeoul: "tourism",
  igidae: "tourism",
  deokcheon: "commercial",
  yeonsan: "transit",
  hadan: "commercial",
  sasang: "transit",
  "citizens-park": "tourism",
  oncheonjang: "commercial",
  cheongsapo: "tourism",
  eulsukdo: "tourism",
  "dong-eui": "commercial",
  dongseo: "commercial",
  silla: "commercial",
  bufs: "commercial",
  kmou: "commercial",
  "gimhae-airport": "transit",
  nopo: "transit",
  myeongji: "commercial",
  hwamyeong: "commercial",
  munhyeon: "commercial",
  jangsan: "commercial",
  ilgwang: "tourism",
  jeonggwan: "commercial",
};

// 2026년 한국천문연구원 월력요항과 관공서 공휴일 기준입니다.
const KOREAN_PUBLIC_HOLIDAYS_2026 = new Map<string, string>([
  ["2026-01-01", "신정"],
  ["2026-02-16", "설날 연휴"], ["2026-02-17", "설날"], ["2026-02-18", "설날 연휴"],
  ["2026-03-01", "삼일절"], ["2026-03-02", "삼일절 대체공휴일"],
  ["2026-05-05", "어린이날"],
  ["2026-05-24", "부처님오신날"], ["2026-05-25", "부처님오신날 대체공휴일"],
  ["2026-06-03", "전국동시지방선거일"], ["2026-06-06", "현충일"],
  ["2026-08-15", "광복절"], ["2026-08-17", "광복절 대체공휴일"],
  ["2026-09-24", "추석 연휴"], ["2026-09-25", "추석"], ["2026-09-26", "추석 연휴"],
  ["2026-10-03", "개천절"], ["2026-10-05", "개천절 대체공휴일"], ["2026-10-09", "한글날"],
  ["2026-12-25", "기독탄신일"],
]);

const ANNUAL_SOLAR_HOLIDAYS: Record<string, string> = {
  "01-01": "신정", "03-01": "삼일절", "05-05": "어린이날", "06-06": "현충일",
  "08-15": "광복절", "10-03": "개천절", "10-09": "한글날", "12-25": "기독탄신일",
};

type CalendarDay = {
  kind: "weekday" | "friday" | "weekend" | "holiday";
  calendarScore: number;
  factor: string;
  holidayName: string | null;
  vacationLabel: "여름방학" | "겨울방학" | null;
};

function dayOfWeek(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function calendarDayFor(dateKey: string): CalendarDay {
  const monthDay = dateKey.slice(5);
  const vacationLabel = monthDay >= "07-20" && monthDay <= "08-31"
    ? "여름방학"
    : monthDay >= "12-20" || monthDay <= "02-28" ? "겨울방학" : null;
  const holidayName = KOREAN_PUBLIC_HOLIDAYS_2026.get(dateKey) ?? ANNUAL_SOLAR_HOLIDAYS[dateKey.slice(5)] ?? null;
  if (holidayName) return { kind: "holiday", calendarScore: 72, factor: `${holidayName} 나들이 수요`, holidayName, vacationLabel };

  const weekday = dayOfWeek(dateKey);
  if (weekday === 0 || weekday === 6) {
    return { kind: "weekend", calendarScore: weekday === 6 ? 75 : 70, factor: "주말 오후 방문 수요", holidayName: null, vacationLabel };
  }
  if (weekday === 5) return { kind: "friday", calendarScore: 52, factor: "금요일 저녁 방문 수요", holidayName: null, vacationLabel };
  return { kind: "weekday", calendarScore: 40, factor: "평일 퇴근·하교 시간대", holidayName: null, vacationLabel };
}

const CAMPUS_REGIONS = new Set(["pnu", "kyungsung", "hadan", "dong-eui", "dongseo", "silla", "bufs", "kmou"]);
const OFFICE_REGIONS = new Set(["munhyeon"]);

function vacationAdjustment(day: CalendarDay, region: RegionForecast, regionType: RegionType, hour: number) {
  if (!day.vacationLabel) return 0;
  if (CAMPUS_REGIONS.has(region.id)) {
    if (hour <= 9) return -2;
    if (hour <= 20) return day.kind === "weekday" || day.kind === "friday" ? -8 : -4;
    return -2;
  }
  if (regionType === "tourism") return hour >= 10 && hour <= 18 ? 7 : 2;
  if (regionType === "commercial") return hour >= 12 && hour <= 18 ? 3 : 1;
  if (regionType === "transit") return hour >= 10 && hour <= 18 ? 2 : 0;
  return 0;
}

function timeAdjustment(kind: CalendarDay["kind"], regionType: RegionType, hour: number) {
  const isDayOff = kind === "weekend" || kind === "holiday";
  if (isDayOff) {
    if (regionType === "tourism") {
      if (hour <= 9) return -8;
      if (hour <= 11) return 2;
      if (hour <= 17) return 11;
      if (hour <= 19) return 6;
      return 1;
    }
    if (regionType === "commercial") {
      if (hour <= 9) return -7;
      if (hour <= 11) return 1;
      if (hour <= 17) return 10;
      if (hour <= 19) return 5;
      return 0;
    }
    if (regionType === "transit") {
      if (hour <= 9) return 2;
      if (hour <= 17) return 6;
      return 3;
    }
    if (hour <= 10) return -5;
    if (hour <= 18) return 7;
    return 2;
  }

  const fridayBonus = kind === "friday" ? 3 : 0;
  if (regionType === "transit") {
    if (hour <= 9) return 8;
    if (hour <= 15) return -5;
    if (hour <= 19) return 11 + fridayBonus;
    return 4;
  }
  if (regionType === "commercial" || regionType === "sports") {
    if (hour <= 10) return -5;
    if (hour <= 15) return -3;
    if (hour <= 16) return 1;
    if (hour <= 20) return 16 + fridayBonus;
    return 5;
  }
  if (hour <= 9) return -6;
  if (hour <= 14) return -2;
  if (hour <= 16) return 2;
  if (hour <= 20) return 7 + fridayBonus;
  return 2;
}

function officeTimeAdjustment(kind: CalendarDay["kind"], hour: number) {
  if (kind === "weekend" || kind === "holiday") return hour >= 9 && hour <= 18 ? -8 : -4;
  if (hour <= 9) return 10;
  if (hour <= 11) return -2;
  if (hour <= 14) return 6;
  if (hour <= 16) return -1;
  if (hour <= 19) return 9;
  return -7;
}

function hourValue(value: string | undefined, index: number) {
  const parsed = Number((value ?? "").split(":")[0]);
  return Number.isFinite(parsed) ? parsed : index + 8;
}

function timeRange(startHour: number) {
  return `${String(startHour).padStart(2, "0")}:00–${String(startHour + 2).padStart(2, "0")}:00`;
}

function peakWindow(hours: number[], scores: number[]) {
  if (scores.length < 2) return "종일 비슷함";
  let bestIndex = 0;
  let bestAverage = -1;
  for (let index = 0; index < scores.length - 1; index += 1) {
    if (hours[index] > 20) continue;
    if (hours[index + 1] !== hours[index] + 1) continue;
    const average = (scores[index] + scores[index + 1]) / 2;
    if (average > bestAverage) {
      bestAverage = average;
      bestIndex = index;
    }
  }
  return timeRange(hours[bestIndex]);
}

function applyRegionCalendar(region: RegionForecast, day: CalendarDay): RegionForecast {
  const regionType = REGION_TYPES[region.id] ?? "commercial";
  const previousCalendar = Number(region.scoreComponents.calendar) || 0;
  const nextCalendar = day.calendarScore * CALENDAR_WEIGHT;
  const dailyDelta = nextCalendar - previousCalendar;
  const hours = region.hourly.map((_, index) => hourValue(region.hours[index], index));
  const hourly = region.hourly.map((score, index) => clampScore(
    score + dailyDelta + (OFFICE_REGIONS.has(region.id) ? officeTimeAdjustment(day.kind, hours[index]) : timeAdjustment(day.kind, regionType, hours[index])) + vacationAdjustment(day, region, regionType, hours[index]),
  ));
  const slots = hourly.map((score, index) => ({ time: `${String(hours[index]).padStart(2, "0")}:00`, score }));
  const calm = findBestTwoHourWindow(slots);
  const vacationDailyDelta = !day.vacationLabel ? 0 : CAMPUS_REGIONS.has(region.id) ? -4 : regionType === "tourism" ? 3 : 1;
  const officeDailyDelta = OFFICE_REGIONS.has(region.id) && (day.kind === "weekend" || day.kind === "holiday") ? -12 : 0;
  const score = clampScore(region.score + dailyDelta + (day.kind === "holiday" ? 2 : 0) + vacationDailyDelta + officeDailyDelta);
  const vacationFactor = !day.vacationLabel
    ? null
    : CAMPUS_REGIONS.has(region.id) ? `${day.vacationLabel} 대학가 수요 완화` : `${day.vacationLabel} 관광·체험 수요`;
  const factors = [vacationFactor, day.factor, ...region.factors.filter((factor) => !/(주말|평일|공휴일|방학|퇴근·하교|금요일 저녁)/.test(factor))]
    .filter((factor): factor is string => Boolean(factor))
    .slice(0, 3);

  return {
    ...region,
    score,
    riskLevel: riskLevelForScore(score),
    riskLabel: riskLabelForScore(score),
    peak: peakWindow(hours, hourly),
    calm: calm ? `${calm.start}–${calm.end}` : "종일 비슷함",
    factors,
    hourly,
    scoreComponents: { ...region.scoreComponents, calendar: nextCalendar },
  };
}

export function applyCalendarProfile(forecast: PublicForecastResponse): PublicForecastResponse {
  const day = calendarDayFor(forecast.date);
  return { ...forecast, regions: forecast.regions.map((region) => applyRegionCalendar(region, day)) };
}
