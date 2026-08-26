from __future__ import annotations

import copy
import io
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET


ROOT = Path(__file__).resolve().parents[1]
TEMPLATE = ROOT / "deliverables" / "template.hwpx"
OUTPUT = ROOT / "deliverables" / "붐비_출품작_설명서.hwpx"

HP = "http://www.hancom.co.kr/hwpml/2011/paragraph"
NS = {"hp": HP}


CONTENT: dict[int, list[str]] = {
    3: [
        "• 행사 일정·평소 시간대별 수요·검색 관심도·날씨·달력 특성을 결합해 부산 42개 권역의 오늘 포함 8일 혼잡 가능성, 최고 혼잡 시간과 추천 방문 시간을 알려주는 사전 의사결정 서비스",
    ],
    4: [
        "• 부산은 본가와 가까워 자주 찾는 여행지지만, 유명 관광지나 행사장에 예상보다 많은 사람이 몰려 긴 대기와 갑작스러운 일정 변경을 경험한 것이 아이디어의 출발점",
        "• 여행을 준비할 때 ‘어디가, 언제 붐빌지’를 알 수 있다면 장소와 시간을 더 여유롭게 선택할 수 있다고 판단",
        "• 현재 상황 확인에 강한 기존 지도와 달리, 흩어진 행사·날씨·검색 관심도·주말/공휴일/방학 정보를 날짜·지역·시간대 기준으로 결합해 미래 일정 결정을 지원",
        "• 혼잡 점수뿐 아니라 최고 혼잡 시간·추천 방문 시간·주요 원인·출처·신뢰도·마지막 갱신 시각을 함께 공개",
        "• 대체 장소도 단순히 가장 한적한 곳이 아니라 방문 목적·장소 성격·관광 매력도·이동 부담·혼잡도를 함께 계산하고, 사용자가 고른 우선조건에 따라 추천 순서를 변경",
    ],
    5: [
        "• 서비스 내부의 AI: 형식이 제각각인 민간 행사 게시글과 포스터에서 행사명·장소·기간·운영시간·예상 규모·선착순/한정판매·실내외 여부를 정해진 데이터 형식으로 구조화",
        "• 입력 검증: AI 결과의 날짜·장소 누락과 형식 오류를 검사하고 정보가 불완전한 항목은 예보 입력에서 분리",
        "• 재현 가능한 계산: AI는 혼잡 점수를 임의로 만들지 않으며, 최종 점수와 추천 시간·대체 장소·조건 시나리오는 코드 기반 규칙 엔진이 계산",
        "• 효율적인 호출: 분석 결과를 저장하고 새 행사가 발견되거나 원문이 바뀐 경우에만 다시 분석해 일반 사용자 조회와 AI 호출을 분리",
        "• 1인 개발 파트너: ChatGPT·Codex를 기획, 데이터 모델, 예측 규칙, UI 구현, 오류 진단, 자동 테스트와 제출 문서 작성까지 연결해 활용",
        "• 협업 워크플로우: 문제와 사용 상황 정의 → 원하는 결과와 제약을 프롬프트로 전달 → 기존 코드 확인 후 부분 구현 → 자동 테스트 → 실제 화면 확인 → 발견한 문제를 다시 구체화해 보완",
        "• 프롬프트 원칙: ‘현재 코드 구조 유지’, ‘요청 범위만 수정’, ‘공식 자료에 없는 사실 추측 금지’, ‘구현 후 오류 상황과 자동 테스트 확인’을 반복 적용",
        "• 역할 분담: 사람은 문제·우선순위·타당성 기준을 판단하고, AI는 구현·분석·검증을 수행하는 반복 협업 구조로 완성도를 향상",
    ],
    6: [
        "• 대상: 서면·해운대·광안리·남포동·부산 주요 대학가 등 42개 권역, 오늘 포함 8일, 08:00~22:00의 15개 시간대",
        "• 혼잡 계산: 평소 수요 60%·검색 관심도 25%·달력 15%로 기본 점수를 만들고 행사 최대 +25점과 날씨·인접 행사 영향을 추가 보정",
        "• 날짜·지역 예보: 날짜별 혼잡 경보 TOP 3, 지도 마커, 권역별 점수·단계·최고 혼잡 구간·추천 방문 시간·주요 원인을 제공",
        "• 시간대 흐름과 비교: 08:00~22:00 그래프와 두 지역 또는 두 날짜의 점수·혼잡 구간·추천 시간 비교",
        "• 행사 근거: 관련 게시글의 제목·요약·출처를 스크롤 목록으로 제공하고 항목을 가리키면 대표 이미지를 미리보기로 표시",
        "• 혼잡 회피: ‘비슷한 분위기·최대한 여유롭게·실내 중심’ 중 선택한 조건에 맞춰 대체 장소 3곳을 추천하고 추천 이유와 확인할 점을 제시",
        "• 조건 시나리오: 날씨·행사·평일/주말/공휴일 조건 변경 전후 점수와 원인을 비교",
        "• 자동 갱신: Supabase PostgreSQL에 예보를 저장하고 매일 06:00·15:00(KST) 날씨·검색·공공/민간 행사·혼잡 점수를 하나의 기준 시각으로 갱신",
        "• 운영과 검증: 행사 후보·원문 변경·갱신 이력·예보와 행사 후 관찰 결과를 관리자 화면과 자동 테스트로 확인",
        "• 완성 형태: Next.js·TypeScript·Supabase·Kakao Map API와 공공데이터 API로 구현했으며 데스크톱과 모바일 모두 지원",
    ],
    7: [
        "• 시민·관광객: 혼잡이 집중되는 지역과 시간을 이동 전에 확인해 대기와 동선 변경 부담을 줄일 수 있음",
        "• 행사 방문객: 한정 판매·선착순·시작/종료 시간 등 행사 특성까지 반영한 방문 판단 가능",
        "• 행사 운영자: 혼잡이 집중될 시간대를 사전에 확인해 안내와 인력 배치에 활용",
        "• 지자체: 행사·날씨·관심도·달력 정보를 하나의 설명 가능한 지표로 확인해 현장 대응 우선순위 설정",
        "• 공공·민간 행사 자동 탐색과 하루 2회 통합 갱신으로 1인이 운영하더라도 반복 입력과 수동 확인 부담을 낮춤",
        "• 부산에서 검증한 지역 프로필과 계산 구조를 울산·경남권으로 확장하고, 관찰 데이터가 쌓이면 지역별 가중치 보정 가능",
        "• 한계: 실시간 인원수나 확정 수치가 아닌 혼잡 가능성 예보이며 돌발 상황이 반영되지 않을 수 있어 신뢰도와 근거를 함께 제시",
    ],
    8: [
        "• 서비스: https://boombi-busan-forecast.jomgminlee.chatgpt.site",
        "• 데이터: 부산광역시 부산축제정보 · 한국관광공사 TourAPI · 민간 행사 검색 · 기상청 단기예보 · 네이버 데이터랩",
    ],
}


def namespace_map(xml_bytes: bytes) -> dict[str, str]:
    result: dict[str, str] = {}
    for _, item in ET.iterparse(io.BytesIO(xml_bytes), events=("start-ns",)):
        prefix, uri = item
        result[prefix or ""] = uri
    return result


def cell_by_address(table: ET.Element, row: int, col: int) -> ET.Element:
    for cell in table.findall(".//hp:tc", NS):
        address = cell.find("hp:cellAddr", NS)
        if address is not None and int(address.get("rowAddr", "-1")) == row and int(address.get("colAddr", "-1")) == col:
            return cell
    raise ValueError(f"cell not found: row={row}, col={col}")


def replace_cell_paragraphs(cell: ET.Element, lines: list[str], char_pr_id: str) -> None:
    sublist = cell.find("hp:subList", NS)
    if sublist is None:
        raise ValueError("cell subList not found")
    existing = sublist.findall("hp:p", NS)
    if not existing:
        raise ValueError("base paragraph not found")
    base = existing[0]
    for paragraph in existing:
        sublist.remove(paragraph)

    for index, line in enumerate(lines):
        paragraph = copy.deepcopy(base)
        paragraph.set("id", str(2147483648 + index))
        for child in list(paragraph):
            paragraph.remove(child)
        run = ET.SubElement(paragraph, f"{{{HP}}}run", {"charPrIDRef": char_pr_id})
        text = ET.SubElement(run, f"{{{HP}}}t")
        text.text = line
        sublist.append(paragraph)


def build() -> None:
    if not TEMPLATE.exists():
        raise FileNotFoundError(TEMPLATE)

    with zipfile.ZipFile(TEMPLATE) as source:
        entries = {name: source.read(name) for name in source.namelist()}

    section = entries["Contents/section0.xml"]
    for prefix, uri in namespace_map(section).items():
        ET.register_namespace(prefix, uri)
    root = ET.fromstring(section)

    tables = [
        table
        for table in root.findall(".//hp:tbl", NS)
        if table.get("rowCnt") == "9" and table.get("colCnt") == "4"
    ]
    if len(tables) != 1:
        raise ValueError(f"expected one submission table, found {len(tables)}")
    table = tables[0]

    replace_cell_paragraphs(cell_by_address(table, 1, 1), [""], "8")
    replace_cell_paragraphs(cell_by_address(table, 1, 3), [""], "8")
    replace_cell_paragraphs(cell_by_address(table, 2, 1), ["붐비(BoomB) — 부산 AI 혼잡 예보"], "21")
    for row, lines in CONTENT.items():
        replace_cell_paragraphs(cell_by_address(table, row, 1), lines, "1")

    entries["Contents/section0.xml"] = ET.tostring(root, encoding="utf-8", xml_declaration=True)
    entries["Preview/PrvText.txt"] = (
        "2026 AI 활용 공모전(나는 Solo AI) 출품작 설명서\n"
        "참가자명·생년월일: \n연락처: \n"
        "출품작 명칭: 붐비(BoomB) — 부산 AI 혼잡 예보\n\n"
        + "\n\n".join("\n".join(lines) for lines in CONTENT.values())
    ).encode("utf-8")

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(OUTPUT, "w") as target:
        target.writestr("mimetype", entries.pop("mimetype"), compress_type=zipfile.ZIP_STORED)
        for name, data in entries.items():
            target.writestr(name, data, compress_type=zipfile.ZIP_DEFLATED)

    with zipfile.ZipFile(OUTPUT) as check:
        if check.testzip() is not None:
            raise ValueError("generated HWPX contains a corrupt ZIP entry")
        ET.fromstring(check.read("Contents/section0.xml"))

    print(OUTPUT)
    print(f"size={OUTPUT.stat().st_size} bytes")


if __name__ == "__main__":
    build()
