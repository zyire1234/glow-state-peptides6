"""Minimal server-side PayPal REST API (Orders v2) client.

Uses the PayPal Client ID + Secret (kept only on the server, via env vars)
to create and capture real PayPal orders. The frontend never talks to
PayPal's REST API directly for money-moving calls — it only uses the
public PayPal JS SDK (client-id only) to render the button, then hands
off to these two endpoints to actually create/capture the payment.
"""
import requests
from django.conf import settings


class PayPalError(Exception):
    pass


def _api_base():
    return (
        "https://api-m.paypal.com"
        if settings.PAYPAL_MODE == "live"
        else "https://api-m.sandbox.paypal.com"
    )


def get_access_token():
    client_id = settings.PAYPAL_CLIENT_ID
    client_secret = settings.PAYPAL_CLIENT_SECRET
    if not client_id or not client_secret:
        raise PayPalError(
            "PayPal is not configured on the server. Set PAYPAL_CLIENT_ID and "
            "PAYPAL_CLIENT_SECRET environment variables."
        )
    resp = requests.post(
        f"{_api_base()}/v1/oauth2/token",
        headers={"Accept": "application/json", "Accept-Language": "en_US"},
        data={"grant_type": "client_credentials"},
        auth=(client_id, client_secret),
        timeout=15,
    )
    if resp.status_code != 200:
        raise PayPalError(f"Failed to authenticate with PayPal: {resp.text}")
    return resp.json()["access_token"]


def create_order(amount, currency="AUD", reference_id=None):
    token = get_access_token()
    body = {
        "intent": "CAPTURE",
        "purchase_units": [
            {
                "reference_id": str(reference_id) if reference_id else None,
                "amount": {"currency_code": currency, "value": f"{amount:.2f}"},
                "description": "Glow State Peptides order",
            }
        ],
    }
    body["purchase_units"][0] = {k: v for k, v in body["purchase_units"][0].items() if v is not None}

    resp = requests.post(
        f"{_api_base()}/v2/checkout/orders",
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"},
        json=body,
        timeout=15,
    )
    if resp.status_code not in (200, 201):
        raise PayPalError(f"Failed to create PayPal order: {resp.text}")
    return resp.json()


def capture_order(paypal_order_id):
    token = get_access_token()
    resp = requests.post(
        f"{_api_base()}/v2/checkout/orders/{paypal_order_id}/capture",
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"},
        timeout=15,
    )
    if resp.status_code not in (200, 201):
        raise PayPalError(f"Failed to capture PayPal order: {resp.text}")
    return resp.json()
