#!/usr/bin/env python3
import os
import requests
requests.packages.urllib3.disable_warnings()  # skip SSL warnings for self-signed

BASE = "https://central.local"

# --- Choose one login flow ---

# 1) Web user login (email/password) -> bearer token:
def login_web(email, password):
    r = requests.post(
        f"{BASE}/v1/sessions",
        json={"email": email, "password": password},
        verify=False,  # set to a CA bundle path instead of False if you have it
    )
    r.raise_for_status()
    data = r.json()
    return data["token"]

# 2) App-user login -> short token:
def login_app_user(project_id, username, password):
    r = requests.post(
        f"{BASE}/v1/projects/{project_id}/app-users/login",
        json={"username": username, "password": password},
        verify=False,
    )
    r.raise_for_status()
    data = r.json()
    return data["token"]

# --- Example usage: replace with your creds ---
token = login_web(email="your@email.com", password="password@2026")
# or:
# token = login_app_user(project_id=1, username="collect-user", password="GoodPass!1X")

# Make an authenticated call (list app users for project 1)
resp = requests.get(
    f"{BASE}/v1/projects/1/app-users",
    headers={"Authorization": f"Bearer {token}"},
    verify=False,
)
resp.raise_for_status()
print(resp.json())
