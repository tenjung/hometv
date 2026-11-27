#!/usr/bin/env bash
# 집TV 앱 릴리스 (Mac): 빌드 → 서명 키 확인 → GitHub 릴리스(app-v버전)에 APK 업로드.
# 사용: app/build.gradle.kts 의 versionCode/versionName 을 올린 뒤
#   bash android/release.sh "바뀐 점"
# 필요: android/local.properties 에 sdk.dir, hometv.keystore(서명 키 경로). Android Studio(JDK), gh 로그인.
set -euo pipefail
NOTES="${1:-집TV 앱 업데이트}"
SRC="$(cd "$(dirname "$0")" && pwd)"
REPO="tenjung/hometv"
# 설치된 앱(v1.2~)과 같은 키인지 확인하는 인증서 SHA-256. 다르면 기존 앱 위에 업데이트가 안 된다.
EXPECTED_CERT="ccca9eed8b206b23bb0438f2ca5ef255a57dd871213ccb769d21fe26830559d5"

export JAVA_HOME="${JAVA_HOME:-/Applications/Android Studio.app/Contents/jbr/Contents/Home}"
SDK="$(grep '^sdk.dir=' "$SRC/local.properties" | cut -d= -f2-)"
grep -q '^hometv.keystore=' "$SRC/local.properties" || { echo "local.properties 에 hometv.keystore 가 없습니다."; exit 1; }

VERSION="$(grep -o 'versionName = "[^"]*"' "$SRC/app/build.gradle.kts" | cut -d'"' -f2)"
TAG="app-v$VERSION"
if gh release view "$TAG" -R "$REPO" >/dev/null 2>&1; then echo "$TAG 릴리스가 이미 있습니다. versionCode/versionName 을 올려 주세요."; exit 1; fi

GRADLE="$(ls -d "$HOME"/.gradle/wrapper/dists/gradle-8.*-bin/*/gradle-8.*/bin/gradle 2>/dev/null | tail -1)"
[ -x "$GRADLE" ] || GRADLE="$(command -v gradle)"
(cd "$SRC" && "$GRADLE" --no-daemon -q assembleRelease)

APK="$SRC/HomeTV.apk"
cp "$SRC/app/build/outputs/apk/release/app-release.apk" "$APK"
BT="$(ls -d "$SDK"/build-tools/* | sort -V | tail -1)"
CERT="$("$BT/apksigner" verify --print-certs "$APK" | grep 'SHA-256 digest' | head -1 | awk '{print $NF}')"
if [ "$CERT" != "$EXPECTED_CERT" ]; then echo "서명 키가 설치된 앱과 다릅니다 ($CERT). 릴리스를 멈춥니다."; exit 1; fi

gh release create "$TAG" "$APK" -R "$REPO" --title "집TV 앱 $VERSION" --notes "$NOTES"
echo "릴리스 완료: https://github.com/$REPO/releases/tag/$TAG"
