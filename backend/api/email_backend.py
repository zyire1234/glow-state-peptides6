"""Stub for api/email_backend.py.

campaigns.py does `from .email_backend import is_blocked`. That file was
missing from the repo, which made the Render build fail with
ModuleNotFoundError. If you have the ORIGINAL email_backend.py on your
computer, commit that instead of this one.

is_blocked(email) -> True means "never send marketing email to this address".
Add addresses to BLOCKED_EMAILS below, or set the EMAIL_BLOCKLIST env var
(comma-separated) on Render.
"""
import os

BLOCKED_EMAILS = set()


def _blocklist():
    extra = os.environ.get("EMAIL_BLOCKLIST", "")
    items = {e.strip().lower() for e in extra.split(",") if e.strip()}
    return {e.lower() for e in BLOCKED_EMAILS} | items


def is_blocked(email):
    return (email or "").strip().lower() in _blocklist()
