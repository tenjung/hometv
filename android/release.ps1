# 집TV 앱 릴리스: 빌드 → GitHub 릴리스(app-v버전)에 APK 업로드.
# 사용: app/build.gradle.kts 의 versionCode/versionName 을 올린 뒤
#   powershell -File release.ps1 -Notes "바뀐 점"
param([string]$Notes = "집TV 앱 업데이트")
$ErrorActionPreference = "Stop"

$T = "C:\Users\VICTUS\.hometv-android"
$B = "$T\build-src"
$Src = $PSScriptRoot
$Repo = "tenjung/hometv"
$Gh = "C:\Program Files\GitHub CLI\gh.exe"

$gradleFile = Get-Content "$Src\app\build.gradle.kts" -Raw
$version = [regex]::Match($gradleFile, 'versionName\s*=\s*"([^"]+)"').Groups[1].Value
if (-not $version) { throw "versionName 을 찾지 못했습니다." }
$tag = "app-v$version"

& $Gh release view $tag -R $Repo *> $null
if ($LASTEXITCODE -eq 0) { throw "$tag 릴리스가 이미 있습니다. versionCode/versionName 을 올려 주세요." }

# 경로에 한글이 있으면 Android 빌드가 실패하므로 영문 경로로 복사해 빌드한다.
robocopy $Src $B /MIR /XD build .gradle /NFL /NDL /NJH /NJS | Out-Null
$env:JAVA_HOME = "$T\jdk-17.0.21.1+2"
$env:ANDROID_HOME = "$T\sdk"
$env:GRADLE_USER_HOME = "$T\gradle-home"
$env:Path = "$env:JAVA_HOME\bin;$env:Path"
Push-Location $B
try {
    & "$T\gradle-8.9\bin\gradle.bat" --no-daemon -q assembleRelease
    if ($LASTEXITCODE -ne 0) { throw "빌드 실패" }
} finally { Pop-Location }

$apk = Join-Path $Src "HomeTV.apk"
Copy-Item "$B\app\build\outputs\apk\release\app-release.apk" $apk -Force

& $Gh release create $tag $apk -R $Repo --title "집TV 앱 $version" --notes $Notes
if ($LASTEXITCODE -ne 0) { throw "릴리스 업로드 실패" }
Write-Host "릴리스 완료: https://github.com/$Repo/releases/tag/$tag"
