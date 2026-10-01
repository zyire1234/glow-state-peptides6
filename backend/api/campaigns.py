"""One-off email campaigns, kept deliberately separate from the transactional
order emails in email_utils.py:

  FEATURE 1 — Promotional message (flyer + fixed message).
  FEATURE 2 — Returning-customer discount-code notification (short, no flyer).

The two features share only the plumbing at the top of this file (finding
recipients, claiming them so nobody is emailed twice, and sending). Their
message builders, campaign keys and duplicate checks are independent, so
using one can never trigger the other.

Nothing here modifies, deletes or reorders Order records — they are only read.
"""
import json
import logging
import threading
from datetime import datetime, timedelta
from decimal import Decimal
from pathlib import Path
from zoneinfo import ZoneInfo

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.mail import EmailMultiAlternatives, get_connection
from django.core.validators import validate_email
from django.db import close_old_connections
from django.template.loader import render_to_string
from django.utils import timezone

from .models import Activity, Archive, EmailSendLog, Order

logger = logging.getLogger(__name__)

# A "sending" claim older than this is treated as abandoned (e.g. the server
# restarted mid-send) and may be picked up again.
STALE_CLAIM_MINUTES = 10


# ---------------------------------------------------------------------------
# Time zone helpers
# ---------------------------------------------------------------------------

def business_tz():
    return ZoneInfo(settings.BUSINESS_TIMEZONE)


def format_business_time(dt):
    """e.g. 'Sunday 4 October 2026, 6:00 PM AEDT' in the business time zone."""
    local = dt.astimezone(business_tz())
    hour = local.strftime("%I").lstrip("0") or "12"
    return f"{local.strftime('%A')} {local.day} {local.strftime('%B %Y')}, {hour}:{local.strftime('%M %p %Z')}"


def promo_window_end():
    """The promo order window end as an aware datetime (business time zone)."""
    naive = datetime.fromisoformat(settings.PROMO_ORDER_WINDOW_END)
    if naive.tzinfo is None:
        return naive.replace(tzinfo=business_tz())
    return naive


def promo_window_open():
    return timezone.now() <= promo_window_end()


# ---------------------------------------------------------------------------
# Recipients — every email address ever collected, any order status
# ---------------------------------------------------------------------------

def _clean_email(raw):
    email = (raw or "").strip().lower()
    if not email:
        return None
    try:
        validate_email(email)
    except ValidationError:
        return None
    return email


def _first_name(raw_name):
    """Best-effort first name for the greeting; blank if it doesn't look like
    a real name (empty, or someone typed an email address in the name box)."""
    name = (raw_name or "").strip()
    if not name or "@" in name:
        return ""
    first = name.split()[0]
    return first.capitalize() if first.isupper() or first.islower() else first


def collect_recipients():
    """Returns a list of (email, name) — one entry per distinct email address.

    Covers EVERY order regardless of status (pending, paid, shipped,
    cancelled, ...), plus orders that were moved to the Archive by the
    "Website Cleaning" feature, so no previously-collected email is lost.
    The name is taken from that customer's most recent order.
    """
    people = {}

    # Archived orders first (oldest data), so live orders override the name.
    for archive in Archive.objects.filter(category="orders").order_by("id"):
        try:
            records = json.loads(archive.data or "[]")
        except ValueError:
            continue
        for rec in records:
            email = _clean_email(rec.get("customer_email"))
            if email:
                people[email] = rec.get("customer_name") or people.get(email, "")

    for email_raw, name in Order.objects.order_by("created_at").values_list("customer_email", "customer_name"):
        email = _clean_email(email_raw)
        if email:
            people[email] = name or people.get(email, "")

    return [(email, _first_name(name)) for email, name in sorted(people.items())]


# ---------------------------------------------------------------------------
# Claiming recipients (the duplicate guard)
# ---------------------------------------------------------------------------

def claim_recipients(campaign, recipients, force=False):
    """Marks each (email, name) as 'sending' for this campaign and returns
    only the ones this caller is allowed to send to now.

    Skipped (not returned): addresses already 'sent', or currently being sent
    by another run. 'failed' and stale claims are retried. force=True claims
    everyone again — used only for a deliberate admin "resend".
    """
    claimed = []
    stale_before = timezone.now() - timedelta(minutes=STALE_CLAIM_MINUTES)
    for email, name in recipients:
        log, created = EmailSendLog.objects.get_or_create(
            campaign=campaign, email=email, defaults={"status": "sending"}
        )
        if not created:
            retryable = (
                force
                or log.status == "failed"
                or (log.status == "sending" and log.updated_at < stale_before)
            )
            if not retryable:
                continue
            log.status = "sending"
            log.error = ""
            log.save(update_fields=["status", "error", "updated_at"])
        claimed.append((email, name))
    return claimed


def campaign_counts(campaign):
    rows = EmailSendLog.objects.filter(campaign=campaign)
    return {
        "sent": rows.filter(status="sent").count(),
        "failed": rows.filter(status="failed").count(),
        "sending": rows.filter(status="sending").count(),
    }


def _log_activity(kind, description):
    try:
        Activity.objects.create(type=kind, description=description)
    except Exception:  # never let logging break a send
        logger.exception("could not write activity log")


# ---------------------------------------------------------------------------
# Sending
# ---------------------------------------------------------------------------

def email_ready():
    """(ok, reason) — whether SMTP is configured, same rule as email_utils."""
    if not settings.EMAIL_ENABLED or not settings.EMAIL_HOST:
        return False, "Email sending is disabled (EMAIL_ENABLED/SMTP_HOST not configured)."
    return True, None


def send_claimed(campaign, claimed, build_message, track=True):
    """Sends one email per claimed recipient over a single SMTP connection.

    build_message(email, name) -> EmailMultiAlternatives.
    Each result is written to EmailSendLog (unless track=False, used for
    test sends so tests never use up the real duplicate guard).
    Returns {"sent": n, "failed": n, "errors": [...]} — never raises.
    """
    sent = failed = 0
    errors = []
    ok, reason = email_ready()
    if not ok:
        for email, _name in claimed:
            if track:
                EmailSendLog.objects.filter(campaign=campaign, email=email).update(status="failed", error=reason)
        return {"sent": 0, "failed": len(claimed), "errors": [reason] if claimed else []}

    try:
        connection = get_connection(fail_silently=False)
        connection.open()
    except Exception as exc:
        for email, _name in claimed:
            if track:
                EmailSendLog.objects.filter(campaign=campaign, email=email).update(status="failed", error=str(exc))
        return {"sent": 0, "failed": len(claimed), "errors": [str(exc)]}

    try:
        for email, name in claimed:
            try:
                msg = build_message(email, name)
                msg.connection = connection
                count = msg.send(fail_silently=False)
                if count < 1:
                    raise RuntimeError("SMTP server accepted zero recipients.")
                sent += 1
                if track:
                    EmailSendLog.objects.filter(campaign=campaign, email=email).update(status="sent", error="")
            except Exception as exc:
                failed += 1
                errors.append(f"{email}: {exc}")
                if track:
                    EmailSendLog.objects.filter(campaign=campaign, email=email).update(status="failed", error=str(exc)[:500])
    finally:
        try:
            connection.close()
        except Exception:
            pass

    return {"sent": sent, "failed": failed, "errors": errors[:10]}


def send_in_background(campaign, claimed, build_message, done_note):
    """Runs send_claimed in a daemon thread so an admin request (or a
    checkout) returns immediately instead of waiting on SMTP."""
    def _run():
        close_old_connections()
        try:
            result = send_claimed(campaign, claimed, build_message)
            _log_activity("email_sent", json.dumps({
                "type": campaign, "note": done_note,
                "sent": result["sent"], "failed": result["failed"], "errors": result["errors"],
            }))
        except Exception:
            logger.exception("background campaign send crashed")
        finally:
            close_old_connections()

    threading.Thread(target=_run, daemon=True).start()


# ===========================================================================
# FEATURE 1 — Promotional message
# ===========================================================================

PROMO_CAMPAIGN = "promo_grand_final_2026"
PROMO_SUBJECT = "🏉 Grand Final Special — 20% OFF!"
PROMO_FLYER_PATH = Path(__file__).resolve().parent / "emails_assets" / "glow_state_grand_final_flyer.jpg"
PROMO_FLYER_CID = "grand-final-flyer"

# The exact message supplied by the business owner — one string per line.
PROMO_TEXT_LINES = [
    "Hey there!",
    "Grand Final weekend is here, and we're celebrating with 20% OFF! 🎉",
    "Whether you're backing the Roosters or the Knights, enjoy a little something from us this weekend!",
    "",
    "🏉 Use code: NRLGF",
    "💜 20% OFF storewide",
    "⏰ Saturday until Sunday, 6 PM",
    "This weekend only, so don't miss out!",
    "",
    "Thank you for your continued support. We appreciate you! 💙",
    "Glow State",
]


class _PromoEmail(EmailMultiAlternatives):
    """Text + HTML email whose HTML part carries the flyer as an inline
    (cid:) image — multipart/related, which Outlook/Hotmail/Gmail show
    directly in the body without a "download pictures" prompt.

    Uses the standard library's add_related(), which is what Django 6's
    message API is built on (the old `mixed_subtype` trick no longer exists).
    """

    def message(self, *, policy=None):
        msg = super().message(**({"policy": policy} if policy is not None else {}))
        html_part = msg.get_body(preferencelist=("html",))
        html_part.add_related(
            PROMO_FLYER_PATH.read_bytes(), "image", "jpeg",
            cid=f"<{PROMO_FLYER_CID}>", disposition="inline",
            filename="glow-state-grand-final-special.jpg",
        )
        return msg


def build_promo_message(email, name=""):
    """The promotional email: flyer shown inline at the top, then the exact
    message. Same content for everyone (no personalisation), per the brief."""
    html = render_to_string("emails/promo_grand_final.html", {"flyer_cid": PROMO_FLYER_CID})
    msg = _PromoEmail(
        subject=PROMO_SUBJECT,
        body="\n".join(PROMO_TEXT_LINES),
        from_email=settings.DEFAULT_FROM_EMAIL,
        to=[email],
    )
    msg.attach_alternative(html, "text/html")
    return msg


def send_promo_test(addresses):
    """Immediate test send of Feature 1. Does NOT touch the duplicate log."""
    return send_claimed(PROMO_CAMPAIGN, [(a.strip(), "") for a in addresses], build_promo_message, track=False)


def send_promo_to_previous_customers(dry_run=False):
    """Feature 1, part A: everyone already on file. Safe to run repeatedly —
    anyone who already got it is skipped."""
    recipients = collect_recipients()
    claimed = claim_recipients(PROMO_CAMPAIGN, recipients) if not dry_run else []
    if dry_run:
        done = set(EmailSendLog.objects.filter(campaign=PROMO_CAMPAIGN, status="sent").values_list("email", flat=True))
        return {"total": len(recipients), "to_send": len([r for r in recipients if r[0] not in done]), "dry_run": True}
    result = send_claimed(PROMO_CAMPAIGN, claimed, build_promo_message)
    result.update({"total": len(recipients), "skipped_already_sent": len(recipients) - len(claimed)})
    _log_activity("email_sent", json.dumps({"type": PROMO_CAMPAIGN, "note": "promo blast to previous customers", **{
        k: result[k] for k in ("sent", "failed", "total", "skipped_already_sent")}}))
    return result


def send_promo_for_new_order(order):
    """Feature 1, part B: called after a customer places an order. Sends the
    promo (in the background, so checkout isn't slowed) if the promo window
    is still open and they haven't already received it. Never raises."""
    try:
        if not settings.PROMO_AUTO_SEND_ON_ORDER or not promo_window_open():
            return
        email = _clean_email(order.customer_email)
        if not email:
            return
        claimed = claim_recipients(PROMO_CAMPAIGN, [(email, "")])
        if claimed:
            send_in_background(PROMO_CAMPAIGN, claimed, build_promo_message, f"promo for new order #{order.id}")
    except Exception:
        logger.exception("promo-on-order failed (order is unaffected)")


# ===========================================================================
# FEATURE 2 — Returning-customer discount code
# ===========================================================================

def coupon_campaign(coupon):
    return f"coupon_{coupon.id}"


def build_coupon_message(coupon, email, name=""):
    greeting_line = f"Hi {name}, we've just released a new discount code for you!" if name else \
        "We've just released a new discount code for you!"
    context = {
        "name": name,
        "code": coupon.code,
        "percent": f"{Decimal(str(coupon.discount_percent)).normalize():f}",
        "deadline": format_business_time(coupon.expires_at),
        "greeting_line": greeting_line,
    }
    html = render_to_string("emails/coupon_returning_customer.html", context)
    text = (
        "Dear Returning Customer,\n\n"
        f"{greeting_line}\n\n"
        f"Your code: {context['code']} ({context['percent']}% off)\n"
        f"Use it by: {context['deadline']}\n\n"
        "Thank you for shopping with us.\nGlow State"
    )
    msg = EmailMultiAlternatives(
        subject=f"Your new discount code: {coupon.code}",
        body=text,
        from_email=settings.DEFAULT_FROM_EMAIL,
        to=[email],
    )
    msg.attach_alternative(html, "text/html")
    return msg


def send_coupon_test(coupon, address, name=""):
    """Test send of Feature 2 to one address. No duplicate-log entry, and
    nothing from Feature 1 is involved."""
    return send_claimed(
        coupon_campaign(coupon), [(address.strip(), name)],
        lambda email, nm: build_coupon_message(coupon, email, nm), track=False,
    )


def start_coupon_notification(coupon, resend=False):
    """Feature 2 real send. Claims recipients synchronously (so a double click
    can't double-send), then sends in the background.

    Returns {"total", "queued", "already_sent"}; the caller polls
    campaign_counts() for progress.
    """
    campaign = coupon_campaign(coupon)
    recipients = collect_recipients()
    claimed = claim_recipients(campaign, recipients, force=resend)
    if claimed:
        send_in_background(
            campaign, claimed,
            lambda email, nm: build_coupon_message(coupon, email, nm),
            f"discount code {coupon.code} sent to returning customers",
        )
    return {
        "total": len(recipients),
        "queued": len(claimed),
        "already_sent": len(recipients) - len(claimed),
    }
