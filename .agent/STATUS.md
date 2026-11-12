# Splitwright 진행 상황 (개발 단계, Opus 5.5)
기획: /Users/guggyeonghun/.aside/u/0/sessions/2026-11-10_baP891hto7irXDys/tmp/contests/paypal2/PLAN.md, PLAN_REVIEW.md
마지막 갱신: 11/13 00:25 (마무리 작업자)

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

## 11/13 마무리 작업 기록
- 데모 약속을 $8 글꼴 비용 회수로 바꿈(첫 판매에 세 사람 모두 지급되도록). 상한 표시 버그, 서명 상태 문구, Gemini 요약 12초 제한, PayPal 버튼 영어, 같은 탭 결제(팝업 없음) 추가. 모두 배포됨.
- GitHub 공개 저장소 https://github.com/kyunghoonkook/splitwright (MIT LICENSE) 푸시 완료
- 실제 흐름 1회(00:21): 프로젝트 L6Ma8Ksa(리드 키 CKHPW3yt8643nKlR), 버전 909317059c02, 주문 9JG66454W8585725Y, 수수료 $0.77, 순액 $11.23 → Mina $1.61(계정에 남김) Jun $8.97 Sol $0.65
- 구매자: 결제 화면의 '카드로 결제 + 계정 만들기'로 샌드박스 개인 계정 생성 buyer.splitwright.demo@example.com / 비밀번호 SplitDemo#2026 (가짜 돈, 시험 카드 4012000033330026). 가입 직후 PayPal이 상점으로 돌려보내지 않아 돌아오는 주소를 직접 열어 캡처함.
- 영상 캡처: /Users/guggyeonghun/.aside/u/0/sessions/2026-11-13_yMUl1DqSj7Hrowmd/tmp/vid
- 00:50 두 번째 구매(구매자 로그인, 정상 복귀 확인) 2W415294RG1676306, 세 번째 구매 5K134307LE0806845는 하루 한도 $16로 보류 → 한도 300 복구 후 'Check again and pay'로 지급. 준 샌드박스 계정에 +$8.97 입금 확인. 웹훅 5건 수신(서명 확인).
- README 영어 작성·푸시 완료. 1단계 끝.
- 2단계 영상: 장면 이미지와 lines.txt(내레이션), tts.py, run.sh 가 tmp/vid 에 있음. 음성 n01~n11.wav 생성 중.
- 01:06 영상 완성 tmp/vid/splitwright_demo.mp4 (2분 22초). Devpost 초안 https://devpost.com/submit-to/31302-paypal-ai-hackathon/manage/submissions/1298756-splitwright (1·2단계 입력 중, 영상 주소만 남음). 유튜브 업로드 시작.
