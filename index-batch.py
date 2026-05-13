#!/usr/bin/env python3
"""
Google Indexing API batch submitter for nogoon.io.

Usage:
  ~/.gcp/venv/bin/python3 index-batch.py                # all sitemap URLs
  ~/.gcp/venv/bin/python3 index-batch.py URL1 URL2 ...  # specific URLs

First run: opens a browser to authorize. Token saved to ~/.gcp/nogoon-token.json.
"""
import os, sys, re, json, pathlib, urllib.request

from google_auth_oauthlib.flow import InstalledAppFlow
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build

CLIENT_SECRET = os.path.expanduser('~/.gcp/nogoon-oauth.json')
TOKEN_FILE    = os.path.expanduser('~/.gcp/nogoon-token.json')
SCOPES        = ['https://www.googleapis.com/auth/indexing']
SITEMAP_PATH  = pathlib.Path(__file__).parent / 'public' / 'sitemap.xml'


def get_creds():
    creds = None
    if os.path.exists(TOKEN_FILE):
        creds = Credentials.from_authorized_user_file(TOKEN_FILE, SCOPES)
    if creds and creds.valid:
        return creds
    if creds and creds.expired and creds.refresh_token:
        creds.refresh(Request())
    else:
        flow = InstalledAppFlow.from_client_secrets_file(CLIENT_SECRET, SCOPES)
        creds = flow.run_local_server(port=0)
    with open(TOKEN_FILE, 'w') as f:
        f.write(creds.to_json())
    os.chmod(TOKEN_FILE, 0o600)
    return creds


def load_sitemap_urls():
    if SITEMAP_PATH.exists():
        xml = SITEMAP_PATH.read_text()
    else:
        xml = urllib.request.urlopen('https://nogoon.io/sitemap.xml').read().decode()
    return re.findall(r'<loc>([^<]+)</loc>', xml)


def main():
    urls = sys.argv[1:] or load_sitemap_urls()
    if not urls:
        sys.exit('No URLs to submit.')

    creds = get_creds()
    service = build('indexing', 'v3', credentials=creds, cache_discovery=False)

    ok = fail = 0
    for url in urls:
        body = {'url': url, 'type': 'URL_UPDATED'}
        try:
            r = service.urlNotifications().publish(body=body).execute()
            t = r.get('urlNotificationMetadata', {}).get('latestUpdate', {}).get('notifyTime', '')
            print(f'OK    {url}   ({t})')
            ok += 1
        except Exception as e:
            msg = str(e)
            short = msg[:200].replace('\n', ' ')
            print(f'FAIL  {url}   {short}')
            fail += 1

    print(f'\n=== Submitted: {ok} OK | {fail} FAIL | {len(urls)} total ===')


if __name__ == '__main__':
    main()
