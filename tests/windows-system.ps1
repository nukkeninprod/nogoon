# Destructive Windows system test. Run only on a disposable elevated runner.
[CmdletBinding()]
param(
    [string]$SetupPath = (Join-Path (Split-Path -Parent $PSScriptRoot) "scripts\setup.ps1")
)

$ErrorActionPreference = "Stop"
$env:NOGOON_NO_TRACK = "1"
$env:NOGOON_DESKTOP = "1"
$env:NOGOON_SKIP_BROWSER_CLOSE = "1"

function Assert-True([bool]$Condition, [string]$Message) {
    if (-not $Condition) { throw "ASSERTION FAILED: $Message" }
}

function Invoke-Setup([string]$Action, [switch]$Permanent) {
    $arguments = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $SetupPath, "-Action", $Action)
    if ($Permanent) { $arguments += "-Permanent" }
    $previousPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = "Continue"
        $output = & powershell.exe @arguments 2>&1
        $exitCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previousPreference
    }
    if ($exitCode -ne 0) { throw "setup.ps1 $Action failed ($exitCode): $($output -join ' ')" }
    return @($output)
}

function Get-PublicState {
    $output = Invoke-Setup "State"
    Assert-True ($output.Count -eq 1) "State must emit exactly one line of JSON."
    return ($output[0] | ConvertFrom-Json)
}

function Get-RegistrySnapshot([string]$Path, [string]$Name) {
    $keyExists = Test-Path -LiteralPath $Path
    $valueExists = $false; $value = $null; $kind = $null
    if ($keyExists) {
        $key = Get-Item -LiteralPath $Path
        if ($key.GetValueNames() -contains $Name) {
            $valueExists = $true
            $value = $key.GetValue($Name, $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
            $kind = $key.GetValueKind($Name).ToString()
        }
    }
    return [PSCustomObject]@{ Path = $Path; Name = $Name; KeyExists = $keyExists; ValueExists = $valueExists; Value = $value; Kind = $kind }
}

function Restore-RegistrySnapshot([object]$Snapshot) {
    if ($Snapshot.ValueExists) {
        if (-not (Test-Path -LiteralPath $Snapshot.Path)) { New-Item -Path $Snapshot.Path -Force | Out-Null }
        Set-ItemProperty -LiteralPath $Snapshot.Path -Name $Snapshot.Name -Value $Snapshot.Value -Type $Snapshot.Kind -Force
    } else {
        Remove-ItemProperty -LiteralPath $Snapshot.Path -Name $Snapshot.Name -ErrorAction SilentlyContinue
        if (-not $Snapshot.KeyExists -and (Test-Path -LiteralPath $Snapshot.Path)) {
            $key = Get-Item -LiteralPath $Snapshot.Path
            if ($key.GetValueNames().Count -eq 0 -and $key.GetSubKeyNames().Count -eq 0) { Remove-Item -LiteralPath $Snapshot.Path -Force }
        }
    }
}

function Get-DnsMode([Guid]$InterfaceGuid, [string]$Family) {
    $service = if ($Family -eq "IPv4") { "Tcpip" } else { "Tcpip6" }
    $path = "HKLM:\SYSTEM\CurrentControlSet\Services\$service\Parameters\Interfaces\{$InterfaceGuid}"
    $nameServer = (Get-ItemProperty -LiteralPath $path -Name NameServer -ErrorAction SilentlyContinue).NameServer
    if ([string]::IsNullOrWhiteSpace([string]$nameServer)) { return "automatic" }
    return "manual"
}

function Assert-DnsRestored([object[]]$Backup) {
    $adapters = @(Get-NetAdapter)
    foreach ($entry in @($Backup)) {
        $adapter = $adapters | Where-Object { $_.InterfaceGuid.ToString() -eq [string]$entry.InterfaceGuid } | Select-Object -First 1
        if (-not $adapter) { continue }
        Assert-True ((Get-DnsMode $adapter.InterfaceGuid "IPv4") -eq $entry.IPv4Mode) "IPv4 DNS mode was not restored for $($adapter.Name)."
        Assert-True ((Get-DnsMode $adapter.InterfaceGuid "IPv6") -eq $entry.IPv6Mode) "IPv6 DNS mode was not restored for $($adapter.Name)."
        if ($entry.IPv4Mode -eq "manual") {
            $actual = @((Get-DnsClientServerAddress -InterfaceIndex $adapter.ifIndex -AddressFamily IPv4).ServerAddresses)
            Assert-True (($actual -join ',') -eq (@($entry.IPv4) -join ',')) "IPv4 DNS servers were not restored for $($adapter.Name)."
        }
        if ($entry.IPv6Mode -eq "manual") {
            $actual = @((Get-DnsClientServerAddress -InterfaceIndex $adapter.ifIndex -AddressFamily IPv6).ServerAddresses)
            Assert-True (($actual -join ',') -eq (@($entry.IPv6) -join ',')) "IPv6 DNS servers were not restored for $($adapter.Name)."
        }
    }
}

if ($env:OS -ne "Windows_NT") { throw "This test requires Windows." }
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw "This test requires an elevated disposable runner." }
Assert-True (Test-Path -LiteralPath $SetupPath) "setup.ps1 was not found."

$hostsPath = Join-Path $env:SystemRoot "System32\drivers\etc\hosts"
$statePath = Join-Path $env:ProgramData "nogoon\state.json"
$cleanupPath = Join-Path $env:ProgramData "nogoon\cleanup.ps1"
$chromePath = "HKLM:\SOFTWARE\Policies\Google\Chrome"
$chromeName = "DnsOverHttpsMode"
$chromeOriginal = Get-RegistrySnapshot $chromePath $chromeName
$sections = [Security.AccessControl.AccessControlSections]::Access -bor [Security.AccessControl.AccessControlSections]::Owner -bor [Security.AccessControl.AccessControlSections]::Group
$hostsOriginalBytes = [Convert]::ToBase64String([IO.File]::ReadAllBytes($hostsPath))
$hostsOriginalAcl = (Get-Acl -LiteralPath $hostsPath).GetSecurityDescriptorSddlForm($sections)
$hostsOriginalAttributes = [int](Get-Item -LiteralPath $hostsPath -Force).Attributes
$cfaOriginal = try { [int](Get-MpPreference).EnableControlledFolderAccess } catch { $null }

try {
    Invoke-Setup "Cleanup" | Out-Null

    if (-not (Test-Path -LiteralPath $chromePath)) { New-Item -Path $chromePath -Force | Out-Null }
    Set-ItemProperty -LiteralPath $chromePath -Name $chromeName -Value "secure" -Type String -Force

    Invoke-Setup "Install" | Out-Null
    $freeState = Get-PublicState
    Assert-True ($freeState.mode -eq "free") "A default install must create a free trial."
    Assert-True (-not [string]::IsNullOrWhiteSpace($freeState.expiresAt)) "The free trial must have an expiry."
    Assert-True ($null -ne (Get-ScheduledTask -TaskName "NogoonCleanup" -ErrorAction SilentlyContinue)) "The cleanup task was not created."
    Assert-True (Select-String -LiteralPath $hostsPath -Pattern '^0\.0\.0\.0\s+www\.pornhub\.com\s*$' -Quiet) "The hosts block was not installed."
    $internalState = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
    $dnsBackup = @($internalState.Dns)
    $firstExpiry = $freeState.expiresAt

    Invoke-Setup "Install" | Out-Null
    Assert-True ((Get-PublicState).expiresAt -eq $firstExpiry) "A free rerun must not restart the trial."

    Invoke-Setup "Install" -Permanent | Out-Null
    Assert-True ((Get-PublicState).mode -eq "permanent") "Permanent install must upgrade an active trial."
    Assert-True ($null -eq (Get-ScheduledTask -TaskName "NogoonCleanup" -ErrorAction SilentlyContinue)) "Permanent mode must remove the expiry task."
    Invoke-Setup "Install" | Out-Null
    Assert-True ((Get-PublicState).mode -eq "permanent") "A free rerun must not downgrade permanent mode."

    Invoke-Setup "Cleanup" | Out-Null
    Assert-True ((Get-PublicState).mode -eq "none") "Cleanup must clear installed state."
    Assert-True ([Convert]::ToBase64String([IO.File]::ReadAllBytes($hostsPath)) -eq $hostsOriginalBytes) "Cleanup did not restore the hosts file bytes."
    Assert-True ((Get-Acl -LiteralPath $hostsPath).GetSecurityDescriptorSddlForm($sections) -eq $hostsOriginalAcl) "Cleanup did not restore the hosts ACL."
    Assert-True ([int](Get-Item -LiteralPath $hostsPath -Force).Attributes -eq $hostsOriginalAttributes) "Cleanup did not restore hosts attributes."
    Assert-True ((Get-ItemProperty -LiteralPath $chromePath -Name $chromeName).$chromeName -eq "secure") "Cleanup did not restore a pre-existing browser policy."
    Assert-DnsRestored $dnsBackup
    if ($null -ne $cfaOriginal) { Assert-True ([int](Get-MpPreference).EnableControlledFolderAccess -eq $cfaOriginal) "Controlled Folder Access was not restored." }

    Invoke-Setup "Install" | Out-Null
    $expired = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
    & takeown.exe /F $hostsPath /A | Out-Null
    & icacls.exe $hostsPath /grant '*S-1-5-32-544:F' | Out-Null
    (Get-Item -LiteralPath $hostsPath -Force).IsReadOnly = $false
    Add-Content -LiteralPath $hostsPath -Value "`r`n127.0.0.1 unrelated-system-test.invalid" -Encoding ASCII
    $expired.ExpiresAt = [DateTime]::UtcNow.AddMinutes(-5).ToString("o")
    $expired | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $statePath -Encoding UTF8
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $cleanupPath -Scheduled
    Assert-True ($LASTEXITCODE -eq 0) "Scheduled cleanup failed after a missed expiry."
    Assert-True ((Get-PublicState).mode -eq "none") "Scheduled cleanup did not clear an expired trial."
    Assert-True (Select-String -LiteralPath $hostsPath -SimpleMatch "127.0.0.1 unrelated-system-test.invalid" -Quiet) "Cleanup erased an unrelated hosts edit."
    & takeown.exe /F $hostsPath /A | Out-Null
    & icacls.exe $hostsPath /grant '*S-1-5-32-544:F' | Out-Null
    (Get-Item -LiteralPath $hostsPath -Force).IsReadOnly = $false
    [IO.File]::WriteAllBytes($hostsPath, [Convert]::FromBase64String($hostsOriginalBytes))
    $originalAcl = New-Object Security.AccessControl.FileSecurity
    $originalAcl.SetSecurityDescriptorSddlForm($hostsOriginalAcl)
    Set-Acl -LiteralPath $hostsPath -AclObject $originalAcl
    (Get-Item -LiteralPath $hostsPath -Force).Attributes = [IO.FileAttributes]$hostsOriginalAttributes

    Invoke-Setup "Install" -Permanent | Out-Null
    Assert-True ((Get-PublicState).mode -eq "permanent") "A fresh permanent install failed."
    Invoke-Setup "Cleanup" | Out-Null
    Assert-True ((Get-PublicState).mode -eq "none") "Permanent cleanup failed."

    Write-Host "Windows system install/upgrade/expiry/restore checks passed." -ForegroundColor Green
} finally {
    try { Invoke-Setup "Cleanup" | Out-Null } catch { Write-Warning $_ }
    try { Restore-RegistrySnapshot $chromeOriginal } catch { Write-Warning $_ }
    try {
        if ([Convert]::ToBase64String([IO.File]::ReadAllBytes($hostsPath)) -ne $hostsOriginalBytes) {
            & takeown.exe /F $hostsPath /A | Out-Null
            & icacls.exe $hostsPath /grant '*S-1-5-32-544:F' | Out-Null
            (Get-Item -LiteralPath $hostsPath -Force).IsReadOnly = $false
            [IO.File]::WriteAllBytes($hostsPath, [Convert]::FromBase64String($hostsOriginalBytes))
            $acl = New-Object Security.AccessControl.FileSecurity
            $acl.SetSecurityDescriptorSddlForm($hostsOriginalAcl)
            Set-Acl -LiteralPath $hostsPath -AclObject $acl
            (Get-Item -LiteralPath $hostsPath -Force).Attributes = [IO.FileAttributes]$hostsOriginalAttributes
        }
    } catch { Write-Warning $_ }
}
