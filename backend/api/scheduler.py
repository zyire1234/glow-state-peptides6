"""Fires the Feature 1 promo blast at a set time (PROMO_BLAST_AT, business
time zone) without any manual command.

How it stays safe:
  * A "marker" row in EmailSendLog is claimed atomically (unique constraint)
    before sending, so the blast fires exactly once even with several web
    workers or restarts.
  * Every recipient is also claimed individually, so nobody can ever get the
    promo twice, whether it came from this timer, the --blast command, or
    checkout.
  * If email isn't configured when the time arrives, nothing is claimed and
    it simply retries every 30 seconds (within the grace window).
"""
import json
import logging
import threading
import time
from datetime import datetime, timedelta

from django.conf import settings
from django.db import close_old_connections
from django.utils import timezone

from . import campaigns
from .models import Activity, EmailSendLog

logger = logging.getLogger(__name__)

CHECK_EVERY_SECONDS = 30
MARKER_EMAIL = "scheduler@marker.local"
_started = False
_warned_not_ready = False


def scheduled_time():
    raw = (settings.PROMO_BLAST_AT or "").strip()
    if not raw:
        return None
    when = datetime.fromisoformat(raw)
    if when.tzinfo is None:
        when = when.replace(tzinfo=campaigns.business_tz())
    return when


def tick(now=None):
    """One clock check. Returns 'fired', 'waiting', 'done', 'expired',
    'disabled' or 'email-not-ready' (handy for tests / logs)."""
    global _warned_not_ready
    when = scheduled_time()
    if when is None:
        return "disabled"
    now = now or timezone.now()
    if now < when:
        return "waiting"
    if now > when + timedelta(hours=settings.PROMO_BLAST_GRACE_HOURS):
        return "expired"

    ok, reason = campaigns.email_ready()
    if not ok:
        if not _warned_not_ready:
            _warned_not_ready = True
            logger.warning("Scheduled promo blast is due but email is not ready: %s", reason)
        return "email-not-ready"

    marker_campaign = f"{campaigns.PROMO_CAMPAIGN}:scheduled:{when.isoformat()}"
    _, created = EmailSendLog.objects.get_or_create(
        campaign=marker_campaign, email=MARKER_EMAIL, defaults={"status": "sent"}
    )
    if not created:
        return "done"

    result = campaigns.send_promo_to_previous_customers()
    Activity.objects.create(type="email_sent", description=json.dumps({
        "type": campaigns.PROMO_CAMPAIGN,
        "note": f"scheduled promo blast at {campaigns.format_business_time(when)}",
        "sent": result["sent"], "failed": result["failed"],
        "total": result["total"], "skipped_already_sent": result["skipped_already_sent"],
        "errors": result["errors"],
    }))
    logger.info("Scheduled promo blast finished: %s", result)
    return "fired"


def _loop():
    while True:
        close_old_connections()
        try:
            tick()
        except Exception:
            logger.exception("scheduled promo check failed")
        finally:
            close_old_connections()
        time.sleep(CHECK_EVERY_SECONDS)


def start():
    """Starts the background clock once per web process."""
    global _started
    if _started or not (settings.PROMO_BLAST_AT or "").strip():
        return
    _started = True
    threading.Thread(target=_loop, name="promo-scheduler", daemon=True).start()
    logger.info("Promo scheduler armed for %s", settings.PROMO_BLAST_AT)
