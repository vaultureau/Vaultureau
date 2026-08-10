#!/usr/bin/env python3
import base64
import getpass
import json
import sys
import urllib.parse
import urllib.request
import urllib.error


TOKEN_URL = "https://api.ebay.com/identity/v1/oauth2/token"


def prompt(label, secret=False):
    if secret:
        return getpass.getpass(label).strip()
    return input(label).strip()


def extract_code(value):
    if value.startswith("http://") or value.startswith("https://"):
        parsed = urllib.parse.urlparse(value)
        params = urllib.parse.parse_qs(parsed.query)
        if "code" not in params or not params["code"]:
            raise ValueError("That URL does not contain a code= parameter.")
        return params["code"][0]
    return value


def main():
    print("This only exchanges your temporary eBay OAuth code for a refresh token.")
    print("It does not save secrets or write them into the website.\n")

    client_id = prompt("Production App ID / Client ID: ")
    client_secret = prompt("Production Cert ID / Client Secret: ", secret=True)
    runame = prompt("RuName: ")
    code_or_url = prompt("Full OAuth redirect URL or code: ")

    code = extract_code(code_or_url)
    body = urllib.parse.urlencode({
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": runame,
    }).encode()
    auth = base64.b64encode(f"{client_id}:{client_secret}".encode()).decode()

    request = urllib.request.Request(
        TOKEN_URL,
        data=body,
        headers={
            "Content-Type": "application/x-www-form-urlencoded",
            "Authorization": f"Basic {auth}",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request) as response:
            payload = json.loads(response.read())
    except urllib.error.HTTPError as error:
        print("\neBay returned an error:")
        print(error.read().decode())
        print("\nIf this says invalid_client, double-check you used the Production App ID and Production Cert ID from the same eBay app.")
        print("If this says invalid_grant, generate a fresh Test Sign-In URL because the code expired.")
        return 1

    refresh_token = payload.get("refresh_token")
    if not refresh_token:
        print(json.dumps(payload, indent=2))
        print("\nNo refresh_token was returned.")
        return 1

    print("\nSuccess. Copy this into GitHub Secrets as EBAY_REFRESH_TOKEN:\n")
    print(refresh_token)
    return 0


if __name__ == "__main__":
    sys.exit(main())
