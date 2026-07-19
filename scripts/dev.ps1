# AC Server Manager — Dev helper
# Run from project root: .\scripts\dev.ps1

param(
    [switch]$Install,
    [switch]$Build,
    [switch]$Clean
)

$ProjectRoot = Split-Path $PSScriptRoot -Parent

Set-Location $ProjectRoot

if ($Clean) {
    Write-Host "Cleaning build artifacts..." -ForegroundColor Yellow
    Remove-Item -Recurse -Force dist, dist-electron -ErrorAction SilentlyContinue
    Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
    Write-Host "Clean done." -ForegroundColor Green
    exit
}

if ($Install -or -not (Test-Path "node_modules")) {
    Write-Host "Installing dependencies..." -ForegroundColor Cyan
    npm install
    if ($LASTEXITCODE -ne 0) { Write-Error "npm install failed"; exit 1 }
}

if ($Build) {
    Write-Host "Building distributable..." -ForegroundColor Cyan
    npm run build
    if ($LASTEXITCODE -ne 0) { Write-Error "Build failed"; exit 1 }
    $exe = Get-ChildItem "dist-electron\*.exe" | Select-Object -First 1
    Write-Host "Built: $($exe.FullName)" -ForegroundColor Green
    exit
}

# Default: dev mode
Write-Host "Starting dev server..." -ForegroundColor Cyan
Write-Host "  Vite:     http://localhost:5173" -ForegroundColor Gray
Write-Host "  Electron: will open automatically" -ForegroundColor Gray
Write-Host ""
npm run dev
