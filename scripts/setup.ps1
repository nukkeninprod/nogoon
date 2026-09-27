# nogoon.io Windows installer. PowerShell 5.1 compatible.
[CmdletBinding()]
param(
    [ValidateSet("Install", "Cleanup", "State")]
    [string]$Action = "Install",
    [switch]$Permanent
)

$ErrorActionPreference = "Stop"

$script:ProductDir = Join-Path $env:ProgramData "nogoon"
$script:StateFile = Join-Path $script:ProductDir "state.json"
$script:CleanupScript = Join-Path $script:ProductDir "cleanup.ps1"
$script:TaskName = "NogoonCleanup"
$script:Marker = "# === NOGOON.IO ==="
$script:EndMarker = "# === END NOGOON.IO ==="
$script:TrialSeconds = 259200
$script:TrialHuman = "72 hours"
$script:HostsPath = Join-Path $env:SystemRoot "System32\drivers\etc\hosts"
# Replaced by /api/setup-ps1 when attribution is available.
$NOGOON_ATTR = ""

function Write-Step([string]$Message) { Write-Host "  -> $Message" -ForegroundColor Cyan }
function Write-Ok([string]$Message) { Write-Host "  OK $Message" -ForegroundColor Green }
function Write-Warn([string]$Message) { Write-Host "  !  $Message" -ForegroundColor Yellow }

function Test-Administrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Request-Elevation([string]$RequestedAction, [bool]$RequestedPermanent) {
    Write-Host "  Requesting administrator privileges..." -ForegroundColor Yellow
    if ($PSCommandPath) {
        $arguments = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ('"{0}"' -f $PSCommandPath), "-Action", $RequestedAction)
        if ($RequestedPermanent) { $arguments += "-Permanent" }
        Start-Process powershell.exe -Verb RunAs -ArgumentList ($arguments -join " ") | Out-Null
    } else {
        $permanentArgument = if ($RequestedPermanent) { " -Permanent" } else { "" }
        $command = "& ([scriptblock]::Create((Invoke-WebRequest -UseBasicParsing 'https://nogoon.io/setup.ps1').Content)) -Action $RequestedAction$permanentArgument"
        Start-Process powershell.exe -Verb RunAs -ArgumentList "-NoProfile -ExecutionPolicy Bypass -Command `"$command`"" | Out-Null
    }
}

function Read-InstallState([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path)) { return $null }
    try { return Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json }
    catch { throw "The nogoon installation state is unreadable: $($_.Exception.Message)" }
}

function Write-InstallState([object]$State, [string]$Path) {
    $directory = Split-Path -Parent $Path
    if (-not (Test-Path -LiteralPath $directory)) { New-Item -Path $directory -ItemType Directory -Force | Out-Null }
    $temporaryPath = "$Path.tmp"
    $State | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $temporaryPath -Encoding UTF8
    Move-Item -LiteralPath $temporaryPath -Destination $Path -Force
}

function Get-PublicState {
    $result = [ordered]@{ mode = "none"; expiresAt = $null }
    try {
        $state = Read-InstallState $script:StateFile
        if ($state -and $state.Status -eq "Active") {
            if ($state.Mode -eq "permanent") { $result.mode = "permanent" }
            elseif ($state.Mode -eq "free") { $result.mode = "free"; $result.expiresAt = $state.ExpiresAt }
        }
    } catch {}
    Write-Output ($result | ConvertTo-Json -Compress)
}

function Get-RegistryValueBackup([string]$Path, [string]$Name) {
    $keyExists = Test-Path -LiteralPath $Path
    $valueExists = $false
    $value = $null
    $kind = $null
    if ($keyExists) {
        $key = Get-Item -LiteralPath $Path
        if ($key.GetValueNames() -contains $Name) {
            $valueExists = $true
            $value = $key.GetValue($Name, $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
            $kind = $key.GetValueKind($Name).ToString()
        }
    }
    return [PSCustomObject]@{ Path = $Path; Name = $Name; KeyExisted = $keyExists; ValueExisted = $valueExists; Value = $value; Kind = $kind }
}

function Restore-RegistryValue([object]$Backup) {
    if ($Backup.ValueExisted) {
        if (-not (Test-Path -LiteralPath $Backup.Path)) { New-Item -Path $Backup.Path -Force | Out-Null }
        Set-ItemProperty -LiteralPath $Backup.Path -Name $Backup.Name -Value $Backup.Value -Type $Backup.Kind -Force
        return
    }
    if (Test-Path -LiteralPath $Backup.Path) {
        Remove-ItemProperty -LiteralPath $Backup.Path -Name $Backup.Name -ErrorAction SilentlyContinue
        if (-not $Backup.KeyExisted) {
            $key = Get-Item -LiteralPath $Backup.Path -ErrorAction SilentlyContinue
            if ($key -and $key.GetValueNames().Count -eq 0 -and $key.GetSubKeyNames().Count -eq 0) { Remove-Item -LiteralPath $Backup.Path -Force -ErrorAction SilentlyContinue }
        }
    }
}

function Get-DnsMode([Guid]$InterfaceGuid, [string]$Family) {
    $service = if ($Family -eq "IPv4") { "Tcpip" } else { "Tcpip6" }
    $path = "HKLM:\SYSTEM\CurrentControlSet\Services\$service\Parameters\Interfaces\{$InterfaceGuid}"
    if (-not (Test-Path -LiteralPath $path)) { return "automatic" }
    $nameServer = (Get-ItemProperty -LiteralPath $path -Name NameServer -ErrorAction SilentlyContinue).NameServer
    if ([string]::IsNullOrWhiteSpace([string]$nameServer)) { return "automatic" }
    return "manual"
}

function Get-DnsBackup {
    $result = @()
    foreach ($adapter in @(Get-NetAdapter -ErrorAction Stop | Where-Object { $_.Status -eq "Up" })) {
        $v4 = @((Get-DnsClientServerAddress -InterfaceIndex $adapter.ifIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue).ServerAddresses)
        $v6 = @((Get-DnsClientServerAddress -InterfaceIndex $adapter.ifIndex -AddressFamily IPv6 -ErrorAction SilentlyContinue).ServerAddresses)
        $result += [PSCustomObject]@{
            Index = [int]$adapter.ifIndex; InterfaceGuid = $adapter.InterfaceGuid.ToString(); Alias = $adapter.Name
            IPv4Mode = Get-DnsMode $adapter.InterfaceGuid "IPv4"; IPv6Mode = Get-DnsMode $adapter.InterfaceGuid "IPv6"
            IPv4 = $v4; IPv6 = $v6
        }
    }
    return @($result)
}

function Invoke-NetshDnsRestore([int]$Index, [string]$Protocol, [string]$Mode, [object[]]$Addresses) {
    $family = if ($Protocol -eq "IPv4") { "ipv4" } else { "ipv6" }
    $usableAddresses = @($Addresses | Where-Object { -not [string]::IsNullOrWhiteSpace([string]$_) })
    if ($Mode -eq "automatic" -or $usableAddresses.Count -eq 0) {
        & netsh interface $family set dnsservers name=$Index source=dhcp validate=no | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "Could not restore automatic $Protocol DNS on interface $Index." }
        return
    }
    & netsh interface $family set dnsservers name=$Index source=static address=$($usableAddresses[0]) register=primary validate=no | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Could not restore $Protocol DNS on interface $Index." }
    for ($i = 1; $i -lt $usableAddresses.Count; $i++) {
        & netsh interface $family add dnsservers name=$Index address=$($usableAddresses[$i]) index=$($i + 1) validate=no | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "Could not restore secondary $Protocol DNS on interface $Index." }
    }
}

function Restore-Dns([object[]]$Backup) {
    $currentAdapters = @(Get-NetAdapter -ErrorAction Stop)
    foreach ($entry in @($Backup)) {
        $adapter = $currentAdapters | Where-Object { $_.InterfaceGuid.ToString() -eq [string]$entry.InterfaceGuid } | Select-Object -First 1
        if (-not $adapter) { $adapter = $currentAdapters | Where-Object { $_.Name -eq [string]$entry.Alias } | Select-Object -First 1 }
        if (-not $adapter) { continue }
        Invoke-NetshDnsRestore ([int]$adapter.ifIndex) "IPv4" ([string]$entry.IPv4Mode) @($entry.IPv4)
        Invoke-NetshDnsRestore ([int]$adapter.ifIndex) "IPv6" ([string]$entry.IPv6Mode) @($entry.IPv6)
    }
}

function Get-CfaPreference { try { return [int](Get-MpPreference -ErrorAction Stop).EnableControlledFolderAccess } catch { return $null } }

function Set-CfaPreference([int]$Value) {
    $setting = switch ($Value) {
        0 { "Disabled" }; 1 { "Enabled" }; 2 { "AuditMode" }; 3 { "BlockDiskModificationOnly" }; 4 { "AuditDiskModificationOnly" }
        default { throw "Unsupported Controlled Folder Access setting: $Value" }
    }
    Set-MpPreference -EnableControlledFolderAccess $setting -ErrorAction Stop
}

function Enable-HostsWrite {
    $cfaOriginal = Get-CfaPreference
    try {
        if ($null -ne $cfaOriginal -and $cfaOriginal -ne 0) { Set-CfaPreference 0 }
        & takeown.exe /F $script:HostsPath /A | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "Could not take ownership of the hosts file." }
        & icacls.exe $script:HostsPath /grant '*S-1-5-32-544:F' | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "Could not grant hosts file access." }
        $hostsFile = Get-Item -LiteralPath $script:HostsPath -Force
        if ($hostsFile.IsReadOnly) { $hostsFile.IsReadOnly = $false }
        return $cfaOriginal
    } catch {
        if ($null -ne $cfaOriginal) { try { Set-CfaPreference ([int]$cfaOriginal) } catch {} }
        throw
    }
}

function Restore-CfaPreference([object]$Original) {
    if ($null -eq $Original) { return }
    $current = Get-CfaPreference
    if ($null -eq $current -or $current -ne [int]$Original) { Set-CfaPreference ([int]$Original) }
}

function Remove-NogoonHostsBlock {
    $content = Get-Content -LiteralPath $script:HostsPath -Raw
    $start = [Regex]::Escape($script:Marker); $finish = [Regex]::Escape($script:EndMarker)
    $updated = [Regex]::Replace($content, "(?ms)^\s*$start.*?^\s*$finish\s*(?:\r?\n)?", "")
    if ($updated -ne $content) { [IO.File]::WriteAllText($script:HostsPath, $updated, [Text.Encoding]::ASCII) }
}

function Restore-HostsContent([object]$HostsBackup) {
    $currentBase64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($script:HostsPath))
    if ($HostsBackup.ContentBase64 -and $HostsBackup.InstalledContentBase64 -and $currentBase64 -eq [string]$HostsBackup.InstalledContentBase64) {
        [IO.File]::WriteAllBytes($script:HostsPath, [Convert]::FromBase64String([string]$HostsBackup.ContentBase64))
    } else {
        Remove-NogoonHostsBlock
    }
}

function Restore-HostsSecurity([object]$HostsBackup) {
    $acl = New-Object Security.AccessControl.FileSecurity
    $acl.SetSecurityDescriptorSddlForm([string]$HostsBackup.Sddl)
    Set-Acl -LiteralPath $script:HostsPath -AclObject $acl
    $file = Get-Item -LiteralPath $script:HostsPath -Force
    $file.Attributes = [IO.FileAttributes]([int]$HostsBackup.Attributes)
}

function Remove-CleanupTask { Unregister-ScheduledTask -TaskName $script:TaskName -Confirm:$false -ErrorAction SilentlyContinue }

function Invoke-RestoreInstallation([string]$StatePath) {
    $state = Read-InstallState $StatePath
    if (-not $state) {
        if (Select-String -LiteralPath $script:HostsPath -SimpleMatch $script:Marker -Quiet -ErrorAction SilentlyContinue) { throw "A legacy nogoon installation was found without a restoration backup. Reinstall before cleaning it up." }
        Remove-CleanupTask
        return
    }
    $errors = New-Object Collections.Generic.List[string]
    $cfaOriginal = $null
    try {
        try { $cfaOriginal = Enable-HostsWrite; Restore-HostsContent $state.Hosts } catch { $errors.Add("hosts content: $($_.Exception.Message)") }
        foreach ($policy in @($state.Policies)) { try { Restore-RegistryValue $policy } catch { $errors.Add("browser policy $($policy.Name): $($_.Exception.Message)") } }
        try { Restore-Dns @($state.Dns) } catch { $errors.Add("DNS: $($_.Exception.Message)") }
        try { & ipconfig.exe /flushdns | Out-Null } catch { $errors.Add("DNS cache: $($_.Exception.Message)") }
        try { Restore-HostsSecurity $state.Hosts } catch { $errors.Add("hosts permissions: $($_.Exception.Message)") }
    } finally {
        try { Restore-CfaPreference $cfaOriginal } catch { $errors.Add("Controlled Folder Access: $($_.Exception.Message)") }
    }
    if ($errors.Count -gt 0) {
        $state.Status = "RestoreFailed"; Write-InstallState $state $StatePath
        throw ($errors -join " ")
    }
    Remove-CleanupTask
    Remove-Item -LiteralPath $StatePath -Force -ErrorAction SilentlyContinue
}

function Get-CleanupScriptContent {
    $functionNames = @("Read-InstallState", "Write-InstallState", "Get-RegistryValueBackup", "Restore-RegistryValue", "Invoke-NetshDnsRestore", "Restore-Dns", "Get-CfaPreference", "Set-CfaPreference", "Enable-HostsWrite", "Restore-CfaPreference", "Remove-NogoonHostsBlock", "Restore-HostsContent", "Restore-HostsSecurity", "Remove-CleanupTask", "Invoke-RestoreInstallation")
    $builder = New-Object Text.StringBuilder
    [void]$builder.AppendLine('param([switch]$Scheduled)')
    [void]$builder.AppendLine('$ErrorActionPreference = "Stop"')
    [void]$builder.AppendLine('$script:ProductDir = Join-Path $env:ProgramData "nogoon"')
    [void]$builder.AppendLine('$script:StateFile = Join-Path $script:ProductDir "state.json"')
    [void]$builder.AppendLine('$script:CleanupScript = Join-Path $script:ProductDir "cleanup.ps1"')
    [void]$builder.AppendLine('$script:TaskName = "NogoonCleanup"')
    [void]$builder.AppendLine('$script:Marker = "# === NOGOON.IO ==="')
    [void]$builder.AppendLine('$script:EndMarker = "# === END NOGOON.IO ==="')
    [void]$builder.AppendLine('$script:HostsPath = Join-Path $env:SystemRoot "System32\drivers\etc\hosts"')
    foreach ($name in $functionNames) { [void]$builder.AppendLine("function $name {"); [void]$builder.AppendLine((Get-Item "function:$name").Definition); [void]$builder.AppendLine("}") }
    [void]$builder.AppendLine('if ($Scheduled) {')
    [void]$builder.AppendLine('    $state = Read-InstallState $script:StateFile')
    [void]$builder.AppendLine('    if (-not $state -or $state.Mode -ne "free") { exit 0 }')
    [void]$builder.AppendLine('    if ([DateTime]::Parse([string]$state.ExpiresAt).ToUniversalTime() -gt [DateTime]::UtcNow) { exit 0 }')
    [void]$builder.AppendLine('}')
    [void]$builder.AppendLine('try { Invoke-RestoreInstallation $script:StateFile; Remove-Item -LiteralPath $script:CleanupScript -Force -ErrorAction SilentlyContinue; exit 0 }')
    [void]$builder.AppendLine('catch { Write-Error $_; exit 1 }')
    return $builder.ToString()
}

function Get-HostsBlock {
    $adultDomains = @(
        "pornhub.com", "xvideos.com", "xnxx.com", "xhamster.com", "redtube.com", "youporn.com", "tube8.com", "spankbang.com", "eporner.com", "pornone.com", "onlyfans.com", "stripchat.com", "chaturbate.com", "brazzers.com", "livejasmin.com", "porn.com", "porntrex.com", "hentaihaven.xxx", "rule34.xxx", "nhentai.net", "hanime.tv", "motherless.com", "tnaflix.com", "pornpics.com", "fuq.com", "4tube.com", "alohatube.com", "fapello.com", "coomer.su", "kemono.su", "simpcity.su", "bongacams.com", "cam4.com", "myfreecams.com", "camsoda.com", "flirt4free.com", "imagefap.com", "sexlikereal.com", "vrporn.com", "bangbros.com", "realitykings.com", "naughtyamerica.com", "mofos.com", "digitalplayground.com", "fakehub.com", "babes.com", "twistys.com", "porngo.com", "cliphunter.com", "3movs.com", "hqporner.com", "daftsex.com", "sxyprn.com", "fux.com", "beeg.com", "heavy-r.com", "dinotube.com", "freeones.com", "nudevista.com", "xxxbunker.com", "lobstertube.com", "thumbzilla.com", "keezmovies.com", "pornmd.com", "camhub.cc", "porntn.com", "porndd.com", "crushon.ai", "eroasmr.com"
    )
    $lines = New-Object Collections.Generic.List[string]
    $lines.Add(""); $lines.Add($script:Marker); $lines.Add("# Installed by nogoon.io - https://nogoon.io"); $lines.Add("# Do not edit manually."); $lines.Add(""); $lines.Add("# -- Porn sites --")
    foreach ($domain in $adultDomains) { $lines.Add("0.0.0.0 $domain"); $lines.Add("0.0.0.0 www.$domain") }
    $lines.Add(""); $lines.Add("# -- DNS-over-HTTPS bypass prevention --")
    foreach ($domain in @("dns.google", "dns64.dns.google", "cloudflare-dns.com", "mozilla.cloudflare-dns.com", "doh.opendns.com", "dns.quad9.net", "doh.cleanbrowsing.org", "dns.nextdns.io", "doh.dns.sb", "dns.adguard.com")) { $lines.Add("0.0.0.0 $domain") }
    if ($env:NOGOON_BLOCK_REDDIT -eq "1") { foreach ($domain in @("reddit.com", "www.reddit.com", "old.reddit.com", "i.reddit.com")) { $lines.Add("0.0.0.0 $domain") } }
    if ($env:NOGOON_BLOCK_TWITTER -eq "1") { foreach ($domain in @("twitter.com", "www.twitter.com", "x.com", "www.x.com")) { $lines.Add("0.0.0.0 $domain") } }
    if ($env:NOGOON_BLOCK_TUMBLR -eq "1") { foreach ($domain in @("tumblr.com", "www.tumblr.com")) { $lines.Add("0.0.0.0 $domain") } }
    if ($env:NOGOON_NO_SAFESEARCH -ne "1") {
        $safeSearch = [ordered]@{
            "www.google.com" = "216.239.38.120"; "google.com" = "216.239.38.120"; "www.google.fr" = "216.239.38.120"; "google.fr" = "216.239.38.120"; "www.google.co.uk" = "216.239.38.120"; "www.google.de" = "216.239.38.120"; "www.google.es" = "216.239.38.120"; "www.google.it" = "216.239.38.120"; "www.google.nl" = "216.239.38.120"; "www.google.be" = "216.239.38.120"; "www.google.ca" = "216.239.38.120"; "www.google.com.tr" = "216.239.38.120"; "www.google.com.au" = "216.239.38.120"; "www.google.co.jp" = "216.239.38.120"; "www.google.com.br" = "216.239.38.120"; "www.bing.com" = "204.79.197.220"; "bing.com" = "204.79.197.220"
        }
        $lines.Add(""); $lines.Add("# -- Forced SafeSearch --")
        foreach ($name in $safeSearch.Keys) { $lines.Add("$($safeSearch[$name]) $name") }
    }
    $lines.Add(""); $lines.Add($script:EndMarker)
    return ($lines -join "`r`n")
}

function Set-NogoonPolicies([object[]]$Policies) {
    foreach ($policy in @($Policies)) {
        if (-not (Test-Path -LiteralPath $policy.Path)) { New-Item -Path $policy.Path -Force | Out-Null }
        Set-ItemProperty -LiteralPath $policy.Path -Name $policy.Name -Value $policy.NogoonValue -Type $policy.NogoonKind -Force
    }
}

function Set-HostsLock {
    if ($env:NOGOON_NO_LOCK -eq "1") { return }
    $acl = Get-Acl -LiteralPath $script:HostsPath
    $acl.SetAccessRuleProtection($true, $false)
    foreach ($rule in @($acl.Access)) { [void]$acl.RemoveAccessRuleSpecific($rule) }
    $inheritance = [Security.AccessControl.InheritanceFlags]::None; $propagation = [Security.AccessControl.PropagationFlags]::None; $allow = [Security.AccessControl.AccessControlType]::Allow
    $systemSid = [Security.Principal.SecurityIdentifier]::new("S-1-5-18"); $adminSid = [Security.Principal.SecurityIdentifier]::new("S-1-5-32-544"); $usersSid = [Security.Principal.SecurityIdentifier]::new("S-1-5-32-545")
    $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($systemSid, [Security.AccessControl.FileSystemRights]::FullControl, $inheritance, $propagation, $allow))
    $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($adminSid, [Security.AccessControl.FileSystemRights]::Read, $inheritance, $propagation, $allow))
    $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($usersSid, [Security.AccessControl.FileSystemRights]::Read, $inheritance, $propagation, $allow))
    Set-Acl -LiteralPath $script:HostsPath -AclObject $acl
    (Get-Item -LiteralPath $script:HostsPath -Force).IsReadOnly = $true
}

function Register-CleanupTask([DateTime]$ExpiresAt) {
    Get-CleanupScriptContent | Set-Content -LiteralPath $script:CleanupScript -Encoding UTF8
    $taskAction = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$script:CleanupScript`" -Scheduled"
    $triggers = @((New-ScheduledTaskTrigger -Once -At $ExpiresAt.ToLocalTime()), (New-ScheduledTaskTrigger -AtStartup))
    $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 15)
    Register-ScheduledTask -TaskName $script:TaskName -Action $taskAction -Trigger $triggers -Settings $settings -User "SYSTEM" -RunLevel Highest -Force | Out-Null
    $task = Get-ScheduledTask -TaskName $script:TaskName -ErrorAction Stop
    if ($task.Actions.Execute -notcontains "powershell.exe" -or $task.Actions.Arguments -notmatch [Regex]::Escape($script:CleanupScript)) { throw "The automatic cleanup task could not be verified." }
}

function Test-Block {
    if (-not (Select-String -LiteralPath $script:HostsPath -Pattern '^0\.0\.0\.0\s+www\.pornhub\.com\s*$' -Quiet)) { return $false }
    try { $addresses = @([Net.Dns]::GetHostAddresses("www.pornhub.com") | ForEach-Object { $_.IPAddressToString }) } catch { return $false }
    return ($addresses -contains "0.0.0.0" -or $addresses -contains "::")
}

function Invoke-Install([bool]$InstallPermanent) {
    $existing = Read-InstallState $script:StateFile
    $hasMarker = Select-String -LiteralPath $script:HostsPath -SimpleMatch $script:Marker -Quiet -ErrorAction SilentlyContinue
    if ($existing -and $existing.Status -eq "Active" -and $hasMarker) {
        $expired = $existing.Mode -eq "free" -and $existing.ExpiresAt -and ([DateTime]::Parse([string]$existing.ExpiresAt).ToUniversalTime() -le [DateTime]::UtcNow)
        if ($expired) {
            Invoke-RestoreInstallation $script:StateFile
            $existing = $null
            $hasMarker = $false
        } else {
            if (-not (Test-Block)) { throw "The existing protection could not be verified." }
            if ($existing.Mode -eq "permanent") { Write-Ok "Permanent protection is already active."; return }
            if ($InstallPermanent) { Remove-CleanupTask; $existing.Mode = "permanent"; $existing.ExpiresAt = $null; Write-InstallState $existing $script:StateFile; Write-Ok "Protection is now permanent."; return }
            Write-Ok "The free trial is already active."; return
        }
    }
    if ($existing) { Write-Step "Recovering the incomplete previous installation..."; Invoke-RestoreInstallation $script:StateFile }
    elseif ($hasMarker) { throw "nogoon is already present, but its restoration backup is missing. Contact support@nogoon.io before reinstalling." }

    $policyDefinitions = @(
        @{ Path = "HKLM:\SOFTWARE\Policies\Google\Chrome"; Name = "DnsOverHttpsMode"; Value = "off"; Kind = "String" },
        @{ Path = "HKLM:\SOFTWARE\Policies\Microsoft\Edge"; Name = "DnsOverHttpsMode"; Value = "off"; Kind = "String" },
        @{ Path = "HKLM:\SOFTWARE\Policies\BraveSoftware\Brave"; Name = "DnsOverHttpsMode"; Value = "off"; Kind = "String" },
        @{ Path = "HKLM:\SOFTWARE\Policies\Mozilla\Firefox\DNSOverHTTPS"; Name = "Enabled"; Value = 0; Kind = "DWord" },
        @{ Path = "HKLM:\SOFTWARE\Policies\Mozilla\Firefox\DNSOverHTTPS"; Name = "Locked"; Value = 1; Kind = "DWord" }
    )
    $policyBackups = @()
    foreach ($definition in $policyDefinitions) {
        $backup = Get-RegistryValueBackup $definition.Path $definition.Name
        $backup | Add-Member -NotePropertyName NogoonValue -NotePropertyValue $definition.Value
        $backup | Add-Member -NotePropertyName NogoonKind -NotePropertyValue $definition.Kind
        $policyBackups += $backup
    }
    $hostsAcl = Get-Acl -LiteralPath $script:HostsPath
    $sections = [Security.AccessControl.AccessControlSections]::Access -bor [Security.AccessControl.AccessControlSections]::Owner -bor [Security.AccessControl.AccessControlSections]::Group
    $hostsBackup = [PSCustomObject]@{
        Sddl = $hostsAcl.GetSecurityDescriptorSddlForm($sections)
        Attributes = [int](Get-Item -LiteralPath $script:HostsPath -Force).Attributes
        ContentBase64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($script:HostsPath))
    }
    $expiresAt = if ($InstallPermanent) { $null } else { [DateTime]::UtcNow.AddSeconds($script:TrialSeconds).ToString("o") }
    $state = [PSCustomObject]@{ Version = 2; Status = "Installing"; Mode = if ($InstallPermanent) { "permanent" } else { "free" }; ExpiresAt = $expiresAt; Dns = @(Get-DnsBackup); Hosts = $hostsBackup; Policies = @($policyBackups) }
    Write-InstallState $state $script:StateFile
    try {
        Write-Step "Setting DNS filtering..."
        $configured = 0
        foreach ($adapter in @(Get-NetAdapter | Where-Object { $_.Status -eq "Up" })) { Set-DnsClientServerAddress -InterfaceIndex $adapter.ifIndex -ServerAddresses @("185.228.168.10", "185.228.169.11") -ErrorAction Stop; $configured++ }
        if ($configured -eq 0) { throw "No active network adapter could be configured." }
        Write-Step "Applying browser and hosts protections..."
        Set-NogoonPolicies $policyBackups
        $cfaOriginal = $null
        try {
            $cfaOriginal = Enable-HostsWrite
            Add-Content -LiteralPath $script:HostsPath -Value (Get-HostsBlock) -Encoding ASCII
            $state.Hosts | Add-Member -NotePropertyName InstalledContentBase64 -NotePropertyValue ([Convert]::ToBase64String([IO.File]::ReadAllBytes($script:HostsPath))) -Force
            Write-InstallState $state $script:StateFile
            Set-HostsLock
        }
        finally { Restore-CfaPreference $cfaOriginal }
        & ipconfig.exe /flushdns | Out-Null
        if ($env:NOGOON_SKIP_BROWSER_CLOSE -ne "1") {
            $runningBrowsers = @(Get-Process -Name @("chrome", "msedge", "firefox", "brave", "opera", "vivaldi", "thorium", "librewolf") -ErrorAction SilentlyContinue)
            if ($runningBrowsers.Count -gt 0) { Write-Warn "Open browsers will close now so protection takes effect."; $runningBrowsers | Stop-Process -Force -ErrorAction Stop }
        }
        if ($InstallPermanent) { Get-CleanupScriptContent | Set-Content -LiteralPath $script:CleanupScript -Encoding UTF8; Remove-CleanupTask }
        else { Register-CleanupTask ([DateTime]::Parse($expiresAt)) }
        if (-not (Test-Block)) { throw "The hosts block could not be verified." }
        $state.Status = "Active"; Write-InstallState $state $script:StateFile
    } catch {
        $installError = $_.Exception.Message
        try { Invoke-RestoreInstallation $script:StateFile } catch { $installError += " Rollback also failed: $($_.Exception.Message)" }
        throw $installError
    }
    if (-not $InstallPermanent -and $env:NOGOON_NO_TRACK -ne "1" -and $env:NOGOON_DESKTOP -ne "1") {
        try { Invoke-WebRequest -Uri "https://nogoon.io/api/track?t=free&os=win&$NOGOON_ATTR" -UseBasicParsing -TimeoutSec 3 | Out-Null } catch {}
    }
    Write-Host ""; Write-Host "  Porn is now blocked on this PC." -ForegroundColor Green
    if ($InstallPermanent) { Write-Host "  Permanent protection is active." -ForegroundColor White }
    else { Write-Host "  Free trial active for $script:TrialHuman." -ForegroundColor White; Write-Host "  Automatic cleanup: $([DateTime]::Parse($expiresAt).ToLocalTime().ToString('g'))" -ForegroundColor Gray }
}

if ($env:OS -ne "Windows_NT") {
    if ($Action -eq "State") { Write-Output '{"mode":"none","expiresAt":null}'; exit 0 }
    Write-Error "This script is for Windows only."; exit 1
}
if ($Action -eq "State") { Get-PublicState; exit 0 }
if (-not (Test-Administrator)) { Request-Elevation $Action ([bool]$Permanent); exit 0 }
try {
    if ($Action -eq "Cleanup") { Invoke-RestoreInstallation $script:StateFile; Remove-Item -LiteralPath $script:CleanupScript -Force -ErrorAction SilentlyContinue; Write-Ok "nogoon protection was removed and previous settings were restored." }
    else { Invoke-Install ([bool]$Permanent) }
    exit 0
} catch { Write-Error $_.Exception.Message; exit 1 }
