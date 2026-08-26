import Link from "next/link";

import { requireForecastAdmin } from "../../../lib/admin-auth";
import { aiProviderSummary, hasConfiguredAiProvider } from "../../../providers/ai-runtime";
import { readForecastControlSettings, readRecentForecastJobs } from "../../../repositories/supabase-forecast-writer";
import ForecastControlPanel from "./control-panel";

export const dynamic = "force-dynamic";

export default async function AdminControlPage() {
  const admin = await requireForecastAdmin("/admin/control");
  const [settings, jobs] = await Promise.all([
    readForecastControlSettings(),
    readRecentForecastJobs(5).catch(() => []),
  ]);
  const hasAiProvider = hasConfiguredAiProvider();
  const capabilities = {
    analysisReady: hasAiProvider && process.env.AI_ANALYSIS_MODE === "live",
    decisionReady: hasAiProvider && process.env.AI_DECISION_MODE === "live",
    providerSummary: aiProviderSummary(),
  };

  return (
    <main className="app-shell admin-shell control-shell">
      <header className="site-header admin-header">
        <Link className="brand" href="/" aria-label="붐비 홈"><span className="brand-mark" aria-hidden="true"><i /><i /><i /></span><span>붐비</span><span className="brand-sub">예보 갱신 제어</span></Link>
        <nav className="admin-links" aria-label="관리 메뉴"><Link className="active" href="/admin/control">갱신 제어</Link><Link href="/admin/events">행사 후보</Link><Link href="/admin/jobs">갱신 이력</Link><Link href="/admin/validation">검증 기록</Link><Link href="/">예보 화면</Link></nav>
      </header>

      <section className="admin-hero control-hero">
        <div><p className="eyebrow">FORECAST CONTROL ROOM</p><h1>데이터 갱신과 AI 사용을,<br /><em>한곳에서 제어합니다.</em></h1><p>예약 실행, 수동 갱신, AI 분석 한도와 최근 처리 상태를 통합 관리합니다. 저장된 설정은 서버의 모든 갱신 요청에 동일하게 적용됩니다.</p></div>
        <div className="admin-mode-card"><span>현재 운영 모드</span><strong>{settings.auto_refresh_enabled ? "자동 갱신" : "수동 전용"}</strong><small>{admin.email} · AI 행사 분석 {settings.ai_analysis_enabled ? "ON" : "OFF"}</small></div>
      </section>

      <ForecastControlPanel initialSettings={settings} recentJobs={jobs} capabilities={capabilities} />
    </main>
  );
}
