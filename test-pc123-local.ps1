$ErrorActionPreference = "Stop"
$env:PYTHONIOENCODING = "utf-8"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path

Invoke-RestMethod -Uri "http://127.0.0.1:7000/health" | ConvertTo-Json -Depth 6
Invoke-RestMethod -Uri "http://127.0.0.1:9000/health" | ConvertTo-Json -Depth 6

Push-Location -LiteralPath (Join-Path $Root "pc2-smart-mirror-aiot-coaching\pc2_coach_server")
try {
    uv run --with-requirements requirements.txt python scripts/smoke_pc2.py --base-url http://127.0.0.1:7000
    if ($LASTEXITCODE -ne 0) {
        throw "PC2 smoke failed with exit code $LASTEXITCODE"
    }
} finally {
    Pop-Location
}

Push-Location -LiteralPath (Join-Path $Root "pc3-vision-gateway")
try {
    uv run --with-requirements requirements.txt python scripts/check_pc1_gateway.py --base-url http://127.0.0.1:9000
    if ($LASTEXITCODE -ne 0) {
        throw "PC1 to PC3 gateway check failed with exit code $LASTEXITCODE"
    }

    uv run --with-requirements requirements.txt python scripts/check_pc2_bridge.py
    if ($LASTEXITCODE -ne 0) {
        throw "PC3 to PC2 bridge check failed with exit code $LASTEXITCODE"
    }
} finally {
    Pop-Location
}

Invoke-WebRequest -Uri "http://localhost:1420" -UseBasicParsing | Select-Object StatusCode, StatusDescription
Write-Output "PC123_LOCAL_TEST_OK"
