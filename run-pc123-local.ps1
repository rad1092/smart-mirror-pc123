param(
    [switch]$Tauri
)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$RunDir = Join-Path $Root ".run"
New-Item -ItemType Directory -Force -Path $RunDir | Out-Null

function Start-LoggedProcess {
    param(
        [string]$Name,
        [string]$WorkDir,
        [string[]]$Command
    )

    $OutLog = Join-Path $RunDir "$Name.out.log"
    $ErrLog = Join-Path $RunDir "$Name.err.log"
    $PidFile = Join-Path $RunDir "$Name.pid"

    if (Test-Path -LiteralPath $PidFile) {
        $ExistingPid = Get-Content -LiteralPath $PidFile -ErrorAction SilentlyContinue
        if ($ExistingPid -and (Get-Process -Id ([int]$ExistingPid) -ErrorAction SilentlyContinue)) {
            Write-Output "$Name already running pid=$ExistingPid"
            return
        }
    }

    $Process = Start-Process `
        -FilePath $Command[0] `
        -ArgumentList $Command[1..($Command.Length - 1)] `
        -WorkingDirectory $WorkDir `
        -RedirectStandardOutput $OutLog `
        -RedirectStandardError $ErrLog `
        -PassThru `
        -WindowStyle Hidden

    Set-Content -LiteralPath $PidFile -Value $Process.Id
    Write-Output "started $Name pid=$($Process.Id)"
}

function Wait-Http {
    param(
        [string]$Name,
        [string]$Url,
        [int]$Seconds = 90
    )

    for ($i = 0; $i -lt $Seconds; $i++) {
        try {
            Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2 | Out-Null
            Write-Output "$Name ready: $Url"
            return
        } catch {
            Start-Sleep -Seconds 1
        }
    }
    throw "$Name did not become ready: $Url"
}

$Pc2Dir = Join-Path $Root "pc2-smart-mirror-aiot-coaching\pc2_coach_server"
$Pc3Dir = Join-Path $Root "pc3-vision-gateway"
$Pc1Dir = Join-Path $Root "pc1-smart-mirror"

Start-LoggedProcess -Name "pc2" -WorkDir $Pc2Dir -Command @(
    "powershell.exe",
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    (Join-Path $Pc2Dir "scripts\run_pc2.ps1")
)

Start-LoggedProcess -Name "pc3" -WorkDir $Pc3Dir -Command @(
    "powershell.exe",
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    (Join-Path $Pc3Dir "scripts\run_pc3.ps1")
)

if ($Tauri) {
    Start-LoggedProcess -Name "pc1" -WorkDir $Pc1Dir -Command @("cmd.exe", "/c", "npm run tauri -- dev")
} else {
    Start-LoggedProcess -Name "pc1" -WorkDir $Pc1Dir -Command @("cmd.exe", "/c", "npm run dev")
}

Wait-Http -Name "PC2" -Url "http://127.0.0.1:7000/health"
Wait-Http -Name "PC3" -Url "http://127.0.0.1:9000/health"
Wait-Http -Name "PC1" -Url "http://localhost:1420"

Write-Output "PC1: http://localhost:1420"
Write-Output "PC2: http://127.0.0.1:7000"
Write-Output "PC3: http://127.0.0.1:9000"
Write-Output "Logs: $RunDir"
