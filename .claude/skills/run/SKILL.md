---
description: App Launch & Deploy — 로컬 실행 및 GitHub Pages 배포 방법
---

# App Launch & Deploy Skill

## 로컬 실행
- 이 프로젝트는 순수 HTML/CSS/JS 정적 파일이야
- 로컬 실행: VS Code에서 index.html을 브라우저로 열거나
  터미널에서 `start index.html` (Windows) 실행
- 라이브 서버가 필요하면 VS Code Live Server 익스텐션 사용

## 배포 방법 (GitHub Pages)
1. 변경사항 저장 후 터미널에서:
   git add .
   git commit -m "업데이트 내용"
   git push origin main

2. GitHub 저장소 Settings → Pages → Branch: main / folder: root(/) → Save

3. 배포 URL: https://[GitHub아이디].github.io/[저장소명]/

## 공유
- 배포 완료 후 위 URL을 그대로 공유하면 누구나 접근 가능
- 별도 서버, 로그인 불필요
- 코드 변경 후 git push하면 1~2분 내 자동 반영

## 주의사항
- API 키는 절대 커밋하지 말 것 (.gitignore 또는 환경변수 사용)
- 정적 파일이므로 백엔드 로직은 외부 API로 처리
