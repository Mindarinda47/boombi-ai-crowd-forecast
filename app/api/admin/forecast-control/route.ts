import { getForecastAdmin } from "../../../../lib/admin-auth";
import { hasConfiguredAiProvider } from "../../../../providers/ai-runtime";
import { updateForecastControlSettings } from "../../../../repositories/supabase-forecast-writer";

export const dynamic = "force-dynamic";

function hasSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

function validSettings(value: unknown): value is {
  autoRefreshEnabled: boolean;
  aiAnalysisEnabled: boolean;
  aiDecisionEnabled: boolean;
  maxAiAnalysesPerRun: number;
  confirmAutomatic?: boolean;
} {
  if (!value || typeof value !== "object") return false;
  const input = value as Record<string, unknown>;
  return typeof input.autoRefreshEnabled === "boolean"
    && typeof input.aiAnalysisEnabled === "boolean"
    && typeof input.aiDecisionEnabled === "boolean"
    && typeof input.maxAiAnalysesPerRun === "number"
    && Number.isInteger(input.maxAiAnalysesPerRun)
    && input.maxAiAnalysesPerRun >= 1
    && input.maxAiAnalysesPerRun <= 20;
}

export async function POST(request: Request) {
  const admin = await getForecastAdmin();
  if (!admin) return Response.json({ error: "관리자 인증이 필요합니다." }, { status: 401 });
  if (!hasSameOrigin(request)) return Response.json({ error: "허용되지 않은 요청입니다." }, { status: 403 });

  const raw = await request.text();
  if (raw.length > 2_048) return Response.json({ error: "요청 내용이 너무 깁니다." }, { status: 413 });
  let input: unknown;
  try {
    input = JSON.parse(raw);
  } catch {
    return Response.json({ error: "설정 내용을 읽을 수 없습니다." }, { status: 400 });
  }
  if (!validSettings(input)) return Response.json({ error: "설정 값이 올바르지 않습니다." }, { status: 400 });
  if (input.autoRefreshEnabled && input.confirmAutomatic !== true) {
    return Response.json({ error: "자동 갱신 활성화 확인이 필요합니다." }, { status: 400 });
  }

  const hasAiProvider = hasConfiguredAiProvider();
  const analysisReady = hasAiProvider && process.env.AI_ANALYSIS_MODE === "live";
  const decisionReady = hasAiProvider && process.env.AI_DECISION_MODE === "live";
  if (input.aiAnalysisEnabled && !analysisReady) {
    return Response.json({ error: "AI 행사 분석 환경 설정이 아직 준비되지 않았습니다." }, { status: 400 });
  }
  if (input.aiDecisionEnabled && !decisionReady) {
    return Response.json({ error: "AI 선택 도구 환경 설정이 아직 준비되지 않았습니다." }, { status: 400 });
  }

  try {
    const settings = await updateForecastControlSettings({
      auto_refresh_enabled: input.autoRefreshEnabled,
      ai_analysis_enabled: input.aiAnalysisEnabled,
      ai_decision_enabled: input.aiDecisionEnabled,
      max_ai_analyses_per_run: input.maxAiAnalysesPerRun,
    }, admin.email);
    return Response.json({ ok: true, settings });
  } catch (error) {
    const message = error instanceof Error ? error.message : "관리자 설정을 저장하지 못했습니다.";
    return Response.json({ error: message }, { status: 503 });
  }
}
