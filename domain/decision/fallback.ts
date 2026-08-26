import { clampScore } from "../forecast/score.ts";
import type { PublicForecastResponse, RegionForecast } from "../forecast/types.ts";
import type {
  AlternativeDecisionResponse,
  AlternativePriority,
  ScenarioDecisionResponse,
  ScenarioRequest,
} from "./types.ts";

type DestinationTier = "landmark" | "leisure" | "local" | "campus" | "functional";
type PlaceSetting = "indoor" | "outdoor" | "mixed";

type RegionProfile = {
  tags: string[];
  setting: PlaceSetting;
  appeal: number;
  tier: DestinationTier;
  character: string;
};

// 부산시·부산관광공사의 관광 분류와 각 권역의 실제 방문 목적을 기준으로 정리한 추천용 프로필입니다.
const REGION_PROFILES: Record<string, RegionProfile> = {
  seomyeon: { tags: ["상권", "맛집", "야간", "카페", "문화"], setting: "mixed", appeal: 100, tier: "landmark", character: "대형 상권과 맛집·야간 활동이 중심입니다." },
  haeundae: { tags: ["해변", "해안", "관광", "맛집", "카페", "가족"], setting: "mixed", appeal: 100, tier: "landmark", character: "해변과 관광·숙박 콘텐츠가 밀집한 대표 여행지입니다." },
  gwangalli: { tags: ["해변", "해안", "야간", "맛집", "카페", "관광"], setting: "mixed", appeal: 100, tier: "landmark", character: "해변을 따라 맛집·카페와 야간 활동이 이어집니다." },
  centum: { tags: ["상권", "쇼핑", "실내", "문화", "전시", "가족"], setting: "indoor", appeal: 95, tier: "landmark", character: "대형 쇼핑시설과 전시·문화시설이 모인 실내형 권역입니다." },
  sajik: { tags: ["스포츠", "맛집", "가족", "야간"], setting: "outdoor", appeal: 84, tier: "leisure", character: "야구 경기와 경기 전후 식음 활동이 중심입니다." },
  "busan-station": { tags: ["교통", "역사", "맛집"], setting: "mixed", appeal: 58, tier: "functional", character: "철도와 시내 이동이 집중되는 관문형 교통 거점입니다." },
  nampo: { tags: ["상권", "맛집", "야간", "시장", "역사", "관광"], setting: "mixed", appeal: 100, tier: "landmark", character: "시장·쇼핑·먹거리와 원도심 관광이 함께 가능합니다." },
  gijang: { tags: ["해안", "자연", "맛집", "가족", "관광"], setting: "outdoor", appeal: 91, tier: "landmark", character: "해안 경관과 식도락·가족 나들이 수요가 강합니다." },
  jeonpo: { tags: ["상권", "맛집", "야간", "카페", "문화", "골목"], setting: "mixed", appeal: 96, tier: "landmark", character: "카페·소품점과 골목문화가 밀집한 도심 데이트 권역입니다." },
  songjeong: { tags: ["해변", "해안", "카페", "맛집", "자연"], setting: "outdoor", appeal: 92, tier: "landmark", character: "해변과 카페·해안 산책을 함께 즐기는 권역입니다." },
  yeongdo: { tags: ["해안", "자연", "관광", "카페", "역사"], setting: "mixed", appeal: 90, tier: "landmark", character: "해안 경관과 근현대 문화·카페가 공존합니다." },
  pnu: { tags: ["대학가", "상권", "맛집", "야간", "카페"], setting: "mixed", appeal: 88, tier: "campus", character: "음식점·카페·소품점과 놀거리가 밀집한 대학가입니다." },
  kyungsung: { tags: ["대학가", "상권", "맛집", "야간", "카페"], setting: "mixed", appeal: 90, tier: "campus", character: "맛집과 야간 상권이 발달한 대표 대학가입니다." },
  dongnae: { tags: ["역사", "상권", "맛집", "온천"], setting: "mixed", appeal: 82, tier: "leisure", character: "역사 명소와 지역 상권·먹거리가 결합된 권역입니다." },
  dadaepo: { tags: ["해변", "자연", "가족", "산책", "일몰"], setting: "outdoor", appeal: 91, tier: "landmark", character: "넓은 해변과 일몰·가족 산책에 적합합니다." },
  gamcheon: { tags: ["문화", "관광", "마을", "산책", "사진"], setting: "outdoor", appeal: 96, tier: "landmark", character: "골목·전망·사진 중심의 대표 문화관광지입니다." },
  songdo: { tags: ["해변", "가족", "관광", "해안", "체험"], setting: "outdoor", appeal: 94, tier: "landmark", character: "해변과 케이블카·해안 체험이 결합된 가족 관광지입니다." },
  osiria: { tags: ["테마파크", "쇼핑", "가족", "해안", "관광"], setting: "mixed", appeal: 97, tier: "landmark", character: "테마파크·쇼핑·해안 관광을 한 번에 즐길 수 있습니다." },
  taejongdae: { tags: ["자연", "해안", "관광", "산책", "가족"], setting: "outdoor", appeal: 95, tier: "landmark", character: "절벽 해안 경관과 산책이 중심인 대표 자연 관광지입니다." },
  huinnyeoul: { tags: ["문화", "해안", "카페", "산책", "사진"], setting: "outdoor", appeal: 95, tier: "landmark", character: "해안 골목과 카페·사진 명소가 이어지는 문화마을입니다." },
  igidae: { tags: ["자연", "해안", "산책", "사진"], setting: "outdoor", appeal: 86, tier: "leisure", character: "해안 절경을 따라 걷는 트레킹형 장소입니다." },
  deokcheon: { tags: ["상권", "맛집", "야간"], setting: "mixed", appeal: 76, tier: "local", character: "북부산 생활권의 음식점과 지역 상권이 중심입니다." },
  yeonsan: { tags: ["맛집", "야간", "상권", "교통"], setting: "mixed", appeal: 70, tier: "local", character: "환승과 직장인 식음 수요가 강한 생활 상권입니다." },
  hadan: { tags: ["대학가", "맛집", "상권"], setting: "mixed", appeal: 74, tier: "local", character: "대학가와 서부산 생활 상권 성격이 강합니다." },
  sasang: { tags: ["교통", "상권", "맛집"], setting: "mixed", appeal: 62, tier: "functional", character: "광역버스·도시철도 환승과 생활 상권이 결합된 교통 거점입니다." },
  "citizens-park": { tags: ["자연", "산책", "가족", "문화"], setting: "outdoor", appeal: 88, tier: "leisure", character: "도심 속 공원 산책과 가족 휴식에 적합합니다." },
  oncheonjang: { tags: ["온천", "역사", "맛집", "상권", "가족"], setting: "mixed", appeal: 82, tier: "leisure", character: "온천과 전통 상권·가족 나들이 성격이 결합됩니다." },
  cheongsapo: { tags: ["해안", "카페", "맛집", "산책", "관광"], setting: "outdoor", appeal: 92, tier: "landmark", character: "해변열차와 전망대·카페를 잇는 해안 관광지입니다." },
  eulsukdo: { tags: ["자연", "가족", "산책", "문화"], setting: "outdoor", appeal: 87, tier: "leisure", character: "생태공원과 문화시설을 함께 즐기는 가족 나들이 장소입니다." },
  "dong-eui": { tags: ["대학가", "맛집"], setting: "mixed", appeal: 54, tier: "campus", character: "재학생 중심의 캠퍼스 생활권입니다." },
  dongseo: { tags: ["대학가", "맛집"], setting: "mixed", appeal: 53, tier: "campus", character: "재학생 중심의 캠퍼스 생활권입니다." },
  silla: { tags: ["대학가", "산책"], setting: "mixed", appeal: 50, tier: "campus", character: "캠퍼스와 주변 생활권 방문이 중심입니다." },
  bufs: { tags: ["대학가", "산책"], setting: "mixed", appeal: 50, tier: "campus", character: "캠퍼스와 주변 생활권 방문이 중심입니다." },
  kmou: { tags: ["대학가", "해안", "산책"], setting: "outdoor", appeal: 60, tier: "campus", character: "해안 캠퍼스 경관이 특징인 대학 생활권입니다." },
  "gimhae-airport": { tags: ["교통", "항공"], setting: "indoor", appeal: 25, tier: "functional", character: "항공편 이용을 위한 여객 교통시설입니다." },
  nopo: { tags: ["교통", "광역버스"], setting: "indoor", appeal: 22, tier: "functional", character: "고속·시외버스 이용을 위한 광역 교통시설입니다." },
  myeongji: { tags: ["가족", "맛집", "카페", "상권"], setting: "mixed", appeal: 71, tier: "local", character: "신도시 가족 식음·생활 상권 성격이 강합니다." },
  hwamyeong: { tags: ["자연", "산책", "가족", "맛집"], setting: "mixed", appeal: 72, tier: "local", character: "생태공원과 북부산 생활 상권을 함께 이용하는 곳입니다." },
  munhyeon: { tags: ["업무", "교통", "문화"], setting: "indoor", appeal: 48, tier: "functional", character: "금융·업무 방문 수요가 중심인 권역입니다." },
  jangsan: { tags: ["상권", "맛집", "가족"], setting: "mixed", appeal: 76, tier: "local", character: "해운대 주거권의 생활형 쇼핑·외식 상권입니다." },
  ilgwang: { tags: ["해변", "해안", "카페", "가족", "자연"], setting: "outdoor", appeal: 88, tier: "leisure", character: "비교적 한적한 해변과 카페·가족 나들이에 적합합니다." },
  jeonggwan: { tags: ["가족", "맛집", "상권"], setting: "mixed", appeal: 60, tier: "local", character: "동부산 신도시의 가족 생활 상권입니다." },
};

const PRIORITY_LABELS: Record<AlternativePriority, string> = {
  similar: "비슷한 분위기",
  calmest: "낮은 혼잡도",
  indoor: "실내 활동",
};

type KoreanParticle = "이/가" | "은/는" | "을/를" | "과/와" | "으로/로";

export function withJosa(word: string, particle: KoreanParticle) {
  const lastCharacter = Array.from(word.trim()).reverse().find((character) => /[가-힣A-Za-z0-9]/.test(character));
  if (!lastCharacter) return word;

  const code = lastCharacter.charCodeAt(0);
  const finalConsonantIndex = code >= 0xac00 && code <= 0xd7a3 ? (code - 0xac00) % 28 : 0;
  const hasFinalConsonant = finalConsonantIndex > 0;
  const selectedParticle = {
    "이/가": hasFinalConsonant ? "이" : "가",
    "은/는": hasFinalConsonant ? "은" : "는",
    "을/를": hasFinalConsonant ? "을" : "를",
    "과/와": hasFinalConsonant ? "과" : "와",
    "으로/로": hasFinalConsonant && finalConsonantIndex !== 8 ? "으로" : "로",
  }[particle];

  return `${word}${selectedParticle}`;
}

function profileFor(region: RegionForecast): RegionProfile {
  return REGION_PROFILES[region.id] ?? {
    tags: ["관광"],
    setting: "mixed",
    appeal: 60,
    tier: "local",
    character: "지역 생활권 성격을 가진 장소입니다.",
  };
}

function commonTags(selected: RegionForecast, candidate: RegionForecast) {
  const candidateTags = new Set(profileFor(candidate).tags);
  return profileFor(selected).tags.filter((tag) => candidateTags.has(tag));
}

function similarityScore(selected: RegionForecast, candidate: RegionForecast) {
  const selectedTags = profileFor(selected).tags;
  const candidateTags = profileFor(candidate).tags;
  const overlap = commonTags(selected, candidate).length;
  return overlap / Math.sqrt(selectedTags.length * candidateTags.length) * 100;
}

function travelScore(selected: RegionForecast, candidate: RegionForecast) {
  const mapDistance = Math.hypot(selected.x - candidate.x, selected.y - candidate.y);
  return Math.max(0, 100 - mapDistance * 1.15);
}

function tierCompatibility(selected: RegionForecast, candidate: RegionForecast) {
  const selectedTier = profileFor(selected).tier;
  const candidateTier = profileFor(candidate).tier;
  if (selectedTier === candidateTier) return 100;
  const compatibility: Record<DestinationTier, Partial<Record<DestinationTier, number>>> = {
    landmark: { leisure: 25, campus: 20, local: 10 },
    leisure: { landmark: 90, campus: 55, local: 45 },
    local: { landmark: 70, leisure: 80, campus: 65 },
    campus: { landmark: 55, leisure: 70, local: 65 },
    functional: { landmark: 80, leisure: 75, local: 55, campus: 40 },
  };
  return compatibility[selectedTier][candidateTier] ?? 0;
}

function candidateAllowed(selected: RegionForecast, candidate: RegionForecast, priority: AlternativePriority) {
  const selectedProfile = profileFor(selected);
  const candidateProfile = profileFor(candidate);
  if (candidateProfile.tier === "functional") return false;
  if (priority === "indoor" && candidateProfile.setting === "outdoor") return false;
  const establishedDestination = selectedProfile.tier === "landmark" || selectedProfile.tier === "leisure";
  const minimumAppeal = establishedDestination
    ? priority === "similar" ? 82 : 78
    : 50;
  return candidateProfile.appeal >= minimumAppeal;
}

function fitScore(selected: RegionForecast, candidate: RegionForecast, priority: AlternativePriority) {
  const profile = profileFor(candidate);
  const similarity = similarityScore(selected, candidate);
  const travel = travelScore(selected, candidate);
  const tier = tierCompatibility(selected, candidate);
  const calmScore = 100 - candidate.score;
  const indoorScore = profile.setting === "indoor" ? 100 : profile.setting === "mixed" ? 65 : 0;
  if (priority === "calmest") return calmScore * 0.78 + profile.appeal * 0.08 + similarity * 0.05 + travel * 0.05 + tier * 0.04;
  if (priority === "indoor") return indoorScore * 0.38 + similarity * 0.25 + profile.appeal * 0.17 + travel * 0.1 + calmScore * 0.1;
  return similarity * 0.5 + tier * 0.18 + profile.appeal * 0.15 + travel * 0.1 + calmScore * 0.07;
}

function visitPurposeText(tags: string[]) {
  return tags.length > 0 ? tags.slice(0, 3).join("·") : "방문 목적";
}

function recommendationReason(selected: RegionForecast, candidate: RegionForecast, priority: AlternativePriority) {
  const profile = profileFor(candidate);
  const overlap = commonTags(selected, candidate);
  const difference = selected.score - candidate.score;
  const crowdText = difference > 0
    ? `혼잡도도 ${difference}점 낮습니다.`
    : difference < 0
      ? `혼잡도는 ${Math.abs(difference)}점 높지만 목적 적합도를 우선했습니다.`
      : "혼잡도는 비슷하지만 목적 적합도가 높습니다.";
  if (priority === "calmest") {
    return `${difference > 0 ? `혼잡도가 ${difference}점 낮고` : "혼잡도 차이는 크지 않지만"} ${profile.character}`;
  }
  if (priority === "indoor") {
    const settingText = profile.setting === "indoor" ? "실내 활동 비중이 높고" : "실내외 선택지가 함께 있고";
    return `${settingText} ${visitPurposeText(overlap)} 목적이 이어집니다. ${crowdText}`;
  }
  return `${visitPurposeText(overlap)} 목적이 잘 맞고 ${profile.character} ${crowdText}`;
}

function recommendationTradeoff(selected: RegionForecast, candidate: RegionForecast, priority: AlternativePriority) {
  const selectedProfile = profileFor(selected);
  const candidateProfile = profileFor(candidate);
  if (priority === "calmest" && similarityScore(selected, candidate) < 35) {
    return "여유도를 우선한 만큼 원래 방문 목적과 분위기는 달라질 수 있습니다.";
  }
  if (selectedProfile.setting !== candidateProfile.setting && candidateProfile.setting === "outdoor") {
    return "야외 활동 비중이 높아 날씨와 이동 동선을 확인하세요.";
  }
  if (candidateProfile.tier === "local") {
    return "대표 관광지보다 지역 생활권 성격이 강합니다.";
  }
  return `${withJosa(candidate.factors[0], "은/는")} 방문 전에 확인하세요.`;
}

export function createAlternativeDecision(
  forecast: PublicForecastResponse,
  selectedRegionId: string,
  priority: AlternativePriority,
): AlternativeDecisionResponse {
  const selected = forecast.regions.find((region) => region.id === selectedRegionId);
  if (!selected) throw new Error("선택한 지역의 예보를 찾을 수 없습니다.");

  const ranked = forecast.regions
    .filter((region) => region.id !== selected.id && candidateAllowed(selected, region, priority))
    .map((region) => ({ region, fit: fitScore(selected, region, priority) }))
    .sort((first, second) => second.fit - first.fit || first.region.score - second.region.score)
    .slice(0, 3);

  const recommendations = ranked.map(({ region, fit }) => {
    return {
      regionId: region.id,
      regionName: region.name,
      area: region.area,
      score: region.score,
      fitScore: Math.max(0, Math.min(100, Math.round(fit))),
      bestTime: region.calm,
      why: recommendationReason(selected, region, priority),
      tradeoff: recommendationTradeoff(selected, region, priority),
    };
  });

  return {
    action: "alternatives",
    source: "forecast_engine",
    date: forecast.date,
    selectedRegionId,
    summary: `${selected.name}의 방문 목적을 기준으로 ${PRIORITY_LABELS[priority]}·장소 매력도·이동 부담·혼잡도를 함께 비교했습니다.`,
    recommendations,
    generatedAt: new Date().toISOString(),
  };
}

function weatherDelta(region: RegionForecast, weather: ScenarioRequest["weather"]) {
  if (weather === "forecast") return { value: 0, text: "현재 기상 예보를 그대로 적용했습니다." };
  const setting = profileFor(region).setting;
  const outdoor = setting === "outdoor";
  const indoor = setting === "indoor";
  if (weather === "rain") {
    if (outdoor) return { value: -9, text: "비로 야외 방문 수요가 감소하는 조건을 반영했습니다." };
    if (indoor) return { value: 5, text: "비로 실내 방문 수요가 늘어나는 조건을 반영했습니다." };
    return { value: -3, text: "비로 이동 수요가 일부 줄어드는 조건을 반영했습니다." };
  }
  if (outdoor) return { value: 5, text: "맑은 날씨에 야외 방문 수요가 늘어나는 조건을 반영했습니다." };
  return { value: 1, text: "맑은 날씨의 이동 수요 증가를 소폭 반영했습니다." };
}

function eventDelta(region: RegionForecast, event: ScenarioRequest["event"]) {
  const current = region.scoreComponents?.eventImpact ?? 0;
  if (event === "forecast") return { value: 0, text: "현재 반영된 행사 조건을 유지했습니다." };
  if (event === "cancelled") return { value: -Math.round(current), text: "주요 행사가 취소되어 행사 기여도를 제외했습니다." };
  return { value: Math.max(5, Math.round(32 - current)), text: "대형 행사가 추가되는 조건으로 행사 영향을 높였습니다." };
}

function calendarDelta(region: RegionForecast, calendar: ScenarioRequest["calendar"]) {
  const current = region.scoreComponents?.calendar ?? 0;
  const targets = { weekday: 6, weekend: 11, holiday: 13 } as const;
  if (calendar === "forecast") return { value: 0, text: "현재 날짜의 달력 효과를 유지했습니다." };
  const labels = { weekday: "평일", weekend: "주말", holiday: "공휴일" } as const;
  return { value: targets[calendar] - current, text: `${labels[calendar]} 방문 패턴으로 달력 효과를 변경했습니다.` };
}

export function createScenarioDecision(forecast: PublicForecastResponse, request: ScenarioRequest): ScenarioDecisionResponse {
  const region = forecast.regions.find((item) => item.id === request.selectedRegionId);
  if (!region) throw new Error("선택한 지역의 예보를 찾을 수 없습니다.");

  const changes = [weatherDelta(region, request.weather), eventDelta(region, request.event), calendarDelta(region, request.calendar)];
  const scenarioScore = clampScore(region.score + changes.reduce((sum, change) => sum + change.value, 0));
  const delta = scenarioScore - region.score;
  const direction = delta === 0 ? "현재와 비슷하게" : delta > 0 ? `${delta}점 높게` : `${Math.abs(delta)}점 낮게`;

  return {
    action: "scenario",
    source: "forecast_engine",
    date: forecast.date,
    selectedRegionId: region.id,
    baseScore: region.score,
    scenarioScore,
    delta,
    summary: `선택한 조건에서는 ${region.name} 혼잡도가 현재 예보보다 ${direction} 예상됩니다.`,
    effects: changes.map((change) => change.text),
    recommendedTime: region.calm,
    confidenceNote: "선택한 조건만 바꾼 비교 결과이며, 실제 행사 규모와 기상 변화에 따라 달라질 수 있습니다.",
    generatedAt: new Date().toISOString(),
  };
}
