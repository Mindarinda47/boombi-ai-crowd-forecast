export type DecisionSource = "gemini" | "groq" | "openai" | "forecast_engine";

export type AlternativePriority = "similar" | "calmest" | "indoor";

export type AlternativeRequest = {
  action: "alternatives";
  date: string;
  selectedRegionId: string;
  priority: AlternativePriority;
};

export type AlternativeRecommendation = {
  regionId: string;
  regionName: string;
  area: string;
  score: number;
  fitScore: number;
  bestTime: string;
  why: string;
  tradeoff: string;
};

export type AlternativeDecisionResponse = {
  action: "alternatives";
  source: DecisionSource;
  date: string;
  selectedRegionId: string;
  summary: string;
  recommendations: AlternativeRecommendation[];
  generatedAt: string;
};

export type ScenarioWeather = "forecast" | "clear" | "rain";
export type ScenarioEvent = "forecast" | "cancelled" | "major";
export type ScenarioCalendar = "forecast" | "weekday" | "weekend" | "holiday";

export type ScenarioRequest = {
  action: "scenario";
  date: string;
  selectedRegionId: string;
  weather: ScenarioWeather;
  event: ScenarioEvent;
  calendar: ScenarioCalendar;
};

export type ScenarioDecisionResponse = {
  action: "scenario";
  source: DecisionSource;
  date: string;
  selectedRegionId: string;
  baseScore: number;
  scenarioScore: number;
  delta: number;
  summary: string;
  effects: string[];
  recommendedTime: string;
  confidenceNote: string;
  generatedAt: string;
};

export type DecisionRequest = AlternativeRequest | ScenarioRequest;
export type DecisionResponse = AlternativeDecisionResponse | ScenarioDecisionResponse;
