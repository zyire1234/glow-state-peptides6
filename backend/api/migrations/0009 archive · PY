# Generated for the Website Cleaning / Archive feature.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0008_coupon_order_coupon_fields'),
    ]

    operations = [
        migrations.CreateModel(
            name='Archive',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('category', models.CharField(choices=[('orders', 'Orders'), ('activities', 'Activity Logs (incl. Notifications / Emails)')], max_length=30)),
                ('item_count', models.IntegerField(default=0)),
                ('data', models.TextField(blank=True, default='[]')),
                ('cutoff_date', models.DateTimeField(blank=True, help_text='Only records created before this date were included in this archive.', null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
            ],
            options={
                'ordering': ['-id'],
            },
        ),
    ]
