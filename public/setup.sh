#!/bin/bash
# ============================================================================
#  nogoon.io — Block porn on your Mac. FREE for 72 hours.
#  https://nogoon.io
#
#  Usage:
#    curl -sL nogoon.io/setup.sh | sudo bash
#
#  This is the FREE trial. Porn is blocked for 72 hours, then auto-reverts.
#  Want it permanent? https://nogoon.io → buy the permanent version.
# ============================================================================

set -e

# ── Track execution (silent, non-blocking) ───────────────────────────────
curl -s "https://nogoon.vercel.app/api/track?t=free&os=mac" > /dev/null 2>&1 &

# ── Config ──────────────────────────────────────────────────────────────────
# TRIAL DURATION: 259200 = 72 hours
TRIAL_SECONDS=259200
TRIAL_LABEL="io.nogoon.cleanup"
CLEANUP_PLIST="/Library/LaunchDaemons/${TRIAL_LABEL}.plist"
CLEANUP_SCRIPT="/usr/local/bin/nogoon-cleanup.sh"

# ── Colors ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

# ── Branding ────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${BLUE}"
echo "  ╔═══════════════════════════════════════════╗"
echo "  ║                                           ║"
echo "  ║       ┌┐┌┌─┐┌─┐┌─┐┌─┐┌┐┌ ┬┌─┐            ║"
echo "  ║       ││││ ││ ┬│ ││ ││││ ││ │            ║"
echo "  ║       ┘└┘└─┘└─┘└─┘└─┘┘└┘o┴└─┘            ║"
echo "  ║                                           ║"
echo "  ║       FREE trial — 72 hours of focus      ║"
echo "  ╚═══════════════════════════════════════════╝"
echo -e "${NC}"

# ── Check root ──────────────────────────────────────────────────────────────
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}✘ This script must be run with sudo.${NC}"
  echo "  Run: curl -sL nogoon.io/setup.sh | sudo bash"
  exit 1
fi

# ── Check macOS ─────────────────────────────────────────────────────────────
if [[ "$(uname)" != "Darwin" ]]; then
  echo -e "${RED}✘ This script currently only supports macOS.${NC}"
  exit 1
fi

# ── Check if already installed ──────────────────────────────────────────────
MARKER="# === NOGOON.IO ==="
if grep -q "$MARKER" /etc/hosts 2>/dev/null; then
  echo -e "${YELLOW}⚠ nogoon.io is already installed on this machine.${NC}"
  echo "  To reinstall, first remove the existing entries from /etc/hosts."
  exit 0
fi

HOSTS_FILE="/etc/hosts"

# ── Unlock hosts file if locked ─────────────────────────────────────────────
chflags noschg "$HOSTS_FILE" 2>/dev/null || true

echo -e "${BOLD}Starting installation (free trial)...${NC}"
echo ""

# ── Step 1: Set CleanBrowsing Adult DNS ─────────────────────────────────────
echo -e "${BLUE}[1/6]${NC} Setting up DNS filtering..."

DNS1="185.228.168.10"
DNS2="185.228.169.11"

interfaces=$(networksetup -listallnetworkservices 2>/dev/null | tail -n +2 | grep -v '^\*')
while IFS= read -r iface; do
  networksetup -setdnsservers "$iface" "$DNS1" "$DNS2" 2>/dev/null && \
    echo -e "  ${GREEN}✓${NC} DNS set on: $iface" || true
done <<< "$interfaces"

echo ""

# ── Step 2: Block adult sites in hosts file ─────────────────────────────────
echo -e "${BLUE}[2/6]${NC} Blocking adult sites..."

cat >> "$HOSTS_FILE" << 'HOSTS'

# === NOGOON.IO ===
# Installed by nogoon.io — FREE TRIAL
# This will auto-revert. Want permanent? https://nogoon.io

# ── Porn sites ──
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

# ── DNS-over-HTTPS bypass prevention ──
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

# ── Forced SafeSearch ──
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

# === END NOGOON.IO ===
HOSTS

echo -e "  ${GREEN}✓${NC} 60+ adult sites blocked"
echo -e "  ${GREEN}✓${NC} DNS bypass prevention active"
echo -e "  ${GREEN}✓${NC} Google & Bing SafeSearch enforced"

echo ""

# ── Step 3: Flush DNS ──────────────────────────────────────────────────────
echo -e "${BLUE}[3/6]${NC} Flushing DNS cache..."
dscacheutil -flushcache 2>/dev/null || true
killall -HUP mDNSResponder 2>/dev/null || true
echo -e "  ${GREEN}✓${NC} DNS cache flushed"

# ── Step 4: Lock hosts file ────────────────────────────────────────────────
echo -e "${BLUE}[4/6]${NC} Locking hosts file..."
chflags schg "$HOSTS_FILE"
echo -e "  ${GREEN}✓${NC} Hosts file locked (immutable)"

# ── Step 5: Create cleanup script ──────────────────────────────────────────
echo -e "${BLUE}[5/6]${NC} Setting up auto-revert timer (trial)..."

cat > "$CLEANUP_SCRIPT" << 'CLEANUP'
#!/bin/bash
# nogoon.io cleanup — trial expired
HOSTS_FILE="/etc/hosts"
LABEL="io.nogoon.cleanup"

# Unlock hosts file
chflags noschg "$HOSTS_FILE" 2>/dev/null || true

# Remove nogoon entries from hosts
sed -i '' '/# === NOGOON.IO ===/,/# === END NOGOON.IO ===/d' "$HOSTS_FILE"

# Reset DNS to automatic on all interfaces
interfaces=$(networksetup -listallnetworkservices 2>/dev/null | tail -n +2 | grep -v '^\*')
while IFS= read -r iface; do
  networksetup -setdnsservers "$iface" "Empty" 2>/dev/null || true
done <<< "$interfaces"

# Flush DNS
dscacheutil -flushcache 2>/dev/null || true
killall -HUP mDNSResponder 2>/dev/null || true

# Self-cleanup: remove files FIRST, then bootout (bootout may kill us)
rm -f "/Library/LaunchDaemons/${LABEL}.plist"
rm -f "$0"
# Bootout last — even if it kills this process, files are already gone
launchctl bootout "system/${LABEL}" 2>/dev/null || true
CLEANUP

chmod +x "$CLEANUP_SCRIPT"
echo -e "  ${GREEN}✓${NC} Cleanup script created"

# ── Step 6: Schedule the cleanup via launchd ────────────────────────────────
echo -e "${BLUE}[6/6]${NC} Scheduling auto-revert..."

# Calculate the exact revert date
REVERT_EPOCH=$(($(date +%s) + TRIAL_SECONDS))

# Extract date components
REVERT_YEAR=$(date -r "$REVERT_EPOCH" "+%Y")
REVERT_MONTH=$(date -r "$REVERT_EPOCH" "+%-m")
REVERT_DAY=$(date -r "$REVERT_EPOCH" "+%-d")
REVERT_HOUR=$(date -r "$REVERT_EPOCH" "+%-H")
REVERT_MINUTE=$(date -r "$REVERT_EPOCH" "+%-M")

cat > "$CLEANUP_PLIST" << PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${TRIAL_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>${CLEANUP_SCRIPT}</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Year</key>
    <integer>${REVERT_YEAR}</integer>
    <key>Month</key>
    <integer>${REVERT_MONTH}</integer>
    <key>Day</key>
    <integer>${REVERT_DAY}</integer>
    <key>Hour</key>
    <integer>${REVERT_HOUR}</integer>
    <key>Minute</key>
    <integer>${REVERT_MINUTE}</integer>
  </dict>
  <key>RunAtLoad</key>
  <false/>
</dict>
</plist>
PLIST

# Load the job
launchctl bootstrap system "$CLEANUP_PLIST" 2>/dev/null || launchctl load "$CLEANUP_PLIST" 2>/dev/null || true
echo -e "  ${GREEN}✓${NC} Auto-revert scheduled"

# ── Done ────────────────────────────────────────────────────────────────────
TRIAL_HUMAN="72 hours"
REVERT_DISPLAY=$(date -r "$REVERT_EPOCH" "+%H:%M on %b %d" 2>/dev/null || echo "soon")

echo ""
echo -e "${GREEN}${BOLD}════════════════════════════════════════════${NC}"
echo -e "${GREEN}${BOLD}  ✓ Porn is now blocked on this Mac.${NC}"
echo -e "${GREEN}${BOLD}════════════════════════════════════════════${NC}"
echo ""
echo -e "  ${BOLD}FREE trial active — expires in ${TRIAL_HUMAN}${NC}"
echo -e "  Auto-reverts at: ${REVERT_DISPLAY}"
echo ""
echo -e "  ${BOLD}What's active:${NC}"
echo -e "  • CleanBrowsing Adult DNS on all interfaces"
echo -e "  • 60+ adult sites blocked via hosts file"
echo -e "  • DNS-over-HTTPS bypass prevention"
echo -e "  • Google & Bing SafeSearch enforced"
echo -e "  • Hosts file locked (cannot be edited)"
echo ""
echo -e "  ${BOLD}Not affected:${NC} YouTube, Reddit, Twitter/X, all other sites"
echo ""
echo -e "  ${YELLOW}${BOLD}⏰ After ${TRIAL_HUMAN}, porn will be unblocked again.${NC}"
echo -e "  ${YELLOW}   Want it blocked PERMANENTLY?${NC}"
echo -e "  ${BOLD}   → https://nogoon.io ← ${NC}"
echo ""
echo -e "  ${BOLD}Restart your browser${NC} for changes to take full effect."
echo ""
