# Generated for the SALE30 discount code feature.

from datetime import timedelta

from django.db import migrations, models
from django.utils import timezone


def seed_sale30_coupon(apps, schema_editor):
    """Creates the SALE30 code with a 7-day countdown that starts the
    moment this migration is applied (i.e. the moment this is deployed).
    After that, Coupon.is_valid() will naturally return False — no manual
    cleanup needed for it to stop working."""
    Coupon = apps.get_model("api", "Coupon")
    Coupon.objects.update_or_create(
        code="SALE30",
        defaults={
            "discount_percent": 30,
            "is_active": True,
            "expires_at": timezone.now() + timedelta(days=7),
        },
    )


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0007_alter_order_payment_method_alter_payment_method'),
    ]

    operations = [
        migrations.CreateModel(
            name='Coupon',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('code', models.CharField(max_length=50, unique=True)),
                ('discount_percent', models.DecimalField(decimal_places=2, max_digits=5)),
                ('is_active', models.BooleanField(default=True)),
                ('expires_at', models.DateTimeField()),
                ('created_at', models.DateTimeField(auto_now_add=True)),
            ],
        ),
        migrations.AddField(
            model_name='order',
            name='coupon_code',
            field=models.CharField(blank=True, default='', max_length=50),
        ),
        migrations.AddField(
            model_name='order',
            name='discount_amount',
            field=models.DecimalField(decimal_places=2, default=0, max_digits=10),
        ),
        migrations.RunPython(seed_sale30_coupon, noop_reverse),
    ]
