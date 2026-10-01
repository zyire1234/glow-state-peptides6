"""FEATURE 1 — Promotional message (flyer + exact message).

Examples (run in the Render Shell, from the backend folder):

  # Immediate test to specific inboxes (does NOT use up the duplicate guard):
  python manage.py send_promo --test Glowstatesupport@hotmail.com zainababdulmumin93@gmail.com

  # See how many previous customers would receive it, without sending:
  python manage.py send_promo --dry-run

  # Send to every previously collected email (any order status).
  # Safe to run more than once — anyone who already got it is skipped.
  python manage.py send_promo --blast
"""
from django.core.management.base import BaseCommand, CommandError

from api import campaigns


class Command(BaseCommand):
    help = "Feature 1: send the Grand Final promotional email (test, dry-run, or blast to previous customers)."

    def add_arguments(self, parser):
        parser.add_argument("--test", nargs="+", metavar="EMAIL", help="Send a test to these addresses only.")
        parser.add_argument("--dry-run", action="store_true", help="Count recipients, send nothing.")
        parser.add_argument("--blast", action="store_true", help="Send to all previous customers (deduplicated).")

    def handle(self, *args, **opts):
        chosen = [bool(opts["test"]), opts["dry_run"], opts["blast"]]
        if sum(chosen) != 1:
            raise CommandError("Choose exactly one of --test EMAIL..., --dry-run, or --blast.")

        ok, reason = campaigns.email_ready()
        if not ok and not opts["dry_run"]:
            raise CommandError(reason)

        if opts["test"]:
            result = campaigns.send_promo_test(opts["test"])
            self.stdout.write(self.style.SUCCESS(f"Test sent: {result['sent']}, failed: {result['failed']}"))
            for err in result["errors"]:
                self.stdout.write(self.style.ERROR(f"  {err}"))
            return

        if opts["dry_run"]:
            r = campaigns.send_promo_to_previous_customers(dry_run=True)
            self.stdout.write(f"{r['total']} distinct emails on file; {r['to_send']} still to receive the promo.")
            return

        r = campaigns.send_promo_to_previous_customers()
        self.stdout.write(self.style.SUCCESS(
            f"Promo sent: {r['sent']}, failed: {r['failed']}, "
            f"skipped (already received): {r['skipped_already_sent']}, total on file: {r['total']}"
        ))
        for err in r["errors"]:
            self.stdout.write(self.style.ERROR(f"  {err}"))
