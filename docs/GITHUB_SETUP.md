# GitHub 저장소 설정 가이드

## 📁 저장소 정보
- **URL**: https://github.com/service0427/v3_hub_agent
- **브랜치**: `main`
- **라이센스**: MIT

## 🚀 프로젝트 클론 및 설정

### 1. 저장소 클론
```bash
# HTTPS 클론
git clone https://github.com/service0427/v3_hub_agent.git
cd v3_hub_agent

# SSH 클론 (권장)
git clone git@github.com:service0427/v3_hub_agent.git
cd v3_hub_agent
```

### 2. 브랜치 확인 및 설정
```bash
# 현재 브랜치 확인
git branch

# 원격 브랜치 확인
git branch -r

# main 브랜치로 전환 (이미 main이면 생략)
git checkout main
```

### 3. 의존성 설치
```bash
# 허브 서버
cd hub/
npm install
cd ../

# 에이전트
cd agent/
npm install
cd ../
```

## 🔧 개발 워크플로우

### 브랜치 전략
```bash
# 새 기능 개발
git checkout -b feature/new-feature
# 개발 작업...
git add .
git commit -m "feat: 새로운 기능 추가"
git push origin feature/new-feature

# Pull Request 생성 후 main으로 병합
```

### 커밋 메시지 규칙
```
feat: 새로운 기능 추가
fix: 버그 수정
docs: 문서 수정
style: 코드 포맷팅
refactor: 코드 리팩토링
test: 테스트 추가/수정
chore: 빌드/설정 변경
```

## 📦 릴리즈 관리

### 버전 태깅
```bash
# 새 버전 태그 생성
git tag -a v3.0.0 -m "Release version 3.0.0"
git push origin v3.0.0

# 모든 태그 확인
git tag -l
```

### 릴리즈 노트 작성
- GitHub Releases 페이지에서 릴리즈 노트 작성
- 주요 변경사항, 버그 수정 내용 포함
- 배포 가이드 링크 제공

## 🤝 협업 가이드

### Pull Request 규칙
1. **제목**: 명확하고 간결한 제목 작성
2. **설명**: 변경 내용과 이유 상세 기술
3. **테스트**: 테스트 결과 첨부
4. **리뷰**: 최소 1명 이상의 리뷰 필요

### 코드 리뷰 체크리스트
- [ ] 코딩 스타일 준수
- [ ] 테스트 케이스 포함
- [ ] 문서 업데이트
- [ ] 보안 취약점 확인
- [ ] 성능 영향 검토

## 🔒 보안 설정

### GitHub Secrets 설정
```
# Actions에서 사용할 비밀 정보
DB_HOST=mkt.techb.kr
DB_USER=techb_pp
DB_PASS=Tech1324!
DOCKER_USERNAME=your_docker_username
DOCKER_PASSWORD=your_docker_password
```

### .gitignore 확인
```bash
# 민감한 정보가 커밋되지 않도록 확인
cat .gitignore
```

## 📋 이슈 템플릿

### 버그 리포트
```markdown
## 버그 설명
버그에 대한 명확하고 간결한 설명

## 재현 단계
1. '...' 로 이동
2. '....' 클릭
3. '....' 스크롤
4. 오류 확인

## 예상 동작
정상적으로 작동해야 하는 내용

## 실제 동작
실제로 발생한 내용

## 환경
- OS: [예: Windows 11]
- 브라우저: [예: Chrome 120]
- 버전: [예: v3.0.0]
```

### 기능 요청
```markdown
## 기능 설명
새로운 기능에 대한 명확하고 간결한 설명

## 해결하고자 하는 문제
이 기능이 해결하는 문제점

## 제안하는 해결책
원하는 동작에 대한 설명

## 대안
고려해본 다른 해결책들
```

## 🚀 CI/CD 설정

### GitHub Actions (예정)
```yaml
# .github/workflows/ci.yml
name: CI/CD Pipeline

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'
    - name: Install dependencies
      run: |
        cd hub && npm install
        cd ../agent && npm install
    - name: Run tests
      run: |
        cd hub && npm test
```

## 📊 프로젝트 상태

### 배지 (Badges)
```markdown
![GitHub release](https://img.shields.io/github/release/service0427/v3_hub_agent)
![GitHub issues](https://img.shields.io/github/issues/service0427/v3_hub_agent)
![GitHub license](https://img.shields.io/github/license/service0427/v3_hub_agent)
```

### 기여자 가이드
1. Fork 저장소
2. 새 브랜치 생성
3. 변경사항 커밋
4. Pull Request 생성
5. 리뷰 및 병합

## 📞 지원 및 문의

### 이슈 등록
- 버그 리포트: GitHub Issues 사용
- 기능 요청: GitHub Issues 사용
- 보안 취약점: 비공개로 연락

### 문서 업데이트
- README.md 최신 상태 유지
- API 문서 자동 생성
- 변경사항 CHANGELOG.md에 기록

---

**주의**: 민감한 정보 (패스워드, API 키 등)는 절대 커밋하지 마세요. .env.example 파일만 커밋하고 실제 .env 파일은 .gitignore에 포함되어 있습니다.