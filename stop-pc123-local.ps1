$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$RunDir = Join-Path $Root ".run"
$Ports = @(1420, 7000, 9000)

function Stop-ProcessTree {
    param([int]$ProcessId)

    $Children = Get-CimInstance Win32_Process |
        Where-Object { $_.ParentProcessId -eq $ProcessId } |
        Select-Object -ExpandProperty ProcessId

    foreach ($ChildId in $Children) {
        Stop-ProcessTree -ProcessId ([int]$ChildId)
    }

    $Process = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
    if ($Process) {
        Stop-Process -Id $Process.Id -Force
        Write-Output "stopped pid=$($Process.Id) name=$($Process.ProcessName)"
    }
}

if (-not (Test-Path -LiteralPath $RunDir)) {
    New-Item -ItemType Directory -Force -Path $RunDir | Out-Null
}

$Targets = @()
foreach ($PidFile in Get-ChildItem -LiteralPath $RunDir -Filter "*.pid") {
    $PidText = Get-Content -LiteralPath $PidFile.FullName -ErrorAction SilentlyContinue
    if ($PidText) {
        $Targets += [int]$PidText
    }
    Remove-Item -LiteralPath $PidFile.FullName -Force
}

$ListenerPids = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
    Where-Object { $_.LocalPort -in $Ports } |
    Select-Object -ExpandProperty OwningProcess -Unique

$Targets += $ListenerPids
$Targets = $Targets | Where-Object { $_ } | Sort-Object -Unique

foreach ($ProcessId in $Targets) {
    Stop-ProcessTree -ProcessId ([int]$ProcessId)
}
