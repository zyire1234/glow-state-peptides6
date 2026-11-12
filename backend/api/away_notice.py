"""FEATURE 4 — "We're away 17th–21st November" notice to previous customers.

Kept in its own module so it never touches the other campaigns. It reuses the
shared plumbing in campaigns.py (recipient list, duplicate guard, SMTP send)
and has its own campaign key, template, image and duplicate log.
"""
import json
from pathlib import Path

from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string

from . import campaigns
from .models import EmailSendLog

AWAY_CAMPAIGN = "away_notice_nov_2026"
AWAY_SUBJECT = "Glow State is away 17th–21st November — order now ✈️"
AWAY_IMAGE_PATH = Path(__file__).resolve().parent / "emails_assets" / "glow_state_away_notice.jpg"
AWAY_IMAGE_CID = "away-notice-image"

AWAY_TEXT_LINES = [
    "Please note that I will be away from the 17th and will return on the 22nd. "
    "I will resume accepting orders upon my return.",
    "",
    "In the meantime, you can place your orders now at https://glowstatepeptide.com before then.",
    "",
    "Thank you for your understanding.",
    "Glow State",
    "",
    "You're receiving this because you've ordered from Glow State before. "
    "To stop receiving these emails, just reply with \"unsubscribe\".",
]


class _AwayEmail(EmailMultiAlternatives):
    """Text + HTML email with the notice image embedded inline (cid:), same
    technique as the promo and pen-launch emails."""

    def message(self, *, policy=None):
        msg = super().message(**({"policy": policy} if policy is not None else {}))
        html_part = msg.get_body(preferencelist=("html",))
        html_part.add_related(
            AWAY_IMAGE_PATH.read_bytes(), "image", "jpeg",
            cid=f"<{AWAY_IMAGE_CID}>", disposition="inline",
            filename="glow-state-away-notice.jpg",
        )
        return msg


def build_away_message(email, name=""):
    """Same content for everyone (no personalisation)."""
    html = render_to_string("emails/away_notice.html", {"image_cid": AWAY_IMAGE_CID})
    msg = _AwayEmail(
        subject=AWAY_SUBJECT,
        body="\n".join(AWAY_TEXT_LINES),
        from_email=settings.DEFAULT_FROM_EMAIL,
        to=[email],
    )
    msg.attach_alternative(html, "text/html")
    return msg


def send_away_test(addresses):
    """Immediate test send. Does NOT touch the duplicate log, so testing never
    uses up the real send."""
    return campaigns.send_claimed(
        AWAY_CAMPAIGN, [(a.strip(), "") for a in addresses],
        build_away_message, track=False,
    )


def send_away_to_previous_customers(dry_run=False):
    """Everyone on file (any order status, plus archived orders). Safe to run
    more than once — anyone who already received it is skipped."""
    recipients = campaigns.collect_recipients()
    if dry_run:
        done = set(EmailSendLog.objects.filter(campaign=AWAY_CAMPAIGN, status="sent").values_list("email", flat=True))
        return {"total": len(recipients), "to_send": len([r for r in recipients if r[0] not in done]), "dry_run": True}
    claimed = campaigns.claim_recipients(AWAY_CAMPAIGN, recipients)
    result = campaigns.send_claimed(AWAY_CAMPAIGN, claimed, build_away_message)
    result.update({"total": len(recipients), "skipped_already_sent": len(recipients) - len(claimed)})
    campaigns._log_activity("email_sent", json.dumps({
        "type": AWAY_CAMPAIGN, "note": "away notice to previous customers",
        **{k: result[k] for k in ("sent", "failed", "total", "skipped_already_sent")},
    }))
    return result
