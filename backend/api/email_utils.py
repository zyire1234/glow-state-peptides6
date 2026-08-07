"""Sends fully-branded HTML transactional emails (order confirmation, paid,
cancelled). Falls back to a safe no-op when SMTP isn't configured, exactly
like the previous plain-text notifications did — callers don't need to
change how they handle the return value.
"""
import os
from email.mime.image import MIMEImage

from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string
from django.utils.html import strip_tags

_LOGO_PATH = os.path.join(os.path.dirname(__file__), "emails_assets", "logo.jpg")


def send_branded_email(subject, template_name, context, to_email):
    """Renders templates/emails/{template_name}.html (which extends the
    shared base_email.html brand layout) and sends it with a plain-text
    fallback and the Glow State logo embedded inline (referenced in the
    template as cid:glow_logo).

    Returns True if the send was attempted via SMTP, False if email sending
    is disabled/not configured (EMAIL_ENABLED / SMTP_HOST env vars).
    """
    if not settings.EMAIL_ENABLED or not settings.EMAIL_HOST:
        return False

    html_body = render_to_string(f"emails/{template_name}.html", context)
    text_body = strip_tags(html_body)

    msg = EmailMultiAlternatives(
        subject=subject,
        body=text_body,
        from_email=settings.DEFAULT_FROM_EMAIL,
        to=[to_email],
    )
    msg.attach_alternative(html_body, "text/html")
    # Required so the inline cid: image is delivered as part of the same
    # multipart/related message as the HTML alternative, instead of as a
    # regular attachment.
    msg.mixed_subtype = "related"

    if os.path.exists(_LOGO_PATH):
        try:
            with open(_LOGO_PATH, "rb") as f:
                logo = MIMEImage(f.read(), _subtype="jpeg")
            logo.add_header("Content-ID", "<glow_logo>")
            logo.add_header("Content-Disposition", "inline", filename="logo.jpg")
            msg.attach(logo)
        except OSError:
            pass

    try:
        msg.send(fail_silently=True)
        return True
    except Exception:
        return False
