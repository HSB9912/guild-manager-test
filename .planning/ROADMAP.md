# Roadmap: 뚠카롱 길드 관리 시스템

**Created:** 2026-03-24
**Phases:** 6
**Requirements:** 54 mapped

## Overview

| # | Phase | Goal | Requirements | Success Criteria |
|---|-------|------|--------------|------------------|
| 1 | Foundation & Auth | React + Vite 프로젝트 기반과 Google OAuth 인증을 완성한다 | FOUND-01..07, AUTH-01..05 | 5 |
| 2 | Members & Guild Stats | 길드원 CRUD와 현황 통계 대시보드를 제공한다 | MEMB-01..05, STAT-01..04 | 4 |
| 3 | Scores & Promotion | 주차별 수로 점수 기록과 승강제 운영을 제공한다 | SCORE-01..05, PROMO-01..04 | 4 |
| 4 | Analysis & Rewards | 수로 분석 차트와 보상 자동 계산을 제공한다 | ANAL-01..05, REWARD-01..03 | 4 |
| 5 | Board, Buddy & Calendar | 게시판·버디 매칭·캘린더를 완성한다 | BOARD-01..05, BUDDY-01..03, CAL-01..04 | 5 |
| 6 | OCR & Polish | 스크린샷 OCR 통합과 전체 품질 완성도를 높인다 | OCR-01..04 | 3 |

---

## Phase Details

### Phase 1: Foundation & Auth

**Goal:** React + Vite + TypeScript + Tailwind CSS 프로젝트를 초기화하고, AppShell 레이아웃(사이드바·헤더·모바일 탭바)과 Google OAuth 기반 관리자 인증을 완성한다. Supabase 클라이언트 싱글턴, Zustand UI 스토어, 다크모드, 폰트 크기 설정이 모두 동작해야 한다.

**Requirements:**
- FOUND-01, FOUND-02, FOUND-03, FOUND-04, FOUND-05, FOUND-06, FOUND-07
- AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05

**UI hint:** yes

**Success Criteria:**
1. 관리자가 Google 계정으로 로그인하면 앱 셸(사이드바 + 헤더)이 표시되고, 허용되지 않은 이메일은 거부 화면을 본다.
2. 브라우저를 새로고침해도 로그인 상태가 유지되며, 로그아웃 버튼 클릭 시 인증 화면으로 돌아간다.
3. 다크모드 토글을 누르면 전체 UI가 즉시 전환되고, 새로고침 후에도 설정이 유지된다.
4. 모바일 뷰포트(375px)에서 모바일 탭바가 표시되고, 데스크톱(1280px)에서는 사이드바가 표시된다.
5. 비로그인 사용자가 Public View URL에 접근하면 읽기 전용 모드로 앱을 볼 수 있다.

**Plans:**
1. Project scaffold — Vite + React 19 + TypeScript + Tailwind CSS 4 + ESLint + Prettier 초기 설정 및 빌드/dev 서버 검증
2. Supabase & state wiring — `lib/supabase.ts` 싱글턴, `lib/r2.ts` 스텁, Zustand 스토어(다크모드, 폰트 크기, 사이드바 상태) 구현
3. AppShell & routing — React Router `createBrowserRouter`, Sidebar, TopBar, 모바일 탭바, 빈 페이지 플레이스홀더 구현
4. Google OAuth auth flow — `AuthGuard`, 로그인 페이지, 이메일 허용 리스트 검사, 세션 복구, Public View 모드 구현

---

### Phase 2: Members & Guild Stats

**Goal:** 길드원 CRUD(추가·수정·삭제·검색·정렬·배치 편집)를 완성하고, 레벨/직업 분포 차트 및 통계 요약 대시보드를 제공한다.

**Requirements:**
- MEMB-01, MEMB-02, MEMB-03, MEMB-04, MEMB-05
- STAT-01, STAT-02, STAT-03, STAT-04

**UI hint:** yes

**Success Criteria:**
1. 관리자가 길드원을 추가·수정·삭제할 수 있고, 변경 사항이 즉시 목록에 반영된다.
2. 닉네임/직업/랭크 기준으로 검색·필터·정렬이 동작하고, 여러 길드원을 선택해 일괄 편집할 수 있다.
3. 현황 페이지에서 레벨 분포 차트와 직업 분포 차트가 실제 데이터 기반으로 표시된다.
4. 총원, 평균 레벨, 최고 레벨 등 통계 요약 카드가 표시되며, 기존 대비 강화된 대시보드 레이아웃을 제공한다.

**Plans:**
1. Member types & hook — `types/member.ts` (Supabase 스키마에서 생성), `useMembers` TanStack Query 훅 (CRUD 뮤테이션 포함)
2. Member list UI — `MembersPage`, `MemberTable` (검색/필터/정렬), `MemberForm` 모달, 배치 편집 UI
3. Guild stats — `types/stat.ts`, `useGuildStats` 훅, `StatsPage` (레벨/직업 분포 Chart.js 차트, 통계 요약 카드, 강화된 대시보드)

---

### Phase 3: Scores & Promotion

**Goal:** 주차별 수로 점수를 기록·조회하고, 승급/강등 기준 설정과 대상자 자동 계산·이력 관리를 제공한다.

**Requirements:**
- SCORE-01, SCORE-02, SCORE-03, SCORE-04, SCORE-05
- PROMO-01, PROMO-02, PROMO-03, PROMO-04

**UI hint:** yes

**Success Criteria:**
1. 관리자가 주차를 선택한 후 길드원별 점수를 입력·저장하면 점수 테이블에 즉시 반영된다.
2. 미참여(0점) 길드원이 시각적으로 강조 표시되고, 컬럼별 정렬이 동작한다.
3. 관리자가 승급/강등 기준 점수를 설정하면 대상자가 자동으로 계산되어 목록에 표시된다.
4. 승강 대상자를 편집·확정할 수 있고, 이력이 날짜별로 조회 가능하다.

**Plans:**
1. Score types & hook — `types/score.ts`, `useScores` TanStack Query 훅 (주차별 조회·기록 뮤테이션)
2. Scores page UI — `ScoresPage`, `WeekSelector`, `ScoreTable` (0점 강조, 컬럼 정렬), `ScoreInputForm` (수동 입력)
3. Promotion types & hook — `types/promotion.ts`, `usePromotion` 훅 (기준 설정, 대상자 계산, 이력 조회)
4. Promotion page UI — `PromotionPage`, `PromotionRules` 설정 폼, `PromotionCandidates` 편집/확정 UI, `PromotionHistory` 이력 테이블, `TierBadge` 컴포넌트

---

### Phase 4: Analysis & Rewards

**Goal:** 개인별 점수 추이 차트, 전체 참여율 통계, 랭킹, MVP 하이라이트 등 수로 분석 페이지를 완성하고, 점수 기반 보상 자동 계산·내역 조회·공식 설정 기능을 제공한다.

**Requirements:**
- ANAL-01, ANAL-02, ANAL-03, ANAL-04, ANAL-05
- REWARD-01, REWARD-02, REWARD-03

**UI hint:** yes

**Success Criteria:**
1. 분석 페이지에서 특정 길드원을 선택하면 주차별 점수 추이 차트가 표시된다.
2. 길드 전체 참여율, 주간/월간 랭킹, MVP 하이라이트가 실제 데이터 기반으로 표시된다.
3. 분석 요약 테이블에서 전체 길드원의 통계(평균, 최고, 참여율 등)를 한눈에 볼 수 있다.
4. 수로 보상 페이지에서 점수 기반 보상이 자동 계산되고, 보상 내역 조회 및 계산 공식 설정이 동작한다.

**Plans:**
1. Analysis types & hook — `types/analysis.ts`, `useAnalysis` 훅 (개인별 추이, 전체 참여율, 랭킹 집계)
2. Analysis page UI — `AnalysisPage`, `ScoreTrendChart` (Chart.js), `ParticipationStats`, `RankingTable`, `MvpHighlight`, `AnalysisSummaryTable`
3. Reward types & hook — `types/reward.ts`, `useRewards` 훅 (보상 계산 로직 순수 함수 추출, 설정 조회/수정)
4. Rewards page UI — `RewardsPage`, `RewardCalculator`, `RewardHistory` 테이블, `RewardFormulaSettings` 폼

---

### Phase 5: Board, Buddy & Calendar

**Goal:** 게시판(공지/자유 글 작성·조회·수정·삭제·R2 이미지 업로드), 뚠뚠 버디 매칭(실행·결과 조회·이력 보존), 캘린더(월별 표시·일정 CRUD·목요일 강조)를 완성한다.

**Requirements:**
- BOARD-01, BOARD-02, BOARD-03, BOARD-04, BOARD-05
- BUDDY-01, BUDDY-02, BUDDY-03
- CAL-01, CAL-02, CAL-03, CAL-04

**UI hint:** yes

**Success Criteria:**
1. 관리자가 게시글을 작성(이미지 첨부 포함)·수정·삭제할 수 있고, 비로그인 사용자도 목록·상세를 조회할 수 있다.
2. 이미지가 Cloudflare R2를 통해 업로드되고, 게시글 상세에서 정상적으로 표시된다.
3. 버디 매칭을 실행하면 결과가 표시되고, 이전 이력이 반영되어 중복 매칭이 방지된다.
4. 월별 캘린더에서 일정을 추가·수정·삭제할 수 있고, 목요일이 시각적으로 강조된다.
5. 일정 상세 보기 모달이 동작하고, 월 이동 버튼으로 전월/다음 달 캘린더를 탐색할 수 있다.

**Plans:**
1. Board feature — `types/board.ts`, `useBoard` 훅, `BoardPage`, `PostList`, `PostDetail`, `PostEditor` (R2 이미지 업로드 포함)
2. Buddy feature — `types/buddy.ts`, `useBuddy` 훅 (매칭 알고리즘 순수 함수 추출, 이력 관리), `BuddyPage`, `BuddyMatchButton`, `MatchResultList`, `MatchHistoryTable`
3. Calendar feature — `types/calendar.ts`, `useCalendar` 훅, `CalendarPage`, `CalendarGrid` (목요일 강조), `EventForm`, `EventDetailModal`

---

### Phase 6: OCR & Polish

**Goal:** OpenCV.js WASM 기반 스크린샷 점수 인식을 ScoresPage에 통합하고, 모바일 반응형 완성도·에러 경계·코드 분할·SPA fallback 등 전체 품질을 마무리한다.

**Requirements:**
- OCR-01, OCR-02, OCR-03, OCR-04

**UI hint:** yes

**Success Criteria:**
1. 점수 입력 화면에서 스크린샷을 업로드하면 OpenCV.js가 점수를 자동 인식하여 입력 폼에 미리 채워준다.
2. 1366×768 ~ 3840×2160 다양한 해상도 스크린샷에서 점수가 정상 인식된다.
3. OCR 인식 결과를 수동으로 수정한 뒤 저장하면 점수에 정확히 반영된다.

**Plans:**
1. OCR integration — `lib/ocr.ts` OpenCV.js WASM 래퍼 (lazy load, 환경 격리), `OcrUploader` 컴포넌트, ScoresPage 통합
2. Multi-resolution support & correction UI — 해상도별 ROI 보정 로직, 인식 결과 수정 폼
3. Polish & QA — 모바일 뷰포트 전수 점검, 페이지별 에러 경계, React.lazy 코드 분할 검증, SPA 404 fallback (Cloudflare Pages / Vite preview), 접근성 기본 검토
4. Deployment verification — 빌드 결과물 프로덕션 배포, 기존 앱과 기능 병렬 검증, 마이그레이션 완료 체크리스트
