"""FEATURE 2 — send a TEST of a discount-code email to one or more addresses.

Completely separate from Feature 1: no flyer, no promo text, and it never
touches real customers or the duplicate guard.

  python manage.py send_coupon_test NRLGF you@example.com other@example.com
"""
from django.core.management.base import BaseCommand, CommandError

from api import campaigns
from api.models import Coupon


class Command(BaseCommand):
    help = "Feature 2: send a test of the returning-customer discount-code email."

    def add_arguments(self, parser):
        parser.add_argument("code", help="An existing discount code, e.g. NRLGF")
        parser.add_argument("emails", nargs="+", metavar="EMAIL")

    def handle(self, *args, **opts):
        coupon = Coupon.objects.filter(code=opts["code"].strip().upper()).first()
        if not coupon:
            raise CommandError(f"No discount code named {opts['code']!r}. Create it in the Admin Panel first.")
        ok, reason = campaigns.email_ready()
        if not ok:
            raise CommandError(reason)
        for address in opts["emails"]:
            r = campaigns.send_coupon_test(coupon, address)
            if r["sent"]:
                self.stdout.write(self.style.SUCCESS(f"Sent test to {address}"))
            else:
                self.stdout.write(self.style.ERROR(f"Failed for {address}: {r['errors']}"))
