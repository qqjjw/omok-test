# 함께 두는 바둑판 · omok-test

GitHub Pages 화면과 Render WebSocket 서버로 구성한 2인 공유 바둑판 MVP입니다.

- 15×15 판에서 누구나 흑돌·백돌을 선택해 놓거나 기존 돌을 삭제할 수 있습니다.
- 돌 색을 사용자에게 배정하지 않으며 차례, 승패, 금수 규칙을 적용하지 않습니다.
- 서버 전체에서 최대 2개 연결을 허용합니다. 브라우저 탭 하나가 한 자리를 차지합니다.
- 두 사용자에게 서버가 확정한 동일한 판을 전달합니다. 동시에 수정하면 먼저 처리한 요청을 적용하고 오래된 요청은 거절합니다.
- 연결이 끊기면 자동 재접속하고 현재 판을 다시 받습니다. 인원이 가득 찬 경우 자리가 비면 ‘연결하기’를 다시 누르세요.

## 구성

```text
GitHub Pages → 브라우저의 HTML / CSS / JavaScript
                         ↕ WSS
                 Render의 Node.js 서버
                 판 상태는 서버 메모리에 저장
```

게임 중 GitHub API 요청이나 git push는 하지 않습니다. push는 코드 배포에만 사용합니다.

## Render 배포

### 방법 1: Blueprint

Render에 GitHub를 연결하고 `qqjjw/omok-test` 저장소 접근을 허용하세요.
**New → Blueprint**에서 이 저장소를 선택하면 루트의 `render.yaml`로 무료 Web Service를 만들 수 있습니다.

### 방법 2: Web Service 수동 설정

**New → Web Service**에서 이 저장소를 선택하고 다음을 입력하세요.

| 설정 | 값 |
|---|---|
| Branch | `main` |
| Language / Runtime | Node |
| Root Directory | **비워 두기** |
| Build Command | `npm ci --prefix server` |
| Start Command | `npm start --prefix server` |
| Instance Type | Free |
| Region | Singapore (선택 가능하면) |
| Health Check Path | `/health` |

환경변수 `NODE_VERSION=22`를 설정하세요. `ALLOWED_ORIGINS`는 기본값이 `https://qqjjw.github.io`입니다.
다른 Pages 도메인도 허용하려면 쉼표로 구분해 입력하세요. Render 서버 자체에서 제공하는 화면도 접속할 수 있습니다.
서버는 Render가 지정한 `PORT`를 사용하며 `0.0.0.0`에서 요청을 받습니다.

배포가 끝나면 `https://서비스이름.onrender.com/health`에서 상태를 확인하세요.
`https://서비스이름.onrender.com/`에서도 바둑판이 열리고 서버에 자동으로 연결됩니다.

## GitHub Pages 연결

1. 저장소 **Settings → Pages → Build and deployment**에서 **Deploy from a branch**, `main`, `/(root)`를 선택하고 저장합니다.
2. `https://qqjjw.github.io/omok-test/`를 엽니다.
3. **Render 서버 주소** 칸에 `https://서비스이름.onrender.com`을 입력하고 **연결하기**를 누릅니다.
4. **초대 링크 복사**를 눌러 친구에게 전달합니다. 링크에 서버 주소가 포함되어 친구가 별도로 설정할 필요가 없습니다.

서버 주소는 현재 브라우저에도 저장됩니다. GitHub Pages에서는 HTTPS/WSS 주소를 사용해야 합니다.

## 로컬 실행·검증

Node.js 22 이상을 사용하세요.

```bash
cd server
npm ci
npm test
npm start
```

`http://localhost:8080`을 엽니다. 두 탭으로 테스트할 수 있습니다.
같은 Wi-Fi에서는 `http://서버의내부IP:8080`으로 접속하고, 화면의 서버 주소에 같은 주소를 입력하세요.

테스트는 2인 동기화, 세 번째 연결 거절, 자유로운 색상 선택·돌 삭제, 오래된 수정 및 잘못된 좌표 거절,
재접속 상태 복구, 브라우저 Origin 제한을 검증합니다.

## MVP의 제한

- DB를 사용하지 않습니다. 서버가 재시작되거나 Render가 재배포하면 판이 초기화됩니다.
- Render 무료 인스턴스는 유휴 상태에서 정지할 수 있으며, 다음 접속에서 기동 대기가 발생할 수 있습니다.
  화면은 기다리는 동안 자동 재접속합니다. 항상 실행되는 서버나 영구 저장을 보장하지 않습니다.
- 단일 공유 판입니다. 방 코드, 계정, 관전자, 비공개 초대 인증은 없습니다.
  주소를 아는 사람은 빈 자리에 접속해 판을 조작할 수 있습니다. Origin 제한은 사용자 인증이 아닙니다.
- 허용된 사용자 둘 모두 자유롭게 돌을 지울 수 있습니다. 추가 연결은 거절하며, 끊긴 연결은 heartbeat로 정리합니다.

## 원래 요구사항

승패 판정과 게임 규칙 없이 실제 바둑판처럼 두 플레이어가 돌을 선택해 놓고 삭제할 수 있는 테스트 MVP.
초기 sandbox 백엔드 검토에서 공개 접속 경로를 확보하지 못하여, 백엔드 호스팅은 Render로 변경했습니다.
