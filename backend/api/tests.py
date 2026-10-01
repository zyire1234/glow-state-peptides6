import json
from datetime import datetime, timedelta, timezone as dt_timezone
from unittest import mock

from django.core import mail
from django.test import TestCase, override_settings
from django.utils import timezone

from api import campaigns
from api.models import AdminSession, AdminUser, Archive, Coupon, EmailSendLog, Order

EMAIL_ON = dict(EMAIL_ENABLED=True, EMAIL_HOST="smtp.test", DEFAULT_FROM_EMAIL="shop@test.com", SECURE_SSL_REDIRECT=False)


def make_order(email, name="Jane Doe", status="pending"):
    return Order.objects.create(
        customer_name=name, customer_email=email, customer_address="1 St",
        payment_method="payid", status=status, total_amount=10,
    )


@override_settings(**EMAIL_ON)
class PromoFeatureTests(TestCase):
    def setUp(self):
        make_order("a@x.com", status="paid")
        make_order("B@x.com", status="cancelled")
        make_order("c@x.com", status="pending")
        make_order("a@x.com", name="Jane Doe", status="shipped")  # repeat customer
        Archive.objects.create(category="orders", item_count=1, data=json.dumps(
            [{"customer_email": "old@x.com", "customer_name": "Old Timer"}]))

    def test_recipients_cover_every_status_archive_and_dedupe(self):
        emails = [e for e, _ in campaigns.collect_recipients()]
        self.assertEqual(emails, ["a@x.com", "b@x.com", "c@x.com", "old@x.com"])

    def test_test_send_has_flyer_exact_text_and_no_dedupe_log(self):
        r = campaigns.send_promo_test(["t1@x.com", "t2@x.com"])
        self.assertEqual(r["sent"], 2)
        self.assertEqual(len(mail.outbox), 2)
        m = mail.outbox[0]
        self.assertEqual(m.subject, "🏉 Grand Final Special — 20% OFF!")
        self.assertIn("Hey there!", m.body)
        self.assertIn("🏉 Use code: NRLGF", m.body)
        self.assertIn("Thank you for your continued support. We appreciate you! 💙", m.body)
        raw = m.message().as_string()
        self.assertIn("Content-ID: <grand-final-flyer>", raw)
        self.assertIn("image/jpeg", raw)
        self.assertIn("cid:grand-final-flyer", raw)
        self.assertNotIn("Dear Returning Customer", raw)
        self.assertEqual(EmailSendLog.objects.count(), 0)

    def test_blast_is_deduplicated(self):
        first = campaigns.send_promo_to_previous_customers()
        self.assertEqual((first["sent"], first["skipped_already_sent"]), (4, 0))
        second = campaigns.send_promo_to_previous_customers()
        self.assertEqual((second["sent"], second["skipped_already_sent"]), (0, 4))
        self.assertEqual(len(mail.outbox), 4)

    def test_new_order_in_window_gets_promo_once_and_blast_skips_them(self):
        with mock.patch.object(campaigns, "send_in_background",
                               side_effect=lambda c, cl, b, n: campaigns.send_claimed(c, cl, b)):
            with override_settings(PROMO_ORDER_WINDOW_END=(timezone.now() + timedelta(days=1)).isoformat()):
                new = make_order("new@x.com")
                campaigns.send_promo_for_new_order(new)
                campaigns.send_promo_for_new_order(make_order("new@x.com"))  # same person orders again
            self.assertEqual(len(mail.outbox), 1)
            blast = campaigns.send_promo_to_previous_customers()
            self.assertEqual(blast["skipped_already_sent"], 1)

    def test_no_promo_after_window_closes(self):
        with override_settings(PROMO_ORDER_WINDOW_END=(timezone.now() - timedelta(minutes=1)).isoformat()):
            campaigns.send_promo_for_new_order(make_order("late@x.com"))
        self.assertEqual(len(mail.outbox), 0)

    def test_window_end_is_sunday_6pm_sydney_daylight_saving(self):
        end = campaigns.promo_window_end()
        self.assertEqual(end.utcoffset(), timedelta(hours=11))  # AEDT from 4 Oct 2026
        self.assertEqual(end.astimezone(campaigns.business_tz()).strftime("%A %H:%M"), "Sunday 18:00")


@override_settings(**EMAIL_ON)
class CouponNotificationTests(TestCase):
    def setUp(self):
        make_order("a@x.com", name="JANE SMITH", status="cancelled")
        make_order("b@x.com", name="")
        user = AdminUser.objects.create(username="adm", password_hash="x")
        self.token = AdminSession.objects.create(admin_user=user).token
        self.coupon = Coupon.objects.create(
            code="SAVE20", discount_percent=20,
            expires_at=timezone.now() + timedelta(days=2))

    def post(self, body):
        return self.client.post(f"/api/coupons/{self.coupon.id}/notify", json.dumps(body),
                                content_type="application/json",
                                HTTP_AUTHORIZATION=f"Bearer {self.token}")

    def test_requires_admin(self):
        r = self.client.post(f"/api/coupons/{self.coupon.id}/notify", "{}", content_type="application/json")
        self.assertEqual(r.status_code, 401)

    def test_email_content_name_code_deadline_no_flyer(self):
        msg = campaigns.build_coupon_message(self.coupon, "a@x.com", "Jane")
        self.assertTrue(msg.body.startswith("Dear Returning Customer,"))
        self.assertIn("Hi Jane", msg.body)
        self.assertIn("SAVE20", msg.body)
        self.assertIn(campaigns.format_business_time(self.coupon.expires_at), msg.body)
        no_name = campaigns.build_coupon_message(self.coupon, "b@x.com", "")
        self.assertNotIn("Hi ,", no_name.body)
        raw = msg.message().as_string()
        self.assertNotIn("image/jpeg", raw)
        self.assertNotIn("NRLGF", raw)
        self.assertNotIn("Grand Final", raw)

    def test_real_send_dedupes_and_resend_works(self):
        with mock.patch.object(campaigns, "send_in_background",
                               side_effect=lambda c, cl, b, n: campaigns.send_claimed(c, cl, b)):
            r1 = self.post({})
            self.assertEqual((r1.status_code, r1.json()["queued"]), (202, 2))
            self.assertEqual(len(mail.outbox), 2)
            r2 = self.post({})  # double-click / second attempt
            self.assertEqual((r2.status_code, r2.json()["queued"], r2.json()["already_sent"]), (200, 0, 2))
            self.assertEqual(len(mail.outbox), 2)
            r3 = self.post({"resend": True})
            self.assertEqual(r3.json()["queued"], 2)
            self.assertEqual(len(mail.outbox), 4)
        # Feature 1 never triggered:
        self.assertFalse(EmailSendLog.objects.filter(campaign=campaigns.PROMO_CAMPAIGN).exists())
        self.assertEqual(self.client.get(f"/api/coupons/{self.coupon.id}/notify",
                         HTTP_AUTHORIZATION=f"Bearer {self.token}").json()["sent"], 2)

    def test_test_send_goes_to_one_address_only(self):
        r = self.post({"test_email": "me@x.com"})
        self.assertEqual(r.status_code, 200)
        self.assertEqual([m.to for m in mail.outbox], [["me@x.com"]])
        self.assertEqual(EmailSendLog.objects.count(), 0)

    def test_stopped_code_cannot_be_announced_but_code_stays_public(self):
        self.coupon.is_active = False
        self.coupon.save()
        self.assertEqual(self.post({}).status_code, 400)

    def test_notification_does_not_make_code_exclusive(self):
        before = Coupon.objects.get(id=self.coupon.id)
        with mock.patch.object(campaigns, "send_in_background",
                               side_effect=lambda c, cl, b, n: campaigns.send_claimed(c, cl, b)):
            self.post({})
        after = Coupon.objects.get(id=self.coupon.id)
        self.assertEqual((before.applies_to_all, before.is_active, before.max_uses),
                         (after.applies_to_all, after.is_active, after.max_uses))
        self.assertTrue(after.is_valid())
        orders_before = Order.objects.count()
        self.assertEqual(orders_before, 2)  # orders untouched


@override_settings(**EMAIL_ON)
class ScheduledBlastTests(TestCase):
    def setUp(self):
        from api import scheduler
        self.scheduler = scheduler
        scheduler._warned_not_ready = False
        make_order("a@x.com", status="paid")
        make_order("b@x.com", status="cancelled")
        # 3:00 PM Sydney Friday 2 Oct 2026 = 05:00 UTC
        self.when = datetime(2026, 10, 2, 5, 0, tzinfo=dt_timezone.utc)

    def test_schedule_resolves_to_3pm_sydney(self):
        with override_settings(PROMO_BLAST_AT="2026-10-02T15:00:00"):
            self.assertEqual(self.scheduler.scheduled_time(), self.when)

    def test_waits_then_fires_once(self):
        with override_settings(PROMO_BLAST_AT="2026-10-02T15:00:00", PROMO_BLAST_GRACE_HOURS=12):
            self.assertEqual(self.scheduler.tick(self.when - timedelta(seconds=1)), "waiting")
            self.assertEqual(len(mail.outbox), 0)
            self.assertEqual(self.scheduler.tick(self.when), "fired")
            self.assertEqual(len(mail.outbox), 2)
            self.assertEqual(self.scheduler.tick(self.when + timedelta(minutes=1)), "done")
            self.assertEqual(len(mail.outbox), 2)

    def test_does_not_resend_to_people_already_emailed(self):
        with override_settings(PROMO_BLAST_AT="2026-10-02T15:00:00"):
            campaigns.send_promo_to_previous_customers()  # e.g. manual --blast earlier
            self.assertEqual(len(mail.outbox), 2)
            self.scheduler.tick(self.when)
            self.assertEqual(len(mail.outbox), 2)

    def test_email_not_ready_retries_later(self):
        with override_settings(PROMO_BLAST_AT="2026-10-02T15:00:00", EMAIL_ENABLED=False):
            self.assertEqual(self.scheduler.tick(self.when), "email-not-ready")
        with override_settings(PROMO_BLAST_AT="2026-10-02T15:00:00"):
            self.assertEqual(self.scheduler.tick(self.when + timedelta(minutes=1)), "fired")

    def test_too_late_and_disabled(self):
        with override_settings(PROMO_BLAST_AT="2026-10-02T15:00:00", PROMO_BLAST_GRACE_HOURS=12):
            self.assertEqual(self.scheduler.tick(self.when + timedelta(hours=13)), "expired")
        with override_settings(PROMO_BLAST_AT=""):
            self.assertEqual(self.scheduler.tick(self.when), "disabled")
