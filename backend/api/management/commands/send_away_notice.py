"""FEATURE 4 — "Away 17th–21st November" notice email.

Run in the Render Shell, from the backend folder:

  # 1) FIRST: test to your own inbox (does NOT use up the duplicate guard):
  python manage.py send_away_notice --test zainababdulmumin93@gmail.com

  # 2) See how many customers would receive it, without sending anything:
  python manage.py send_away_notice --dry-run

  # 3) Send to every customer email on file (any order status). Safe to run
  #    more than once — anyone who already got it is skipped:
  python manage.py send_away_notice --blast
"""
from django.core.management.base import BaseCommand, CommandError

from api import away_notice, campaigns


class Command(BaseCommand):
    help = "Send the 'away 17th-21st November' notice (test, dry-run, or blast to previous customers)."

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
            bad = [a for a in opts["test"] if not campaigns._clean_email(a)]
            if bad:
                raise CommandError(f"These don't look like valid email addresses: {', '.join(bad)}")
            result = away_notice.send_away_test(opts["test"])
            self.stdout.write(self.style.SUCCESS(f"Test sent: {result['sent']}, failed: {result['failed']}"))
            for err in result["errors"]:
                self.stdout.write(self.style.ERROR(f"  {err}"))
            return

        if opts["dry_run"]:
            r = away_notice.send_away_to_previous_customers(dry_run=True)
            self.stdout.write(f"{r['total']} distinct emails on file; {r['to_send']} still to receive the away notice.")
            return

        r = away_notice.send_away_to_previous_customers()
        self.stdout.write(self.style.SUCCESS(
            f"Away notice sent: {r['sent']}, failed: {r['failed']}, "
            f"skipped (already received): {r['skipped_already_sent']}, total on file: {r['total']}"
        ))
        for err in r["errors"]:
            self.stdout.write(self.style.ERROR(f"  {err}"))
