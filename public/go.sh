#!/bin/bash
# ============================================================================
#  nogoon.io — Block porn on your Mac. Permanently. One command.
#  https://nogoon.io
#
#  Usage:
#    curl -sL nogoon.io/setup.sh | sudo bash
#    curl -sL nogoon.io/setup.sh | sudo bash -s -- --block-reddit --block-twitter
#
#  Flags:
#    --block-reddit    Also block Reddit (has NSFW content)
#    --block-twitter   Also block Twitter/X (has NSFW content)
#    --block-tumblr    Also block Tumblr (has NSFW content)
#    --no-lock         Don't lock the hosts file (not recommended)
#    --no-safesearch   Don't force SafeSearch on Google/Bing
# ============================================================================

set -e

# ── Track execution (silent, non-blocking) ───────────────────────────────
curl -s "https://nogoon.vercel.app/api/track?t=paid&os=mac" > /dev/null 2>&1 &

# ── Colors ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# ── Branding ────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${BLUE}"
echo "  ╔═══════════════════════════════════════════╗"
echo "  ║                                           ║"
echo "  ║       ┌┐┌┌─┐┌─┐┌─┐┌─┐┌┐┌ ┬┌─┐            ║"
echo "  ║       ││││ ││ ┬│ ││ ││││ ││ │            ║"
echo "  ║       ┘└┘└─┘└─┘└─┘└─┘┘└┘o┴└─┘            ║"
echo "  ║                                           ║"
echo "  ║    Block porn on your Mac. Permanently.   ║"
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
  echo "  Windows support coming soon."
  exit 1
fi

# ── Parse flags ─────────────────────────────────────────────────────────────
BLOCK_REDDIT=false
BLOCK_TWITTER=false
BLOCK_TUMBLR=false
LOCK_HOSTS=true
FORCE_SAFESEARCH=true

for arg in "$@"; do
  case $arg in
    --block-reddit)   BLOCK_REDDIT=true ;;
    --block-twitter)  BLOCK_TWITTER=true ;;
    --block-tumblr)   BLOCK_TUMBLR=true ;;
    --no-lock)        LOCK_HOSTS=false ;;
    --no-safesearch)  FORCE_SAFESEARCH=false ;;
  esac
done

# ── Hosts file marker ──────────────────────────────────────────────────────
MARKER="# === NOGOON.IO ==="
if grep -q "$MARKER" /etc/hosts 2>/dev/null; then
  echo -e "${YELLOW}⚠ nogoon.io is already installed on this machine.${NC}"
  echo "  To reinstall, first remove the existing entries from /etc/hosts."
  exit 0
fi

HOSTS_FILE="/etc/hosts"

# ── Unlock hosts file if locked ─────────────────────────────────────────────
chflags noschg "$HOSTS_FILE" 2>/dev/null || true

echo -e "${BOLD}Starting installation...${NC}"
echo ""

# ── Step 1: Set CleanBrowsing Adult DNS on all interfaces ──────────────────
# Using Adult filter (not Family) — blocks porn without restricting YouTube/Reddit/X
echo -e "${BLUE}[1/5]${NC} Setting up DNS filtering..."

DNS1="185.228.168.10"
DNS2="185.228.169.11"

interfaces=$(networksetup -listallnetworkservices 2>/dev/null | tail -n +2 | grep -v '^\*')
while IFS= read -r iface; do
  networksetup -setdnsservers "$iface" "$DNS1" "$DNS2" 2>/dev/null && \
    echo -e "  ${GREEN}✓${NC} DNS set on: $iface" || true
done <<< "$interfaces"

echo ""

# ── Step 2: Block adult sites in hosts file ─────────────────────────────────
echo -e "${BLUE}[2/5]${NC} Blocking adult sites..."

cat >> "$HOSTS_FILE" << 'HOSTS'

# === NOGOON.IO ===
# Installed by nogoon.io — https://nogoon.io
# Do not edit manually.

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
HOSTS

BLOCKED_COUNT=60
echo -e "  ${GREEN}✓${NC} $BLOCKED_COUNT adult sites blocked"

# ── Step 2b: Optional social media blocks ────────────────────────────────────
if [ "$BLOCK_REDDIT" = true ]; then
  cat >> "$HOSTS_FILE" << 'HOSTS'

# ── Reddit (NSFW content) ──
0.0.0.0 reddit.com
0.0.0.0 www.reddit.com
0.0.0.0 old.reddit.com
0.0.0.0 i.reddit.com
HOSTS
  echo -e "  ${GREEN}✓${NC} Reddit blocked"
fi

if [ "$BLOCK_TWITTER" = true ]; then
  cat >> "$HOSTS_FILE" << 'HOSTS'

# ── Twitter/X (NSFW content) ──
0.0.0.0 twitter.com
0.0.0.0 www.twitter.com
0.0.0.0 x.com
0.0.0.0 www.x.com
HOSTS
  echo -e "  ${GREEN}✓${NC} Twitter/X blocked"
fi

if [ "$BLOCK_TUMBLR" = true ]; then
  cat >> "$HOSTS_FILE" << 'HOSTS'

# ── Tumblr (NSFW content) ──
0.0.0.0 tumblr.com
0.0.0.0 www.tumblr.com
HOSTS
  echo -e "  ${GREEN}✓${NC} Tumblr blocked"
fi

# End marker
echo "" >> "$HOSTS_FILE"
echo "# === END NOGOON.IO ===" >> "$HOSTS_FILE"

# ── Step 3: Force SafeSearch ────────────────────────────────────────────────
if [ "$FORCE_SAFESEARCH" = true ]; then
  echo -e "${BLUE}[3/5]${NC} Forcing SafeSearch on Google & Bing..."

  # Insert SafeSearch entries before the end marker
  sed -i '' '/# === END NOGOON.IO ===/i\
\
# ── Forced SafeSearch ──\
216.239.38.120 www.google.com\
216.239.38.120 google.com\
216.239.38.120 www.google.fr\
216.239.38.120 google.fr\
216.239.38.120 www.google.co.uk\
216.239.38.120 www.google.de\
216.239.38.120 www.google.es\
216.239.38.120 www.google.it\
216.239.38.120 www.google.nl\
216.239.38.120 www.google.be\
216.239.38.120 www.google.ca\
216.239.38.120 www.google.com.tr\
216.239.38.120 www.google.com.au\
216.239.38.120 www.google.co.jp\
216.239.38.120 www.google.com.br\
204.79.197.220 www.bing.com\
204.79.197.220 bing.com\
' "$HOSTS_FILE"

  echo -e "  ${GREEN}✓${NC} Google SafeSearch enforced (15 regions)"
  echo -e "  ${GREEN}✓${NC} Bing SafeSearch enforced"
else
  echo -e "${BLUE}[3/5]${NC} SafeSearch skipped (--no-safesearch)"
fi

# ── Step 4: Flush DNS ──────────────────────────────────────────────────────
echo -e "${BLUE}[4/5]${NC} Flushing DNS cache..."
dscacheutil -flushcache 2>/dev/null || true
killall -HUP mDNSResponder 2>/dev/null || true
echo -e "  ${GREEN}✓${NC} DNS cache flushed"

# ── Step 5: Lock hosts file ────────────────────────────────────────────────
if [ "$LOCK_HOSTS" = true ]; then
  echo -e "${BLUE}[5/5]${NC} Locking hosts file..."
  chflags schg "$HOSTS_FILE"
  echo -e "  ${GREEN}✓${NC} Hosts file locked (immutable)"
else
  echo -e "${BLUE}[5/5]${NC} Hosts file lock skipped (--no-lock)"
fi

# ── Done ────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}════════════════════════════════════════════${NC}"
echo -e "${GREEN}${BOLD}  ✓ Porn is now blocked on this Mac.${NC}"
echo -e "${GREEN}${BOLD}════════════════════════════════════════════${NC}"
echo ""
echo -e "  ${BOLD}What's active:${NC}"
echo -e "  • CleanBrowsing Adult DNS on all network interfaces"
echo -e "  • $BLOCKED_COUNT+ adult sites blocked via hosts file"
echo -e "  • DNS-over-HTTPS bypass prevention"
[ "$FORCE_SAFESEARCH" = true ] && echo -e "  • Google & Bing SafeSearch enforced"
[ "$BLOCK_REDDIT" = true ]     && echo -e "  • Reddit blocked"
[ "$BLOCK_TWITTER" = true ]    && echo -e "  • Twitter/X blocked"
[ "$BLOCK_TUMBLR" = true ]     && echo -e "  • Tumblr blocked"
[ "$LOCK_HOSTS" = true ]       && echo -e "  • Hosts file locked (cannot be edited)"
echo ""
echo -e "  ${BOLD}Not affected:${NC} YouTube, Reddit*, Twitter/X*, all other sites"
echo -e "  ${YELLOW}*unless you chose to block them${NC}"
echo ""
echo -e "  ${BOLD}Restart your browser${NC} for changes to take full effect."
echo ""
  echo -e "  ${BLUE}Questions? https://nogoon.io/faq${NC}"
echo ""
