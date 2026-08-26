import Link from "next/link";

const externalLinkProps = {
  target: "_blank",
  rel: "noreferrer",
} as const;

export default function LicensesPage() {
  return (
    <main className="legal-page">
      <header className="legal-header">
        <Link className="brand" href="/" aria-label="붐비 홈으로 이동">
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
          <span>붐비</span>
        </Link>
        <Link className="legal-back" href="/">← 혼잡 예보로 돌아가기</Link>
      </header>

      <div className="legal-main">
        <section className="legal-hero">
          <p className="eyebrow">DATA &amp; LICENSES</p>
          <h1>데이터·라이선스</h1>
          <p>
            붐비가 활용하는 공공데이터와 외부 서비스, 콘텐츠 권리 및
            예보 이용 시 알아야 할 사항을 안내합니다.
          </p>
          <small>최종 갱신 2026. 07. 24.</small>
        </section>

        <section className="legal-section legal-copyright">
          <span>서비스 저작권</span>
          <h2>© 2026 Boombi. All rights reserved.</h2>
          <p>기획·디자인·개발: 이종민</p>
          <p>
            붐비의 화면 구성, 자체 제작 문구, 혼잡 점수 산식 및 가공 결과의
            저작권은 별도 표시가 없는 한 제작자에게 있습니다.
          </p>
        </section>

        <section className="legal-section">
          <div className="legal-section-heading">
            <span>01</span>
            <div>
              <h2>데이터 및 외부 서비스 출처</h2>
              <p>각 원자료와 서비스의 권리는 해당 제공기관 및 원저작자에게 있습니다.</p>
            </div>
          </div>
          <div className="legal-source-list">
            <article>
              <div><strong>부산광역시 부산축제정보</strong><span>행사 일정·장소</span></div>
              <p>부산광역시가 공공데이터포털을 통해 제공하는 축제 정보를 활용합니다. 공공데이터포털 표시 기준 이용허락범위는 제한 없음입니다.</p>
              <a href="https://www.data.go.kr/data/15063500/openapi.do" {...externalLinkProps}>공식 데이터 보기 ↗</a>
            </article>
            <article>
              <div><strong>한국관광공사 TourAPI</strong><span>관광·행사 정보</span></div>
              <p>관광지·문화행사 정보와 이용이 허용된 이미지 정보를 활용합니다. 데이터셋의 이용허락범위는 제한 없음이며, 개별 이미지의 공공누리 유형은 원문 기준을 따릅니다.</p>
              <a href="https://www.data.go.kr/data/15101578/openapi.do" {...externalLinkProps}>공식 데이터 보기 ↗</a>
            </article>
            <article>
              <div><strong>기상청 단기예보</strong><span>날씨 예보</span></div>
              <p>기상청 제공 단기예보를 혼잡도 보정에 활용합니다.</p>
              <a href="https://data.kma.go.kr/api/selectApiDetail.do?openApiNo=421&pgmNo=42" {...externalLinkProps}>공식 API 보기 ↗</a>
            </article>
            <article>
              <div><strong>네이버 데이터랩</strong><span>검색 관심 추세</span></div>
              <p>검색어 트렌드의 상대적 변화를 활용하며, 검색 결과 데이터의 권리는 네이버 또는 해당 권리자에게 있습니다.</p>
              <a href="https://developers.naver.com/products/terms/" {...externalLinkProps}>API 이용약관 보기 ↗</a>
            </article>
            <article>
              <div><strong>Kakao Maps</strong><span>지도 화면</span></div>
              <p>지역 위치와 지도를 표시하기 위해 Kakao Maps API를 사용합니다. 지도 내 로고와 출처 표시는 그대로 유지합니다.</p>
              <a href="https://developers.kakao.com/docs/en/kakaomap/common" {...externalLinkProps}>서비스 안내 보기 ↗</a>
            </article>
          </div>
        </section>

        <section className="legal-section">
          <div className="legal-section-heading">
            <span>02</span>
            <div>
              <h2>행사 관련 링크와 미리보기</h2>
              <p>원문 확인을 돕기 위한 연결 정보이며, 붐비가 해당 콘텐츠를 소유한다는 의미가 아닙니다.</p>
            </div>
          </div>
          <div className="legal-note-grid">
            <article>
              <strong>제목·요약·대표 이미지</strong>
              <p>뉴스, 블로그, 기관 페이지의 제목·일부 요약·대표 이미지는 원문으로 연결되는 미리보기 목적으로만 표시됩니다.</p>
            </article>
            <article>
              <strong>권리와 삭제 요청</strong>
              <p>저작권과 상표권은 각 발행처 및 권리자에게 있습니다. 원문 변경·삭제 시 미리보기 내용도 달라지거나 제공되지 않을 수 있습니다.</p>
            </article>
          </div>
        </section>

        <section className="legal-section">
          <div className="legal-section-heading">
            <span>03</span>
            <div>
              <h2>예보 및 가공 결과 안내</h2>
              <p>혼잡 가능성을 미리 비교하기 위한 참고 정보입니다.</p>
            </div>
          </div>
          <div className="legal-emphasis">
            <strong>붐비의 혼잡 점수·요약·추천은 여러 원자료를 조합해 만든 독자적 가공 결과입니다.</strong>
            <p>
              제공기관의 공식 혼잡 예보나 입장을 의미하지 않으며, 실시간 인원수 또는
              확정 수치가 아닙니다. 날씨, 행사 변경, 교통 통제 등 현장 변수에 따라
              실제 상황과 다를 수 있으므로 중요한 이동 결정 전에는 공식 안내를 함께 확인해 주세요.
            </p>
          </div>
        </section>

        <section className="legal-section">
          <div className="legal-section-heading">
            <span>04</span>
            <div>
              <h2>주요 오픈소스 소프트웨어</h2>
              <p>붐비는 아래 오픈소스 생태계를 기반으로 제작되었습니다.</p>
            </div>
          </div>
          <div className="legal-license-list">
            <a href="https://github.com/vercel/next.js/blob/canary/license.md" {...externalLinkProps}><strong>Next.js</strong><span>MIT License</span></a>
            <a href="https://github.com/facebook/react/blob/main/LICENSE" {...externalLinkProps}><strong>React · React DOM</strong><span>MIT License</span></a>
            <a href="https://github.com/drizzle-team/drizzle-orm/blob/main/LICENSE" {...externalLinkProps}><strong>Drizzle ORM</strong><span>Apache License 2.0</span></a>
            <a href="https://github.com/cloudflare/vinext/blob/main/LICENSE" {...externalLinkProps}><strong>vinext</strong><span>MIT License</span></a>
            <a href="https://github.com/vitejs/vite/blob/main/LICENSE" {...externalLinkProps}><strong>Vite</strong><span>MIT License</span></a>
            <a href="https://github.com/microsoft/TypeScript/blob/main/LICENSE.txt" {...externalLinkProps}><strong>TypeScript</strong><span>Apache License 2.0</span></a>
          </div>
          <p className="legal-license-note">
            각 소프트웨어의 저작권은 해당 프로젝트 기여자에게 있으며,
            자세한 조건과 고지는 연결된 원문 라이선스를 따릅니다.
          </p>
        </section>

        <section className="legal-section">
          <div className="legal-section-heading">
            <span>05</span>
            <div>
              <h2>개인정보 및 이용 안내</h2>
              <p>현재 공개 서비스는 회원가입·결제·위치 권한을 요구하지 않습니다.</p>
            </div>
          </div>
          <div className="legal-note-grid">
            <article>
              <strong>개인정보 입력</strong>
              <p>혼잡 예보를 확인하는 과정에서 이름, 연락처 등 개인정보를 직접 입력받거나 별도 회원정보로 저장하지 않습니다.</p>
            </article>
            <article>
              <strong>외부 페이지 이동</strong>
              <p>행사 원문이나 데이터 제공기관 링크를 열면 해당 사이트의 개인정보처리방침과 이용약관이 적용됩니다.</p>
            </article>
          </div>
        </section>
      </div>

      <footer className="legal-footer">
        <div className="brand footer-brand"><span className="brand-mark" aria-hidden="true"><i /><i /><i /></span><span>붐비</span></div>
        <p>부산의 내일을 조금 더 여유롭게.</p>
        <Link href="/">혼잡 예보로 돌아가기</Link>
        <small className="footer-copyright">© 2026 Boombi. All rights reserved. · Created by 이종민</small>
      </footer>
    </main>
  );
}
