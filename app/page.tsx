"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from "react";

import type {
  AlternativeDecisionResponse,
  AlternativePriority,
  ScenarioCalendar,
  ScenarioDecisionResponse,
  ScenarioEvent,
  ScenarioWeather,
} from "../domain/decision/types";
import { withJosa } from "../domain/decision/fallback";
import type { PublicForecastResponse } from "../domain/forecast/types";

type RiskLevel = "여유" | "보통" | "혼잡" | "매우 혼잡" | "극심";

type Region = {
  id: string;
  name: string;
  area: string;
  score: number;
  confidence: number;
  weather: string;
  peak: string;
  calm: string;
  factors: string[];
  event: string;
  eventMeta: string;
  eventSource?: "public_api" | "stored" | "none";
  eventSourceName?: string;
  eventSourceUrl?: string | null;
  eventImageUrl?: string | null;
  eventRelatedLinks?: PublicForecastResponse["regions"][number]["eventRelatedLinks"];
  eventEvidence?: string;
  eventUpdatedAt?: string;
  x: number;
  y: number;
  hourly: number[];
  hours?: string[];
  scoreComponents?: PublicForecastResponse["regions"][number]["scoreComponents"];
};

type RegionCategory = "all" | "commercial" | "tourism" | "campus" | "transit";

type KakaoMapInstance = {
  relayout: () => void;
};

type KakaoCustomOverlay = {
  setMap: (map: KakaoMapInstance | null) => void;
  setZIndex: (zIndex: number) => void;
};

type KakaoMapsSdk = {
  load: (callback: () => void) => void;
  Map: new (container: HTMLElement, options: { center: unknown; level: number }) => KakaoMapInstance;
  LatLng: new (latitude: number, longitude: number) => unknown;
  CustomOverlay: new (options: {
    position: unknown;
    content: HTMLElement;
    xAnchor: number;
    yAnchor: number;
    zIndex: number;
  }) => KakaoCustomOverlay;
};

declare global {
  interface Window {
    kakao?: { maps: KakaoMapsSdk };
  }
}

const KAKAO_MAP_KEY = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY;
const KAKAO_MAP_SCRIPT_ID = "kakao-map-sdk";
const MAP_PIN_LABELS: Record<string, string> = {
  gamcheon: "감천\n마을",
  huinnyeoul: "흰여울\n마을",
  kyungsung: "경성대\n부경대",
  igidae: "이기대\n오륙도",
  hadan: "하단\n동아대",
  "citizens-park": "시민\n공원",
  bufs: "부산\n외대",
  kmou: "해양대",
  "gimhae-airport": "김해\n공항",
  nopo: "노포\n터미널",
  munhyeon: "문현\nBIFC",
};

const REGION_CATEGORIES: Record<string, Exclude<RegionCategory, "all">> = {
  seomyeon: "commercial", haeundae: "tourism", gwangalli: "tourism", centum: "commercial",
  sajik: "tourism", "busan-station": "transit", nampo: "commercial", gijang: "tourism",
  jeonpo: "commercial", songjeong: "tourism", yeongdo: "tourism", pnu: "campus",
  kyungsung: "campus", dongnae: "commercial", dadaepo: "tourism", gamcheon: "tourism",
  songdo: "tourism", osiria: "tourism", taejongdae: "tourism", huinnyeoul: "tourism",
  igidae: "tourism", deokcheon: "commercial", yeonsan: "transit", hadan: "campus",
  sasang: "transit", "citizens-park": "tourism", oncheonjang: "commercial", cheongsapo: "tourism",
  eulsukdo: "tourism", "dong-eui": "campus", dongseo: "campus", silla: "campus",
  bufs: "campus", kmou: "campus",
  "gimhae-airport": "transit", nopo: "transit", myeongji: "commercial", hwamyeong: "commercial",
  munhyeon: "commercial", jangsan: "commercial", ilgwang: "tourism", jeonggwan: "commercial",
};

const REGION_CATEGORY_OPTIONS: { id: RegionCategory; label: string }[] = [
  { id: "all", label: "전체" },
  { id: "commercial", label: "상권" },
  { id: "tourism", label: "관광" },
  { id: "campus", label: "대학" },
  { id: "transit", label: "교통" },
];
const REGION_COORDINATES: Record<string, { latitude: number; longitude: number }> = {
  seomyeon: { latitude: 35.1577, longitude: 129.0594 },
  haeundae: { latitude: 35.1587, longitude: 129.1604 },
  gwangalli: { latitude: 35.1532, longitude: 129.1186 },
  centum: { latitude: 35.169, longitude: 129.1309 },
  sajik: { latitude: 35.194, longitude: 129.0615 },
  "busan-station": { latitude: 35.1151, longitude: 129.0414 },
  nampo: { latitude: 35.0988, longitude: 129.0305 },
  gijang: { latitude: 35.244, longitude: 129.2223 },
  jeonpo: { latitude: 35.1557, longitude: 129.063 },
  songjeong: { latitude: 35.1786, longitude: 129.1997 },
  yeongdo: { latitude: 35.0787, longitude: 129.068 },
  pnu: { latitude: 35.2301, longitude: 129.084 },
  kyungsung: { latitude: 35.1376, longitude: 129.1005 },
  dongnae: { latitude: 35.205, longitude: 129.0787 },
  dadaepo: { latitude: 35.047, longitude: 128.965 },
  gamcheon: { latitude: 35.0975, longitude: 129.0106 },
  songdo: { latitude: 35.0762, longitude: 129.0174 },
  osiria: { latitude: 35.1963, longitude: 129.213 },
  taejongdae: { latitude: 35.0526, longitude: 129.0873 },
  huinnyeoul: { latitude: 35.0778, longitude: 129.0436 },
  igidae: { latitude: 35.1245, longitude: 129.1225 },
  deokcheon: { latitude: 35.2109, longitude: 129.005 },
  yeonsan: { latitude: 35.1861, longitude: 129.0802 },
  hadan: { latitude: 35.1062, longitude: 128.9665 },
  sasang: { latitude: 35.1622, longitude: 128.9846 },
  "citizens-park": { latitude: 35.1666, longitude: 129.0557 },
  oncheonjang: { latitude: 35.2205, longitude: 129.0865 },
  cheongsapo: { latitude: 35.1604, longitude: 129.1911 },
  eulsukdo: { latitude: 35.1043, longitude: 128.9495 },
  "dong-eui": { latitude: 35.143, longitude: 129.0339 },
  dongseo: { latitude: 35.1500, longitude: 129.0107 },
  silla: { latitude: 35.1680, longitude: 128.9958 },
  bufs: { latitude: 35.2672, longitude: 129.0793 },
  kmou: { latitude: 35.0759, longitude: 129.0870 },
  "gimhae-airport": { latitude: 35.1795, longitude: 128.9382 },
  nopo: { latitude: 35.2849, longitude: 129.0959 },
  myeongji: { latitude: 35.0987, longitude: 128.9177 },
  hwamyeong: { latitude: 35.2352, longitude: 129.0132 },
  munhyeon: { latitude: 35.1478, longitude: 129.0659 },
  jangsan: { latitude: 35.1699, longitude: 129.1766 },
  ilgwang: { latitude: 35.2676, longitude: 129.2330 },
  jeonggwan: { latitude: 35.3233, longitude: 129.1766 },
};

const REGIONS: Region[] = [
  {
    id: "seomyeon",
    name: "서면",
    area: "부산진구",
    score: 94,
    confidence: 86,
    weather: "흐림 28°",
    peak: "11:00–17:00",
    calm: "19:00–21:00",
    factors: ["한정 상품·선착순 판매", "검색 관심도 2.1배 상승", "주말 상권 수요 중첩"],
    event: "대형 캐릭터 팝업 스토어",
    eventMeta: "롯데백화점 일대 · 10:30–20:00",
    x: 46,
    y: 47,
    hourly: [62, 72, 88, 94, 96, 95, 92, 88, 83, 74, 63, 52],
  },
  {
    id: "haeundae",
    name: "해운대",
    area: "해운대구",
    score: 78,
    confidence: 81,
    weather: "구름 많음 27°",
    peak: "14:00–18:00",
    calm: "09:00–11:00",
    factors: ["해변 방문 수요", "주말 숙박객 유입", "오후 체감온도 상승"],
    event: "해변 문화 체험 행사",
    eventMeta: "해운대해수욕장 · 13:00–19:00",
    x: 78,
    y: 37,
    hourly: [41, 48, 56, 63, 70, 76, 78, 77, 72, 65, 55, 45],
  },
  {
    id: "gwangalli",
    name: "광안리",
    area: "수영구",
    score: 73,
    confidence: 77,
    weather: "약한 비 26°",
    peak: "17:00–21:00",
    calm: "09:00–11:00",
    factors: ["야간 해변 방문 수요", "인근 공연 관람객", "비 예보로 야외 수요 감소"],
    event: "광안리 어쿠스틱 라이브",
    eventMeta: "해변 만남의 광장 · 18:00–20:30",
    x: 68,
    y: 52,
    hourly: [34, 38, 43, 49, 55, 61, 68, 73, 71, 64, 55, 47],
  },
  {
    id: "centum",
    name: "센텀",
    area: "해운대구",
    score: 67,
    confidence: 84,
    weather: "비 26°",
    peak: "12:00–16:00",
    calm: "18:00–20:00",
    factors: ["실내 전시 관람객", "비로 인한 실내 수요 이동", "쇼핑 시간대 중첩"],
    event: "미래 모빌리티 특별전",
    eventMeta: "벡스코 · 10:00–18:00",
    x: 70,
    y: 41,
    hourly: [38, 45, 55, 62, 67, 66, 63, 59, 54, 48, 42, 36],
  },
  {
    id: "sajik",
    name: "사직",
    area: "동래구",
    score: 62,
    confidence: 79,
    weather: "흐림 27°",
    peak: "16:00–19:00",
    calm: "10:00–12:00",
    factors: ["경기 시작 전 유입", "종료 후 교통 집중", "주변 식음 수요"],
    event: "부산 홈경기",
    eventMeta: "사직종합운동장 · 18:30 시작",
    x: 52,
    y: 29,
    hourly: [29, 32, 36, 39, 43, 49, 57, 62, 60, 54, 45, 37],
  },
  {
    id: "busan-station",
    name: "부산역",
    area: "동구",
    score: 55,
    confidence: 72,
    weather: "흐림 28°",
    peak: "17:00–20:00",
    calm: "11:00–13:00",
    factors: ["퇴근 시간대 환승", "주말 철도 이용객", "인근 행사 이동 수요"],
    event: "유라시아 시민 광장 마켓",
    eventMeta: "부산역 광장 · 15:00–20:00",
    x: 37,
    y: 64,
    hourly: [35, 39, 43, 41, 44, 48, 53, 55, 54, 50, 45, 40],
  },
  {
    id: "nampo",
    name: "남포",
    area: "중구",
    score: 48,
    confidence: 74,
    weather: "흐림 28°",
    peak: "15:00–18:00",
    calm: "10:00–12:00",
    factors: ["관광 상권 방문", "국제시장 보행 수요", "오후 쇼핑 시간대"],
    event: "원도심 골목 문화 주간",
    eventMeta: "광복로 일대 · 상시",
    x: 28,
    y: 72,
    hourly: [28, 31, 35, 39, 44, 48, 47, 45, 42, 38, 34, 30],
  },
  {
    id: "gijang",
    name: "기장",
    area: "기장군",
    score: 39,
    confidence: 68,
    weather: "약한 비 25°",
    peak: "13:00–16:00",
    calm: "09:00–11:00",
    factors: ["주말 관광 수요", "비로 인한 야외 방문 감소", "도로 이동 비중 높음"],
    event: "해안 산책 프로그램",
    eventMeta: "오시리아 해안 · 11:00–17:00",
    x: 87,
    y: 18,
    hourly: [22, 25, 30, 35, 39, 38, 35, 33, 31, 28, 25, 22],
  },
  {
    id: "jeonpo", name: "전포", area: "부산진구", score: 71, confidence: 78, weather: "흐림 28°",
    peak: "16:00–20:00", calm: "09:00–11:00", factors: ["카페거리 방문 수요", "저녁 식음 유동", "서면 상권 인접 영향"],
    event: "전포 콘텐츠 마켓", eventMeta: "전포카페거리 · 14:00–20:00", x: 48, y: 49,
    hourly: [35, 40, 46, 52, 58, 62, 65, 69, 72, 74, 64, 58],
  },
  {
    id: "songjeong", name: "송정", area: "해운대구", score: 65, confidence: 76, weather: "구름 많음 27°",
    peak: "13:00–18:00", calm: "08:00–10:00", factors: ["해변·서핑 방문 수요", "주말 카페 이용객", "오후 해안 이동 증가"],
    event: "송정 해변 체험 프로그램", eventMeta: "송정해수욕장 · 11:00–18:00", x: 84, y: 34,
    hourly: [28, 33, 40, 48, 56, 63, 68, 70, 68, 62, 45, 37],
  },
  {
    id: "yeongdo", name: "영도", area: "영도구", score: 58, confidence: 74, weather: "흐림 27°",
    peak: "12:00–17:00", calm: "08:00–10:00", factors: ["흰여울·태종대 관광 수요", "주말 차량 이동", "오후 전망 명소 방문"],
    event: "영도 해양문화 프로그램", eventMeta: "영도 일대 · 10:00–18:00", x: 40, y: 78,
    hourly: [25, 30, 38, 46, 54, 59, 62, 61, 57, 50, 35, 29],
  },
  {
    id: "pnu", name: "부산대", area: "금정구", score: 57, confidence: 76, weather: "흐림 27°",
    peak: "17:00–20:00", calm: "10:00–12:00", factors: ["대학가 저녁 유동", "식음 상권 방문", "지하철 환승 수요"],
    event: "부산대 청년문화 행사", eventMeta: "부산대역 일대 · 16:00–20:00", x: 55, y: 15,
    hourly: [34, 38, 42, 45, 48, 50, 53, 57, 62, 66, 59, 52],
  },
  {
    id: "kyungsung", name: "경성대·부경대", area: "남구", score: 61, confidence: 76, weather: "흐림 28°",
    peak: "17:00–21:00", calm: "09:00–11:00", factors: ["대학가 저녁 상권", "공연·식음 방문 수요", "광안리 인접 이동"],
    event: "대학로 문화거리 행사", eventMeta: "경성대·부경대역 일대 · 16:00–21:00", x: 60, y: 55,
    hourly: [32, 36, 40, 44, 48, 52, 57, 62, 67, 71, 65, 57],
  },
  {
    id: "dongnae", name: "동래", area: "동래구", score: 52, confidence: 75, weather: "흐림 27°",
    peak: "17:00–20:00", calm: "10:00–12:00", factors: ["동래역 환승 수요", "명륜 상권 저녁 유동", "온천장 방문 수요"],
    event: "동래 역사문화 프로그램", eventMeta: "동래읍성 일대 · 11:00–18:00", x: 54, y: 23,
    hourly: [36, 41, 43, 45, 47, 49, 52, 55, 59, 63, 55, 48],
  },
  {
    id: "dadaepo", name: "다대포", area: "사하구", score: 49, confidence: 72, weather: "구름 많음 27°",
    peak: "15:00–19:00", calm: "08:00–10:00", factors: ["해변·낙조 방문 수요", "오후 가족 단위 유입", "도시철도 종점 이동"],
    event: "다대포 낙조 문화행사", eventMeta: "다대포해수욕장 · 15:00–20:00", x: 15, y: 83,
    hourly: [20, 24, 29, 35, 42, 49, 55, 60, 63, 62, 47, 37],
  },
  {
    id: "gamcheon", name: "감천문화마을", area: "사하구", score: 47, confidence: 72, weather: "흐림 27°",
    peak: "11:00–16:00", calm: "19:00–21:00", factors: ["관광객 도보 방문", "주간 포토스팟 수요", "원도심 연계 이동"],
    event: "감천 골목문화 프로그램", eventMeta: "감천문화마을 · 10:00–17:00", x: 24, y: 75,
    hourly: [24, 30, 39, 48, 55, 59, 60, 57, 51, 43, 29, 24],
  },
  {
    id: "songdo", name: "송도", area: "서구", score: 59, confidence: 76, weather: "구름 많음 27°",
    peak: "13:00–18:00", calm: "08:00–10:00", factors: ["해수욕장·케이블카 수요", "오후 가족 관광객", "원도심 연계 이동"],
    event: "송도 해양레저 프로그램", eventMeta: "송도해수욕장 · 11:00–19:00", x: 28, y: 82,
    hourly: [24, 29, 36, 44, 52, 59, 64, 66, 64, 58, 41, 33],
  },
  {
    id: "osiria", name: "오시리아", area: "기장군", score: 72, confidence: 79, weather: "구름 많음 26°",
    peak: "11:00–18:00", calm: "08:00–10:00", factors: ["테마파크·쇼핑 방문", "방학 가족 단위 수요", "주간 차량 유입"],
    event: "오시리아 패밀리 페스타", eventMeta: "오시리아 관광단지 · 10:00–20:00", x: 86, y: 27,
    hourly: [31, 40, 52, 63, 70, 74, 76, 74, 69, 61, 42, 35],
  },
  {
    id: "taejongdae", name: "태종대", area: "영도구", score: 54, confidence: 75, weather: "흐림 27°",
    peak: "11:00–16:00", calm: "19:00–21:00", factors: ["전망대·유원지 방문", "주간 관광버스 유입", "해안 산책 수요"],
    event: "태종대 자연해설 프로그램", eventMeta: "태종대유원지 · 10:00–17:00", x: 44, y: 88,
    hourly: [22, 29, 39, 50, 58, 62, 63, 59, 53, 45, 30, 25],
  },
  {
    id: "huinnyeoul", name: "흰여울문화마을", area: "영도구", score: 57, confidence: 74, weather: "흐림 27°",
    peak: "12:00–17:00", calm: "19:00–21:00", factors: ["골목 관광·포토스팟", "오후 카페 방문", "원도심 관광객 이동"],
    event: "흰여울 골목문화 프로그램", eventMeta: "흰여울문화마을 · 11:00–18:00", x: 35, y: 78,
    hourly: [23, 30, 41, 51, 59, 63, 65, 62, 57, 49, 32, 26],
  },
  {
    id: "igidae", name: "이기대·오륙도", area: "남구", score: 51, confidence: 72, weather: "구름 많음 27°",
    peak: "13:00–18:00", calm: "08:00–10:00", factors: ["해안산책로 방문", "전망대 관광 수요", "오후 자가용 유입"],
    event: "이기대 해안걷기 프로그램", eventMeta: "이기대·오륙도 일대 · 10:00–18:00", x: 65, y: 63,
    hourly: [20, 26, 34, 43, 51, 58, 62, 63, 59, 52, 34, 27],
  },
  {
    id: "deokcheon", name: "덕천", area: "북구", score: 54, confidence: 74, weather: "흐림 28°",
    peak: "17:00–21:00", calm: "10:00–12:00", factors: ["북부산 상권 방문", "도시철도 환승 유동", "저녁 식음 수요"],
    event: "덕천 젊음의거리 행사", eventMeta: "덕천동 일대 · 16:00–21:00", x: 37, y: 18,
    hourly: [35, 41, 44, 46, 49, 52, 55, 59, 64, 68, 62, 55],
  },
  {
    id: "yeonsan", name: "연산", area: "연제구", score: 53, confidence: 76, weather: "흐림 28°",
    peak: "17:00–20:00", calm: "11:00–13:00", factors: ["도시철도 환승 수요", "행정·업무지 퇴근 유동", "저녁 상권 방문"],
    event: "연산 생활문화 프로그램", eventMeta: "연산교차로 일대 · 17:00–20:00", x: 53, y: 33,
    hourly: [44, 48, 43, 41, 43, 45, 48, 52, 59, 66, 57, 50],
  },
  {
    id: "hadan", name: "하단·동아대", area: "사하구", score: 53, confidence: 74, weather: "흐림 28°",
    peak: "17:00–21:00", calm: "10:00–12:00", factors: ["대학가·상권 저녁 유동", "서부산 환승 수요", "을숙도 연계 이동"],
    event: "낙동강 생활문화 행사", eventMeta: "하단·을숙도 일대 · 14:00–20:00", x: 17, y: 68,
    hourly: [36, 42, 45, 47, 50, 52, 55, 58, 63, 67, 60, 53],
  },
  {
    id: "sasang", name: "사상", area: "사상구", score: 58, confidence: 76, weather: "흐림 28°",
    peak: "17:00–20:00", calm: "11:00–13:00", factors: ["서부산 환승 수요", "산업·업무지 퇴근 유동", "저녁 상권 방문"],
    event: "사상 생활문화 프로그램", eventMeta: "사상역 일대 · 17:00–20:00", x: 20, y: 49,
    hourly: [43, 47, 44, 42, 44, 48, 52, 57, 63, 68, 64, 57, 50],
  },
  {
    id: "citizens-park", name: "부산시민공원", area: "부산진구", score: 55, confidence: 73, weather: "흐림 28°",
    peak: "13:00–18:00", calm: "08:00–10:00", factors: ["도심 공원 방문", "가족 단위 나들이", "서면 인접 이동"],
    event: "시민공원 체험 프로그램", eventMeta: "부산시민공원 · 11:00–18:00", x: 44, y: 42,
    hourly: [24, 29, 36, 44, 52, 58, 61, 63, 61, 56, 47, 38, 30],
  },
  {
    id: "oncheonjang", name: "온천장", area: "동래구", score: 51, confidence: 74, weather: "흐림 27°",
    peak: "16:00–20:00", calm: "10:00–12:00", factors: ["온천·상권 방문", "금강공원 연계 이동", "저녁 식음 수요"],
    event: "온천장 문화산책", eventMeta: "온천장역 일대 · 15:00–19:00", x: 55, y: 20,
    hourly: [31, 36, 40, 43, 46, 49, 53, 57, 61, 64, 59, 52, 45],
  },
  {
    id: "cheongsapo", name: "청사포", area: "해운대구", score: 54, confidence: 72, weather: "구름 많음 27°",
    peak: "13:00–18:00", calm: "08:00–10:00", factors: ["해안 산책·카페 방문", "해변열차 이용", "오후 관광객 유입"],
    event: "청사포 해안 체험", eventMeta: "청사포 일대 · 11:00–18:00", x: 82, y: 43,
    hourly: [21, 27, 35, 44, 52, 59, 63, 65, 62, 56, 47, 37, 29],
  },
  {
    id: "eulsukdo", name: "을숙도", area: "사하구", score: 46, confidence: 71, weather: "구름 많음 27°",
    peak: "12:00–17:00", calm: "08:00–10:00", factors: ["생태공원 방문", "가족 체험 수요", "주말 차량 유입"],
    event: "낙동강 생태 체험", eventMeta: "을숙도생태공원 · 10:00–17:00", x: 8, y: 72,
    hourly: [18, 23, 31, 39, 47, 53, 57, 58, 54, 48, 39, 30, 24],
  },
  {
    id: "dong-eui", name: "동의대", area: "부산진구", score: 49, confidence: 72, weather: "흐림 28°",
    peak: "16:00–20:00", calm: "10:00–12:00", factors: ["수업 종료 이동", "대학가 식음 수요", "도시철도 이용"],
    event: "동의대 캠퍼스 프로그램", eventMeta: "동의대학교 일대 · 16:00–19:00", x: 36, y: 55,
    hourly: [30, 36, 43, 48, 51, 53, 55, 58, 62, 65, 59, 51, 43],
  },
  {
    id: "dongseo", name: "동서대", area: "사상구", score: 47, confidence: 71, weather: "흐림 28°",
    peak: "16:00–20:00", calm: "10:00–12:00", factors: ["수업 종료 이동", "주례 상권 방문", "통학버스·도시철도 수요"],
    event: "동서대 캠퍼스 프로그램", eventMeta: "동서대학교 일대 · 16:00–19:00", x: 28, y: 53,
    hourly: [29, 35, 42, 47, 50, 52, 54, 57, 61, 64, 58, 50, 42],
  },
  {
    id: "silla", name: "신라대", area: "사상구", score: 43, confidence: 70, weather: "흐림 27°",
    peak: "16:00–19:00", calm: "10:00–12:00", factors: ["수업 종료 이동", "통학버스 수요", "주변 생활권 방문"],
    event: "신라대 캠퍼스 프로그램", eventMeta: "신라대학교 일대 · 15:00–18:00", x: 23, y: 44,
    hourly: [27, 33, 40, 44, 47, 49, 51, 54, 58, 61, 55, 47, 39],
  },
  {
    id: "bufs", name: "부산외대", area: "금정구", score: 42, confidence: 70, weather: "흐림 27°",
    peak: "16:00–19:00", calm: "10:00–12:00", factors: ["수업 종료 이동", "통학버스 수요", "남산동 생활권 방문"],
    event: "부산외대 캠퍼스 프로그램", eventMeta: "부산외국어대학교 일대 · 15:00–18:00", x: 53, y: 8,
    hourly: [26, 32, 39, 43, 46, 48, 50, 53, 57, 60, 54, 46, 38],
  },
  {
    id: "kmou", name: "한국해양대", area: "영도구", score: 41, confidence: 70, weather: "흐림 27°",
    peak: "16:00–19:00", calm: "10:00–12:00", factors: ["수업 종료 이동", "캠퍼스 셔틀 수요", "영도 해안 방문"],
    event: "해양대 캠퍼스 프로그램", eventMeta: "한국해양대학교 일대 · 15:00–18:00", x: 55, y: 81,
    hourly: [25, 31, 38, 42, 45, 47, 49, 52, 56, 59, 53, 45, 37],
  },
  {
    id: "gimhae-airport", name: "김해공항", area: "강서구", score: 61, confidence: 79, weather: "흐림 28°",
    peak: "17:00–20:00", calm: "11:00–13:00", factors: ["항공편 출도착 집중", "주말·연휴 여행 수요", "경전철·차량 환승"],
    event: "공항 여객 이동 집중", eventMeta: "김해국제공항 · 항공편 운항시간", x: 7, y: 47,
    hourly: [57, 62, 56, 48, 46, 49, 53, 57, 62, 68, 71, 66, 58],
  },
  {
    id: "nopo", name: "노포·부산종합버스터미널", area: "금정구", score: 57, confidence: 77, weather: "흐림 27°",
    peak: "17:00–20:00", calm: "11:00–13:00", factors: ["시외·고속버스 출발 집중", "도시철도 환승", "주말 광역 이동"],
    event: "광역버스 여객 이동", eventMeta: "부산종합버스터미널 · 운행시간", x: 59, y: 8,
    hourly: [53, 58, 52, 45, 43, 46, 50, 54, 59, 65, 68, 62, 54],
  },
  {
    id: "myeongji", name: "명지", area: "강서구", score: 52, confidence: 73, weather: "흐림 28°",
    peak: "16:00–20:00", calm: "09:00–11:00", factors: ["신도시 상권 방문", "가족 단위 외식·쇼핑", "서부산 차량 이동"],
    event: "명지 생활문화 프로그램", eventMeta: "명지국제신도시 일대 · 14:00–19:00", x: 7, y: 67,
    hourly: [27, 31, 36, 41, 46, 50, 54, 58, 63, 67, 65, 59, 51],
  },
  {
    id: "hwamyeong", name: "화명", area: "북구", score: 50, confidence: 73, weather: "흐림 27°",
    peak: "16:00–20:00", calm: "10:00–12:00", factors: ["북부산 생활 상권", "화명생태공원 연계", "저녁 식음·쇼핑 수요"],
    event: "화명 생활문화 프로그램", eventMeta: "화명역 일대 · 15:00–19:00", x: 39, y: 12,
    hourly: [29, 34, 39, 42, 45, 48, 52, 56, 61, 65, 62, 55, 47],
  },
  {
    id: "munhyeon", name: "문현·BIFC", area: "남구", score: 56, confidence: 78, weather: "흐림 28°",
    peak: "08:00–10:00", calm: "20:00–22:00", factors: ["금융·업무지 출근 수요", "점심시간 직장인 이동", "퇴근 시간 환승"],
    event: "금융단지 업무 이동", eventMeta: "부산국제금융센터 일대 · 평일 업무시간", x: 49, y: 57,
    hourly: [66, 70, 58, 54, 61, 63, 57, 53, 56, 64, 68, 55, 42],
  },
  {
    id: "jangsan", name: "장산", area: "해운대구", score: 54, confidence: 74, weather: "구름 많음 27°",
    peak: "16:00–20:00", calm: "10:00–12:00", factors: ["해운대 주거·상업 수요", "도시철도 종점 이동", "저녁 쇼핑·외식 방문"],
    event: "장산 생활상권 프로그램", eventMeta: "장산역 일대 · 15:00–20:00", x: 80, y: 35,
    hourly: [35, 40, 43, 45, 48, 51, 55, 59, 64, 68, 65, 58, 50],
  },
  {
    id: "ilgwang", name: "일광", area: "기장군", score: 48, confidence: 71, weather: "구름 많음 26°",
    peak: "12:00–18:00", calm: "08:00–10:00", factors: ["해수욕장·카페 방문", "신도시 가족 수요", "동해선 이용객 유입"],
    event: "일광 해안 체험", eventMeta: "일광해수욕장 일대 · 10:00–18:00", x: 90, y: 13,
    hourly: [20, 25, 33, 42, 50, 56, 60, 62, 60, 55, 47, 37, 29],
  },
  {
    id: "jeonggwan", name: "정관", area: "기장군", score: 46, confidence: 70, weather: "흐림 26°",
    peak: "16:00–20:00", calm: "10:00–12:00", factors: ["신도시 생활 상권", "가족 단위 외식·쇼핑", "퇴근 시간 차량 이동"],
    event: "정관 생활문화 프로그램", eventMeta: "정관신도시 일대 · 15:00–19:00", x: 78, y: 7,
    hourly: [27, 32, 37, 40, 43, 46, 49, 53, 58, 62, 59, 52, 44],
  },
];

const DATE_OFFSETS = [0, 1, 2, 3, 4, 5, 6, 7];
const DATE_ADJUSTMENTS = [0, -8, -13, -6, 5, -2, 7, -4];
const HOURS = Array.from({ length: 15 }, (_, index) => String(index + 8).padStart(2, "0"));

function clamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function levelFor(score: number): RiskLevel {
  if (score >= 90) return "극심";
  if (score >= 75) return "매우 혼잡";
  if (score >= 55) return "혼잡";
  if (score >= 35) return "보통";
  return "여유";
}

function forecastSentence(score: number) {
  if (score >= 90) return "극심한 혼잡이 예상돼요";
  if (score >= 75) return "매우 혼잡할 가능성이 높아요";
  if (score >= 55) return "혼잡할 가능성이 있어요";
  if (score >= 35) return "평소 수준의 혼잡이 예상돼요";
  return "비교적 여유로울 것으로 보여요";
}

function confidenceLabel(confidence: number) {
  if (confidence >= 75) return "높음";
  if (confidence >= 45) return "보통";
  return "낮음";
}

function levelClass(score: number) {
  if (score >= 90) return "extreme";
  if (score >= 75) return "very-busy";
  if (score >= 55) return "busy";
  if (score >= 35) return "normal";
  return "calm";
}

function makeDate(offset: number) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + offset);
  return date;
}

function toDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatUpdatedAt(value?: string) {
  if (!value) return "갱신 확인 중";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "갱신 시각 확인 필요";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(date);
}

function formatForecastDate(date: Date) {
  return new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric", weekday: "short" }).format(date);
}

function fallbackHourlyScores(scores: number[]) {
  return HOURS.map((_, index) => {
    if (scores[index] !== undefined) return scores[index];
    const lastScore = scores[scores.length - 1] ?? 0;
    return clamp(lastScore - (index - scores.length + 1) * 6);
  });
}

function safeExternalUrl(value?: string | null) {
  return value && /^https?:\/\//i.test(value) ? value : null;
}

function withoutArbitraryEvent(region: Region): Region {
  const factors = [...region.factors.filter((factor) => !/행사|공연|경기|전시|선착순|한정 상품|관람객|페스티벌|마켓/.test(factor)),
    "평소 시간대별 유동 패턴", "주중·주말 및 방학 일정", "기상 조건에 따른 방문 수요"].filter((factor, index, values) => values.indexOf(factor) === index).slice(0, 3);
  return {
    ...region,
    factors,
    event: "영향 행사 없음",
    eventMeta: "선택한 날짜와 지역에서 확인된 관련 행사가 없습니다.",
    eventSource: "none",
    eventSourceName: "",
    eventSourceUrl: null,
    eventImageUrl: null,
    eventRelatedLinks: [],
    eventEvidence: "",
  };
}

export default function Home() {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const kakaoMapRef = useRef<KakaoMapInstance | null>(null);
  const kakaoOverlaysRef = useRef<KakaoCustomOverlay[]>([]);
  const forecastCacheRef = useRef(new Map<string, PublicForecastResponse>());
  const forecastRequestsRef = useRef(new Map<string, Promise<PublicForecastResponse>>());
  const [selectedRegionId, setSelectedRegionId] = useState("seomyeon");
  const [selectedDateIndex, setSelectedDateIndex] = useState(0);
  const [compareId, setCompareId] = useState("centum");
  const [compareMode, setCompareMode] = useState<"region" | "date">("region");
  const [compareDateIndex, setCompareDateIndex] = useState(1);
  const [compareDateRegions, setCompareDateRegions] = useState<Region[] | null>(null);
  const [forecastRegions, setForecastRegions] = useState<Region[]>(() =>
    REGIONS.map((region, index) => ({
      ...withoutArbitraryEvent(region),
      score: clamp(region.score + DATE_ADJUSTMENTS[0] + (index % 3) * 2),
      hourly: fallbackHourlyScores(region.hourly).map((score) => clamp(score + DATE_ADJUSTMENTS[0])),
    })),
  );
  const [forecastStatus, setForecastStatus] = useState<"loading" | "connected" | "fallback">("loading");
  const [forecastMode, setForecastMode] = useState<"demo" | "live">("demo");
  const [weatherSource, setWeatherSource] = useState<"kma" | "stored">("stored");
  const [trendSource, setTrendSource] = useState<"naver" | "stored">("stored");
  const [forecastAsOf, setForecastAsOf] = useState("");
  const [mapStatus, setMapStatus] = useState<"loading" | "ready" | "fallback">(KAKAO_MAP_KEY ? "loading" : "fallback");
  const [regionCategory, setRegionCategory] = useState<RegionCategory>("all");
  const [urlStateReady, setUrlStateReady] = useState(false);
  const [decisionTab, setDecisionTab] = useState<"alternatives" | "scenario">("alternatives");
  const [alternativePriority, setAlternativePriority] = useState<AlternativePriority>("similar");
  const [alternativeDecision, setAlternativeDecision] = useState<AlternativeDecisionResponse | null>(null);
  const [scenarioWeather, setScenarioWeather] = useState<ScenarioWeather>("forecast");
  const [scenarioEvent, setScenarioEvent] = useState<ScenarioEvent>("forecast");
  const [scenarioCalendar, setScenarioCalendar] = useState<ScenarioCalendar>("forecast");
  const [scenarioDecision, setScenarioDecision] = useState<ScenarioDecisionResponse | null>(null);
  const [decisionStatus, setDecisionStatus] = useState<"idle" | "loading" | "error">("idle");
  const [decisionError, setDecisionError] = useState("");
  const [eventLinkPreview, setEventLinkPreview] = useState<{ index: number; x: number; y: number } | null>(null);

  const dates = useMemo(
    () => DATE_OFFSETS.map((offset) => makeDate(offset)),
    [],
  );

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      const params = new URLSearchParams(window.location.search);
      const requestedDate = params.get("date");
      const requestedRegion = params.get("region");
      const requestedDateIndex = dates.findIndex((date) => toDateKey(date) === requestedDate);
      if (requestedDateIndex >= 0) setSelectedDateIndex(requestedDateIndex);
      if (requestedRegion && REGIONS.some((region) => region.id === requestedRegion)) setSelectedRegionId(requestedRegion);
      setUrlStateReady(true);
    });
    return () => { active = false; };
  }, [dates]);

  useEffect(() => {
    if (!urlStateReady) return;
    const params = new URLSearchParams(window.location.search);
    params.set("date", toDateKey(dates[selectedDateIndex]));
    params.set("region", selectedRegionId);
    window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}${window.location.hash}`);
  }, [dates, selectedDateIndex, selectedRegionId, urlStateReady]);

  const applyForecast = useCallback((forecast: PublicForecastResponse) => {
    setForecastRegions(forecast.regions);
    setForecastMode(forecast.mode);
    setWeatherSource(forecast.weatherSource);
    setTrendSource(forecast.trendSource);
    setForecastAsOf(forecast.asOf);
    setForecastStatus("connected");
  }, []);

  const requestForecast = useCallback((dateKey: string) => {
    const cached = forecastCacheRef.current.get(dateKey);
    if (cached) return Promise.resolve(cached);

    const pending = forecastRequestsRef.current.get(dateKey);
    if (pending) return pending;

    const request = fetch(`/api/public/forecast?date=${dateKey}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("공개 예보 API 응답 오류");
        return response.json() as Promise<PublicForecastResponse>;
      })
      .then((forecast) => {
        forecastCacheRef.current.set(dateKey, forecast);
        return forecast;
      })
      .finally(() => forecastRequestsRef.current.delete(dateKey));
    forecastRequestsRef.current.set(dateKey, request);
    return request;
  }, []);

  useEffect(() => {
    let active = true;
    const dateKey = toDateKey(dates[selectedDateIndex]);
    const cached = forecastCacheRef.current.get(dateKey);
    if (cached) {
      applyForecast(cached);
      return () => { active = false; };
    }

    setForecastStatus("loading");
    requestForecast(dateKey)
      .then((forecast) => {
        if (active) applyForecast(forecast);
      })
      .catch(() => {
        if (!active) return;
        setForecastRegions(
          REGIONS.map((region, index) => ({
            ...withoutArbitraryEvent(region),
            score: clamp(region.score + DATE_ADJUSTMENTS[selectedDateIndex] + (index % 3) * 2),
            hourly: fallbackHourlyScores(region.hourly).map((score) => clamp(score + DATE_ADJUSTMENTS[selectedDateIndex])),
          })),
        );
        setForecastAsOf(new Date().toISOString());
        setForecastStatus("fallback");
      });

    return () => { active = false; };
  }, [applyForecast, dates, requestForecast, selectedDateIndex]);

  useEffect(() => {
    dates.forEach((date) => {
      void requestForecast(toDateKey(date)).catch(() => undefined);
    });
  }, [dates, requestForecast]);

  const adjustedRegions = forecastRegions;
  const visibleRegions = useMemo(
    () => regionCategory === "all"
      ? adjustedRegions
      : adjustedRegions.filter((region) => REGION_CATEGORIES[region.id] === regionCategory),
    [adjustedRegions, regionCategory],
  );
  const topAlerts = useMemo(
    () => [...adjustedRegions]
      .sort((first, second) => second.score - first.score || second.confidence - first.confidence)
      .slice(0, 3),
    [adjustedRegions],
  );

  useEffect(() => {
    if (compareId !== selectedRegionId) return;
    const nextRegion = adjustedRegions.find((region) => region.id !== selectedRegionId);
    if (!nextRegion) return;
    let active = true;
    queueMicrotask(() => {
      if (active) setCompareId(nextRegion.id);
    });
    return () => { active = false; };
  }, [adjustedRegions, compareId, selectedRegionId]);

  useEffect(() => {
    if (compareDateIndex !== selectedDateIndex) return;
    let active = true;
    queueMicrotask(() => {
      if (active) setCompareDateIndex(selectedDateIndex === 0 ? 1 : 0);
    });
    return () => { active = false; };
  }, [compareDateIndex, selectedDateIndex]);

  useEffect(() => {
    if (compareMode !== "date" || compareDateIndex === selectedDateIndex) return;
    let active = true;
    queueMicrotask(() => {
      if (active) setCompareDateRegions(null);
    });
    requestForecast(toDateKey(dates[compareDateIndex]))
      .then((forecast) => {
        if (active) setCompareDateRegions(forecast.regions);
      })
      .catch(() => {
        if (!active) return;
        setCompareDateRegions(REGIONS.map((region) => ({
          ...withoutArbitraryEvent(region),
          score: clamp(region.score + DATE_ADJUSTMENTS[compareDateIndex]),
          hourly: fallbackHourlyScores(region.hourly).map((score) => clamp(score + DATE_ADJUSTMENTS[compareDateIndex])),
        })));
      });
    return () => { active = false; };
  }, [compareDateIndex, compareMode, dates, requestForecast, selectedDateIndex]);

  useEffect(() => {
    const container = mapContainerRef.current;
    if (!KAKAO_MAP_KEY || !container) {
      setMapStatus("fallback");
      return;
    }

    let cancelled = false;
    const initializeMap = () => {
      if (!window.kakao) {
        setMapStatus("fallback");
        return;
      }

      window.kakao.maps.load(() => {
        if (cancelled || !mapContainerRef.current || !window.kakao) return;
        const center = new window.kakao.maps.LatLng(35.1796, 129.0756);
        kakaoMapRef.current = new window.kakao.maps.Map(mapContainerRef.current, { center, level: 8 });
        setMapStatus("ready");
      });
    };

    const handleLoad = () => initializeMap();
    const handleError = () => setMapStatus("fallback");
    const existingScript = document.getElementById(KAKAO_MAP_SCRIPT_ID) as HTMLScriptElement | null;

    if (window.kakao?.maps) {
      initializeMap();
    } else if (existingScript) {
      existingScript.addEventListener("load", handleLoad, { once: true });
      existingScript.addEventListener("error", handleError, { once: true });
    } else {
      const script = document.createElement("script");
      script.id = KAKAO_MAP_SCRIPT_ID;
      script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(KAKAO_MAP_KEY)}&autoload=false`;
      script.async = true;
      script.addEventListener("load", handleLoad, { once: true });
      script.addEventListener("error", handleError, { once: true });
      document.head.appendChild(script);
    }

    const resizeObserver = new ResizeObserver(() => kakaoMapRef.current?.relayout());
    resizeObserver.observe(container);

    return () => {
      cancelled = true;
      resizeObserver.disconnect();
      existingScript?.removeEventListener("load", handleLoad);
      existingScript?.removeEventListener("error", handleError);
    };
  }, []);

  useEffect(() => {
    const map = kakaoMapRef.current;
    const maps = window.kakao?.maps;
    if (mapStatus !== "ready" || !map || !maps) return;

    kakaoOverlaysRef.current.forEach((overlay) => overlay.setMap(null));
    kakaoOverlaysRef.current = visibleRegions.flatMap((region) => {
      const coordinates = REGION_COORDINATES[region.id];
      if (!coordinates) return [];

      const button = document.createElement("button");
      button.type = "button";
      button.className = `map-pin kakao-map-pin ${levelClass(region.score)} ${selectedRegionId === region.id ? "selected" : ""}`;
      button.setAttribute("aria-label", `${region.name} 혼잡도 ${region.score}점, ${levelFor(region.score)}`);
      button.setAttribute("aria-pressed", String(selectedRegionId === region.id));
      const score = document.createElement("strong");
      score.textContent = String(region.score);
      const name = document.createElement("span");
      name.textContent = MAP_PIN_LABELS[region.id] ?? region.name;
      button.append(score, name);
      button.addEventListener("click", () => setSelectedRegionId(region.id));

      const overlay = new maps.CustomOverlay({
        position: new maps.LatLng(coordinates.latitude, coordinates.longitude),
        content: button,
        xAnchor: 0.5,
        yAnchor: 0.5,
        zIndex: 100 + region.score,
      });
      const restoreLayer = () => overlay.setZIndex(100 + region.score);
      button.addEventListener("mouseenter", () => overlay.setZIndex(1000));
      button.addEventListener("mouseleave", restoreLayer);
      button.addEventListener("focus", () => overlay.setZIndex(1000));
      button.addEventListener("blur", restoreLayer);
      overlay.setMap(map);
      return [overlay];
    });

    return () => {
      kakaoOverlaysRef.current.forEach((overlay) => overlay.setMap(null));
      kakaoOverlaysRef.current = [];
    };
  }, [mapStatus, selectedRegionId, visibleRegions]);

  const selected = adjustedRegions.find((region) => region.id === selectedRegionId) ?? adjustedRegions[0];
  const comparison = compareMode === "region"
    ? adjustedRegions.find((region) => region.id === compareId) ?? adjustedRegions[3]
    : compareDateRegions?.find((region) => region.id === selectedRegionId) ?? null;
  const selectedDate = dates[selectedDateIndex];
  const comparisonDate = dates[compareDateIndex];
  const hasImpactEvent = selected.eventSource === "public_api" && selected.event !== "영향 행사 없음";
  const eventSourceUrl = safeExternalUrl(selected.eventSourceUrl);
  const eventImageUrl = safeExternalUrl(selected.eventImageUrl);
  const eventRelatedLinks = (selected.eventRelatedLinks ?? [])
    .map((link) => ({ ...link, url: safeExternalUrl(link.url), imageUrl: safeExternalUrl(link.imageUrl) }))
    .filter((link): link is typeof link & { url: string } => Boolean(link.url));
  const visibleEventLinks = !hasImpactEvent ? [] : eventRelatedLinks.length > 0
    ? eventRelatedLinks
    : eventSourceUrl && !eventSourceUrl.includes("data.go.kr/data/")
      ? [{
        title: selected.event,
        summary: selected.eventEvidence || selected.eventMeta,
        source: selected.eventSourceName || "공식 행사 정보",
        url: eventSourceUrl,
        imageUrl: eventImageUrl,
      }]
      : [];
  const hoveredEventLink = eventLinkPreview ? visibleEventLinks[eventLinkPreview.index] : null;
  const hoveredEventImageUrl = safeExternalUrl(hoveredEventLink?.imageUrl) ?? null;
  const showEventLinkPreview = (index: number, event: ReactMouseEvent<HTMLAnchorElement>) => {
    const previewWidth = 270;
    const previewHeight = 190;
    setEventLinkPreview({
      index,
      x: Math.max(14, Math.min(event.clientX + 18, window.innerWidth - previewWidth - 14)),
      y: Math.max(14, Math.min(event.clientY + 18, window.innerHeight - previewHeight - 14)),
    });
  };
  const scoreEvidence = selected.scoreComponents ? [
    { label: "평소 혼잡", value: selected.scoreComponents.baseline, maximum: 60 },
    { label: "행사 가산", value: selected.scoreComponents.eventImpact, maximum: 25 },
    { label: "검색 관심도", value: selected.scoreComponents.trend, maximum: 25 },
    { label: "달력 효과", value: selected.scoreComponents.calendar, maximum: 15 },
  ] : [];

  const selectRegionAndShowForecast = (regionId: string) => {
    setRegionCategory("all");
    setSelectedRegionId(regionId);
    document.getElementById("forecast")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const selectRegionCategory = (category: RegionCategory) => {
    setRegionCategory(category);
    if (category === "all" || REGION_CATEGORIES[selectedRegionId] === category) return;
    const firstVisibleRegion = adjustedRegions.find((region) => REGION_CATEGORIES[region.id] === category);
    if (firstVisibleRegion) setSelectedRegionId(firstVisibleRegion.id);
  };

  const showDemoScenario = () => {
    const cached = forecastCacheRef.current.get(toDateKey(dates[1]));
    if (cached) applyForecast(cached);
    else setForecastStatus("loading");
    setSelectedDateIndex(1);
    setSelectedRegionId("seomyeon");
    setCompareMode("region");
    setCompareId("centum");
    document.getElementById("forecast")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const requestDecision = async (body: Record<string, string>) => {
    const response = await fetch("/api/public/ai-decisions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = await response.json() as { error?: string };
    if (!response.ok) throw new Error(result.error || "분석 결과를 만들지 못했습니다.");
    return result;
  };

  const runAlternativeDecision = async () => {
    setDecisionStatus("loading");
    setDecisionError("");
    try {
      const result = await requestDecision({
        action: "alternatives",
        date: toDateKey(selectedDate),
        selectedRegionId: selected.id,
        priority: alternativePriority,
      }) as AlternativeDecisionResponse;
      setAlternativeDecision(result);
      setDecisionStatus("idle");
    } catch (error) {
      setDecisionError(error instanceof Error ? error.message : "분석 결과를 만들지 못했습니다.");
      setDecisionStatus("error");
    }
  };

  const runScenarioDecision = async () => {
    setDecisionStatus("loading");
    setDecisionError("");
    try {
      const result = await requestDecision({
        action: "scenario",
        date: toDateKey(selectedDate),
        selectedRegionId: selected.id,
        weather: scenarioWeather,
        event: scenarioEvent,
        calendar: scenarioCalendar,
      }) as ScenarioDecisionResponse;
      setScenarioDecision(result);
      setDecisionStatus("idle");
    } catch (error) {
      setDecisionError(error instanceof Error ? error.message : "분석 결과를 만들지 못했습니다.");
      setDecisionStatus("error");
    }
  };

  return (
    <main className="app-shell">
      <header className="site-header">
        <a className="brand" href="#top" aria-label="붐비 홈">
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
          <span>붐비</span>
          <span className="brand-sub">부산 혼잡 예보</span>
        </a>
        <nav className="header-nav" aria-label="주요 메뉴">
          <a className="active" href="#forecast">혼잡 예보</a>
          <a href="#compare">지역 비교</a>
          <a href="#ai-tools">혼잡 회피 도구</a>
          <a href="#method">예측 방법</a>
          <a href="/admin/events">행사 수집</a>
        </nav>
        <div className="header-status"><span /> {forecastStatus === "loading" ? "예보 확인 중" : `${formatUpdatedAt(forecastAsOf)} 갱신`}</div>
      </header>

      <section className="hero" id="top">
        <div>
          <p className="eyebrow">AI CROWD FORECAST · BUSAN</p>
          <h1>붐비기 전에,<br /><em>미리 알고 움직이세요.</em></h1>
          <p className="hero-copy">행사, 평소 유동 패턴, 검색 관심도와 날씨를 분석해<br className="desktop-only" /> 앞으로 8일의 부산 혼잡을 예보합니다.</p>
          <div className="hero-actions"><button type="button" onClick={showDemoScenario}>내일 서면 먼저 보기 <span>↘</span></button><a href="#ai-tools">대체 장소·조건 비교</a><a href="#evidence">예보 근거 확인</a></div>
        </div>
        <div className="hero-summary" aria-label="선택 날짜 요약">
          <div className="pulse-ring"><span>{selectedDateIndex === 0 ? "오늘" : selectedDateIndex === 1 ? "내일" : `${selectedDateIndex}일 뒤`}</span><strong>{Math.max(...adjustedRegions.map((r) => r.score))}</strong></div>
          <div><span>가장 높은 혼잡</span><strong>{topAlerts[0].name}</strong><small>예측 신뢰도 {confidenceLabel(topAlerts[0].confidence)}</small></div>
        </div>
      </section>

      <section className="date-section" aria-label="예보 날짜 선택">
        <div className="section-kicker"><span>01</span> 언제 방문하시나요?</div>
        <div className="date-strip">
          {dates.map((date, index) => {
            const dayLabel = index === 0 ? "오늘" : index === 1 ? "내일" : new Intl.DateTimeFormat("ko-KR", { weekday: "short" }).format(date);
            return (
              <button
                className={selectedDateIndex === index ? "date-card selected" : "date-card"}
                key={index}
                onClick={() => {
                  const cached = forecastCacheRef.current.get(toDateKey(date));
                  if (cached) applyForecast(cached);
                  else setForecastStatus("loading");
                  setSelectedDateIndex(index);
                }}
                aria-pressed={selectedDateIndex === index}
              >
                <span>{dayLabel}</span>
                <strong>{date.getDate()}</strong>
                <small>{date.getMonth() + 1}월</small>
              </button>
            );
          })}
        </div>
      </section>

      <section className="alert-section" aria-labelledby="alert-heading">
        <div className="alert-heading">
          <div><span>TOP 3 CROWD ALERT</span><h2 id="alert-heading">{formatForecastDate(selectedDate)} 주요 혼잡 경보</h2></div>
          <p>점수가 같으면 데이터 신뢰도가 높은 지역을 먼저 보여줍니다.</p>
        </div>
        <div className="alert-grid">
          {topAlerts.map((region, index) => (
            <button type="button" className="alert-card" key={region.id} onClick={() => selectRegionAndShowForecast(region.id)} aria-label={`${index + 1}위 ${region.name}, 혼잡도 ${region.score}점, 상세 예보 보기`}>
              <span className="alert-rank">0{index + 1}</span>
              <div className="alert-card-title"><div><small>{region.area}</small><strong>{region.name}</strong></div><b className={levelClass(region.score)}>{region.score}</b></div>
              <dl><div><dt>혼잡 집중</dt><dd>{region.peak}</dd></div><div><dt>신뢰도</dt><dd>{confidenceLabel(region.confidence)} · {region.confidence}</dd></div></dl>
              <p><span />{region.factors[0]}</p>
            </button>
          ))}
        </div>
      </section>

      <section className="forecast-section" id="forecast">
        <div className="section-heading">
          <div>
            <div className="section-kicker"><span>02</span> 지역별 혼잡 예보</div>
            <h2>{selectedDate.getMonth() + 1}월 {selectedDate.getDate()}일 부산은 어디가 붐빌까요?</h2>
          </div>
          <div className="legend" aria-label="혼잡 단계 범례">
            <span><i className="calm" />여유</span><span><i className="normal" />보통</span><span><i className="busy" />혼잡</span><span><i className="very-busy" />매우 혼잡</span><span><i className="extreme" />극심</span>
          </div>
        </div>

        <div className="forecast-grid">
          <div className="map-panel">
            <div className="map-toolbar">
              <span>부산광역시</span>
              <div className="map-category-filter" role="group" aria-label="지도 권역 분류">
                {REGION_CATEGORY_OPTIONS.map((category) => (
                  <button
                    type="button"
                    key={category.id}
                    className={regionCategory === category.id ? "selected" : ""}
                    onClick={() => selectRegionCategory(category.id)}
                    aria-pressed={regionCategory === category.id}
                  >
                    {category.label}
                  </button>
                ))}
              </div>
              <small>{mapStatus === "ready" ? `카카오맵 · ${visibleRegions.length}개 표시` : mapStatus === "loading" ? "지도 연결 중" : `${visibleRegions.length}개 표시`}</small>
            </div>
            <div className={`map-canvas ${mapStatus === "ready" ? "is-kakao-map" : ""}`} aria-label="부산 주요 지역 혼잡 지도">
              <div ref={mapContainerRef} className="kakao-map" />
              {mapStatus !== "ready" && <>
                <div className="map-land" /><div className="map-river river-one" /><div className="map-river river-two" />
                <span className="sea-label">EAST SEA</span>
                {visibleRegions.map((region) => (
                  <button
                    key={region.id}
                    className={`map-pin ${levelClass(region.score)} ${selected.id === region.id ? "selected" : ""}`}
                    style={{ left: `${region.x}%`, top: `${region.y}%`, "--map-pin-z": String(100 + region.score) } as CSSProperties}
                    onClick={() => setSelectedRegionId(region.id)}
                    aria-label={`${region.name} 혼잡도 ${region.score}점, ${levelFor(region.score)}`}
                    aria-pressed={selected.id === region.id}
                  >
                    <strong>{region.score}</strong><span>{MAP_PIN_LABELS[region.id] ?? region.name}</span>
                  </button>
                ))}
              </>}
            </div>
            <div className="map-footnote"><span className="data-dot" /> {forecastStatus === "loading" ? "예보 계산 결과를 불러오는 중입니다." : forecastStatus === "fallback" ? "외부 연결 지연 · 최근 계산 예보를 표시합니다." : forecastMode === "live" ? `Supabase 예보 연결됨 · ${formatUpdatedAt(forecastAsOf)} 갱신` : `계산 예보 · ${formatUpdatedAt(forecastAsOf)} 생성`}</div>
          </div>

          <aside className="detail-panel" aria-live="polite">
            <div className="detail-topline"><span>{selected.area}</span><span>{selected.weather}</span></div>
            <div className="detail-title-row">
              <div><h3>{selected.name}</h3><p>{forecastSentence(selected.score)}</p></div>
              <div className={`score-orbit ${levelClass(selected.score)}`}><strong>{selected.score}</strong><small>/ 100</small></div>
            </div>
            <div className="confidence-row"><span className="confidence-badge">신뢰도 {confidenceLabel(selected.confidence)} · {selected.confidence}</span><span>{weatherSource === "kma" ? "기상청 단기예보" : "저장 날씨"} · {trendSource === "naver" ? "네이버 데이터랩" : "저장 검색지표"}</span></div>
            <div className="source-summary"><span>예보 기준 {formatUpdatedAt(forecastAsOf)}</span><span>행사 {hasImpactEvent ? "수집 행사 반영" : "확인된 행사 없음"}</span></div>
            {selectedDateIndex === 0 && <p className="forecast-caution">실시간 정보가 아니며 돌발 상황은 반영되지 않을 수 있어요.</p>}

            <div className="recommend-card">
              <span className="recommend-icon" aria-hidden="true">↘</span>
              <div><small>추천 방문 시간</small><strong>{selected.calm}</strong><p>이 시간대가 상대적으로 덜 붐빌 것으로 보여요.</p></div>
            </div>

            <div className="metric-pair">
              <div><small>혼잡 집중</small><strong>{selected.peak}</strong></div>
              <div><small>날씨</small><strong>{selected.weather}</strong></div>
            </div>

            <div className="factor-block">
              <h4>왜 붐빌까요?</h4>
              <ol>{selected.factors.map((factor, index) => <li key={factor}><span>0{index + 1}</span>{factor}</li>)}</ol>
            </div>
          </aside>
        </div>

        <div className="region-list" aria-label="지도 대체 지역 목록">
          {adjustedRegions.map((region) => (
            <button key={region.id} className={selected.id === region.id ? "region-chip selected" : "region-chip"} onClick={() => setSelectedRegionId(region.id)}>
              <span><b title={region.name}>{region.name}</b><small>{region.area}</small></span><strong className={levelClass(region.score)}>{region.score}</strong>
            </button>
          ))}
        </div>
      </section>

      <section className="detail-section">
        <div className="chart-card">
          <div className="card-heading"><div><span>시간대별 혼잡</span><h3>{selected.name}의 하루 흐름</h3></div><p><b /> 추천 시간 {selected.calm}</p></div>
          <div className="chart-wrap">
            <div className="chart-gridlines"><span>100</span><span>75</span><span>50</span><span>25</span></div>
            <div className="bar-chart" style={{ gridTemplateColumns: `repeat(${selected.hourly.length}, 1fr)` }}>
              {selected.hourly.map((score, index) => (
                <div className="bar-column" key={selected.hours?.[index] ?? HOURS[index] ?? index}><div className={`bar ${levelClass(score)}`} style={{ height: `${Math.max(score, 8)}%` }}><span>{score}</span></div><small>{selected.hours?.[index] ?? HOURS[index] ?? String(index + 8).padStart(2, "0")}</small></div>
              ))}
            </div>
          </div>
          <table className="sr-only">
            <caption>{selected.name} 시간대별 혼잡 점수</caption>
            <thead><tr><th>시간</th><th>혼잡 점수</th><th>단계</th></tr></thead>
            <tbody>{selected.hourly.map((score, index) => <tr key={`accessible-${selected.hours?.[index] ?? HOURS[index] ?? index}`}><th>{selected.hours?.[index] ?? HOURS[index] ?? String(index + 8).padStart(2, "0")}시</th><td>{score}점</td><td>{levelFor(score)}</td></tr>)}</tbody>
          </table>
          <div className="chart-note"><span>예보 요약</span><p><strong>{selected.peak}</strong>에 혼잡 위험이 가장 높습니다. {withJosa(selected.factors[0], "과/와")} {withJosa(selected.factors[1], "이/가")} 함께 반영됐습니다.</p></div>
          <div className="visit-plan">
            <div className="visit-plan-heading"><strong>방문 판단 요약</strong><span>선택한 날짜의 예보 기준</span></div>
            <div className="visit-plan-grid">
              <article><span>추천 방문 시간</span><strong>{selected.calm}</strong><small>상대적으로 여유로운 구간</small></article>
              <article><span>혼잡 집중 시간</span><strong>{selected.peak}</strong><small>가능하면 피할 시간대</small></article>
              <article><span>예보 신뢰도</span><strong>{selected.confidence}점</strong><small>{selected.weather}</small></article>
            </div>
          </div>
        </div>

        <div className="event-card event-news-card">
          <div className="event-label">영향 행사</div>
          <div className="event-visual event-news-preview">
            <span>{hasImpactEvent ? "OFFICIAL EVENT SIGNAL" : "NO EVENT SIGNAL"}</span>
            <strong>{selected.name}</strong>
            <small>{selected.area}</small>
          </div>
          <div className="event-content">
            <small>{hasImpactEvent ? "예보에 반영된 주요 행사" : "수집 결과"}</small><h3>{selected.event}</h3><p>{selected.eventMeta}</p>
            {hasImpactEvent ? <>
              <div className="event-evidence"><small>반영 근거</small><p>{selected.eventEvidence || selected.factors.join(" · ")}</p></div>
              <div className="event-source-row"><span><small>출처</small><strong>{selected.eventSourceName || "공식 행사 정보"}</strong></span><span><small>확인 시각</small><strong>{formatUpdatedAt(selected.eventUpdatedAt || forecastAsOf)}</strong></span></div>
              <div className="event-feed-heading"><strong>관련 링크</strong><span>{visibleEventLinks.length}건 · 항목을 올리면 미리보기</span></div>
              {visibleEventLinks.length > 0
              ? <div className="event-link-scroll" role="list" aria-label={`${selected.event} 관련 링크`}>
                {visibleEventLinks.map((link, index) => (
                  <a
                    key={`${link.url}-${index}`}
                    className={`event-link-item${eventLinkPreview?.index === index ? " is-active" : ""}`}
                    href={link.url}
                    target="_blank"
                    rel="noreferrer"
                    role="listitem"
                    onMouseEnter={(event) => showEventLinkPreview(index, event)}
                    onMouseMove={(event) => showEventLinkPreview(index, event)}
                    onMouseLeave={() => setEventLinkPreview(null)}
                    onBlur={() => setEventLinkPreview(null)}
                  >
                    <span>{link.source}</span>
                    <strong>{link.title}</strong>
                    <p>{link.summary}</p>
                    <small>원문 보기 ↗</small>
                  </a>
                ))}
              </div>
              : <div className="event-link-empty">관련 원문을 수집하고 있습니다.</div>}
            </> : <div className="event-link-empty">해당 날짜에 검증된 행사만 이 영역에 표시합니다.</div>}
            {eventLinkPreview && hoveredEventLink && hoveredEventImageUrl
              ? <div className="event-hover-preview" style={{ left: eventLinkPreview.x, top: eventLinkPreview.y }} aria-hidden="true">
                {/* 외부 원문의 동적 이미지 URL이라 사전 도메인 등록이 필요한 next/image 대신 실패 시 닫히는 미리보기를 사용합니다. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={hoveredEventImageUrl} alt="" onError={() => setEventLinkPreview(null)} />
                <div><span>{hoveredEventLink.source}</span><strong>{hoveredEventLink.title}</strong></div>
              </div>
              : null}
          </div>
        </div>
      </section>

      <section className="evidence-section" id="evidence" aria-labelledby="evidence-heading">
        <div className="evidence-heading">
          <div className="section-kicker"><span>03</span> 예보 계산 근거</div>
          <h2 id="evidence-heading">{selected.name} {selected.score}점은 이렇게 만들어졌습니다.</h2>
          <p>AI가 점수를 임의로 정하지 않고, 확인 가능한 입력을 규칙 기반 점수 엔진이 조합합니다.</p>
        </div>
        <div className="evidence-board">
          <article className="component-card">
            <div className="evidence-card-title"><span>WEIGHTED COMPONENTS</span><strong>가중 기여도</strong></div>
            {scoreEvidence.length > 0 ? <div className="component-list">{scoreEvidence.map((component) => (
              <div className="component-row" key={component.label}>
                <div><span>{component.label}</span><strong>+{Math.round(component.value)}점</strong></div>
                <i><b style={{ width: `${Math.max(0, Math.min(100, component.value / component.maximum * 100))}%` }} /></i>
              </div>
            ))}</div> : <p className="evidence-loading">점수 구성 데이터를 불러오는 중입니다.</p>}
            <div className="adjustment-row"><span>날씨 보정 <strong>{Math.round(selected.scoreComponents?.weatherAdjustment ?? 0)}점</strong></span><span>인접 행사 <strong>+{Math.round(selected.scoreComponents?.nearbyEventAdjustment ?? 0)}점</strong></span></div>
          </article>
          <article className="verification-card">
            <div className="evidence-card-title"><span>VALIDATION RULES</span><strong>예보를 검증하는 세 가지 기준</strong></div>
            <ol>
              <li><span>01</span><div><strong>재현 가능한 계산</strong><p>같은 입력에는 같은 점수가 나오며 위험 단계·추천 시간 경계값을 자동 검증합니다.</p></div></li>
              <li><span>02</span><div><strong>출처와 시각 확인</strong><p>공식 행사 원문, 기상청 예보, 검색 추세와 마지막 갱신 시각을 함께 남깁니다.</p></div></li>
              <li><span>03</span><div><strong>불확실성 분리</strong><p>혼잡 위험도와 데이터 신뢰도를 별도로 표시해 확정적인 인원수처럼 보이지 않게 합니다.</p></div></li>
            </ol>
          </article>
        </div>
      </section>

      <section className="compare-section" id="compare">
        <div className="section-heading compact">
          <div><div className="section-kicker"><span>04</span> 지역 비교</div><h2>어디로 갈지 고민된다면</h2></div>
          <div className="compare-controls">
            <div className="compare-mode" role="group" aria-label="비교 방식">
              <button type="button" className={compareMode === "region" ? "selected" : ""} onClick={() => setCompareMode("region")} aria-pressed={compareMode === "region"}>지역끼리</button>
              <button type="button" className={compareMode === "date" ? "selected" : ""} onClick={() => setCompareMode("date")} aria-pressed={compareMode === "date"}>날짜끼리</button>
            </div>
            {compareMode === "region" ? (
              <label>비교 지역<select value={compareId} onChange={(event) => setCompareId(event.target.value)}>{adjustedRegions.filter((region) => region.id !== selected.id).map((region) => <option value={region.id} key={region.id}>{region.name}</option>)}</select></label>
            ) : (
              <label>비교 날짜<select value={compareDateIndex} onChange={(event) => setCompareDateIndex(Number(event.target.value))}>{dates.map((date, index) => index !== selectedDateIndex && <option value={index} key={toDateKey(date)}>{formatForecastDate(date)}</option>)}</select></label>
            )}
          </div>
        </div>
        {comparison ? (
          <div className="compare-board">
            {[selected, comparison].map((region, index) => (
              <article className={index === 0 ? "compare-card primary" : "compare-card"} key={`${region.id}-${index}`}>
                <div>
                  <span>{compareMode === "region" ? (index === 0 ? "선택 지역" : "비교 지역") : (index === 0 ? "선택 날짜" : "비교 날짜")}</span>
                  <h3>{compareMode === "region" ? region.name : formatForecastDate(index === 0 ? selectedDate : comparisonDate)}</h3>
                  <p>{compareMode === "region" ? region.area : selected.name}</p>
                </div>
                <strong className={levelClass(region.score)}>{region.score}</strong>
                <dl><div><dt>혼잡 집중</dt><dd>{region.peak}</dd></div><div><dt>추천 시간</dt><dd>{region.calm}</dd></div><div><dt>신뢰도</dt><dd>{region.confidence} · {confidenceLabel(region.confidence)}</dd></div></dl>
              </article>
            ))}
            <div className="compare-result">
              <span>한눈에 보기</span>
              <strong>{compareMode === "region" ? (selected.score <= comparison.score ? selected.name : comparison.name) : formatForecastDate(selected.score <= comparison.score ? selectedDate : comparisonDate)}</strong>
              <p>{compareMode === "region" ? "더 여유로울 가능성이 높아요." : "방문이 더 여유로울 가능성이 높아요."}</p>
              <small>{compareMode === "region" ? "두 지역" : "두 날짜"}의 차이는 {Math.abs(selected.score - comparison.score)}점입니다.</small>
            </div>
          </div>
        ) : <div className="compare-loading" role="status">비교할 날짜의 예보를 불러오는 중입니다.</div>}
      </section>

      <section className="decision-section" id="ai-tools" aria-labelledby="decision-heading">
        <div className="decision-heading">
          <div>
            <div className="section-kicker"><span>05</span> 혼잡 회피 도구</div>
            <h2 id="decision-heading">붐빈다면, 다른 선택을 바로 찾아보세요.</h2>
            <p>{formatForecastDate(selectedDate)} {selected.name} 예보를 기준으로 장소와 조건을 바꿔 비교합니다.</p>
          </div>
          <div className="decision-tabs" role="tablist" aria-label="혼잡 회피 도구">
            <button type="button" role="tab" aria-selected={decisionTab === "alternatives"} className={decisionTab === "alternatives" ? "selected" : ""} onClick={() => { setDecisionTab("alternatives"); setDecisionError(""); }}>대체 장소</button>
            <button type="button" role="tab" aria-selected={decisionTab === "scenario"} className={decisionTab === "scenario" ? "selected" : ""} onClick={() => { setDecisionTab("scenario"); setDecisionError(""); }}>조건 시나리오</button>
          </div>
        </div>

        <div className="decision-workspace">
          {decisionTab === "alternatives" ? <>
            <aside className="decision-control-card">
              <span className="decision-label">ALTERNATIVE FINDER</span>
              <h3>{selected.name} 대신 어디로 갈까요?</h3>
              <p>방문 목적·장소 매력도·이동 부담·혼잡도를 함께 비교해 세 곳을 추천합니다.</p>
              <fieldset>
                <legend>무엇을 우선할까요?</legend>
                <div className="decision-choice-grid">
                  <button type="button" className={alternativePriority === "similar" ? "selected" : ""} onClick={() => setAlternativePriority("similar")} aria-pressed={alternativePriority === "similar"}><strong>비슷한 분위기</strong><small>방문 목적·장소 성격 우선</small></button>
                  <button type="button" className={alternativePriority === "calmest" ? "selected" : ""} onClick={() => setAlternativePriority("calmest")} aria-pressed={alternativePriority === "calmest"}><strong>최대한 여유롭게</strong><small>갈 만한 곳 중 여유 우선</small></button>
                  <button type="button" className={alternativePriority === "indoor" ? "selected" : ""} onClick={() => setAlternativePriority("indoor")} aria-pressed={alternativePriority === "indoor"}><strong>실내 중심</strong><small>실내 적합성·동선 우선</small></button>
                </div>
              </fieldset>
              <button type="button" className="decision-run-button" onClick={runAlternativeDecision} disabled={decisionStatus === "loading"}>{decisionStatus === "loading" ? "추천을 비교하는 중…" : "대체 장소 찾기"}<span>→</span></button>
            </aside>

            <div className="decision-result-panel" aria-live="polite">
              {alternativeDecision?.selectedRegionId === selected.id && alternativeDecision.date === toDateKey(selectedDate) ? <>
                <div className="decision-result-heading"><div><span>{alternativeDecision.source !== "forecast_engine" ? "맞춤 분석" : "예보 기반 분석"}</span><h3>추천 대체 장소</h3></div><p>{alternativeDecision.summary}</p></div>
                <div className="alternative-list">{alternativeDecision.recommendations.map((recommendation, index) => (
                  <article key={recommendation.regionId}>
                    <div className="alternative-rank"><span>0{index + 1}</span><strong className={levelClass(recommendation.score)}>{recommendation.score}</strong></div>
                    <div className="alternative-copy"><small>{recommendation.area} · 적합도 {recommendation.fitScore}</small><h4>{recommendation.regionName}</h4><p>{recommendation.why}</p><dl><div><dt>추천 시간</dt><dd>{recommendation.bestTime}</dd></div><div><dt>확인할 점</dt><dd>{recommendation.tradeoff}</dd></div></dl></div>
                    <button type="button" onClick={() => selectRegionAndShowForecast(recommendation.regionId)}>이 지역 예보 보기</button>
                  </article>
                ))}</div>
              </> : <div className="decision-empty"><span>↗</span><strong>{selected.name}의 대안을 준비했어요.</strong><p>우선순위를 고르면 방문 목적과 이동 부담까지 반영한 대체 장소를 비교합니다.</p></div>}
              {decisionStatus === "error" && <p className="decision-error" role="alert">{decisionError}</p>}
            </div>
          </> : <>
            <aside className="decision-control-card">
              <span className="decision-label">WHAT-IF SCENARIO</span>
              <h3>조건이 바뀌면 얼마나 달라질까요?</h3>
              <p>한 번에 세 조건을 바꿔 현재 예보와 차이를 확인합니다.</p>
              <div className="scenario-fields">
                <label>날씨<select value={scenarioWeather} onChange={(event) => setScenarioWeather(event.target.value as ScenarioWeather)}><option value="forecast">현재 예보 유지</option><option value="clear">맑아진다면</option><option value="rain">비가 온다면</option></select></label>
                <label>행사<select value={scenarioEvent} onChange={(event) => setScenarioEvent(event.target.value as ScenarioEvent)}><option value="forecast">현재 행사 유지</option><option value="cancelled">주요 행사 취소</option><option value="major">대형 행사 추가</option></select></label>
                <label>날짜 성격<select value={scenarioCalendar} onChange={(event) => setScenarioCalendar(event.target.value as ScenarioCalendar)}><option value="forecast">현재 날짜 유지</option><option value="weekday">평일이라면</option><option value="weekend">주말이라면</option><option value="holiday">공휴일이라면</option></select></label>
              </div>
              <button type="button" className="decision-run-button" onClick={runScenarioDecision} disabled={decisionStatus === "loading"}>{decisionStatus === "loading" ? "조건을 계산하는 중…" : "시나리오 분석하기"}<span>→</span></button>
            </aside>

            <div className="decision-result-panel scenario-result" aria-live="polite">
              {scenarioDecision?.selectedRegionId === selected.id && scenarioDecision.date === toDateKey(selectedDate) ? <>
                <div className="scenario-scoreboard">
                  <div><span>현재 예보</span><strong className={levelClass(scenarioDecision.baseScore)}>{scenarioDecision.baseScore}</strong></div>
                  <i>→</i>
                  <div><span>조건 변경 후</span><strong className={levelClass(scenarioDecision.scenarioScore)}>{scenarioDecision.scenarioScore}</strong></div>
                  <b className={scenarioDecision.delta > 0 ? "up" : scenarioDecision.delta < 0 ? "down" : "same"}>{scenarioDecision.delta > 0 ? "+" : ""}{scenarioDecision.delta}점</b>
                </div>
                <div className="scenario-copy"><span>{scenarioDecision.source !== "forecast_engine" ? "맞춤 시나리오" : "예보 기반 시나리오"}</span><h3>{scenarioDecision.summary}</h3><ul>{scenarioDecision.effects.map((effect) => <li key={effect}>{effect}</li>)}</ul><div><small>추천 방문 시간</small><strong>{scenarioDecision.recommendedTime}</strong></div><p>{scenarioDecision.confidenceNote}</p></div>
              </> : <div className="decision-empty"><span>±</span><strong>현재 {selected.score}점에서 무엇이 달라질까요?</strong><p>날씨·행사·날짜 조건을 선택하면 변경 전후 점수와 원인을 비교합니다.</p></div>}
              {decisionStatus === "error" && <p className="decision-error" role="alert">{decisionError}</p>}
            </div>
          </>}
        </div>
      </section>

      <section className="method-section" id="method">
        <div><p className="eyebrow">HOW IT WORKS</p><h2>감이 아니라,<br />근거를 조합합니다.</h2></div>
        <div className="method-content">
          <div className="method-steps"><div><span>01</span><strong>평소 혼잡</strong><p>권역별·요일별·시간대별 기준 패턴</p></div><div><span>02</span><strong>행사 영향</strong><p>일정, 규모, 선착순·한정 요소</p></div><div><span>03</span><strong>관심도·날씨</strong><p>검색 변화와 실내외 날씨 보정</p></div><div><span>04</span><strong>설명 가능한 예보</strong><p>코드로 점수와 추천 시간 계산</p></div></div>
          <div className="method-detail-grid">
            <article><span>점수 구성</span><strong>평소 60% · 검색 25% · 달력 15% + 행사 가산</strong><p>행사는 최대 +25점, 날씨는 -12~+12점, 인접 행사는 최대 +10점으로 별도 보정합니다.</p></article>
            <article><span>AI 활용</span><strong>비정형 행사 정보 구조화</strong><p>AI는 행사 공지의 날짜·장소·위험 요인을 정형 입력으로 바꾸고, 점수·추천·조건 비교는 재현 가능한 규칙 엔진이 계산합니다.</p></article>
            <article><span>예보의 한계</span><strong>실시간 인원수나 확정 수치가 아닙니다</strong><p>돌발 상황은 반영되지 않을 수 있으며, 혼잡 위험도와 데이터 신뢰도를 분리해 확인해야 합니다.</p></article>
          </div>
        </div>
      </section>

      <footer><div className="brand footer-brand"><span className="brand-mark" aria-hidden="true"><i /><i /><i /></span><span>붐비</span></div><p>부산의 내일을 조금 더 여유롭게.</p><small>행사·날씨·검색 추세와 시간대별 패턴을 결합한 혼잡 가능성 예보입니다. 실제 현장 상황과 다를 수 있습니다.</small><nav className="footer-links" aria-label="서비스 정보"><a href="/licenses">데이터·라이선스</a></nav><small className="footer-copyright">© 2026 Boombi. All rights reserved. · Created by 이종민</small></footer>

      <nav className="mobile-nav" aria-label="모바일 메뉴"><a href="#forecast"><span>●</span>예보</a><a href="#compare"><span>⇄</span>비교</a><a href="#ai-tools"><span>✦</span>회피 도구</a><a href="#method"><span>?</span>방법</a></nav>
    </main>
  );
}
