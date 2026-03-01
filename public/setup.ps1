# ============================================================================
#  nogoon.io - Block porn on your PC. FREE for 72 hours.
#  https://nogoon.io
#
#  Usage (run PowerShell as Administrator):
#    irm nogoon.io/setup.ps1 | iex
#
#  This is the FREE trial. Porn is blocked for 72 hours, then auto-reverts.
#  Want it permanent? https://nogoon.io → buy the permanent version.
# ============================================================================

#Requires -RunAsAdministrator

$ErrorActionPreference = "Stop"

# -- Trial config -------------------------------------------------------------
$TRIAL_SECONDS = 259200  # 72 hours
$TRIAL_HUMAN = "72 hours"
$CLEANUP_SCRIPT = "$env:ProgramData\nogoon\cleanup.ps1"
$TASK_NAME = "NogoonCleanup"

# -- Colors / helpers ---------------------------------------------------------
function Write-Step($num, $total, $msg) {
    Write-Host "[$num/$total] " -ForegroundColor Cyan -NoNewline
    Write-Host $msg
}

function Write-Ok($msg) {
    Write-Host "  ✓ " -ForegroundColor Green -NoNewline
    Write-Host $msg
}

function Write-Warn($msg) {
    Write-Host "  ⚠ " -ForegroundColor Yellow -NoNewline
    Write-Host $msg
}

function Write-Err($msg) {
    Write-Host "  ✘ " -ForegroundColor Red -NoNewline
    Write-Host $msg
}

# -- Branding -----------------------------------------------------------------
Write-Host ""
Write-Host "  ╔═══════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "  ║                                           ║" -ForegroundColor Cyan
Write-Host "  ║       nogoon.io                           ║" -ForegroundColor Cyan
Write-Host "  ║                                           ║" -ForegroundColor Cyan
Write-Host "  ║       FREE trial — 72 hours of focus      ║" -ForegroundColor Cyan
Write-Host "  ╚═══════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# -- Check Windows ------------------------------------------------------------
if ($env:OS -ne "Windows_NT") {
    Write-Err "This script is for Windows only. For Mac, use: curl -sL nogoon.io/setup.sh | sudo bash"
    exit 1
}

# -- Check Administrator ------------------------------------------------------
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Err "This script must be run as Administrator."
    Write-Host "  Right-click PowerShell → 'Run as administrator' → paste the command again." -ForegroundColor Gray
    exit 1
}

# -- Parse flags via env vars --------------------------------------------------
$BlockReddit    = $env:NOGOON_BLOCK_REDDIT -eq "1"
$BlockTwitter   = $env:NOGOON_BLOCK_TWITTER -eq "1"
$BlockTumblr    = $env:NOGOON_BLOCK_TUMBLR -eq "1"
$NoLock         = $env:NOGOON_NO_LOCK -eq "1"
$NoSafeSearch   = $env:NOGOON_NO_SAFESEARCH -eq "1"

# -- Check if already installed ------------------------------------------------
$hostsPath = "$env:SystemRoot\System32\drivers\etc\hosts"
$marker = "# === NOGOON.IO ==="

if (Select-String -Path $hostsPath -Pattern $marker -Quiet 2>$null) {
    Write-Warn "nogoon.io is already installed on this machine."
    Write-Host "  To reinstall, first remove the NOGOON.IO entries from your hosts file." -ForegroundColor Gray
    exit 0
}

Write-Host "Starting installation (free trial)..." -ForegroundColor White
Write-Host ""

# -- Step 1: Set CleanBrowsing Adult DNS on all interfaces --------------------
Write-Step 1 7 "Setting up DNS filtering..."

# Using Adult filter (not Family) - blocks porn without restricting YouTube/Reddit/X
$dns1 = "185.228.168.10"
$dns2 = "185.228.169.11"

$adapters = Get-NetAdapter | Where-Object { $_.Status -eq "Up" }
foreach ($adapter in $adapters) {
    try {
        Set-DnsClientServerAddress -InterfaceIndex $adapter.ifIndex -ServerAddresses @($dns1, $dns2)
        Write-Ok "DNS set on: $($adapter.Name)"
    } catch {
        # Silently skip adapters that can't be configured
    }
}

Write-Host ""

# -- Step 2: Block adult sites in hosts file -----------------------------------
Write-Step 2 7 "Blocking adult sites..."

# Remove read-only attribute if present
$hostsFile = Get-Item $hostsPath -Force
if ($hostsFile.IsReadOnly) {
    $hostsFile.IsReadOnly = $false
}

$hostsEntries = @"

$marker
# Installed by nogoon.io - https://nogoon.io
# Do not edit manually.

# -- Porn sites --
0.0.0.0 pornhub.com
0.0.0.0 www.pornhub.com
0.0.0.0 xvideos.com
0.0.0.0 www.xvideos.com
0.0.0.0 xnxx.com
0.0.0.0 www.xnxx.com
0.0.0.0 xhamster.com
0.0.0.0 www.xhamster.com
0.0.0.0 redtube.com
0.0.0.0 www.redtube.com
0.0.0.0 youporn.com
0.0.0.0 www.youporn.com
0.0.0.0 tube8.com
0.0.0.0 www.tube8.com
0.0.0.0 spankbang.com
0.0.0.0 www.spankbang.com
0.0.0.0 eporner.com
0.0.0.0 www.eporner.com
0.0.0.0 pornone.com
0.0.0.0 www.pornone.com
0.0.0.0 onlyfans.com
0.0.0.0 www.onlyfans.com
0.0.0.0 stripchat.com
0.0.0.0 www.stripchat.com
0.0.0.0 chaturbate.com
0.0.0.0 www.chaturbate.com
0.0.0.0 brazzers.com
0.0.0.0 www.brazzers.com
0.0.0.0 livejasmin.com
0.0.0.0 www.livejasmin.com
0.0.0.0 porn.com
0.0.0.0 www.porn.com
0.0.0.0 porntrex.com
0.0.0.0 www.porntrex.com
0.0.0.0 hentaihaven.xxx
0.0.0.0 www.hentaihaven.xxx
0.0.0.0 rule34.xxx
0.0.0.0 www.rule34.xxx
0.0.0.0 nhentai.net
0.0.0.0 www.nhentai.net
0.0.0.0 hanime.tv
0.0.0.0 www.hanime.tv
0.0.0.0 motherless.com
0.0.0.0 www.motherless.com
0.0.0.0 tnaflix.com
0.0.0.0 www.tnaflix.com
0.0.0.0 pornpics.com
0.0.0.0 www.pornpics.com
0.0.0.0 fuq.com
0.0.0.0 www.fuq.com
0.0.0.0 4tube.com
0.0.0.0 www.4tube.com
0.0.0.0 alohatube.com
0.0.0.0 www.alohatube.com
0.0.0.0 fapello.com
0.0.0.0 www.fapello.com
0.0.0.0 coomer.su
0.0.0.0 www.coomer.su
0.0.0.0 kemono.su
0.0.0.0 www.kemono.su
0.0.0.0 simpcity.su
0.0.0.0 www.simpcity.su
0.0.0.0 bongacams.com
0.0.0.0 www.bongacams.com
0.0.0.0 cam4.com
0.0.0.0 www.cam4.com
0.0.0.0 myfreecams.com
0.0.0.0 www.myfreecams.com
0.0.0.0 camsoda.com
0.0.0.0 www.camsoda.com
0.0.0.0 flirt4free.com
0.0.0.0 www.flirt4free.com
0.0.0.0 imagefap.com
0.0.0.0 www.imagefap.com
0.0.0.0 sexlikereal.com
0.0.0.0 www.sexlikereal.com
0.0.0.0 vrporn.com
0.0.0.0 www.vrporn.com
0.0.0.0 bangbros.com
0.0.0.0 www.bangbros.com
0.0.0.0 realitykings.com
0.0.0.0 www.realitykings.com
0.0.0.0 naughtyamerica.com
0.0.0.0 www.naughtyamerica.com
0.0.0.0 mofos.com
0.0.0.0 www.mofos.com
0.0.0.0 digitalplayground.com
0.0.0.0 www.digitalplayground.com
0.0.0.0 fakehub.com
0.0.0.0 www.fakehub.com
0.0.0.0 babes.com
0.0.0.0 www.babes.com
0.0.0.0 twistys.com
0.0.0.0 www.twistys.com
0.0.0.0 porngo.com
0.0.0.0 www.porngo.com
0.0.0.0 cliphunter.com
0.0.0.0 www.cliphunter.com
0.0.0.0 3movs.com
0.0.0.0 www.3movs.com
0.0.0.0 hqporner.com
0.0.0.0 www.hqporner.com
0.0.0.0 daftsex.com
0.0.0.0 www.daftsex.com
0.0.0.0 sxyprn.com
0.0.0.0 www.sxyprn.com
0.0.0.0 fux.com
0.0.0.0 www.fux.com
0.0.0.0 beeg.com
0.0.0.0 www.beeg.com
0.0.0.0 heavy-r.com
0.0.0.0 www.heavy-r.com
0.0.0.0 dinotube.com
0.0.0.0 www.dinotube.com
0.0.0.0 freeones.com
0.0.0.0 www.freeones.com
0.0.0.0 nudevista.com
0.0.0.0 www.nudevista.com
0.0.0.0 xxxbunker.com
0.0.0.0 www.xxxbunker.com
0.0.0.0 lobstertube.com
0.0.0.0 www.lobstertube.com
0.0.0.0 thumbzilla.com
0.0.0.0 www.thumbzilla.com
0.0.0.0 keezmovies.com
0.0.0.0 www.keezmovies.com
0.0.0.0 pornmd.com
0.0.0.0 www.pornmd.com

# -- DNS-over-HTTPS bypass prevention --
0.0.0.0 dns.google
0.0.0.0 dns64.dns.google
0.0.0.0 cloudflare-dns.com
0.0.0.0 mozilla.cloudflare-dns.com
0.0.0.0 doh.opendns.com
0.0.0.0 dns.quad9.net
0.0.0.0 doh.cleanbrowsing.org
0.0.0.0 dns.nextdns.io
0.0.0.0 doh.dns.sb
0.0.0.0 dns.adguard.com
"@

# Optional social media blocks
if ($BlockReddit) {
    $hostsEntries += @"

# -- Reddit (NSFW content) --
0.0.0.0 reddit.com
0.0.0.0 www.reddit.com
0.0.0.0 old.reddit.com
0.0.0.0 i.reddit.com
"@
}

if ($BlockTwitter) {
    $hostsEntries += @"

# -- Twitter/X (NSFW content) --
0.0.0.0 twitter.com
0.0.0.0 www.twitter.com
0.0.0.0 x.com
0.0.0.0 www.x.com
"@
}

if ($BlockTumblr) {
    $hostsEntries += @"

# -- Tumblr (NSFW content) --
0.0.0.0 tumblr.com
0.0.0.0 www.tumblr.com
"@
}

# SafeSearch entries
if (-not $NoSafeSearch) {
    $hostsEntries += @"

# -- Forced SafeSearch --
216.239.38.120 www.google.com
216.239.38.120 google.com
216.239.38.120 www.google.fr
216.239.38.120 google.fr
216.239.38.120 www.google.co.uk
216.239.38.120 www.google.de
216.239.38.120 www.google.es
216.239.38.120 www.google.it
216.239.38.120 www.google.nl
216.239.38.120 www.google.be
216.239.38.120 www.google.ca
216.239.38.120 www.google.com.tr
216.239.38.120 www.google.com.au
216.239.38.120 www.google.co.jp
216.239.38.120 www.google.com.br
204.79.197.220 www.bing.com
204.79.197.220 bing.com
"@
}

$hostsEntries += "`n`n# === END NOGOON.IO ==="

# Write to hosts file
Add-Content -Path $hostsPath -Value $hostsEntries -Encoding ASCII

$blockedCount = 60
Write-Ok "$blockedCount adult sites blocked"

if ($BlockReddit)  { Write-Ok "Reddit blocked" }
if ($BlockTwitter) { Write-Ok "Twitter/X blocked" }
if ($BlockTumblr)  { Write-Ok "Tumblr blocked" }

# -- Step 3: Force SafeSearch --------------------------------------------------
if (-not $NoSafeSearch) {
    Write-Step 3 7 "Forcing SafeSearch on Google & Bing..."
    Write-Ok "Google SafeSearch enforced (15 regions)"
    Write-Ok "Bing SafeSearch enforced"
} else {
    Write-Step 3 7 "SafeSearch skipped (NOGOON_NO_SAFESEARCH=1)"
}

# -- Step 4: Flush DNS ---------------------------------------------------------
Write-Step 4 7 "Flushing DNS cache..."
ipconfig /flushdns | Out-Null
Write-Ok "DNS cache flushed"

# -- Step 5: Lock hosts file ----------------------------------------------------
if (-not $NoLock) {
    Write-Step 5 7 "Locking hosts file..."

    # Remove all permissions except SYSTEM read
    $acl = Get-Acl $hostsPath
    $acl.SetAccessRuleProtection($true, $false)

    # SYSTEM - full control (needed for OS)
    $systemRule = New-Object System.Security.AccessControl.FileSystemAccessRule(
        "NT AUTHORITY\SYSTEM", "FullControl", "Allow"
    )
    $acl.AddAccessRule($systemRule)

    # Administrators - read only (can't edit without taking ownership back)
    $adminRule = New-Object System.Security.AccessControl.FileSystemAccessRule(
        "BUILTIN\Administrators", "Read", "Allow"
    )
    $acl.AddAccessRule($adminRule)

    # Users - read only
    $usersRule = New-Object System.Security.AccessControl.FileSystemAccessRule(
        "BUILTIN\Users", "Read", "Allow"
    )
    $acl.AddAccessRule($usersRule)

    Set-Acl -Path $hostsPath -AclObject $acl

    # Also set read-only attribute
    Set-ItemProperty -Path $hostsPath -Name IsReadOnly -Value $true

    Write-Ok "Hosts file locked (permissions restricted + read-only)"
} else {
    Write-Step 5 7 "Hosts file lock skipped (NOGOON_NO_LOCK=1)"
}

# -- Step 6: Create cleanup script ---------------------------------------------
Write-Step 6 7 "Setting up auto-revert timer (trial)..."

$cleanupDir = Split-Path $CLEANUP_SCRIPT -Parent
if (-not (Test-Path $cleanupDir)) { New-Item -Path $cleanupDir -ItemType Directory -Force | Out-Null }

$cleanupContent = @'
# nogoon.io cleanup — trial expired
$hostsPath = "$env:SystemRoot\System32\drivers\etc\hosts"
$marker = "# === NOGOON.IO ==="
$endMarker = "# === END NOGOON.IO ==="

# Restore hosts file permissions
try {
    $acl = Get-Acl $hostsPath
    $acl.SetAccessRuleProtection($true, $false)
    $systemRule = New-Object System.Security.AccessControl.FileSystemAccessRule("NT AUTHORITY\SYSTEM", "FullControl", "Allow")
    $adminRule = New-Object System.Security.AccessControl.FileSystemAccessRule("BUILTIN\Administrators", "FullControl", "Allow")
    $usersRule = New-Object System.Security.AccessControl.FileSystemAccessRule("BUILTIN\Users", "ReadAndExecute", "Allow")
    $acl.AddAccessRule($systemRule)
    $acl.AddAccessRule($adminRule)
    $acl.AddAccessRule($usersRule)
    Set-Acl -Path $hostsPath -AclObject $acl
    Set-ItemProperty -Path $hostsPath -Name IsReadOnly -Value $false
} catch {}

# Remove NOGOON entries from hosts
$content = Get-Content $hostsPath -Raw
if ($content -match "(?s)$marker.*?$endMarker\s*") {
    $content = $content -replace "(?s)\r?\n?$marker.*?$endMarker\s*", ""
    Set-Content -Path $hostsPath -Value $content.TrimEnd() -Encoding ASCII
}

# Reset DNS to automatic on all adapters
Get-NetAdapter | Where-Object { $_.Status -eq "Up" } | ForEach-Object {
    try { Set-DnsClientServerAddress -InterfaceIndex $_.ifIndex -ResetServerAddresses } catch {}
}

# Flush DNS
ipconfig /flushdns | Out-Null

# Self-cleanup: remove script and scheduled task
schtasks /Delete /TN "NogoonCleanup" /F 2>$null
Remove-Item -Path $MyInvocation.MyCommand.Path -Force 2>$null
Remove-Item -Path (Split-Path $MyInvocation.MyCommand.Path -Parent) -Recurse -Force 2>$null
'@

Set-Content -Path $CLEANUP_SCRIPT -Value $cleanupContent -Encoding ASCII
Write-Ok "Cleanup script created"

# -- Step 7: Schedule cleanup via Task Scheduler --------------------------------
Write-Step 7 7 "Scheduling auto-revert..."

$revertTime = (Get-Date).AddSeconds($TRIAL_SECONDS)
$revertDisplay = $revertTime.ToString("HH:mm 'on' MMM dd")

# Create scheduled task to run cleanup
schtasks /Create /TN $TASK_NAME /TR "powershell.exe -ExecutionPolicy Bypass -File `"$CLEANUP_SCRIPT`"" `
    /SC ONCE /ST $revertTime.ToString("HH:mm") /SD $revertTime.ToString("MM/dd/yyyy") `
    /RL HIGHEST /RU SYSTEM /F | Out-Null

Write-Ok "Auto-revert scheduled"

# -- Done ----------------------------------------------------------------------
Write-Host ""
Write-Host "════════════════════════════════════════════" -ForegroundColor Green
Write-Host "  ✓ Porn is now blocked on this PC." -ForegroundColor Green
Write-Host "════════════════════════════════════════════" -ForegroundColor Green
Write-Host ""
Write-Host "  FREE trial active — expires in $TRIAL_HUMAN" -ForegroundColor White
Write-Host "  Auto-reverts at: $revertDisplay" -ForegroundColor Gray
Write-Host ""
Write-Host "  What's active:" -ForegroundColor White
Write-Host "  • CleanBrowsing Adult DNS on all network adapters"
Write-Host "  • $blockedCount+ adult sites blocked via hosts file"
Write-Host "  • DNS-over-HTTPS bypass prevention"
if (-not $NoSafeSearch) { Write-Host "  • Google & Bing SafeSearch enforced" }
if (-not $NoLock)       { Write-Host "  • Hosts file locked (cannot be edited)" }
Write-Host ""
Write-Host "  Not affected: " -ForegroundColor White -NoNewline
Write-Host "YouTube, Reddit, Twitter/X, all other sites"
Write-Host ""
Write-Host "  ⏰ After $TRIAL_HUMAN, porn will be unblocked again." -ForegroundColor Yellow
Write-Host "     Want it blocked PERMANENTLY?" -ForegroundColor Yellow
Write-Host "     → https://nogoon.io ← " -ForegroundColor White
Write-Host ""
Write-Host "  Restart your browser " -ForegroundColor White -NoNewline
Write-Host "for changes to take full effect."
Write-Host ""
