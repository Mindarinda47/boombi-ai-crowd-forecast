export type RiskLevelCode = "calm" | "normal" | "busy" | "very_busy" | "extreme";

export type IndoorOutdoor = "indoor" | "outdoor" | "mixed" | "unknown";

export type RegionType = "commercial" | "tourism" | "transit" | "sports";

export type ScoreInputs = {
  baseline: number;
  eventImpact: number;
  trend: number;
  calendar: number;
  weatherAdjustment: number;
  nearbyEventAdjustment: number;
};

export type ScoreResult = {
  score: number;
  riskLevel: RiskLevelCode;
  components: {
    baseline: number;
    eventImpact: number;
    trend: number;
    calendar: number;
    weatherAdjustment: number;
    nearbyEventAdjustment: number;
  };
};

export type ConfidenceInputs = {
  officialSourceQuality: number;
  baselineQuality: number;
  trendQuality: number;
  weatherQuality: number;
  freshness: number;
};

export type ForecastSlot = {
  time: string;
  score: number;
};

export type EventRelatedLink = {
  title: string;
  summary: string;
  source: string;
  url: string;
  imageUrl: string | null;
};

export type RegionForecast = {
  id: string;
  name: string;
  area: string;
  score: number;
  riskLevel: RiskLevelCode;
  riskLabel: string;
  confidence: number;
  confidenceLevel: "low" | "medium" | "high";
  weather: string;
  peak: string;
  calm: string;
  factors: string[];
  event: string;
  eventMeta: string;
  eventSource: "public_api" | "stored" | "none";
  eventSourceName: string;
  eventSourceUrl: string | null;
  eventImageUrl: string | null;
  eventRelatedLinks: EventRelatedLink[];
  eventEvidence: string;
  eventUpdatedAt: string;
  x: number;
  y: number;
  hourly: number[];
  hours: string[];
  scoreComponents: ScoreResult["components"];
};

export type PublicForecastResponse = {
  asOf: string;
  date: string;
  mode: "demo" | "live";
  weatherSource: "kma" | "stored";
  trendSource: "naver" | "stored";
  algorithmVersion: string;
  regions: RegionForecast[];
};
