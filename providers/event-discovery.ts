import type { EventRelatedLink } from "../domain/forecast/types.ts";

export type EventCandidate = {
  id: string;
  title: string;
  venue: string;
  regionId: string | null;
  regionName: string;
  startDate: string;
  endDate: string;
  sourceName: string;
  sourceUrl: string;
  imageUrl: string | null;
  relatedLinks?: EventRelatedLink[];
  activeDates?: string[];
  sourceKind: "fixture" | "precomputed_ai" | "visit_busan" | "busan_festival" | "tour_api" | "naver_search";
  sourceText: string;
};

export type EventSourceId = "visit_busan" | "busan_festival" | "tour_api" | "naver_search";

export type EventCollection = {
  mode: "fixture" | "live";
  generatedAt: string;
  sources: Array<{
    id: EventSourceId;
    name: string;
    status: "connected" | "partial" | "needs_key" | "failed";
    candidateCount: number;
    message: string;
  }>;
  candidates: EventCandidate[];
};

export type EventDecision = {
  status: "auto_approved" | "needs_review" | "excluded";
  confidence: number;
  reasons: string[];
};

const BUSAN_DATASET_URL = "https://www.data.go.kr/data/15063500/openapi.do";
const TOUR_DATASET_URL = "https://www.data.go.kr/data/15101578/openapi.do";
const VISIT_BUSAN_ORIGIN = "https://www.visitbusan.net";
const VISIT_BUSAN_MENU = "DOM_000000204012000000";
const NAVER_API_HUB_ORIGIN = "https://naverapihub.apigw.ntruss.com";

const EVENT_SEARCH_TARGETS = [
  { query: "부산 축제 행사", regionId: null, regionName: "권역 확인 필요", venue: "장소 확인 필요", requiredTerms: [] },
  { query: "부산 공연 콘서트 버스킹", regionId: null, regionName: "권역 확인 필요", venue: "장소 확인 필요", requiredTerms: [] },
  { query: "부산 전시 아트페어", regionId: null, regionName: "권역 확인 필요", venue: "장소 확인 필요", requiredTerms: [] },
  { query: "부산 체험 프로그램", regionId: null, regionName: "권역 확인 필요", venue: "장소 확인 필요", requiredTerms: [] },
  { query: "부산 플리마켓 마켓", regionId: null, regionName: "권역 확인 필요", venue: "장소 확인 필요", requiredTerms: [] },
  { query: "부산 박람회 컨벤션", regionId: null, regionName: "권역 확인 필요", venue: "장소 확인 필요", requiredTerms: [] },
  { query: "부산 스포츠 경기 대회", regionId: null, regionName: "권역 확인 필요", venue: "장소 확인 필요", requiredTerms: [] },
  { query: "부산 드론쇼 불꽃축제", regionId: null, regionName: "권역 확인 필요", venue: "장소 확인 필요", requiredTerms: [] },
  { query: "부산 백화점 행사 팝업스토어", regionId: null, regionName: "권역 확인 필요", venue: "장소 확인 필요", requiredTerms: [] },
  { query: "부산 대학 축제", regionId: null, regionName: "권역 확인 필요", venue: "장소 확인 필요", requiredTerms: [] },
  { query: "벡스코 행사", regionId: "centum", regionName: "센텀", venue: "벡스코", requiredTerms: ["벡스코", "bexco"] },
  { query: "부산 영화의전당 행사", regionId: "centum", regionName: "센텀", venue: "영화의전당", requiredTerms: ["영화의전당"] },
] as const;

const EVENT_SIGNAL_PATTERN = /축제|행사|공연|콘서트|버스킹|전시|아트페어|체험|페스티벌|마켓|박람회|컨벤션|경기|대회|드론쇼|불꽃|팝업|페어|워크|페스타/i;
const NAVER_CHANNELS = [
  { id: "webkr", label: "웹문서", sortable: false },
  { id: "blog", label: "블로그", sortable: true },
  { id: "news", label: "뉴스", sortable: true },
] as const;

let collectionCache: { expiresAt: number; value: EventCollection } | undefined;

function dateKey(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function compactDate(date: Date) {
  return dateKey(date).replaceAll("-", "");
}

function dateForOffset(offset: number) {
  const seoul = new Date(Date.now() + 9 * 60 * 60 * 1000);
  seoul.setUTCDate(seoul.getUTCDate() + offset);
  return dateKey(seoul);
}

function text(value: unknown) {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

function safeUrl(value: unknown, fallback: string) {
  const candidate = text(value);
  return /^https?:\/\//i.test(candidate) ? candidate : fallback;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function array(value: unknown) {
  return Array.isArray(value) ? value : value ? [value] : [];
}

function nested(value: unknown, keys: string[]) {
  return keys.reduce<unknown>((current, key) => record(current)?.[key], value);
}

function normalizeDate(value: unknown) {
  const digits = text(value).replace(/\D/g, "").slice(0, 8);
  return digits.length === 8 ? `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}` : "";
}

function datesFromText(value: unknown) {
  const source = text(value);
  const dates = [...source.matchAll(/(20\d{2})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})/g)]
    .map((match) => `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`);
  const shortEnd = source.match(/(?:~|\uFF5E|\u2013|\u2014)\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})/);
  if (dates.length === 1 && shortEnd) {
    dates.push(`${dates[0].slice(0, 4)}-${shortEnd[1].padStart(2, "0")}-${shortEnd[2].padStart(2, "0")}`);
  }
  if (dates.length === 0) {
    const currentYear = new Date(Date.now() + 9 * 60 * 60 * 1000).getUTCFullYear();
    const monthDays = [...source.matchAll(/(?<!\d)(\d{1,2})\s*[.\-/월]\s*(\d{1,2})\s*일?/g)]
      .filter((match) => Number(match[1]) >= 1 && Number(match[1]) <= 12 && Number(match[2]) >= 1 && Number(match[2]) <= 31)
      .map((match) => `${currentYear}-${match[1].padStart(2, "0")}-${match[2].padStart(2, "0")}`);
    dates.push(...monthDays.slice(0, 2));
  }
  return dates;
}

export function regionFromText(value: string) {
  const matches: Array<[string[], string, string]> = [
    [["롯데백화점 부산본점"], "seomyeon", "서면"],
    [["부산시민공원", "시민공원"], "citizens-park", "부산시민공원"],
    [["온천장"], "oncheonjang", "온천장"],
    [["청사포"], "cheongsapo", "청사포"],
    [["동의대", "동의대학교"], "dong-eui", "동의대"],
    [["동서대", "동서대학교"], "dongseo", "동서대"],
    [["신라대", "신라대학교"], "silla", "신라대"],
    [["부산외대", "부산외국어대학교"], "bufs", "부산외대"],
    [["한국해양대", "한국해양대학교"], "kmou", "한국해양대"],
    [["김해공항"], "gimhae-airport", "김해공항"],
    [["노포터미널", "부산종합버스터미널"], "nopo", "노포터미널"],
    [["명지"], "myeongji", "명지"],
    [["화명"], "hwamyeong", "화명"],
    [["문현", "BIFC"], "munhyeon", "문현·BIFC"],
    [["장산"], "jangsan", "장산"],
    [["일광"], "ilgwang", "일광"],
    [["정관"], "jeonggwan", "정관"],
    [["전포", "전포카페거리"], "jeonpo", "전포"],
    [["송정", "송정해수욕장"], "songjeong", "송정"],
    [["흰여울", "흰여울문화마을"], "huinnyeoul", "흰여울문화마을"],
    [["태종대", "태종대유원지"], "taejongdae", "태종대"],
    [["오시리아", "롯데월드 부산"], "osiria", "오시리아"],
    [["송도해수욕장", "송도 케이블카", "송도"], "songdo", "송도"],
    [["이기대", "오륙도"], "igidae", "이기대·오륙도"],
    [["덕천", "덕천동"], "deokcheon", "덕천"],
    [["연산", "연제구"], "yeonsan", "연산"],
    [["부산현대미술관", "을숙도"], "eulsukdo", "을숙도"],
    [["하단"], "hadan", "하단"],
    [["영도"], "yeongdo", "영도"],
    [["부산대", "금정구"], "pnu", "부산대"],
    [["경성대", "부경대", "대연동"], "kyungsung", "경성대·부경대"],
    [["다대포", "다대포해수욕장"], "dadaepo", "다대포"],
    [["감천문화마을", "감천동"], "gamcheon", "감천문화마을"],
    [["서면", "부산진구"], "seomyeon", "서면"],
    [["센텀", "벡스코", "APEC 나루공원"], "centum", "센텀"],
    [["해운대", "해운대구"], "haeundae", "해운대"],
    [["광안리", "광안", "수영구"], "gwangalli", "광안리"],
    [["사직", "야구장"], "sajik", "사직"],
    [["동래", "온천장", "명륜동", "동래구"], "dongnae", "동래"],
    [["부산역", "동구"], "busan-station", "부산역"],
    [["남포", "중구", "광복로", "자갈치"], "nampo", "남포"],
    [["기장"], "gijang", "기장"],
  ];
  const match = matches.find(([keywords]) => keywords.some((keyword) => value.includes(keyword)));
  return match ? { id: match[1], name: match[2] } : { id: null, name: "권역 확인 필요" };
}

function venueFromText(value: string, fallback: string) {
  const venues = [
    "광안리 해수욕장", "다대포 해변공원", "다대포해수욕장", "해운대해수욕장",
    "부산현대미술관", "영화의전당", "사직야구장", "벡스코", "APEC 나루공원",
    "부산시민공원", "용두산공원", "광복로", "피아크 부산",
  ];
  const exactVenue = venues.find((venue) => value.toLowerCase().includes(venue.toLowerCase()));
  if (exactVenue) return exactVenue;
  const region = regionFromText(value);
  return region.id ? `${region.name} 일원` : fallback;
}

function stripHtml(value: unknown) {
  return text(value)
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&quot;/g, "\"")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/\s+/g, " ")
    .trim();
}

function visitBusanUrl(value: string) {
  const decoded = value.replaceAll("&amp;", "&");
  try {
    return new URL(decoded, VISIT_BUSAN_ORIGIN).toString();
  } catch {
    return "";
  }
}

function fieldFromVisitBusanDetail(html: string, label: string) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = html.match(new RegExp(
    `<div[^>]*class=["'][^"']*name[^"']*["'][^>]*>\\s*${escaped}\\s*</div>\\s*<div[^>]*class=["'][^"']*detail[^"']*["'][^>]*>([\\s\\S]*?)</div>`,
    "i",
  ));
  return stripHtml(match?.[1]);
}

function explicitScheduleDates(value: string, referenceYear: number) {
  const dates = [...value.matchAll(/[○●•]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})/g)]
    .map((match) => `${referenceYear}-${match[1].padStart(2, "0")}-${match[2].padStart(2, "0")}`);
  return [...new Set(dates)].filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date));
}

function saturdayDatesBetween(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];
  const dates: string[] = [];
  for (const date = new Date(start); date <= end; date.setUTCDate(date.getUTCDate() + 1)) {
    if (date.getUTCDay() === 6) dates.push(dateKey(date));
  }
  return dates;
}

export function parseVisitBusanListResponse(html: string): EventCandidate[] {
  const candidates: EventCandidate[] = [];
  const pattern = /<a\b[^>]*href="([^"]*\/schedule\/view\.do\?[^"]*dataSid=(\d+)[^"]*)"[^>]*title="([^"]*?)\s*바로가기"[^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(pattern)) {
    const sourceUrl = visitBusanUrl(match[1]);
    const title = stripHtml(match[3]);
    const block = match[4];
    const period = block.match(/(20\d{2}-\d{2}-\d{2})\s*~\s*(20\d{2}-\d{2}-\d{2})/);
    const imagePath = block.match(/<img\b[^>]*src="([^"]+)"/i)?.[1] ?? "";
    if (!sourceUrl || !title || !period) continue;
    const region = regionFromText(title);
    const imageUrl = imagePath ? visitBusanUrl(imagePath) : null;
    candidates.push({
      id: `visit-busan-${match[2]}`,
      title,
      venue: "장소 확인 필요",
      regionId: region.id,
      regionName: region.name,
      startDate: period[1],
      endDate: period[2],
      sourceName: "Visit Busan 축제·행사",
      sourceUrl,
      imageUrl,
      sourceKind: "visit_busan",
      sourceText: `${title} · ${period[1]}~${period[2]}`,
      relatedLinks: [{
        title,
        summary: `Visit Busan에 공개된 행사 상세 정보입니다.`,
        source: "Visit Busan",
        url: sourceUrl,
        imageUrl,
      }],
    });
  }
  return candidates;
}

export function parseVisitBusanDetailResponse(html: string, candidate: EventCandidate): EventCandidate {
  const contentHtml = html.match(/<section[^>]*id="contents"[^>]*>([\s\S]*?)<\/section>/i)?.[1] ?? html;
  const detailTitle = stripHtml(html.match(/<div[^>]*class="tit_view_sub"[^>]*>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/i)?.[1]);
  const title = detailTitle || candidate.title;
  const venue = fieldFromVisitBusanDetail(html, "장소");
  const address = fieldFromVisitBusanDetail(html, "주소");
  const dateBlock = html.match(/<div[^>]*class="tit_view_sub3"[^>]*>([\s\S]*?)<\/div>/i)?.[1] ?? "";
  const dates = datesFromText(stripHtml(dateBlock));
  const startDate = dates[0] ?? candidate.startDate;
  const endDate = dates.at(-1) ?? candidate.endDate ?? startDate;
  const referenceYear = Number(startDate.slice(0, 4)) || new Date().getUTCFullYear();
  const parsedActiveDates = explicitScheduleDates(stripHtml(contentHtml), referenceYear)
    .filter((date) => !startDate || !endDate || (date >= startDate && date <= endDate));
  const imagePath = contentHtml.match(/<img\b[^>]*src="([^"]*\/upload_data\/[^"]+)"/i)?.[1] ?? "";
  const imageUrl = imagePath ? visitBusanUrl(imagePath) : candidate.imageUrl;
  const bodyText = detailTitle || venue || address ? stripHtml(contentHtml).slice(0, 6_000) : "";
  const titleRegion = regionFromText(title);
  const inferredVenue = titleRegion.id ? `${titleRegion.name} 일원` : "";
  const resolvedVenue = venue || address || (candidate.venue === "장소 확인 필요" ? inferredVenue : candidate.venue) || "장소 확인 필요";
  const region = regionFromText(`${title} ${resolvedVenue} ${address}`);
  const recurringDroneDates = /광안리\s*M\s*드론라이트쇼/.test(title) && /월\s*공연\s*프로그램/.test(title)
    ? saturdayDatesBetween(startDate, endDate)
    : [];
  const activeDates = parsedActiveDates.length > 0 ? parsedActiveDates : recurringDroneDates;
  return {
    ...candidate,
    title,
    venue: resolvedVenue,
    regionId: region.id ?? candidate.regionId,
    regionName: region.id ? region.name : candidate.regionName,
    startDate,
    endDate,
    activeDates: activeDates.length > 0 ? activeDates : undefined,
    imageUrl,
    sourceText: [title, resolvedVenue, address, `${startDate}~${endDate}`, bodyText].filter(Boolean).join(" · "),
    relatedLinks: [{
      title,
      summary: bodyText.slice(0, 240) || `${title} 공식 행사 상세 정보입니다.`,
      source: "Visit Busan",
      url: candidate.sourceUrl,
      imageUrl,
    }],
  };
}

export function eventCandidateFingerprint(candidate: EventCandidate) {
  const value = [
    candidate.title, candidate.venue, candidate.regionId, candidate.startDate, candidate.endDate,
    candidate.activeDates?.join(","), candidate.sourceUrl, candidate.sourceText,
  ].join("\u001f");
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

type NaverSearchPayload = {
  items?: Array<{ title?: string; link?: string; originallink?: string; description?: string; postdate?: string; pubDate?: string }>;
};

const RELATED_LINK_LIMIT = 6;
const GENERIC_EVENT_WORDS = new Set(["부산", "행사", "축제", "공연", "팝업", "스토어", "개최", "안내", "이벤트", "in"]);

function relatedLinkSource(url: string) {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "");
    if (hostname.includes("yna.co.kr")) return "연합뉴스";
    if (hostname.includes("newsis.com")) return "뉴시스";
    if (hostname.includes("blog.naver.com")) return "네이버 블로그";
    return hostname;
  } catch {
    return "행사 원문";
  }
}

function desktopExternalUrl(value: unknown) {
  const url = safeUrl(value, "");
  if (!url) return "";
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return hostname.startsWith("m.") || hostname.startsWith("mobile.") ? "" : url;
  } catch {
    return "";
  }
}

function eventTitleTokens(title: string) {
  return (stripHtml(title).toLowerCase().match(/[가-힣a-z0-9]{2,}/g) ?? [])
    .filter((token) => !GENERIC_EVENT_WORDS.has(token) && !/^\d+$/.test(token));
}

function uniqueRelatedLinks(links: EventRelatedLink[]) {
  const seen = new Set<string>();
  return links.filter((link) => {
    const key = link.url.replace(/\/$/, "");
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, RELATED_LINK_LIMIT);
}

export function parseNaverRelatedLinksResponse(payload: unknown, candidate: EventCandidate): EventRelatedLink[] {
  const tokens = eventTitleTokens(candidate.title);
  return uniqueRelatedLinks(array(record(payload)?.items).flatMap((value): EventRelatedLink[] => {
    const item = record(value);
    if (!item) return [];
    const title = stripHtml(item.title);
    const summary = stripHtml(item.description);
    const url = desktopExternalUrl(item.link);
    const searchable = `${title} ${summary}`.toLowerCase();
    const matchingTokens = tokens.filter((token) => searchable.includes(token)).length;
    if (!title || !url || (tokens.length > 0 && matchingTokens < Math.min(2, tokens.length))) return [];
    return [{
      title,
      summary: summary || `${candidate.title} 관련 행사 원문입니다.`,
      source: relatedLinkSource(url),
      url,
      imageUrl: candidate.imageUrl,
    }];
  }));
}

export function parseNaverSearchResponse(
  payload: unknown,
  target: (typeof EVENT_SEARCH_TARGETS)[number],
  channelLabel = "웹문서",
): EventCandidate[] {
  const items = record(payload)?.items;
  return array(items).flatMap((value): EventCandidate[] => {
    const item = record(value);
    if (!item) return [];
    const title = stripHtml(item.title);
    const description = stripHtml(item.description);
    const sourceUrl = desktopExternalUrl(item.originallink || item.link);
    const searchable = `${title} ${description}`;
    const sourceText = [title, description, `검색어: ${target.query}`].filter(Boolean).join(" · ");
    const requiredTerms = target.requiredTerms ?? [];
    const matchesRequiredVenue = requiredTerms.length === 0
      || requiredTerms.some((term) => searchable.toLowerCase().includes(term));
    const inferredRegion = regionFromText(searchable);
    if (!title || !sourceUrl || !EVENT_SIGNAL_PATTERN.test(searchable)
      || (!inferredRegion.id && !target.regionId) || !matchesRequiredVenue) return [];
    const dates = datesFromText(sourceText);
    const regionId = inferredRegion.id ?? target.regionId;
    const regionName = inferredRegion.id ? inferredRegion.name : target.regionName;
    const venue = venueFromText(searchable, target.venue);
    return [{
      id: `naver-${eventCandidateFingerprint({
        id: sourceUrl,
        title,
        venue,
        regionId,
        regionName,
        startDate: dates[0] ?? "",
        endDate: dates.at(-1) ?? dates[0] ?? "",
        sourceName: `NAVER API HUB ${channelLabel}`,
        sourceUrl,
        imageUrl: null,
        sourceKind: "naver_search",
        sourceText,
      })}`,
      title,
      venue,
      regionId,
      regionName,
      startDate: dates[0] ?? "",
      endDate: dates.at(-1) ?? dates[0] ?? "",
      sourceName: `NAVER API HUB · ${channelLabel}`,
      sourceUrl,
      imageUrl: null,
      sourceKind: "naver_search",
      sourceText,
    }];
  });
}

export function parseBusanFestivalResponse(payload: unknown): EventCandidate[] {
  const itemValue = nested(payload, ["getFestivalKr", "item"])
    ?? nested(payload, ["response", "body", "items", "item"]);
  return array(itemValue).flatMap((value): EventCandidate[] => {
    const item = record(value);
    if (!item) return [];
    const title = text(item.MAIN_TITLE) || text(item.TITLE);
    if (!title) return [];
    const usage = [text(item.USAGE_DAY), text(item.USAGE_DAY_WEEK_AND_TIME)].filter(Boolean).join(" · ");
    const dates = datesFromText(usage);
    const venue = text(item.MAIN_PLACE) || text(item.PLACE) || text(item.ADDR1) || "장소 확인 필요";
    const region = regionFromText(`${title} ${text(item.GUGUN_NM)} ${venue} ${text(item.ADDR1)}`);
    return [{
      id: `busan-${text(item.UC_SEQ) || title}`,
      title,
      venue,
      regionId: region.id,
      regionName: region.name,
      startDate: dates[0] ?? "",
      endDate: dates.at(-1) ?? dates[0] ?? "",
      sourceName: "부산광역시 부산축제정보",
      sourceUrl: safeUrl(item.HOMEPAGE_URL, BUSAN_DATASET_URL),
      imageUrl: safeUrl(item.MAIN_IMG_NORMAL || item.MAIN_IMG_THUMB, "") || null,
      sourceKind: "busan_festival",
      sourceText: [text(item.TITLE), text(item.SUBTITLE), venue, usage, text(item.USAGE_DAY_WEEK_AND_TIME)].filter(Boolean).join(" · "),
    }];
  });
}

export function parseTourApiResponse(payload: unknown): EventCandidate[] {
  const itemValue = nested(payload, ["response", "body", "items", "item"]);
  return array(itemValue).flatMap((value): EventCandidate[] => {
    const item = record(value);
    if (!item) return [];
    const title = text(item.title);
    if (!title) return [];
    const venue = text(item.addr1) || "장소 확인 필요";
    const region = regionFromText(`${title} ${venue}`);
    return [{
      id: `tour-${text(item.contentid) || title}`,
      title,
      venue,
      regionId: region.id,
      regionName: region.name,
      startDate: normalizeDate(item.eventstartdate),
      endDate: normalizeDate(item.eventenddate),
      sourceName: "한국관광공사 TourAPI",
      sourceUrl: TOUR_DATASET_URL,
      imageUrl: safeUrl(item.firstimage || item.firstimage2, "") || null,
      sourceKind: "tour_api",
      sourceText: [title, venue, text(item.tel)].filter(Boolean).join(" · "),
    }];
  });
}

async function readBusanFestival(serviceKey: string) {
  const params = new URLSearchParams({ ServiceKey: serviceKey, pageNo: "1", numOfRows: "100", resultType: "json" });
  const response = await fetch(`https://apis.data.go.kr/6260000/FestivalService/getFestivalKr?${params}`, {
    cache: "no-store", signal: AbortSignal.timeout(4500),
  });
  if (!response.ok) throw new Error(`부산축제정보 조회 실패 (${response.status})`);
  return parseBusanFestivalResponse(await response.json());
}

function visitBusanMonth(offset: number) {
  const date = new Date(Date.now() + 9 * 60 * 60 * 1000);
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + offset);
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
}

async function readVisitBusanListPage(year: number, month: number, startPage: number) {
  const params = new URLSearchParams({
    boardId: "BBS_0000009",
    menuCd: VISIT_BUSAN_MENU,
    year: String(year),
    month: String(month),
    startPage: String(startPage),
  });
  const response = await fetch(`${VISIT_BUSAN_ORIGIN}/schedule/list.do?${params}`, {
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "ko-KR,ko;q=0.9",
      "User-Agent": "Mozilla/5.0 (compatible; BoombiEventCollector/1.0)",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(6_000),
  });
  if (!response.ok) throw new Error(`Visit Busan 목록 조회 실패 (${response.status})`);
  return response.text();
}

async function readVisitBusanMonth(year: number, month: number) {
  const firstPage = await readVisitBusanListPage(year, month, 1);
  const pageNumbers = [...firstPage.matchAll(/fn_go_page\((\d+)\)/g)].map((match) => Number(match[1]));
  const lastPage = Math.min(3, Math.max(1, ...pageNumbers));
  const remaining = await Promise.all(
    Array.from({ length: lastPage - 1 }, (_, index) => readVisitBusanListPage(year, month, index + 2)),
  );
  return [firstPage, ...remaining].flatMap(parseVisitBusanListResponse);
}

async function readVisitBusanDetail(candidate: EventCandidate) {
  const response = await fetch(candidate.sourceUrl, {
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "ko-KR,ko;q=0.9",
      Referer: `${VISIT_BUSAN_ORIGIN}/schedule/list.do?boardId=BBS_0000009&menuCd=${VISIT_BUSAN_MENU}`,
      "User-Agent": "Mozilla/5.0 (compatible; BoombiEventCollector/1.0)",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(6_000),
  });
  if (!response.ok) throw new Error(`Visit Busan 상세 조회 실패 (${response.status})`);
  return parseVisitBusanDetailResponse(await response.text(), candidate);
}

async function readVisitBusan() {
  const months = [visitBusanMonth(0), visitBusanMonth(1)];
  const monthResults = await Promise.allSettled(months.map(({ year, month }) => readVisitBusanMonth(year, month)));
  if (monthResults.every((result) => result.status === "rejected")) {
    throw new Error("Visit Busan 행사 목록 조회 실패");
  }
  const today = dateForOffset(0);
  const horizon = dateForOffset(90);
  const candidates = deduplicate(monthResults.flatMap((result) => result.status === "fulfilled" ? result.value : []))
    .filter((candidate) => candidate.endDate >= today && candidate.startDate <= horizon)
    .sort((left, right) => left.startDate.localeCompare(right.startDate))
    .slice(0, 16);
  const resolved: EventCandidate[] = [];
  let detailFailures = 0;
  for (let index = 0; index < candidates.length; index += 4) {
    const batch = candidates.slice(index, index + 4);
    const details = await Promise.allSettled(batch.map(readVisitBusanDetail));
    details.forEach((result, batchIndex) => {
      if (result.status === "fulfilled") resolved.push(result.value);
      else {
        detailFailures += 1;
        resolved.push(batch[batchIndex]);
      }
    });
  }
  return { candidates: resolved, detailFailures };
}

async function readTourApi(serviceKey: string) {
  const today = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const end = new Date(today);
  end.setUTCDate(end.getUTCDate() + 90);
  const params = new URLSearchParams({
    serviceKey, numOfRows: "100", pageNo: "1", MobileOS: "ETC", MobileApp: "BOOMBI", _type: "json",
    arrange: "A", eventStartDate: compactDate(today), eventEndDate: compactDate(end), areaCode: "6",
  });
  const response = await fetch(`https://apis.data.go.kr/B551011/KorService2/searchFestival2?${params}`, {
    cache: "no-store", signal: AbortSignal.timeout(4500),
  });
  if (!response.ok) throw new Error(`TourAPI 조회 실패 (${response.status})`);
  return parseTourApiResponse(await response.json());
}

async function readNaverChannel(
  query: string,
  channel: (typeof NAVER_CHANNELS)[number],
  clientId: string,
  clientSecret: string,
  display = 10,
) {
  const params = new URLSearchParams({ query, display: String(display), start: "1", format: "json" });
  if (channel.sortable) params.set("sort", "date");
  const request = () => fetch(`${NAVER_API_HUB_ORIGIN}/search/v1/${channel.id}?${params}`, {
      headers: {
        "X-NCP-APIGW-API-KEY-ID": clientId,
        "X-NCP-APIGW-API-KEY": clientSecret,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(6_000),
    });
  let response = await request();
  if (response.status === 429) {
    const payload = await response.clone().json().catch(() => null);
    const apiMessage = text(nested(payload, ["error", "message"]));
    if (/일별 사용량/.test(apiMessage)) {
      throw new Error(`NAVER API HUB ${channel.label} 조회 실패 (429 · ${apiMessage})`);
    }
    const retrySeconds = Number(response.headers.get("retry-after")) || 1;
    await new Promise((resolve) => setTimeout(resolve, Math.min(2_000, retrySeconds * 1_000)));
    response = await request();
  }
  if (!response.ok) {
    const payload = await response.clone().json().catch(() => null);
    const apiMessage = text(nested(payload, ["error", "message"]));
    throw new Error(`NAVER API HUB ${channel.label} 조회 실패 (${response.status}${apiMessage ? ` · ${apiMessage}` : ""})`);
  }
  return response.json() as Promise<NaverSearchPayload>;
}

function discoveryChannel(target: (typeof EVENT_SEARCH_TARGETS)[number]) {
  if (/공연|콘서트|스포츠|경기|대학 축제|축제 행사/.test(target.query)) return NAVER_CHANNELS[2];
  if (/전시|체험|마켓|팝업/.test(target.query)) return NAVER_CHANNELS[1];
  return NAVER_CHANNELS[0];
}

async function readNaverEventSearch(clientId: string, clientSecret: string) {
  const queue = EVENT_SEARCH_TARGETS.map((target) => ({ target, channel: discoveryChannel(target) }));
  const results: PromiseSettledResult<{ target: (typeof EVENT_SEARCH_TARGETS)[number]; channel: (typeof NAVER_CHANNELS)[number]; payload: NaverSearchPayload }>[] = [];
  for (let index = 0; index < queue.length; index += 3) {
    const batch = queue.slice(index, index + 3);
    results.push(...await Promise.allSettled(batch.map(async ({ target, channel }) => ({
      target,
      channel,
      payload: await readNaverChannel(target.query, channel, clientId, clientSecret),
    }))));
    if (index + 3 < queue.length) await new Promise((resolve) => setTimeout(resolve, 350));
  }
  if (results.every((result) => result.status === "rejected")) {
    const firstFailure = results.find((result) => result.status === "rejected");
    throw new Error(firstFailure?.reason instanceof Error ? firstFailure.reason.message : "NAVER API HUB 행사 검색 실패");
  }
  return results.flatMap((result) => result.status === "fulfilled"
    ? parseNaverSearchResponse(result.value.payload, result.value.target, result.value.channel.label)
    : []);
}

async function readNaverRelatedLinks(candidate: EventCandidate, clientId: string, clientSecret: string) {
  const results = await Promise.allSettled(
    NAVER_CHANNELS.map((channel) => readNaverChannel(`${candidate.title} 부산`, channel, clientId, clientSecret, 6)),
  );
  return uniqueRelatedLinks(results.flatMap((result) => result.status === "fulfilled"
    ? parseNaverRelatedLinksResponse(result.value, candidate)
    : []));
}

function deduplicate(candidates: EventCandidate[]) {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = `${candidate.title.replace(/\s/g, "").toLowerCase()}-${candidate.startDate}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function needsDetailedSchedule(candidate: EventCandidate) {
  if (!candidate.startDate || !candidate.endDate || (candidate.activeDates?.length ?? 0) > 0) return false;
  const start = new Date(`${candidate.startDate}T00:00:00Z`).getTime();
  const end = new Date(`${candidate.endDate}T00:00:00Z`).getTime();
  const spanDays = Math.round((end - start) / 86_400_000);
  const venueParts = candidate.venue.split(/[,/·]|\s및\s|\s등(?:\)|$)/).filter((part) => part.trim().length > 1);
  return spanDays > 31 && venueParts.length >= 3;
}

export function classifyEventCandidate(candidate: EventCandidate, today = dateForOffset(0)): EventDecision {
  const reasons: string[] = [];
  if (candidate.sourceKind === "fixture") {
    return { status: "needs_review", confidence: 72, reasons: ["구조화 분석 검토"] };
  }
  if (candidate.endDate && candidate.endDate < today) {
    return { status: "excluded", confidence: 100, reasons: ["종료된 행사"] };
  }
  if (!candidate.startDate || !candidate.endDate) reasons.push("행사 기간 확인 필요");
  if (!candidate.regionId) reasons.push("지원 권역 확인 필요");
  if (!candidate.venue || candidate.venue === "장소 확인 필요") reasons.push("장소 확인 필요");
  if (needsDetailedSchedule(candidate)) reasons.push("세부 개최일 확인 필요");
  if (reasons.length > 0) {
    return { status: "needs_review", confidence: Math.max(55, 85 - reasons.length * 10), reasons };
  }
  return {
    status: "auto_approved",
    confidence: candidate.sourceKind === "visit_busan" ? 97
      : candidate.sourceKind === "busan_festival" ? 95
      : candidate.sourceKind === "tour_api" ? 92
        : candidate.sourceKind === "precomputed_ai" ? 86
          : 82,
    reasons: [
      candidate.sourceKind === "naver_search" ? "검색 결과와 행사 원문"
        : candidate.sourceKind === "precomputed_ai" ? "AI 사전 구조화"
          : "공식 API",
      "날짜·장소·권역 검증 완료",
    ],
  };
}

export async function collectEventCandidates(): Promise<EventCollection> {
  if (collectionCache && collectionCache.expiresAt > Date.now()) return collectionCache.value;
  const serviceKey = process.env.PUBLIC_DATA_SERVICE_KEY?.trim();
  const naverClientId = process.env.NAVER_API_HUB_CLIENT_ID?.trim();
  const naverClientSecret = process.env.NAVER_API_HUB_CLIENT_SECRET?.trim();

  const [visitBusan, busan, tour, naver] = await Promise.allSettled([
    readVisitBusan(),
    serviceKey ? readBusanFestival(serviceKey) : Promise.resolve([]),
    serviceKey ? readTourApi(serviceKey) : Promise.resolve([]),
    naverClientId && naverClientSecret ? readNaverEventSearch(naverClientId, naverClientSecret) : Promise.resolve([]),
  ]);
  const naverCandidates = naver.status === "fulfilled"
    ? deduplicate(naver.value)
      .filter((candidate) => !candidate.endDate || candidate.endDate >= dateForOffset(0))
      .sort((left, right) => (left.startDate || "9999-12-31").localeCompare(right.startDate || "9999-12-31"))
      .slice(0, 24)
    : [];
  const officialCandidates = deduplicate([
    ...(visitBusan.status === "fulfilled" ? visitBusan.value.candidates : []),
    ...(busan.status === "fulfilled" ? busan.value : []),
    ...(tour.status === "fulfilled" ? tour.value : []),
  ])
    .filter((candidate) => classifyEventCandidate(candidate).status !== "excluded");
  const selectedNaverCandidates = naverCandidates
    .filter((candidate) => classifyEventCandidate(candidate).status !== "excluded")
    .slice(0, 20);
  const baseLiveCandidates = deduplicate([
    ...officialCandidates.slice(0, 50 - selectedNaverCandidates.length),
    ...selectedNaverCandidates,
  ])
    .sort((left, right) => {
      const priority = { auto_approved: 0, needs_review: 1, excluded: 2 };
      const sourcePriority = { visit_busan: 0, busan_festival: 1, tour_api: 2, naver_search: 3, precomputed_ai: 4, fixture: 5 };
      const statusDifference = priority[classifyEventCandidate(left).status] - priority[classifyEventCandidate(right).status];
      return statusDifference
        || (left.startDate || "9999-12-31").localeCompare(right.startDate || "9999-12-31")
        || sourcePriority[left.sourceKind] - sourcePriority[right.sourceKind];
    })
    .slice(0, 50);
  const relatedTargets = naverClientId && naverClientSecret
    ? baseLiveCandidates
      .filter((candidate) => classifyEventCandidate(candidate).status === "auto_approved" && (candidate.relatedLinks?.length ?? 0) < 3)
      .slice(0, 3)
    : [];
  const relatedResults: PromiseSettledResult<EventRelatedLink[]>[] = [];
  for (const candidate of relatedTargets) {
    relatedResults.push(...await Promise.allSettled([readNaverRelatedLinks(candidate, naverClientId!, naverClientSecret!)]));
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  const relatedById = new Map(relatedTargets.map((candidate, index) => [
    candidate.id,
    relatedResults[index]?.status === "fulfilled" ? relatedResults[index].value : [],
  ]));
  const liveCandidates = baseLiveCandidates.map((candidate) => {
    const sourceLink = candidate.sourceUrl && !candidate.sourceUrl.includes("data.go.kr/data/") ? [{
      title: candidate.title,
      summary: candidate.sourceText,
      source: candidate.sourceName,
      url: candidate.sourceUrl,
      imageUrl: candidate.imageUrl,
    }] : [];
    const relatedLinks = uniqueRelatedLinks([
      ...(candidate.relatedLinks ?? []),
      ...sourceLink,
      ...(relatedById.get(candidate.id) ?? []),
    ]);
    return relatedLinks.length > 0 ? { ...candidate, relatedLinks } : candidate;
  });
  const hasDiscoveredLive = (visitBusan.status === "fulfilled" && visitBusan.value.candidates.length > 0)
    || [busan, tour, naver].some((result) => result.status === "fulfilled" && result.value.length > 0);
  const mode = hasDiscoveredLive ? "live" : "fixture";
  const failureMessage = (result: PromiseSettledResult<unknown>) => result.status === "rejected"
    ? result.reason instanceof Error ? result.reason.message : "연결 실패"
    : "";
  const visitCount = visitBusan.status === "fulfilled" ? visitBusan.value.candidates.length : 0;
  const visitFailures = visitBusan.status === "fulfilled" ? visitBusan.value.detailFailures : 0;
  const value: EventCollection = {
    mode,
    generatedAt: new Date().toISOString(),
    sources: [
      {
        id: "visit_busan", name: "Visit Busan 축제·행사",
        status: visitBusan.status === "rejected" ? "failed" : visitFailures > 0 ? "partial" : "connected",
        candidateCount: visitCount,
        message: visitBusan.status === "rejected" ? failureMessage(visitBusan)
          : visitFailures > 0 ? `목록 ${visitCount}건 · 상세 ${visitFailures}건 실패` : `행사 ${visitCount}건 수집`,
      },
      {
        id: "busan_festival", name: "부산축제정보",
        status: !serviceKey ? "needs_key" : busan.status === "fulfilled" ? "connected" : "failed",
        candidateCount: busan.status === "fulfilled" ? busan.value.length : 0,
        message: !serviceKey ? "공공데이터 인증키 필요" : busan.status === "fulfilled" ? `행사 ${busan.value.length}건 수집` : failureMessage(busan),
      },
      {
        id: "tour_api", name: "한국관광공사 TourAPI",
        status: !serviceKey ? "needs_key" : tour.status === "fulfilled" ? "connected" : "failed",
        candidateCount: tour.status === "fulfilled" ? tour.value.length : 0,
        message: !serviceKey ? "공공데이터 인증키 필요" : tour.status === "fulfilled" ? `행사 ${tour.value.length}건 수집` : failureMessage(tour),
      },
      {
        id: "naver_search", name: "NAVER API HUB 행사 검색",
        status: !naverClientId || !naverClientSecret ? "needs_key" : naver.status === "fulfilled" ? "connected" : "failed",
        candidateCount: naverCandidates.length,
        message: !naverClientId || !naverClientSecret ? "NAVER API HUB 인증키 필요"
          : naver.status === "fulfilled" ? `선별 후보 ${naverCandidates.length}건` : failureMessage(naver),
      },
    ],
    candidates: mode === "live" ? liveCandidates : [],
  };
  collectionCache = { expiresAt: Date.now() + (mode === "live" ? 30 : 2) * 60 * 1000, value };
  return value;
}
