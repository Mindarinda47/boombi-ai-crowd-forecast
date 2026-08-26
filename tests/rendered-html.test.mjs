import assert from "node:assert/strict";
import test from "node:test";

async function render(path = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${path}`, { headers: { accept: path.startsWith("/api/") ? "application/json" : "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

async function renderPost(path, body) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-post`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request(`http://localhost${path}`, {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

function todayKstDateKey() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

test("server-renders the crowd forecast experience", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>붐비 \| 부산 AI 혼잡 예보<\/title>/);
  assert.match(html, /붐비기 전에/);
  assert.match(html, /내일 서면 먼저 보기/);
  assert.match(html, /TOP 3 CROWD ALERT/);
  assert.equal((html.match(/class="alert-card"/g) ?? []).length, 3);
  assert.match(html, /지역별 혼잡 예보/);
  assert.match(html, /시간대별 혼잡/);
  assert.match(html, /지역 비교/);
  assert.match(html, /날짜끼리/);
  assert.match(html, /혼잡 회피 도구/);
  assert.match(html, /대체 장소 찾기/);
  assert.match(html, /조건 시나리오/);
  assert.match(html, /수집 결과/);
  assert.match(html, /평소 60% · 검색 25% · 달력 15% \+ 행사 가산/);
  assert.match(html, /실시간 인원수나 확정 수치가 아닙니다/);
  assert.match(html, /가중 기여도/);
  assert.match(html, /재현 가능한 계산/);
  assert.match(html, /마지막|갱신/);
  assert.match(html, /영향 행사 없음/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|Your site is taking shape/i);
});

test("데이터·라이선스 페이지가 출처와 이용 안내를 제공한다", async () => {
  const response = await render("/licenses");
  assert.equal(response.status, 200);
  const html = await response.text();

  assert.match(html, /데이터·라이선스/);
  assert.match(html, /부산광역시 부산축제정보/);
  assert.match(html, /한국관광공사 TourAPI/);
  assert.match(html, /기상청 단기예보/);
  assert.match(html, /네이버 데이터랩/);
  assert.match(html, /Kakao Maps/);
  assert.match(html, /주요 오픈소스 소프트웨어/);
  assert.match(html, /© 2026 Boombi\. All rights reserved\./);
  assert.match(html, /Created by 이종민/);
});

test("혼잡 회피 API가 결제 없이도 대체 장소와 시나리오 결과를 제공한다", async () => {
  const date = todayKstDateKey();
  const alternativesResponse = await renderPost("/api/public/ai-decisions", {
    action: "alternatives", date, selectedRegionId: "haeundae", priority: "similar",
  });
  assert.equal(alternativesResponse.status, 200);
  const alternatives = await alternativesResponse.json();
  assert.equal(alternatives.source, "forecast_engine");
  assert.equal(alternatives.recommendations.length, 3);
  assert.ok(alternatives.recommendations.every((item) => item.regionId !== "haeundae"));

  const scenarioResponse = await renderPost("/api/public/ai-decisions", {
    action: "scenario", date, selectedRegionId: "haeundae", weather: "rain", event: "cancelled", calendar: "weekday",
  });
  assert.equal(scenarioResponse.status, 200);
  const scenario = await scenarioResponse.json();
  assert.equal(scenario.source, "forecast_engine");
  assert.ok(scenario.scenarioScore < scenario.baseScore);
  assert.equal(scenario.effects.length, 3);
});

test("공개 예보 API가 화면과 같은 42개 권역 데이터를 제공한다", async () => {
  const today = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const parts = Object.fromEntries(today.map((part) => [part.type, part.value]));
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  const response = await render(`/api/public/forecast?date=${date}`);
  assert.equal(response.status, 200);
  const forecast = await response.json();

  assert.equal(forecast.mode, "demo");
  assert.equal(forecast.algorithmVersion, "forecast-v1.3.0");
  assert.equal(forecast.regions.length, 42);
  assert.equal(forecast.regions[0].id, "seomyeon");
  assert.equal(forecast.regions[0].hourly.length, 15);
  assert.deepEqual(forecast.regions[0].hours, ["08", "09", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "20", "21", "22"]);
  assert.equal(forecast.regions[0].scoreComponents.eventImpact, 0);
});

test("includes accessible interactive forecast controls", async () => {
  const response = await render();
  const html = await response.text();

  assert.match(html, /aria-label="예보 날짜 선택"/);
  assert.match(html, /aria-label="부산 주요 지역 혼잡 지도"/);
  assert.match(html, /aria-label="혼잡 단계 범례"/);
  assert.match(html, /aria-label="지도 권역 분류"/);
  assert.match(html, /aria-pressed="true"/);
  assert.match(html, /실시간 정보가 아니며 돌발 상황은 반영되지 않을 수 있어요/);
  assert.match(html, /시간대별 혼잡 점수/);
  assert.match(html, /영향 행사 없음/);
});

test("행사 후보 관리 화면은 구조화 분석 결과를 표시한다", async () => {
  const response = await render("/admin/events");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /행사 후보를 모으고/);
  assert.match(html, /AI 구조화 분석/);
  assert.match(html, /부산축제정보/);
  assert.match(html, /한국관광공사 TourAPI/);
  assert.match(html, /Visit Busan 축제·행사/);
  assert.match(html, /NAVER API HUB 행사 검색/);
});

test("자동 갱신 이력 화면은 운영 상태와 처리 범위를 표시한다", async () => {
  const response = await render("/admin/jobs");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /하루 두 번의 갱신을/);
  assert.match(html, /최근 실행 기록/);
  assert.match(html, /06:00·15:00 KST/);
});

test("예보 검증 화면은 관찰 전 정확도를 만들지 않는다", async () => {
  const response = await render("/admin/validation");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /예측과 실제 관찰을/);
  assert.match(html, /현장 관찰 완료/);
  assert.match(html, /정확도가 없으면 없다고 표시합니다/);
});
