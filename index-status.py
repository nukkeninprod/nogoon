#!/usr/bin/env python3
"""
Check Google Indexing API submission status for nogoon.io URLs.

Usage:
  ~/.gcp/venv/bin/python3 index-status.py                 # all sitemap URLs
  ~/.gcp/venv/bin/python3 index-status.py URL1 URL2 ...   # specific URLs

Shows last submission time per URL (URL_UPDATED / URL_DELETED).
NOTE: This only proves Google RECEIVED your request, not that it crawled/indexed.
For actual indexation status, use Search Console -> URL Inspection.
"""
import os, sys, re, pathlib, urllib.request

from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build

TOKEN_FILE   = os.path.expanduser('~/.gcp/nogoon-token.json')
SCOPES       = ['https://www.googleapis.com/auth/indexing']
SITEMAP_PATH = pathlib.Path(__file__).parent / 'public' / 'sitemap.xml'


def get_creds():
    creds = Credentials.from_authorized_user_file(TOKEN_FILE, SCOPES)
    if creds.expired and creds.refresh_token:
        creds.refresh(Request())
        with open(TOKEN_FILE, 'w') as f:
            f.write(creds.to_json())
    return creds


def load_sitemap_urls():
    if SITEMAP_PATH.exists():
        xml = SITEMAP_PATH.read_text()
    else:
        xml = urllib.request.urlopen('https://nogoon.io/sitemap.xml').read().decode()
    return re.findall(r'<loc>([^<]+)</loc>', xml)


def main():
    urls = sys.argv[1:] or load_sitemap_urls()
    creds = get_creds()
    service = build('indexing', 'v3', credentials=creds, cache_discovery=False)

    submitted = never = err = 0
    for url in urls:
        try:
            r = service.urlNotifications().getMetadata(url=url).execute()
            latest = r.get('latestUpdate', {})
            t = latest.get('notifyTime', '?')
            kind = latest.get('type', '?')
            print(f'OK    {kind:14}  {t}  {url}')
            submitted += 1
        except Exception as e:
            msg = str(e)
            if '404' in msg or 'not found' in msg.lower():
                print(f'NEVER  -                                      {url}')
                never += 1
            else:
                print(f'ERR   {msg[:100]}  {url}')
                err += 1

    print(f'\n=== Submitted: {submitted} | Never sent: {never} | Errors: {err} | Total: {len(urls)} ===')


if __name__ == '__main__':
    main()
