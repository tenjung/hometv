# 집TV: Vercel 운영 환경에 가족·관리자 PIN 저장. 입력한 숫자는 화면에 보이지 않습니다.
$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)

function Read-Pin($label) {
    while ($true) {
        $secure = Read-Host "$label 입력 (숫자 6~12자리, 화면에 안 보임)" -AsSecureString
        $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
        if ($plain -match '^\d{6,12}$') { return $plain }
        Write-Host "숫자 6~12자리로 다시 입력해 주세요." -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "=== 집TV 외부 접속용 PIN 설정 ===" -ForegroundColor Cyan
Write-Host ""
$family = Read-Pin "가족 PIN"
$admin = Read-Pin "관리자 PIN (가족 PIN과 같아도 됨)"

foreach ($pair in @(@("FAMILY_PIN", $family), @("ADMIN_PIN", $admin))) {
    $name = $pair[0]
    vercel env rm $name production --yes 2>$null | Out-Null
    $pair[1] | vercel env add $name production --sensitive 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { $pair[1] | vercel env add $name production 2>&1 | Out-Null }
}
$family = $null; $admin = $null

$names = (vercel env ls production 2>&1 | Select-String -Pattern "FAMILY_PIN|ADMIN_PIN").Count
Write-Host ""
if ($names -ge 2) { Write-Host "저장 완료! 이 창을 닫고 Claude에게 '입력했어'라고 알려 주세요." -ForegroundColor Green }
else { Write-Host "저장이 확인되지 않았어요. Claude에게 알려 주세요." -ForegroundColor Red }
