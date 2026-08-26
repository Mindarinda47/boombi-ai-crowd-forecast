import { calculateConfidence } from "../domain/forecast/confidence.ts";
import { findBestTwoHourWindow } from "../domain/forecast/recommendation.ts";
import { ALGORITHM_VERSION, calculateForecastScore, clampScore, riskLabelForScore, riskLevelForScore } from "../domain/forecast/score.ts";
import type { ConfidenceInputs, PublicForecastResponse, ScoreInputs } from "../domain/forecast/types.ts";

const HOURS = Array.from({ length: 15 }, (_, index) => `${String(index + 8).padStart(2, "0")}:00`);
const DATE_SIGNAL_ADJUSTMENTS = [0, -8, -13, -6, 5, -2, 7, -4];

type DemoRegion = {
  id: string;
  name: string;
  area: string;
  weather: string;
  peak: string;
  factors: string[];
  event: string;
  eventMeta: string;
  x: number;
  y: number;
  hourly: number[];
  scoreInputs: ScoreInputs;
  confidenceInputs: ConfidenceInputs;
};

const DEMO_REGIONS: DemoRegion[] = [
  {
    id: "seomyeon", name: "서면", area: "부산진구", weather: "흐림 28°", peak: "11:00–17:00",
    factors: ["한정 상품·선착순 판매", "검색 관심도 2.1배 상승", "주말 상권 수요 중첩"],
    event: "대형 캐릭터 팝업 스토어", eventMeta: "롯데백화점 일대 · 10:30–20:00", x: 46, y: 47,
    hourly: [62, 72, 88, 94, 96, 95, 92, 88, 83, 74, 63, 52, 48],
    scoreInputs: { baseline: 78, eventImpact: 100, trend: 90, calendar: 75, weatherAdjustment: 3, nearbyEventAdjustment: 3 },
    confidenceInputs: { officialSourceQuality: 0.9, baselineQuality: 0.8, trendQuality: 0.8, weatherQuality: 0.9, freshness: 0.95 },
  },
  {
    id: "haeundae", name: "해운대", area: "해운대구", weather: "구름 많음 27°", peak: "14:00–18:00",
    factors: ["해변 방문 수요", "주말 숙박객 유입", "오후 체감온도 상승"],
    event: "해변 문화 체험 행사", eventMeta: "해운대해수욕장 · 13:00–19:00", x: 78, y: 37,
    hourly: [42, 34, 36, 48, 59, 69, 76, 78, 77, 72, 65, 55, 46],
    scoreInputs: { baseline: 70, eventImpact: 78, trend: 66, calendar: 75, weatherAdjustment: 0, nearbyEventAdjustment: 5 },
    confidenceInputs: { officialSourceQuality: 0.9, baselineQuality: 0.75, trendQuality: 0.75, weatherQuality: 0.9, freshness: 0.9 },
  },
  {
    id: "gwangalli", name: "광안리", area: "수영구", weather: "약한 비 26°", peak: "17:00–21:00",
    factors: ["야간 해변 방문 수요", "인근 공연 관람객", "비 예보로 야외 수요 감소"],
    event: "광안리 어쿠스틱 라이브", eventMeta: "해변 만남의 광장 · 18:00–20:30", x: 68, y: 52,
    hourly: [34, 36, 42, 47, 53, 59, 65, 70, 72, 74, 73, 68, 61],
    scoreInputs: { baseline: 62, eventImpact: 82, trend: 62, calendar: 75, weatherAdjustment: -6, nearbyEventAdjustment: 8 },
    confidenceInputs: { officialSourceQuality: 0.85, baselineQuality: 0.75, trendQuality: 0.7, weatherQuality: 0.9, freshness: 0.9 },
  },
  {
    id: "centum", name: "센텀", area: "해운대구", weather: "비 26°", peak: "12:00–16:00",
    factors: ["실내 전시 관람객", "비로 인한 실내 수요 이동", "쇼핑 시간대 중첩"],
    event: "미래 모빌리티 특별전", eventMeta: "벡스코 · 10:00–18:00", x: 70, y: 41,
    hourly: [38, 45, 55, 62, 67, 66, 63, 59, 54, 48, 42, 36, 33],
    scoreInputs: { baseline: 58, eventImpact: 68, trend: 58, calendar: 70, weatherAdjustment: 4, nearbyEventAdjustment: 0 },
    confidenceInputs: { officialSourceQuality: 0.95, baselineQuality: 0.8, trendQuality: 0.75, weatherQuality: 0.95, freshness: 0.9 },
  },
  {
    id: "sajik", name: "사직", area: "동래구", weather: "흐림 27°", peak: "16:00–19:00",
    factors: ["경기 시작 전 유입", "종료 후 교통 집중", "주변 식음 수요"],
    event: "부산 홈경기", eventMeta: "사직종합운동장 · 18:30 시작", x: 52, y: 29,
    hourly: [29, 32, 36, 39, 43, 49, 57, 62, 66, 64, 58, 49, 42],
    scoreInputs: { baseline: 52, eventImpact: 70, trend: 48, calendar: 65, weatherAdjustment: 0, nearbyEventAdjustment: 3 },
    confidenceInputs: { officialSourceQuality: 0.95, baselineQuality: 0.75, trendQuality: 0.65, weatherQuality: 0.85, freshness: 0.9 },
  },
  {
    id: "busan-station", name: "부산역", area: "동구", weather: "흐림 28°", peak: "17:00–20:00",
    factors: ["퇴근 시간대 환승", "주말 철도 이용객", "인근 행사 이동 수요"],
    event: "유라시아 시민 광장 마켓", eventMeta: "부산역 광장 · 15:00–20:00", x: 37, y: 64,
    hourly: [35, 39, 43, 41, 44, 48, 53, 55, 57, 55, 51, 46, 42],
    scoreInputs: { baseline: 62, eventImpact: 35, trend: 45, calendar: 65, weatherAdjustment: 0, nearbyEventAdjustment: 5 },
    confidenceInputs: { officialSourceQuality: 0.8, baselineQuality: 0.8, trendQuality: 0.6, weatherQuality: 0.8, freshness: 0.85 },
  },
  {
    id: "nampo", name: "남포", area: "중구", weather: "흐림 28°", peak: "15:00–18:00",
    factors: ["관광 상권 방문", "국제시장 보행 수요", "오후 쇼핑 시간대"],
    event: "원도심 골목 문화 주간", eventMeta: "광복로 일대 · 상시", x: 28, y: 72,
    hourly: [28, 31, 35, 39, 44, 48, 49, 48, 46, 43, 39, 35, 31],
    scoreInputs: { baseline: 55, eventImpact: 30, trend: 42, calendar: 65, weatherAdjustment: 0, nearbyEventAdjustment: 3 },
    confidenceInputs: { officialSourceQuality: 0.8, baselineQuality: 0.75, trendQuality: 0.65, weatherQuality: 0.85, freshness: 0.8 },
  },
  {
    id: "gijang", name: "기장", area: "기장군", weather: "약한 비 25°", peak: "13:00–16:00",
    factors: ["주말 관광 수요", "비로 인한 야외 방문 감소", "도로 이동 비중 높음"],
    event: "해안 산책 프로그램", eventMeta: "오시리아 해안 · 11:00–17:00", x: 87, y: 18,
    hourly: [22, 25, 30, 35, 39, 40, 38, 35, 33, 31, 28, 25, 23],
    scoreInputs: { baseline: 45, eventImpact: 32, trend: 35, calendar: 60, weatherAdjustment: -4, nearbyEventAdjustment: 2 },
    confidenceInputs: { officialSourceQuality: 0.75, baselineQuality: 0.65, trendQuality: 0.55, weatherQuality: 0.85, freshness: 0.8 },
  },
  {
    id: "jeonpo", name: "전포", area: "부산진구", weather: "흐림 28°", peak: "16:00–20:00",
    factors: ["카페거리 방문 수요", "저녁 식음 유동", "서면 상권 인접 영향"],
    event: "전포 콘텐츠 마켓", eventMeta: "전포카페거리 · 14:00–20:00", x: 48, y: 49,
    hourly: [35, 40, 46, 52, 58, 62, 65, 69, 72, 74, 70, 64, 58],
    scoreInputs: { baseline: 64, eventImpact: 52, trend: 62, calendar: 70, weatherAdjustment: 0, nearbyEventAdjustment: 7 },
    confidenceInputs: { officialSourceQuality: 0.8, baselineQuality: 0.75, trendQuality: 0.75, weatherQuality: 0.85, freshness: 0.85 },
  },
  {
    id: "songjeong", name: "송정", area: "해운대구", weather: "구름 많음 27°", peak: "13:00–18:00",
    factors: ["해변·서핑 방문 수요", "주말 카페 이용객", "오후 해안 이동 증가"],
    event: "송정 해변 체험 프로그램", eventMeta: "송정해수욕장 · 11:00–18:00", x: 84, y: 34,
    hourly: [28, 33, 40, 48, 56, 63, 68, 70, 68, 62, 54, 45, 37],
    scoreInputs: { baseline: 57, eventImpact: 55, trend: 52, calendar: 72, weatherAdjustment: 0, nearbyEventAdjustment: 3 },
    confidenceInputs: { officialSourceQuality: 0.8, baselineQuality: 0.7, trendQuality: 0.7, weatherQuality: 0.9, freshness: 0.85 },
  },
  {
    id: "yeongdo", name: "영도", area: "영도구", weather: "흐림 27°", peak: "12:00–17:00",
    factors: ["흰여울·태종대 관광 수요", "주말 차량 이동", "오후 전망 명소 방문"],
    event: "영도 해양문화 프로그램", eventMeta: "영도 일대 · 10:00–18:00", x: 40, y: 78,
    hourly: [25, 30, 38, 46, 54, 59, 62, 61, 57, 50, 43, 35, 29],
    scoreInputs: { baseline: 52, eventImpact: 46, trend: 45, calendar: 70, weatherAdjustment: -2, nearbyEventAdjustment: 2 },
    confidenceInputs: { officialSourceQuality: 0.8, baselineQuality: 0.7, trendQuality: 0.65, weatherQuality: 0.9, freshness: 0.8 },
  },
  {
    id: "pnu", name: "부산대", area: "금정구", weather: "흐림 27°", peak: "17:00–20:00",
    factors: ["대학가 저녁 유동", "식음 상권 방문", "지하철 환승 수요"],
    event: "부산대 청년문화 행사", eventMeta: "부산대역 일대 · 16:00–20:00", x: 55, y: 15,
    hourly: [34, 38, 42, 45, 48, 50, 53, 57, 62, 66, 64, 59, 52],
    scoreInputs: { baseline: 58, eventImpact: 42, trend: 50, calendar: 62, weatherAdjustment: 0, nearbyEventAdjustment: 3 },
    confidenceInputs: { officialSourceQuality: 0.75, baselineQuality: 0.75, trendQuality: 0.7, weatherQuality: 0.85, freshness: 0.85 },
  },
  {
    id: "kyungsung", name: "경성대·부경대", area: "남구", weather: "흐림 28°", peak: "17:00–21:00",
    factors: ["대학가 저녁 상권", "공연·식음 방문 수요", "광안리 인접 이동"],
    event: "대학로 문화거리 행사", eventMeta: "경성대·부경대역 일대 · 16:00–21:00", x: 60, y: 55,
    hourly: [32, 36, 40, 44, 48, 52, 57, 62, 67, 71, 70, 65, 57],
    scoreInputs: { baseline: 60, eventImpact: 48, trend: 54, calendar: 65, weatherAdjustment: 0, nearbyEventAdjustment: 5 },
    confidenceInputs: { officialSourceQuality: 0.75, baselineQuality: 0.75, trendQuality: 0.7, weatherQuality: 0.85, freshness: 0.85 },
  },
  {
    id: "dongnae", name: "동래", area: "동래구", weather: "흐림 27°", peak: "17:00–20:00",
    factors: ["동래역 환승 수요", "명륜 상권 저녁 유동", "온천장 방문 수요"],
    event: "동래 역사문화 프로그램", eventMeta: "동래읍성 일대 · 11:00–18:00", x: 54, y: 23,
    hourly: [36, 41, 43, 45, 47, 49, 52, 55, 59, 63, 61, 55, 48],
    scoreInputs: { baseline: 57, eventImpact: 38, trend: 44, calendar: 62, weatherAdjustment: 0, nearbyEventAdjustment: 4 },
    confidenceInputs: { officialSourceQuality: 0.8, baselineQuality: 0.75, trendQuality: 0.65, weatherQuality: 0.85, freshness: 0.8 },
  },
  {
    id: "dadaepo", name: "다대포", area: "사하구", weather: "구름 많음 27°", peak: "15:00–19:00",
    factors: ["해변·낙조 방문 수요", "오후 가족 단위 유입", "도시철도 종점 이동"],
    event: "다대포 낙조 문화행사", eventMeta: "다대포해수욕장 · 15:00–20:00", x: 15, y: 83,
    hourly: [20, 24, 29, 35, 42, 49, 55, 60, 63, 62, 56, 47, 37],
    scoreInputs: { baseline: 45, eventImpact: 43, trend: 39, calendar: 68, weatherAdjustment: -2, nearbyEventAdjustment: 1 },
    confidenceInputs: { officialSourceQuality: 0.8, baselineQuality: 0.65, trendQuality: 0.6, weatherQuality: 0.9, freshness: 0.8 },
  },
  {
    id: "gamcheon", name: "감천문화마을", area: "사하구", weather: "흐림 27°", peak: "11:00–16:00",
    factors: ["관광객 도보 방문", "주간 포토스팟 수요", "원도심 연계 이동"],
    event: "감천 골목문화 프로그램", eventMeta: "감천문화마을 · 10:00–17:00", x: 24, y: 75,
    hourly: [24, 30, 39, 48, 55, 59, 60, 57, 51, 43, 35, 29, 24],
    scoreInputs: { baseline: 48, eventImpact: 36, trend: 42, calendar: 68, weatherAdjustment: -1, nearbyEventAdjustment: 3 },
    confidenceInputs: { officialSourceQuality: 0.8, baselineQuality: 0.65, trendQuality: 0.65, weatherQuality: 0.85, freshness: 0.8 },
  },
  {
    id: "songdo", name: "송도", area: "서구", weather: "구름 많음 27°", peak: "13:00–18:00",
    factors: ["해수욕장·케이블카 수요", "오후 가족 관광객", "원도심 연계 이동"],
    event: "송도 해양레저 프로그램", eventMeta: "송도해수욕장 · 11:00–19:00", x: 28, y: 82,
    hourly: [24, 29, 36, 44, 52, 59, 64, 66, 64, 58, 50, 41, 33],
    scoreInputs: { baseline: 52, eventImpact: 50, trend: 46, calendar: 70, weatherAdjustment: 0, nearbyEventAdjustment: 3 },
    confidenceInputs: { officialSourceQuality: 0.85, baselineQuality: 0.7, trendQuality: 0.65, weatherQuality: 0.9, freshness: 0.85 },
  },
  {
    id: "osiria", name: "오시리아", area: "기장군", weather: "구름 많음 26°", peak: "11:00–18:00",
    factors: ["테마파크·쇼핑 방문", "방학 가족 단위 수요", "주간 차량 유입"],
    event: "오시리아 패밀리 페스타", eventMeta: "오시리아 관광단지 · 10:00–20:00", x: 86, y: 27,
    hourly: [31, 40, 52, 63, 70, 74, 76, 74, 69, 61, 51, 42, 35],
    scoreInputs: { baseline: 62, eventImpact: 62, trend: 58, calendar: 74, weatherAdjustment: 0, nearbyEventAdjustment: 4 },
    confidenceInputs: { officialSourceQuality: 0.85, baselineQuality: 0.75, trendQuality: 0.7, weatherQuality: 0.9, freshness: 0.85 },
  },
  {
    id: "taejongdae", name: "태종대", area: "영도구", weather: "흐림 27°", peak: "11:00–16:00",
    factors: ["전망대·유원지 방문", "주간 관광버스 유입", "해안 산책 수요"],
    event: "태종대 자연해설 프로그램", eventMeta: "태종대유원지 · 10:00–17:00", x: 44, y: 88,
    hourly: [22, 29, 39, 50, 58, 62, 63, 59, 53, 45, 37, 30, 25],
    scoreInputs: { baseline: 49, eventImpact: 42, trend: 40, calendar: 70, weatherAdjustment: -1, nearbyEventAdjustment: 2 },
    confidenceInputs: { officialSourceQuality: 0.85, baselineQuality: 0.7, trendQuality: 0.6, weatherQuality: 0.9, freshness: 0.8 },
  },
  {
    id: "huinnyeoul", name: "흰여울문화마을", area: "영도구", weather: "흐림 27°", peak: "12:00–17:00",
    factors: ["골목 관광·포토스팟", "오후 카페 방문", "원도심 관광객 이동"],
    event: "흰여울 골목문화 프로그램", eventMeta: "흰여울문화마을 · 11:00–18:00", x: 35, y: 78,
    hourly: [23, 30, 41, 51, 59, 63, 65, 62, 57, 49, 40, 32, 26],
    scoreInputs: { baseline: 51, eventImpact: 45, trend: 48, calendar: 70, weatherAdjustment: -1, nearbyEventAdjustment: 3 },
    confidenceInputs: { officialSourceQuality: 0.8, baselineQuality: 0.7, trendQuality: 0.65, weatherQuality: 0.85, freshness: 0.8 },
  },
  {
    id: "igidae", name: "이기대·오륙도", area: "남구", weather: "구름 많음 27°", peak: "13:00–18:00",
    factors: ["해안산책로 방문", "전망대 관광 수요", "오후 자가용 유입"],
    event: "이기대 해안걷기 프로그램", eventMeta: "이기대·오륙도 일대 · 10:00–18:00", x: 65, y: 63,
    hourly: [20, 26, 34, 43, 51, 58, 62, 63, 59, 52, 43, 34, 27],
    scoreInputs: { baseline: 47, eventImpact: 40, trend: 39, calendar: 68, weatherAdjustment: -1, nearbyEventAdjustment: 2 },
    confidenceInputs: { officialSourceQuality: 0.8, baselineQuality: 0.65, trendQuality: 0.6, weatherQuality: 0.9, freshness: 0.8 },
  },
  {
    id: "deokcheon", name: "덕천", area: "북구", weather: "흐림 28°", peak: "17:00–21:00",
    factors: ["북부산 상권 방문", "도시철도 환승 유동", "저녁 식음 수요"],
    event: "덕천 젊음의거리 행사", eventMeta: "덕천동 일대 · 16:00–21:00", x: 37, y: 18,
    hourly: [35, 41, 44, 46, 49, 52, 55, 59, 64, 68, 67, 62, 55],
    scoreInputs: { baseline: 58, eventImpact: 40, trend: 47, calendar: 62, weatherAdjustment: 0, nearbyEventAdjustment: 2 },
    confidenceInputs: { officialSourceQuality: 0.75, baselineQuality: 0.75, trendQuality: 0.65, weatherQuality: 0.85, freshness: 0.8 },
  },
  {
    id: "yeonsan", name: "연산", area: "연제구", weather: "흐림 28°", peak: "17:00–20:00",
    factors: ["도시철도 환승 수요", "행정·업무지 퇴근 유동", "저녁 상권 방문"],
    event: "연산 생활문화 프로그램", eventMeta: "연산교차로 일대 · 17:00–20:00", x: 53, y: 33,
    hourly: [44, 48, 43, 41, 43, 45, 48, 52, 59, 66, 64, 57, 50],
    scoreInputs: { baseline: 61, eventImpact: 32, trend: 42, calendar: 58, weatherAdjustment: 0, nearbyEventAdjustment: 3 },
    confidenceInputs: { officialSourceQuality: 0.75, baselineQuality: 0.8, trendQuality: 0.65, weatherQuality: 0.85, freshness: 0.85 },
  },
  {
    id: "hadan", name: "하단·동아대", area: "사하구", weather: "흐림 28°", peak: "17:00–21:00",
    factors: ["대학가·상권 저녁 유동", "서부산 환승 수요", "을숙도 연계 이동"],
    event: "낙동강 생활문화 행사", eventMeta: "하단·을숙도 일대 · 14:00–20:00", x: 17, y: 68,
    hourly: [36, 42, 45, 47, 50, 52, 55, 58, 63, 67, 66, 60, 53],
    scoreInputs: { baseline: 58, eventImpact: 38, trend: 44, calendar: 60, weatherAdjustment: 0, nearbyEventAdjustment: 3 },
    confidenceInputs: { officialSourceQuality: 0.75, baselineQuality: 0.75, trendQuality: 0.65, weatherQuality: 0.85, freshness: 0.8 },
  },
  {
    id: "sasang", name: "사상", area: "사상구", weather: "흐림 28°", peak: "17:00–20:00",
    factors: ["서부산 환승 수요", "산업·업무지 퇴근 유동", "저녁 상권 방문"],
    event: "사상 생활문화 프로그램", eventMeta: "사상역 일대 · 17:00–20:00", x: 20, y: 49,
    hourly: [43, 47, 44, 42, 44, 48, 52, 57, 63, 68, 64, 57, 50],
    scoreInputs: { baseline: 63, eventImpact: 34, trend: 45, calendar: 58, weatherAdjustment: 0, nearbyEventAdjustment: 3 },
    confidenceInputs: { officialSourceQuality: 0.8, baselineQuality: 0.8, trendQuality: 0.65, weatherQuality: 0.85, freshness: 0.85 },
  },
  {
    id: "citizens-park", name: "부산시민공원", area: "부산진구", weather: "흐림 28°", peak: "13:00–18:00",
    factors: ["도심 공원 방문", "가족 단위 나들이", "서면 인접 이동"],
    event: "시민공원 체험 프로그램", eventMeta: "부산시민공원 · 11:00–18:00", x: 44, y: 42,
    hourly: [24, 29, 36, 44, 52, 58, 61, 63, 61, 56, 47, 38, 30],
    scoreInputs: { baseline: 50, eventImpact: 46, trend: 47, calendar: 70, weatherAdjustment: -1, nearbyEventAdjustment: 4 },
    confidenceInputs: { officialSourceQuality: 0.8, baselineQuality: 0.7, trendQuality: 0.65, weatherQuality: 0.85, freshness: 0.8 },
  },
  {
    id: "oncheonjang", name: "온천장", area: "동래구", weather: "흐림 27°", peak: "16:00–20:00",
    factors: ["온천·상권 방문", "금강공원 연계 이동", "저녁 식음 수요"],
    event: "온천장 문화산책", eventMeta: "온천장역 일대 · 15:00–19:00", x: 55, y: 20,
    hourly: [31, 36, 40, 43, 46, 49, 53, 57, 61, 64, 59, 52, 45],
    scoreInputs: { baseline: 56, eventImpact: 34, trend: 43, calendar: 61, weatherAdjustment: 0, nearbyEventAdjustment: 3 },
    confidenceInputs: { officialSourceQuality: 0.75, baselineQuality: 0.75, trendQuality: 0.65, weatherQuality: 0.85, freshness: 0.8 },
  },
  {
    id: "cheongsapo", name: "청사포", area: "해운대구", weather: "구름 많음 27°", peak: "13:00–18:00",
    factors: ["해안 산책·카페 방문", "해변열차 이용", "오후 관광객 유입"],
    event: "청사포 해안 체험", eventMeta: "청사포 일대 · 11:00–18:00", x: 82, y: 43,
    hourly: [21, 27, 35, 44, 52, 59, 63, 65, 62, 56, 47, 37, 29],
    scoreInputs: { baseline: 48, eventImpact: 44, trend: 50, calendar: 72, weatherAdjustment: 0, nearbyEventAdjustment: 3 },
    confidenceInputs: { officialSourceQuality: 0.8, baselineQuality: 0.7, trendQuality: 0.65, weatherQuality: 0.9, freshness: 0.8 },
  },
  {
    id: "eulsukdo", name: "을숙도", area: "사하구", weather: "구름 많음 27°", peak: "12:00–17:00",
    factors: ["생태공원 방문", "가족 체험 수요", "주말 차량 유입"],
    event: "낙동강 생태 체험", eventMeta: "을숙도생태공원 · 10:00–17:00", x: 8, y: 72,
    hourly: [18, 23, 31, 39, 47, 53, 57, 58, 54, 48, 39, 30, 24],
    scoreInputs: { baseline: 42, eventImpact: 38, trend: 36, calendar: 70, weatherAdjustment: 0, nearbyEventAdjustment: 2 },
    confidenceInputs: { officialSourceQuality: 0.8, baselineQuality: 0.65, trendQuality: 0.6, weatherQuality: 0.9, freshness: 0.8 },
  },
  {
    id: "dong-eui", name: "동의대", area: "부산진구", weather: "흐림 28°", peak: "16:00–20:00",
    factors: ["수업 종료 이동", "대학가 식음 수요", "도시철도 이용"],
    event: "동의대 캠퍼스 프로그램", eventMeta: "동의대학교 일대 · 16:00–19:00", x: 36, y: 55,
    hourly: [30, 36, 43, 48, 51, 53, 55, 58, 62, 65, 59, 51, 43],
    scoreInputs: { baseline: 52, eventImpact: 30, trend: 42, calendar: 58, weatherAdjustment: 0, nearbyEventAdjustment: 2 },
    confidenceInputs: { officialSourceQuality: 0.7, baselineQuality: 0.7, trendQuality: 0.65, weatherQuality: 0.85, freshness: 0.8 },
  },
  {
    id: "dongseo", name: "동서대", area: "사상구", weather: "흐림 28°", peak: "16:00–20:00",
    factors: ["수업 종료 이동", "주례 상권 방문", "통학버스·도시철도 수요"],
    event: "동서대 캠퍼스 프로그램", eventMeta: "동서대학교 일대 · 16:00–19:00", x: 28, y: 53,
    hourly: [29, 35, 42, 47, 50, 52, 54, 57, 61, 64, 58, 50, 42],
    scoreInputs: { baseline: 50, eventImpact: 29, trend: 40, calendar: 58, weatherAdjustment: 0, nearbyEventAdjustment: 2 },
    confidenceInputs: { officialSourceQuality: 0.7, baselineQuality: 0.7, trendQuality: 0.65, weatherQuality: 0.85, freshness: 0.8 },
  },
  {
    id: "silla", name: "신라대", area: "사상구", weather: "흐림 27°", peak: "16:00–19:00",
    factors: ["수업 종료 이동", "통학버스 수요", "주변 생활권 방문"],
    event: "신라대 캠퍼스 프로그램", eventMeta: "신라대학교 일대 · 15:00–18:00", x: 23, y: 44,
    hourly: [27, 33, 40, 44, 47, 49, 51, 54, 58, 61, 55, 47, 39],
    scoreInputs: { baseline: 46, eventImpact: 26, trend: 37, calendar: 58, weatherAdjustment: 0, nearbyEventAdjustment: 1 },
    confidenceInputs: { officialSourceQuality: 0.7, baselineQuality: 0.65, trendQuality: 0.6, weatherQuality: 0.85, freshness: 0.8 },
  },
  {
    id: "bufs", name: "부산외대", area: "금정구", weather: "흐림 27°", peak: "16:00–19:00",
    factors: ["수업 종료 이동", "통학버스 수요", "남산동 생활권 방문"],
    event: "부산외대 캠퍼스 프로그램", eventMeta: "부산외국어대학교 일대 · 15:00–18:00", x: 53, y: 8,
    hourly: [26, 32, 39, 43, 46, 48, 50, 53, 57, 60, 54, 46, 38],
    scoreInputs: { baseline: 45, eventImpact: 26, trend: 37, calendar: 58, weatherAdjustment: 0, nearbyEventAdjustment: 1 },
    confidenceInputs: { officialSourceQuality: 0.7, baselineQuality: 0.65, trendQuality: 0.6, weatherQuality: 0.85, freshness: 0.8 },
  },
  {
    id: "kmou", name: "한국해양대", area: "영도구", weather: "흐림 27°", peak: "16:00–19:00",
    factors: ["수업 종료 이동", "캠퍼스 셔틀 수요", "영도 해안 방문"],
    event: "해양대 캠퍼스 프로그램", eventMeta: "한국해양대학교 일대 · 15:00–18:00", x: 55, y: 81,
    hourly: [25, 31, 38, 42, 45, 47, 49, 52, 56, 59, 53, 45, 37],
    scoreInputs: { baseline: 44, eventImpact: 26, trend: 36, calendar: 58, weatherAdjustment: 0, nearbyEventAdjustment: 1 },
    confidenceInputs: { officialSourceQuality: 0.7, baselineQuality: 0.65, trendQuality: 0.6, weatherQuality: 0.85, freshness: 0.8 },
  },
  {
    id: "gimhae-airport", name: "김해공항", area: "강서구", weather: "흐림 28°", peak: "17:00–20:00",
    factors: ["항공편 출도착 집중", "주말·연휴 여행 수요", "경전철·차량 환승"],
    event: "공항 여객 이동 집중", eventMeta: "김해국제공항 · 항공편 운항시간", x: 7, y: 47,
    hourly: [57, 62, 56, 48, 46, 49, 53, 57, 62, 68, 71, 66, 58],
    scoreInputs: { baseline: 66, eventImpact: 38, trend: 48, calendar: 64, weatherAdjustment: 0, nearbyEventAdjustment: 2 },
    confidenceInputs: { officialSourceQuality: 0.85, baselineQuality: 0.8, trendQuality: 0.7, weatherQuality: 0.85, freshness: 0.85 },
  },
  {
    id: "nopo", name: "노포·부산종합버스터미널", area: "금정구", weather: "흐림 27°", peak: "17:00–20:00",
    factors: ["시외·고속버스 출발 집중", "도시철도 환승", "주말 광역 이동"],
    event: "광역버스 여객 이동", eventMeta: "부산종합버스터미널 · 운행시간", x: 59, y: 8,
    hourly: [53, 58, 52, 45, 43, 46, 50, 54, 59, 65, 68, 62, 54],
    scoreInputs: { baseline: 62, eventImpact: 35, trend: 43, calendar: 64, weatherAdjustment: 0, nearbyEventAdjustment: 2 },
    confidenceInputs: { officialSourceQuality: 0.85, baselineQuality: 0.8, trendQuality: 0.65, weatherQuality: 0.85, freshness: 0.85 },
  },
  {
    id: "myeongji", name: "명지", area: "강서구", weather: "흐림 28°", peak: "16:00–20:00",
    factors: ["신도시 상권 방문", "가족 단위 외식·쇼핑", "서부산 차량 이동"],
    event: "명지 생활문화 프로그램", eventMeta: "명지국제신도시 일대 · 14:00–19:00", x: 7, y: 67,
    hourly: [27, 31, 36, 41, 46, 50, 54, 58, 63, 67, 65, 59, 51],
    scoreInputs: { baseline: 55, eventImpact: 34, trend: 43, calendar: 61, weatherAdjustment: 0, nearbyEventAdjustment: 2 },
    confidenceInputs: { officialSourceQuality: 0.75, baselineQuality: 0.7, trendQuality: 0.65, weatherQuality: 0.85, freshness: 0.8 },
  },
  {
    id: "hwamyeong", name: "화명", area: "북구", weather: "흐림 27°", peak: "16:00–20:00",
    factors: ["북부산 생활 상권", "화명생태공원 연계", "저녁 식음·쇼핑 수요"],
    event: "화명 생활문화 프로그램", eventMeta: "화명역 일대 · 15:00–19:00", x: 39, y: 12,
    hourly: [29, 34, 39, 42, 45, 48, 52, 56, 61, 65, 62, 55, 47],
    scoreInputs: { baseline: 54, eventImpact: 32, trend: 41, calendar: 61, weatherAdjustment: 0, nearbyEventAdjustment: 2 },
    confidenceInputs: { officialSourceQuality: 0.75, baselineQuality: 0.7, trendQuality: 0.65, weatherQuality: 0.85, freshness: 0.8 },
  },
  {
    id: "munhyeon", name: "문현·BIFC", area: "남구", weather: "흐림 28°", peak: "08:00–10:00",
    factors: ["금융·업무지 출근 수요", "점심시간 직장인 이동", "퇴근 시간 환승"],
    event: "금융단지 업무 이동", eventMeta: "부산국제금융센터 일대 · 평일 업무시간", x: 49, y: 57,
    hourly: [66, 70, 58, 54, 61, 63, 57, 53, 56, 64, 68, 55, 42],
    scoreInputs: { baseline: 61, eventImpact: 28, trend: 40, calendar: 58, weatherAdjustment: 0, nearbyEventAdjustment: 3 },
    confidenceInputs: { officialSourceQuality: 0.8, baselineQuality: 0.85, trendQuality: 0.65, weatherQuality: 0.85, freshness: 0.85 },
  },
  {
    id: "jangsan", name: "장산", area: "해운대구", weather: "구름 많음 27°", peak: "16:00–20:00",
    factors: ["해운대 주거·상업 수요", "도시철도 종점 이동", "저녁 쇼핑·외식 방문"],
    event: "장산 생활상권 프로그램", eventMeta: "장산역 일대 · 15:00–20:00", x: 80, y: 35,
    hourly: [35, 40, 43, 45, 48, 51, 55, 59, 64, 68, 65, 58, 50],
    scoreInputs: { baseline: 58, eventImpact: 34, trend: 45, calendar: 62, weatherAdjustment: 0, nearbyEventAdjustment: 3 },
    confidenceInputs: { officialSourceQuality: 0.75, baselineQuality: 0.75, trendQuality: 0.65, weatherQuality: 0.9, freshness: 0.8 },
  },
  {
    id: "ilgwang", name: "일광", area: "기장군", weather: "구름 많음 26°", peak: "12:00–18:00",
    factors: ["해수욕장·카페 방문", "신도시 가족 수요", "동해선 이용객 유입"],
    event: "일광 해안 체험", eventMeta: "일광해수욕장 일대 · 10:00–18:00", x: 90, y: 13,
    hourly: [20, 25, 33, 42, 50, 56, 60, 62, 60, 55, 47, 37, 29],
    scoreInputs: { baseline: 44, eventImpact: 38, trend: 43, calendar: 72, weatherAdjustment: 0, nearbyEventAdjustment: 2 },
    confidenceInputs: { officialSourceQuality: 0.8, baselineQuality: 0.65, trendQuality: 0.6, weatherQuality: 0.9, freshness: 0.8 },
  },
  {
    id: "jeonggwan", name: "정관", area: "기장군", weather: "흐림 26°", peak: "16:00–20:00",
    factors: ["신도시 생활 상권", "가족 단위 외식·쇼핑", "퇴근 시간 차량 이동"],
    event: "정관 생활문화 프로그램", eventMeta: "정관신도시 일대 · 15:00–19:00", x: 78, y: 7,
    hourly: [27, 32, 37, 40, 43, 46, 49, 53, 58, 62, 59, 52, 44],
    scoreInputs: { baseline: 50, eventImpact: 28, trend: 38, calendar: 60, weatherAdjustment: 0, nearbyEventAdjustment: 1 },
    confidenceInputs: { officialSourceQuality: 0.7, baselineQuality: 0.65, trendQuality: 0.6, weatherQuality: 0.85, freshness: 0.8 },
  },
];

function hourlyScoresForServiceHours(scores: number[]) {
  return HOURS.map((_, index) => {
    if (scores[index] !== undefined) return scores[index];
    const lastScore = scores[scores.length - 1] ?? 0;
    return clampScore(lastScore - (index - scores.length + 1) * 6);
  });
}

export function seoulDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export function dayOffsetFromToday(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const [todayYear, todayMonth, todayDay] = seoulDateKey().split("-").map(Number);
  return Math.round((Date.UTC(year, month - 1, day) - Date.UTC(todayYear, todayMonth - 1, todayDay)) / 86_400_000);
}

export function dateKeyForOffset(offset: number) {
  const [year, month, day] = seoulDateKey().split("-").map(Number);
  const target = new Date(Date.UTC(year, month - 1, day + offset));
  return `${target.getUTCFullYear()}-${String(target.getUTCMonth() + 1).padStart(2, "0")}-${String(target.getUTCDate()).padStart(2, "0")}`;
}

export function createDemoForecast(dateKey = seoulDateKey()): PublicForecastResponse {
  const offset = dayOffsetFromToday(dateKey);
  if (!Number.isInteger(offset) || offset < 0 || offset > 7) {
    throw new RangeError("예보 날짜는 오늘부터 7일 뒤까지 선택할 수 있습니다.");
  }
  const adjustment = DATE_SIGNAL_ADJUSTMENTS[offset];
  const generatedAt = new Date().toISOString();

  const regions = DEMO_REGIONS.map((region) => {
    const scoreInputs = {
      ...region.scoreInputs,
      eventImpact: 0,
      nearbyEventAdjustment: 0,
    };
    const scoreResult = calculateForecastScore({
      ...scoreInputs,
      trend: clampScore(scoreInputs.trend + adjustment * 2),
      calendar: clampScore(scoreInputs.calendar + adjustment),
    });
    const sourceScore = calculateForecastScore({
      ...region.scoreInputs,
      eventImpact: 0,
      nearbyEventAdjustment: 0,
    }).score;
    const hourlyAdjustment = scoreResult.score - sourceScore;
    const hourly = hourlyScoresForServiceHours(region.hourly).map((score) => clampScore(score + hourlyAdjustment));
    const recommendation = findBestTwoHourWindow(HOURS.map((time, index) => ({ time, score: hourly[index] })));
    const confidence = calculateConfidence(region.confidenceInputs);

    return {
      id: region.id,
      name: region.name,
      area: region.area,
      score: scoreResult.score,
      riskLevel: riskLevelForScore(scoreResult.score),
      riskLabel: riskLabelForScore(scoreResult.score),
      confidence: confidence.score,
      confidenceLevel: confidence.level,
      weather: region.weather,
      peak: region.peak,
      calm: recommendation ? `${recommendation.start}–${recommendation.end}` : "종일 비슷함",
      factors: [...region.factors.filter((factor) => !/행사|공연|경기|전시|선착순|한정 상품|관람객|페스티벌|마켓/.test(factor)),
        "평소 시간대별 유동 패턴", "주중·주말 및 방학 일정", "기상 조건에 따른 방문 수요"].filter((factor, index, factors) => factors.indexOf(factor) === index).slice(0, 3),
      event: "영향 행사 없음",
      eventMeta: "선택한 날짜와 지역에서 확인된 관련 행사가 없습니다.",
      eventSource: "none" as const,
      eventSourceName: "",
      eventSourceUrl: null,
      eventImageUrl: null,
      eventRelatedLinks: [],
      eventEvidence: "",
      eventUpdatedAt: generatedAt,
      x: region.x,
      y: region.y,
      hourly,
      hours: HOURS.map((hour) => hour.slice(0, 2)),
      scoreComponents: scoreResult.components,
    };
  });

  return {
    asOf: generatedAt,
    date: dateKey,
    mode: "demo",
    weatherSource: "stored",
    trendSource: "stored",
    algorithmVersion: ALGORITHM_VERSION,
    regions,
  };
}

export const INITIAL_DEMO_FORECAST = createDemoForecast(dateKeyForOffset(1));
