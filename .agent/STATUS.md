# Splitwright 진행 상황 (개발 단계, Opus 5.5)
기획: /Users/guggyeonghun/.aside/u/0/sessions/2026-11-10_baP891hto7irXDys/tmp/contests/paypal2/PLAN.md, PLAN_REVIEW.md
마지막 갱신: 11/12 08:16

## 끝난 것
- 샌드박스 Payouts 실제 호출 통과(11/12 01:05, 묶음 JF8G329QPABBU). 앱은 RefundClerk과 같은 샌드박스 앱(범위에 payouts, webhooks).
- 계산 엔진 src/lib/engine.ts + 시험 14개 통과(npx vitest run)
- 저장소: Upstash Redis 무료(Vercel 연동 splitwright-kv, 환경변수 KV_*)
- API 경로 전부, 화면 전부(/, /p/[id], /p/[id]/deal, /p/[id]/preview, /p/[id]/ledger, /sign/[token], /me/[token], /buy/[id]), npm run build 통과
- Vercel 프로젝트 splitwright, 배포 https://splitwright.vercel.app (11/12 02시대 첫 배포)
- PayPal 웹훅 등록: id 3TX48135LR682831U → https://splitwright.vercel.app/api/paypal/webhook (PAYPAL_WEBHOOK_ID 환경변수 등록, 재배포 필요)

## 하는 중
- 샌드박스 개인 계정 준(Jun)·솔(Sol) 만들기 (developer.paypal.com 계정 만들기 창이 브라우저를 멈추게 함, 다른 경로 시도 중)

## 남은 것
- DEMO_MINA/JUN/SOL_EMAIL 환경변수, 재배포
- GitHub 공개 저장소 + MIT LICENSE
- 실제 흐름 시험과 번호 기록, 한도 보류 1회
- 폭 360/768/1213/1440 캡처(.agent/shots)
- README(영어)

## 계정·설정 위치 (비밀 값은 적지 않음)
- 비밀 값: ~/splitwright/.env.local, Vercel 프로젝트 환경변수
- 샌드박스 사업자(돈 받는 쪽, Mina 역): sb-4e3cr53833060@business.example.com
- 샌드박스 개인(구매자로 사용): sb-wvrlz53834447@personal.example.com (비밀번호는 developer.paypal.com 계정 화면에서 확인)
- PayPal 개발자 로그인: Aside 비밀번호 보관함 'PayPal 계정 로그인' + 문자 인증
