"""Timer for the scheduled promotional email (Feature 1).

At PROMO_BLAST_AT (business time zone, see settings.py) the web server sends
the Grand Final promo ONCE to every email address already on file.

  * start() is called from core/wsgi.py. It starts a background thread that
    calls tick() every 30 seconds.
  * tick(now) does one check and returns a short status string:
        "disabled"         PROMO_BLAST_AT is blank - timer switched off
        "waiting"          the scheduled time hasn't arrived yet
        "expired"          too late (more than PROMO_BLAST_GRACE_HOURS after)
        "done"             everyone on file has already received it
        "email-not-ready"  SMTP isn't configured yet - tries again next tick
        "fired"            the promo was sent just now
  * It is safe to run on several workers / restarts: campaigns.py records
    every recipient in the database, so nobody is ever emailed twice.
"""
import logging
import threading
import time
from datetime import datetime, timedelta

from django.conf import settings
from django.db import close_old_connections
from django.utils import timezone

from . import campaigns

logger = logging.getLogger(__name__)

CHECK_EVERY_SECONDS = 30

_started = False
_start_lock = threading.Lock()
_warned_not_ready = False


def scheduled_time():
    """The blast moment as an aware datetime, or None if the timer is off."""
    raw = (getattr(settings, "PROMO_BLAST_AT", "") or "").strip()
    if not raw:
        return None
    when = datetime.fromisoformat(raw)
    if when.tzinfo is None:
        when = when.replace(tzinfo=campaigns.business_tz())
    return when


def tick(now=None):
    """One clock check. Returns a status string (see module docstring)."""
    global _warned_not_ready
    now = now or timezone.now()

    when = scheduled_time()
    if when is None:
        return "disabled"
    if now < when:
        return "waiting"
    grace = timedelta(hours=int(getattr(settings, "PROMO_BLAST_GRACE_HOURS", 12)))
    if now > when + grace:
        return "expired"

    # Nothing left to send (already blasted, manually or by an earlier tick)?
    if campaigns.send_promo_to_previous_customers(dry_run=True)["to_send"] == 0:
        return "done"

    ok, reason = campaigns.email_ready()
    if not ok:
        if not _warned_not_ready:
            _warned_not_ready = True
            logger.warning("Scheduled promo is due but email isn't ready yet: %s", reason)
        return "email-not-ready"

    result = campaigns.send_promo_to_previous_customers()
    logger.info(
        "Scheduled promo sent: %s sent, %s failed, %s already received",
        result.get("sent"), result.get("failed"), result.get("skipped_already_sent"),
    )
    return "fired"


def _loop():
    while True:
        try:
            close_old_connections()
            status = tick()
            if status in ("disabled", "expired", "done"):
                logger.info("Promo scheduler finished (%s).", status)
                return
        except Exception:
            logger.exception("promo scheduler tick failed")
        finally:
            close_old_connections()
        time.sleep(CHECK_EVERY_SECONDS)


def start():
    """Start the background timer once per process. Never raises."""
    global _started
    with _start_lock:
        if _started:
            return
        _started = True
    try:
        if scheduled_time() is None:
            return
        threading.Thread(target=_loop, name="promo-scheduler", daemon=True).start()
    except Exception:
        logger.exception("could not start promo scheduler")
