import Link from "next/link";

import { classifyEventCandidate, collectEventCandidates } from "../../../providers/event-discovery";
import { fixtureEventAnalysis } from "../../../providers/openai-event-analysis";
import { readEventDiscoveryRecords } from "../../../repositories/supabase-forecast-writer";

export const dynamic = "force-dynamic";

function dateRange(start: string, end: string) {
  if (!start) return "기간 확인 필요";
  return end && end !== start ? `${start} – ${end}` : start;
}

export default async function AdminEventsPage() {
  const collection = await collectEventCandidates();
  const stored = await readEventDiscoveryRecords().catch(() => []);
  const analysisById = new Map(stored.map((record) => [record.candidate.id, record.analysis]));
  const sourceCandidates = stored.length > 0 ? stored.map((record) => record.candidate) : collection.candidates;
  const classified = sourceCandidates.map((candidate) => ({ candidate, decision: classifyEventCandidate(candidate) }));
  const autoApproved = classified.filter((item) => item.decision.status === "auto_approved").length;
  const needsReview = classified.filter((item) => item.decision.status === "needs_review").length;
  const candidates = classified.filter((item) => item.decision.status !== "excluded").slice(0, 8);
  const sourceLabel = { connected: "연결됨", partial: "일부 오류", needs_key: "연결 설정", failed: "연결 실패" } as const;

  return (
    <main className="app-shell admin-shell">
      <header className="site-header admin-header">
        <Link className="brand" href="/" aria-label="붐비 홈">
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
          <span>붐비</span><span className="brand-sub">행사 후보 관리</span>
        </Link>
        <nav className="admin-links" aria-label="관리 메뉴"><Link href="/admin/control">갱신 제어</Link><Link className="active" href="/admin/events">행사 후보</Link><Link href="/admin/jobs">갱신 이력</Link><Link href="/admin/validation">검증 기록</Link><Link href="/">예보 화면</Link></nav>
      </header>

      <section className="admin-hero">
        <div>
          <p className="eyebrow">EVENT DISCOVERY LAB</p>
          <h1>행사 후보를 모으고,<br /><em>검증되면 자동 반영합니다.</em></h1>
          <p>Visit Busan·공식 API와 네이버 뉴스·블로그·웹문서에서 축제, 공연, 전시, 체험, 경기와 민간 행사를 찾고 날짜·장소·권역이 명확하면 예보에 반영합니다.</p>
        </div>
        <div className="admin-mode-card">
          <span>자동화 현황</span><strong>자동 반영 {autoApproved}건</strong>
          <small>확인 필요 {needsReview}건 · AI 구조화 분석</small>
        </div>
      </section>

      <section className="source-strip" aria-label="행사 데이터 소스 상태">
        {collection.sources.map((source) => (
          <div key={source.id}><span className={`source-dot ${source.status}`} /><p>{source.name}<small>{source.message}</small></p><strong>{sourceLabel[source.status]}</strong></div>
        ))}
        <div><span className="source-dot fixture" /><p>Gemini · Groq 행사 분석</p><strong>구조화 분석 적용</strong></div>
      </section>

      <section className="candidate-section">
        <div className="candidate-heading">
          <div><span>자동 수집 결과</span><h2>자동 반영 {autoApproved}건 · 확인 필요 {needsReview}건</h2></div>
          <p>새로 발견되거나 내용이 바뀐 행사만 다시 분석하고, 같은 원문은 저장 결과를 재사용합니다.</p>
        </div>
        <div className="candidate-grid">
          {candidates.map(({ candidate, decision }) => {
            const analysis = analysisById.get(candidate.id) ?? fixtureEventAnalysis(candidate);
            const decisionLabel = decision.status === "auto_approved" ? "예보 자동 반영" : "확인 필요";
            return (
              <article className="candidate-card" key={candidate.id}>
                <div className="candidate-card-top"><span>{candidate.regionName}</span><i className={decision.status}>{decisionLabel}</i></div>
                <h3>{candidate.title}</h3>
                <p className="candidate-meta">{candidate.venue}<br />{dateRange(candidate.startDate, candidate.endDate)}</p>
                <div className="analysis-box">
                  <small>AI 구조화 분석 결과</small>
                  <strong>{analysis.riskFactors[0]}</strong>
                  <p>{analysis.summary}</p>
                  <div>{analysis.riskFactors.slice(1).map((factor) => <span key={factor}>{factor}</span>)}</div>
                </div>
                <footer>{candidate.sourceUrl ? <a href={candidate.sourceUrl} target="_blank" rel="noreferrer">{candidate.sourceName} ↗</a> : <span>{candidate.sourceName}</span>}<span>{decision.reasons.join(" · ")} · {decision.confidence}</span></footer>
              </article>
            );
          })}
        </div>
      </section>

      <section className="admin-next">
        <span>자동화 원칙</span><h2>관리자는 예외가 생겼을 때만 확인합니다.</h2>
        <p>공공·민간 행사를 구분하지 않고 날짜, 장소, 부산 42개 권역이 확인되면 자동 반영합니다. 원문 해시가 같은 행사는 재분석하지 않아 반복 관리와 API 사용량을 줄였습니다.</p>
      </section>
    </main>
  );
}
