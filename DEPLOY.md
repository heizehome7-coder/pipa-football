# PIPA 무료 배포 (Render)

게임 화면 + 실시간 대결 서버가 **Render 웹 서비스 하나**로 올라갑니다. 설정은 `render.yaml`에 이미 들어 있습니다.

## 1. GitHub에 올리기
1. https://github.com 가입 → 오른쪽 위 **+ → New repository**
2. 이름 `pipa-football`, Public 또는 Private → **Create repository**
3. 생성된 페이지에서 **uploading an existing file** 클릭
4. 압축을 푼 `pipa` 폴더 **안의 내용 전부**(src, server, scripts, package.json, render.yaml …)를 드래그 → **Commit changes**
   - `node_modules`, `dist` 폴더는 올리지 않습니다 (zip에 포함되어 있지 않음)
   - `.gitignore`처럼 점으로 시작하는 파일이 안 보이면 없어도 괜찮습니다

## 2. Render에 배포
1. https://render.com → **Get Started** → **GitHub로 가입**
2. 대시보드 **+ New → Blueprint**
3. GitHub 연결 → `pipa-football` 저장소 선택 → **Connect**
4. `pipa-football` 서비스(무료 플랜)가 보이면 **Apply / Deploy Blueprint**
5. 빌드 로그가 끝나고 **Live**가 되면(3~5분) 상단의 `https://pipa-football-xxxx.onrender.com` 주소가 게임 주소

> Blueprint가 안 보이면: **New → Web Service** → 저장소 선택 →
> Build Command `npm ci --include=dev && npm run build`, Start Command `node server/realtime-server.mjs`, Instance Type **Free**.

## 3. 친구와 플레이
- 주소를 카톡 등으로 공유 → 친구는 닉네임+비밀번호만 입력하면 끝 (계정·앱 설치 불필요)
- 둘 다 **온라인**을 누르면 서로 목록에 보입니다

## 참고
- 무료 플랜은 15분 동안 접속이 없으면 잠듭니다 → 첫 접속은 최대 1분 걸림 (그다음부터 빠름)
- 접속 중(로비 연결 유지)에는 잠들지 않습니다
- 수정본 반영: GitHub 저장소에 바뀐 파일을 다시 업로드 → Render가 자동으로 재배포
- 정상 동작 확인: `https://주소/health` → `{"ok":true,...}`
