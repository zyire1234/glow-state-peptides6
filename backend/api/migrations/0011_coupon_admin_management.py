from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0010_order_cancel_reason'),
    ]

    operations = [
        migrations.AddField(
            model_name='coupon',
            name='name',
            field=models.CharField(blank=True, default='', max_length=150),
        ),
        migrations.AddField(
            model_name='coupon',
            name='starts_at',
            field=models.DateTimeField(default=django.utils.timezone.now),
        ),
        migrations.AddField(
            model_name='coupon',
            name='max_uses',
            field=models.PositiveIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='coupon',
            name='used_count',
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.AddField(
            model_name='coupon',
            name='applies_to_all',
            field=models.BooleanField(default=True),
        ),
        migrations.AddField(
            model_name='coupon',
            name='products',
            field=models.ManyToManyField(blank=True, related_name='coupons', to='api.product'),
        ),
    ]
