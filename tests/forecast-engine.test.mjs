import assert from "node:assert/strict";
import test from "node:test";

import { calculateConfidence } from "../domain/forecast/confidence.ts";
import { applyCalendarProfile, calendarDayFor } from "../domain/forecast/calendar-profile.ts";
import { findBestTwoHourWindow } from "../domain/forecast/recommendation.ts";
import {
  calculateForecastScore,
  clampScore,
  combineEventImpacts,
  eventImpactScore,
  riskLabelForScore,
  trendScore,
  weatherAdjustment,
} from "../domain/forecast/score.ts";
import { createDemoForecast, dateKeyForOffset } from "../fixtures/forecast.ts";
import { snapshotFromItems } from "../providers/kma-weather.ts";
import { trendSignalFromData } from "../providers/naver-datalab.ts";
import {
  classifyEventCandidate,
  eventCandidateFingerprint,
  parseBusanFestivalResponse,
  parseNaverRelatedLinksResponse,
  parseNaverSearchResponse,
  parseTourApiResponse,
  parseVisitBusanDetailResponse,
  parseVisitBusanListResponse,
} from "../providers/event-discovery.ts";
import { applyAutoEvents } from "../providers/auto-event-forecast.ts";
import { fixtureEventAnalysis } from "../providers/openai-event-analysis.ts";
import { configuredAiProviders } from "../providers/ai-runtime.ts";
import { isRefreshAuthorized } from "../repositories/supabase-forecast-writer.ts";
import { createAlternativeDecision, createScenarioDecision, withJosa } from "../domain/decision/fallback.ts";

test("위험 단계 경계값과 clamp를 지킨다", () => {
  assert.equal(clampScore(-3), 0);
  assert.equal(clampScore(104), 100);
  assert.equal(riskLabelForScore(34), "여유");
  assert.equal(riskLabelForScore(35), "보통");
  assert.equal(riskLabelForScore(55), "혼잡");
  assert.equal(riskLabelForScore(75), "매우 혼잡");
  assert.equal(riskLabelForScore(90), "극심");
});

test("동적 문구의 한국어 조사를 받침에 맞게 선택한다", () => {
  assert.equal(withJosa("서면", "이/가"), "서면이");
  assert.equal(withJosa("광안리", "이/가"), "광안리가");
  assert.equal(withJosa("서면", "과/와"), "서면과");
  assert.equal(withJosa("광안리", "과/와"), "광안리와");
  assert.equal(withJosa("관광 수요", "은/는"), "관광 수요는");
  assert.equal(withJosa("부산역", "으로/로"), "부산역으로");
  assert.equal(withJosa("해운대", "으로/로"), "해운대로");
  assert.equal(withJosa("서울", "으로/로"), "서울로");
});

test("대체 장소 추천은 선택 지역을 제외하고 서로 다른 세 곳을 반환한다", () => {
  const forecast = createDemoForecast(dateKeyForOffset(0));
  const decision = createAlternativeDecision(forecast, "haeundae", "similar");
  assert.equal(decision.recommendations.length, 3);
  assert.equal(new Set(decision.recommendations.map((item) => item.regionId)).size, 3);
  assert.ok(decision.recommendations.every((item) => item.regionId !== "haeundae"));
  assert.ok(decision.recommendations.every((item) => item.bestTime.length > 0 && item.why.length > 0));
});

test("서면의 비슷한 분위기는 대표 상권과 야간 방문지를 우선한다", () => {
  const forecast = createDemoForecast(dateKeyForOffset(0));
  const decision = createAlternativeDecision(forecast, "seomyeon", "similar");
  const ids = decision.recommendations.map((item) => item.regionId);
  assert.ok(ids.includes("jeonpo"));
  assert.ok(ids.includes("gwangalli") || ids.includes("nampo"));
  assert.ok(ids.every((id) => !["jeonggwan", "hwamyeong", "gimhae-airport", "nopo", "munhyeon", "sasang"].includes(id)));
});

test("대체 장소는 우선순위별 점수로 정렬하고 기능형 교통 거점을 제외한다", () => {
  const forecast = createDemoForecast(dateKeyForOffset(0));
  const similar = createAlternativeDecision(forecast, "seomyeon", "similar");
  const calmest = createAlternativeDecision(forecast, "seomyeon", "calmest");
  const indoor = createAlternativeDecision(forecast, "seomyeon", "indoor");
  const excluded = new Set(["gimhae-airport", "nopo", "busan-station", "sasang", "munhyeon"]);
  assert.notDeepEqual(similar.recommendations.map((item) => item.regionId), calmest.recommendations.map((item) => item.regionId));
  assert.notDeepEqual(calmest.recommendations.map((item) => item.regionId), indoor.recommendations.map((item) => item.regionId));
  assert.ok([similar, calmest, indoor].every((decision) => decision.recommendations.every((item) => !excluded.has(item.regionId))));
  assert.ok([similar, calmest, indoor].every((decision) => decision.recommendations.every((item, index, items) => index === 0 || items[index - 1].fitScore >= item.fitScore)));
});

test("혼잡 시나리오는 변경 조건을 기준 점수와 분리해 계산한다", () => {
  const forecast = createDemoForecast(dateKeyForOffset(0));
  const quieter = createScenarioDecision(forecast, {
    action: "scenario", date: forecast.date, selectedRegionId: "haeundae", weather: "rain", event: "cancelled", calendar: "weekday",
  });
  const busier = createScenarioDecision(forecast, {
    action: "scenario", date: forecast.date, selectedRegionId: "haeundae", weather: "clear", event: "major", calendar: "holiday",
  });
  assert.ok(quieter.scenarioScore < quieter.baseScore);
  assert.ok(busier.scenarioScore > busier.baseScore);
  assert.equal(quieter.effects.length, 3);
});

test("평상시 혼잡을 중심으로 행사 가산점을 더한다", () => {
  const result = calculateForecastScore({
    baseline: 60, eventImpact: 80, trend: 50, calendar: 70, weatherAdjustment: 4, nearbyEventAdjustment: 3,
  });
  assert.equal(result.score, 86);
  assert.equal(result.components.baseline, 36);
  assert.equal(result.components.eventImpact, 20);
});

test("행사 신호, 중첩 행사, 검색 관심도를 계산한다", () => {
  assert.equal(eventImpactScore({ scale: "large", limitedGoods: true, firstCome: true, numberedTickets: true }), 98);
  assert.equal(combineEventImpacts([80, 40, 20]), 100);
  assert.equal(trendScore(210, 100, true), 95);
  assert.equal(trendScore(10, 0), 45);
});

test("장기 다지역 묶음 행사는 세부 날짜가 없으면 자동 반영하지 않는다", () => {
  const decision = classifyEventCandidate({
    id: "umbrella-event",
    title: "부산 야간관광 페스타",
    venue: "해운대, 광안리, 다대포, 광복로 일원 등",
    regionId: "haeundae",
    regionName: "해운대",
    startDate: "2026-07-01",
    endDate: "2026-12-31",
    sourceName: "공식 행사",
    sourceUrl: "https://example.com/event",
    imageUrl: null,
    sourceKind: "visit_busan",
    sourceText: "여러 지역에서 순차적으로 운영되는 행사",
  }, "2026-08-21");
  assert.equal(decision.status, "needs_review");
  assert.ok(decision.reasons.includes("세부 개최일 확인 필요"));
});

test("고정 시각 공개 공연은 해당 권역 점수와 시간대에 집중 반영한다", () => {
  const date = dateKeyForOffset(1);
  const base = applyCalendarProfile(createDemoForecast(date));
  const candidate = {
    id: "drone-show",
    title: "광안리 M 드론라이트쇼",
    venue: "광안리해수욕장 일원",
    regionId: "gwangalli",
    regionName: "광안리",
    startDate: date,
    endDate: date,
    activeDates: [date],
    sourceName: "Visit Busan",
    sourceUrl: "https://example.com/drone",
    imageUrl: null,
    sourceKind: "visit_busan",
    sourceText: "20시 공개 공연으로 관람객이 집중되는 드론라이트쇼",
  };
  const analysis = fixtureEventAnalysis(candidate);
  const forecast = applyAutoEvents(base, [candidate], base.asOf, new Map([[candidate.id, analysis]]));
  const gwangalli = forecast.regions.find((region) => region.id === "gwangalli");
  const haeundae = forecast.regions.find((region) => region.id === "haeundae");
  assert.ok((gwangalli?.score ?? 0) > (haeundae?.score ?? 100));
  assert.ok((gwangalli?.hourly[11] ?? 0) > (gwangalli?.hourly[2] ?? 100));
  assert.match(gwangalli?.eventEvidence ?? "", /공개 공연 관람객/);
  assert.doesNotMatch(gwangalli?.eventEvidence ?? "", /20시 공개 공연으로/);
});

test("실내와 야외 날씨 보정 방향이 다르다", () => {
  assert.equal(weatherAdjustment({ venue: "indoor", precipitationProbability: 80 }), 4);
  assert.equal(weatherAdjustment({ venue: "outdoor", precipitationProbability: 80 }), -6);
  assert.equal(weatherAdjustment({ venue: "outdoor", precipitationProbability: 90, precipitationMm: 20 }), -12);
});

test("기상청 단기예보 항목을 화면용 날씨로 변환한다", () => {
  const items = [
    { category: "TMP", fcstDate: "20260722", fcstTime: "1400", fcstValue: "31" },
    { category: "POP", fcstDate: "20260722", fcstTime: "1400", fcstValue: "70" },
    { category: "PTY", fcstDate: "20260722", fcstTime: "1400", fcstValue: "1" },
    { category: "SKY", fcstDate: "20260722", fcstTime: "1400", fcstValue: "4" },
    { category: "PCP", fcstDate: "20260722", fcstTime: "1400", fcstValue: "1.0mm 미만" },
    { category: "WSD", fcstDate: "20260722", fcstTime: "1400", fcstValue: "3.2" },
  ];
  assert.deepEqual(snapshotFromItems(items, "20260722"), {
    label: "비 31°",
    precipitationProbability: 70,
    precipitationMm: 0.5,
    temperature: 31,
    windSpeed: 3.2,
  });
});

test("네이버 검색트렌드의 최근 3일 상승과 월간 고점을 계산한다", () => {
  const data = [20, 22, 24, 25, 23, 24, 22, 60, 65, 70].map((ratio, index) => ({
    period: `2026-07-${String(index + 1).padStart(2, "0")}`,
    ratio,
  }));
  const signal = trendSignalFromData(data);
  assert.equal(signal?.nearMonthlyPeak, true);
  assert.equal(signal?.score, 95);
  assert.ok((signal?.ratio ?? 0) > 2.5);
});

test("부산축제정보와 TourAPI 응답을 같은 행사 후보 형식으로 변환한다", () => {
  const busan = parseBusanFestivalResponse({ getFestivalKr: { item: [{
    UC_SEQ: 71, MAIN_TITLE: "광안리 축제", GUGUN_NM: "수영구", MAIN_PLACE: "광안리해수욕장",
    USAGE_DAY: "", USAGE_DAY_WEEK_AND_TIME: "2026. 7. 22. ~ 7. 24.", HOMEPAGE_URL: "https://example.com",
    MAIN_IMG_NORMAL: "https://example.com/busan.jpg",
  }] } });
  const tour = parseTourApiResponse({ response: { body: { items: { item: [{
    contentid: "10", title: "벡스코 전시", addr1: "부산 해운대구 APEC로 55", eventstartdate: "20260725", eventenddate: "20260727",
    firstimage: "https://example.com/tour.jpg",
  }] } } } });
  assert.equal(busan[0].regionId, "gwangalli");
  assert.equal(busan[0].startDate, "2026-07-22");
  assert.equal(busan[0].endDate, "2026-07-24");
  assert.equal(busan[0].imageUrl, "https://example.com/busan.jpg");
  assert.equal(tour[0].regionId, "centum");
  assert.equal(tour[0].endDate, "2026-07-27");
  assert.equal(tour[0].imageUrl, "https://example.com/tour.jpg");
});

test("네이버 검색 결과에서 민간 행사의 원문·기간·권역을 구조화한다", () => {
  const candidates = parseNaverSearchResponse({
    items: [{
      title: "<b>서면 캐릭터 팝업스토어</b>",
      link: "https://example.com/popup",
      description: "롯데백화점 부산본점에서 2026. 7. 25. ~ 8. 3. 기간 한정 운영",
    }],
  }, {
    query: "서면 롯데백화점 팝업스토어",
    regionId: "seomyeon",
    regionName: "서면",
    venue: "롯데백화점 부산본점",
  });
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].title, "서면 캐릭터 팝업스토어");
  assert.equal(candidates[0].regionId, "seomyeon");
  assert.equal(candidates[0].startDate, "2026-07-25");
  assert.equal(candidates[0].endDate, "2026-08-03");
  assert.equal(candidates[0].sourceKind, "naver_search");
});

test("네이버 검색 결과는 팝업 외 공연·전시·체험 행사도 후보로 만든다", () => {
  const candidates = parseNaverSearchResponse({
    items: [{
      title: "부산 해변 야외 콘서트 개최",
      link: "https://example.com/concert",
      description: "광안리해수욕장에서 2026. 8. 22. 공연",
    }],
  }, {
    query: "부산 공연 콘서트 버스킹",
    regionId: null,
    regionName: "권역 확인 필요",
    venue: "부산",
  }, "뉴스");
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].regionId, "gwangalli");
  assert.equal(candidates[0].sourceName, "NAVER API HUB · 뉴스");
});

test("Visit Busan 목록과 상세 페이지에서 포스터·장소·실제 운영일을 추출한다", () => {
  const list = parseVisitBusanListResponse(`
    <a href="/schedule/view.do?boardId=BBS_0000009&amp;menuCd=DOM_000000204012000000&amp;dataSid=6227" title="광안리 M 드론라이트쇼 바로가기">
      <p class="imgwrap"><img src="/upload_data/board_data/BBS_0000009/poster.png" alt="광안리 M 드론라이트쇼"></p>
      <span>2026-08-08 ~ 2026-08-29</span>
    </a>
  `);
  assert.equal(list.length, 1);
  assert.equal(list[0].sourceKind, "visit_busan");
  assert.equal(list[0].imageUrl, "https://www.visitbusan.net/upload_data/board_data/BBS_0000009/poster.png");

  const detail = parseVisitBusanDetailResponse(`
    <div class="tit_view_sub"><p>광안리 M 드론라이트쇼</p></div>
    <div class="tit_view_sub3"><ul><li>기간 2026.08.08. ~ 2026.08.29.</li></ul></div>
    <section id="contents">
      <img src="/upload_data/board_data/BBS_0000009/detail.png">
      <p>○ 8. 8. 여름을 담다</p><p>○ 8. 22. 네이버웹툰 in 광안리</p>
      <div class="name">장소</div><div class="detail"><span>광안리 해수욕장 일원</span></div>
      <div class="name">주소</div><div class="detail"><p>부산 수영구 광안해변로 219</p></div>
    </section>
  `, list[0]);
  assert.equal(detail.regionId, "gwangalli");
  assert.equal(detail.venue, "광안리 해수욕장 일원");
  assert.deepEqual(detail.activeDates, ["2026-08-08", "2026-08-22"]);
  assert.equal(detail.imageUrl, "https://www.visitbusan.net/upload_data/board_data/BBS_0000009/detail.png");

  const fallbackDetail = parseVisitBusanDetailResponse("<html><body><nav>영도 관광</nav></body></html>", {
    ...list[0],
    title: "「광안리 M 드론라이트쇼」 8월 공연 프로그램 안내",
  });
  assert.equal(fallbackDetail.regionId, "gwangalli");
  assert.equal(fallbackDetail.venue, "광안리 일원");
  assert.ok(fallbackDetail.activeDates.includes("2026-08-22"));
});

test("행사 관련 링크는 제목 관련성과 데스크톱 URL을 확인해 선별한다", () => {
  const candidate = {
    id: "popup", title: "포켓몬 메가페스타", venue: "서면", regionId: "seomyeon", regionName: "서면",
    startDate: "2026-07-17", endDate: "2026-08-09", sourceName: "공식 행사", sourceUrl: "",
    imageUrl: "https://example.com/event.jpg", sourceKind: "naver_search", sourceText: "포켓몬 행사",
  };
  const links = parseNaverRelatedLinksResponse({ items: [
    { title: "포켓몬 메가페스타 부산 개최", link: "https://www.yna.co.kr/view/1", description: "서면 팝업 행사 안내" },
    { title: "부산 주말 날씨", link: "https://example.com/weather", description: "행사와 무관한 날씨 정보" },
    { title: "포켓몬 메가페스타 모바일 안내", link: "https://m.example.com/event", description: "모바일 전용 페이지" },
  ] }, candidate);
  assert.equal(links.length, 1);
  assert.equal(links[0].source, "연합뉴스");
  assert.equal(links[0].imageUrl, candidate.imageUrl);
});

test("행사 원문이 같으면 같은 변경 감지 해시를 만들고 내용이 바뀌면 달라진다", () => {
  const candidate = {
    id: "popup", title: "캐릭터 팝업", venue: "서면", regionId: "seomyeon", regionName: "서면",
    startDate: "2026-07-25", endDate: "2026-08-03", sourceName: "검색", sourceUrl: "https://example.com",
    imageUrl: null, sourceKind: "naver_search", sourceText: "한정 상품",
  };
  assert.equal(eventCandidateFingerprint(candidate), eventCandidateFingerprint({ ...candidate }));
  assert.notEqual(eventCandidateFingerprint(candidate), eventCandidateFingerprint({ ...candidate, sourceText: "한정 상품 · 번호표" }));
});

test("연도와 월만 있는 기간을 잘못된 월·일 날짜로 만들지 않는다", () => {
  const candidates = parseBusanFestivalResponse({ getFestivalKr: { item: [{
    UC_SEQ: 1705,
    MAIN_TITLE: "별바다부산 나이트페스타",
    GUGUN_NM: "사하구",
    MAIN_PLACE: "다대포해수욕장",
    USAGE_DAY: "2025.07. ~ 2025.10.",
  }] } });
  assert.equal(candidates[0].startDate, "");
  assert.equal(candidates[0].endDate, "");
  assert.equal(classifyEventCandidate(candidates[0], "2026-07-24").status, "needs_review");
});

test("공식 API 행사는 자동 승인하고 정보가 부족한 항목만 검토로 보낸다", () => {
  const approved = classifyEventCandidate({
    id: "official", title: "벡스코 전시", venue: "벡스코", regionId: "centum", regionName: "센텀",
    startDate: "2026-07-25", endDate: "2026-07-27", sourceName: "TourAPI", sourceUrl: "https://example.com",
    imageUrl: null, sourceKind: "tour_api", sourceText: "공식 행사",
  }, "2026-07-21");
  const review = classifyEventCandidate({
    id: "ambiguous", title: "날짜 미정 행사", venue: "장소 확인 필요", regionId: null, regionName: "권역 확인 필요",
    startDate: "", endDate: "", sourceName: "부산축제정보", sourceUrl: "https://example.com",
    imageUrl: null, sourceKind: "busan_festival", sourceText: "일정 미정",
  }, "2026-07-21");
  assert.equal(approved.status, "auto_approved");
  assert.equal(review.status, "needs_review");
});

test("사전 생성한 AI 행사 분석은 날짜·장소·권역이 있으면 예보에 반영한다", () => {
  const decision = classifyEventCandidate({
    id: "precomputed", title: "캐릭터 팝업", venue: "서면 백화점", regionId: "seomyeon", regionName: "서면",
    startDate: "2026-07-25", endDate: "2026-08-02", sourceName: "AI 사전 분석 시나리오", sourceUrl: "",
    imageUrl: null, sourceKind: "precomputed_ai", sourceText: "한정 상품 · 선착순 입장",
  }, "2026-07-24");
  assert.equal(decision.status, "auto_approved");
  assert.equal(decision.confidence, 86);
});

test("사전 AI 행사와 공식 API 행사의 출처 표기를 구분한다", () => {
  const date = dateKeyForOffset(1);
  const forecast = createDemoForecast(date);
  const result = applyAutoEvents(forecast, [{
    id: "precomputed", title: "캐릭터 팝업", venue: "서면 백화점", regionId: "seomyeon", regionName: "서면",
    startDate: date, endDate: date, sourceName: "AI 사전 분석", sourceUrl: "",
    imageUrl: null, sourceKind: "precomputed_ai", sourceText: "한정 상품 · 선착순 입장",
    relatedLinks: [{
      title: "부산본점 팝업·행사 검색", summary: "팝업 운영 정보를 확인합니다.", source: "롯데백화점",
      url: "https://example.com/popup", imageUrl: null,
    }],
  }]);
  const seomyeon = result.regions.find((region) => region.id === "seomyeon");
  assert.equal(seomyeon?.eventSource, "stored");
  assert.equal(seomyeon?.eventImageUrl, null);
  assert.equal(seomyeon?.eventRelatedLinks[0]?.title, "부산본점 팝업·행사 검색");
});

test("자동 승인 행사를 해당 날짜와 권역 예보에 반영한다", () => {
  const date = dateKeyForOffset(1);
  const forecast = createDemoForecast(date);
  const enriched = applyAutoEvents(forecast, [{
    id: "official", title: "센텀 공식 박람회", venue: "벡스코", regionId: "centum", regionName: "센텀",
    startDate: date, endDate: date, sourceName: "TourAPI", sourceUrl: "https://example.com",
    imageUrl: "https://example.com/event.jpg", sourceKind: "tour_api", sourceText: "대형 실내 전시",
  }]);
  const centum = enriched.regions.find((region) => region.id === "centum");
  assert.equal(centum?.event, "센텀 공식 박람회");
  assert.equal(centum?.eventSource, "public_api");
  assert.equal(centum?.eventImageUrl, "https://example.com/event.jpg");
  assert.equal(centum?.eventSourceUrl, "https://example.com");
});

test("결제 없는 fixture 모드에서도 행사 위험 요인을 결정론적으로 만든다", () => {
  const analysis = fixtureEventAnalysis({
    id: "fixture", title: "캐릭터 팝업", venue: "서면", regionId: "seomyeon", regionName: "서면",
    startDate: "2026-07-22", endDate: "2026-07-28", sourceName: "예시", sourceUrl: "https://example.com",
    imageUrl: null, sourceKind: "fixture", sourceText: "한정 상품 선착순 번호표",
  });
  assert.equal(analysis.analysisSource, "fixture");
  assert.equal(analysis.limitedGoods, true);
  assert.equal(analysis.firstCome, true);
  assert.equal(analysis.scale, "large");
});

test("AI 공급자는 Gemini를 먼저 사용하고 Groq를 예비로 둔다", () => {
  const before = {
    primary: process.env.AI_PRIMARY_PROVIDER,
    fallback: process.env.AI_FALLBACK_PROVIDER,
    geminiKey: process.env.GEMINI_API_KEY,
    groqKey: process.env.GROQ_API_KEY,
  };
  try {
    process.env.AI_PRIMARY_PROVIDER = "gemini";
    process.env.AI_FALLBACK_PROVIDER = "groq";
    process.env.GEMINI_API_KEY = "";
    process.env.GROQ_API_KEY = "";
    assert.deepEqual(configuredAiProviders(), ["gemini", "groq"]);
    delete process.env.GEMINI_API_KEY;
    assert.deepEqual(configuredAiProviders(), ["groq"]);
  } finally {
    for (const [key, value] of Object.entries({
      AI_PRIMARY_PROVIDER: before.primary,
      AI_FALLBACK_PROVIDER: before.fallback,
      GEMINI_API_KEY: before.geminiKey,
      GROQ_API_KEY: before.groqKey,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("자동 갱신 API는 공유 비밀키가 일치할 때만 허용한다", () => {
  assert.equal(isRefreshAuthorized(new Request("https://example.com", {
    headers: { authorization: "Bearer forecast-secret" },
  }), "forecast-secret"), true);
  assert.equal(isRefreshAuthorized(new Request("https://example.com", {
    headers: { authorization: "Bearer wrong-secret" },
  }), "forecast-secret"), false);
});

test("2시간 연속 최저 혼잡 구간을 추천한다", () => {
  const result = findBestTwoHourWindow([
    { time: "08:00", score: 52 }, { time: "09:00", score: 49 }, { time: "10:00", score: 62 },
    { time: "19:00", score: 31 }, { time: "20:00", score: 25 }, { time: "21:00", score: 40 },
  ]);
  assert.deepEqual(result, { start: "19:00", end: "21:00", averageScore: 28, relativelyCalm: false });
});

test("평일·주말·공휴일의 시간대 패턴을 다르게 반영한다", () => {
  const base = createDemoForecast(dateKeyForOffset(0));
  const weekday = applyCalendarProfile({ ...base, date: "2026-07-21" });
  const weekend = applyCalendarProfile({ ...base, date: "2026-07-25" });
  const weekdaySeomyeon = weekday.regions.find((region) => region.id === "seomyeon");
  const weekendSeomyeon = weekend.regions.find((region) => region.id === "seomyeon");
  const weekdayMunhyeon = weekday.regions.find((region) => region.id === "munhyeon");
  const weekendMunhyeon = weekend.regions.find((region) => region.id === "munhyeon");

  assert.equal(calendarDayFor("2026-07-21").kind, "weekday");
  assert.equal(calendarDayFor("2026-07-25").kind, "weekend");
  assert.equal(calendarDayFor("2026-10-09").holidayName, "한글날");
  assert.ok(weekdaySeomyeon?.factors.some((factor) => /평일/.test(factor)));
  assert.ok(weekendSeomyeon?.factors.some((factor) => /주말/.test(factor)));
  assert.match(weekdaySeomyeon?.calm ?? "", /^(0[8-9]|1\d|20):00–(10|1\d|2[0-2]):00$/);
  assert.match(weekendSeomyeon?.calm ?? "", /^(0[8-9]|1\d|20):00–(10|1\d|2[0-2]):00$/);
  assert.ok((weekdaySeomyeon?.hourly[11] ?? 0) > (weekendSeomyeon?.hourly[11] ?? 0));
  assert.ok((weekendSeomyeon?.hourly[6] ?? 0) > (weekdaySeomyeon?.hourly[6] ?? 0));
  assert.ok((weekdayMunhyeon?.score ?? 0) > (weekendMunhyeon?.score ?? 100));
});

test("방학에는 관광지 수요를 높이고 대학가 수요를 낮춘다", () => {
  const base = createDemoForecast(dateKeyForOffset(0));
  const summerVacation = applyCalendarProfile({ ...base, date: "2026-07-22" });
  const semester = applyCalendarProfile({ ...base, date: "2026-06-24" });
  const summerPnu = summerVacation.regions.find((region) => region.id === "pnu");
  const semesterPnu = semester.regions.find((region) => region.id === "pnu");
  const summerDongEui = summerVacation.regions.find((region) => region.id === "dong-eui");
  const semesterDongEui = semester.regions.find((region) => region.id === "dong-eui");
  const summerHaeundae = summerVacation.regions.find((region) => region.id === "haeundae");
  const semesterHaeundae = semester.regions.find((region) => region.id === "haeundae");

  assert.equal(calendarDayFor("2026-07-22").vacationLabel, "여름방학");
  assert.equal(calendarDayFor("2026-12-24").vacationLabel, "겨울방학");
  assert.equal(calendarDayFor("2026-09-02").vacationLabel, null);
  assert.ok((summerPnu?.score ?? 100) < (semesterPnu?.score ?? 0));
  assert.ok((summerDongEui?.score ?? 100) < (semesterDongEui?.score ?? 0));
  assert.ok((summerHaeundae?.score ?? 0) > (semesterHaeundae?.score ?? 100));
  assert.match(summerPnu?.factors[0] ?? "", /방학/);
  assert.match(summerHaeundae?.factors[0] ?? "", /방학/);
});

test("신뢰도와 8일 데모 예보를 결정론적으로 생성한다", () => {
  assert.deepEqual(
    calculateConfidence({ officialSourceQuality: 1, baselineQuality: 1, trendQuality: 1, weatherQuality: 1, freshness: 1 }),
    { score: 100, level: "high" },
  );
  const forecast = createDemoForecast(dateKeyForOffset(7));
  assert.equal(forecast.regions.length, 42);
  assert.ok(forecast.regions.some((region) => region.id === "jeonpo"));
  assert.ok(forecast.regions.some((region) => region.id === "gamcheon"));
  assert.ok(forecast.regions.some((region) => region.id === "osiria"));
  assert.ok(forecast.regions.some((region) => region.id === "hadan"));
  assert.ok(forecast.regions.some((region) => region.id === "citizens-park"));
  assert.ok(forecast.regions.some((region) => region.id === "kmou"));
  assert.ok(forecast.regions.some((region) => region.id === "gimhae-airport"));
  assert.ok(forecast.regions.some((region) => region.id === "munhyeon"));
  assert.ok(forecast.regions.some((region) => region.id === "ilgwang"));
  assert.equal(forecast.algorithmVersion, "forecast-v1.3.0");
  assert.equal(forecast.regions[0].hourly.length, 15);
});
