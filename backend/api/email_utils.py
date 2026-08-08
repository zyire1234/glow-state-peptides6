"""Sends fully-branded HTML transactional emails (order confirmation, paid,
cancelled). Falls back to a safe no-op when SMTP isn't configured, exactly
like the previous plain-text notifications did — callers don't need to
change how they handle the return value.
"""
from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string
from django.utils.html import strip_tags


def send_branded_email(subject, template_name, context, to_email):
    """Renders templates/emails/{template_name}.html (which extends the
    shared base_email.html brand layout) and sends it with a plain-text
    fallback.

    Returns (sent, error): sent is True only if SMTP confirmed delivery to
    at least one recipient. error is None on success, or a short string
    describing what went wrong (missing config, auth failure, connection
    refused, etc.) so it can be logged and inspected from the admin panel.
    """
    if not settings.EMAIL_ENABLED or not settings.EMAIL_HOST:
        return False, "Email sending is disabled (EMAIL_ENABLED/SMTP_HOST not configured)."

    html_body = render_to_string(f"emails/{template_name}.html", context)
    text_body = strip_tags(html_body)

    msg = EmailMultiAlternatives(
        subject=subject,
        body=text_body,
        from_email=settings.DEFAULT_FROM_EMAIL,
        to=[to_email],
    )
    msg.attach_alternative(html_body, "text/html")

    try:
        # fail_silently=False so real SMTP errors (bad auth, wrong port,
        # connection refused, etc.) surface here instead of being silently
        # swallowed by Django and reported as a false "success".
        sent_count = msg.send(fail_silently=False)
        if sent_count >= 1:
            return True, None
        return False, "SMTP server accepted zero recipients."
    except Exception as exc:
        return False, str(exc)
