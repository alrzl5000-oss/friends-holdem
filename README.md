# 친구 홀덤 ♠♥♣♦

친구들끼리 하는 텍사스 홀덤 웹게임 (실시간 채팅 포함). 진짜 돈 없이 칩으로만 플레이.

- 방 만들기 → 4자리 코드 / 초대 링크로 입장 (최대 8명)
- 노리밋 홀덤, 사이드팟·스플릿팟 자동 계산
- 내 차례 30초 제한 (시간 넘으면 자동 체크/폴드)
- 새로고침·접속 끊김 후 다시 들어오면 같은 자리로 복귀
- 칩 다 잃으면 리바이 버튼
- 모바일 지원

## 1. 내 컴퓨터에서 실행해보기

[Node.js](https://nodejs.org) (18 이상) 설치 후:

```bash
npm install
npm start
```

브라우저에서 http://localhost:3000 열기. 창을 여러 개 띄우면 혼자서도 테스트 가능 (시크릿 창 써야 서로 다른 사람으로 인식돼요).

## 2. GitHub에 올리기

1. https://github.com/new 에서 새 저장소 만들기 (예: `friends-holdem`, README 추가 체크 해제)
2. 이 폴더에서:

```bash
git init
git add .
git commit -m "first commit"
git branch -M main
git remote add origin https://github.com/내아이디/friends-holdem.git
git push -u origin main
```

> 터미널이 불편하면 GitHub 저장소 페이지의 **uploading an existing file** 링크로 파일을 드래그해서 올려도 돼요. (`node_modules` 폴더는 올리지 마세요)

## 3. Railway로 배포

1. https://railway.com 로그인 (GitHub 계정으로)
2. **New Project → Deploy from GitHub repo** → 방금 만든 저장소 선택
3. 배포가 끝나면 서비스 클릭 → **Settings → Networking → Generate Domain**
4. 생긴 주소(`xxx.up.railway.app`)로 접속 → 방 만들고 **초대 링크 복사** 해서 친구들한테 보내기

별도 설정 필요 없어요. Railway가 `npm start`로 실행하고 포트도 자동으로 잡아요.
GitHub에 새로 push하면 Railway가 자동으로 다시 배포해요.

> 서버가 재시작되면(재배포 등) 진행 중인 방은 사라져요. 게임 중엔 push 하지 마세요.

## 설정 바꾸기

`game.js` 맨 위에서 수정:

| 항목 | 기본값 |
|---|---|
| `START_CHIPS` 시작 칩 | 1000 |
| `SMALL_BLIND` / `BIG_BLIND` | 10 / 20 |
| `TURN_MS` 차례 제한시간 | 30초 |
| `MAX_SEATS` 최대 인원 | 8 |

## 파일 구조

```
server.js        서버 (방, 채팅, 접속 관리)
game.js          홀덤 규칙 (셔플, 베팅, 족보 판정, 팟 분배)
public/
  index.html     화면
  style.css      디자인
  client.js      화면 동작
```

카드는 서버에서만 섞고, 각 사람에게는 자기 카드만 보내기 때문에 개발자도구로 남의 패를 훔쳐볼 수 없어요.
