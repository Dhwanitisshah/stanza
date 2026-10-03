# Runs the full quality gate in order; stops at the first failure.
$ErrorActionPreference = "Continue"
Set-Location (Split-Path -Parent $PSScriptRoot)

$steps = @("typecheck", "lint", "test", "build")

foreach ($step in $steps) {
    Write-Host "`n>>> npm run $step" -ForegroundColor Cyan
    npm run $step
    if ($LASTEXITCODE -ne 0) {
        Write-Host "FAIL  $step" -ForegroundColor Red
        exit 1
    }
    Write-Host "PASS  $step" -ForegroundColor Green
}

Write-Host "`nALL STEPS PASSED" -ForegroundColor Green
exit 0
