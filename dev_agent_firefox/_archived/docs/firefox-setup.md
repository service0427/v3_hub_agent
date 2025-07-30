# Firefox 설정 가이드

## 문제점
Ubuntu 22.04 이상에서는 Firefox가 snap 패키지로 기본 설치되어 있어 Playwright와 호환성 문제가 발생합니다.

### Snap Firefox의 문제:
- GTK+ 2.x와 3.x 라이브러리 충돌
- Playwright의 프로필 관리와 호환되지 않음
- 샌드박스 환경으로 인한 제약

## 해결 방법

### 옵션 1: Playwright의 Firefox 사용 (권장)
```javascript
// 별도 설정 없이 사용
browser = await firefox.launch(launchOptions);
```
- Playwright가 자동으로 Firefox Developer Edition 다운로드
- 안정적이고 테스트 환경에 최적화됨
- 단점: "Nightly"로 표시될 수 있음

### 옵션 2: Mozilla PPA에서 Firefox 설치
```bash
# Snap Firefox 제거
sudo snap remove firefox

# Mozilla PPA 추가
sudo add-apt-repository ppa:mozillateam/ppa

# Firefox 우선순위 설정
echo '
Package: *
Pin: release o=LP-PPA-mozillateam
Pin-Priority: 1001
' | sudo tee /etc/apt/preferences.d/mozilla-firefox

# Firefox 설치
sudo apt update
sudo apt install firefox

# 자동 업데이트 설정
echo 'Unattended-Upgrade::Allowed-Origins:: "LP-PPA-mozillateam:${distro_codename}";' | sudo tee /etc/apt/apt.conf.d/51unattended-upgrades-firefox
```

### 옵션 3: Firefox ESR 설치
```bash
# Firefox ESR (Extended Support Release) 설치
sudo apt install firefox-esr
```

## 현재 권장사항
Playwright의 Firefox를 사용하는 것이 가장 안정적입니다. 브라우저 창 제목으로 Firefox와 Firefox Nightly를 구분할 수 있도록 코드에서 처리하고 있습니다.