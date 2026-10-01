from django.db import migrations, models


class Migration(migrations.Migration):
    """Additive only: creates one new table. No existing table is altered."""

    dependencies = [
        ('api', '0011_coupon_admin_management'),
    ]

    operations = [
        migrations.CreateModel(
            name='EmailSendLog',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('campaign', models.CharField(db_index=True, max_length=100)),
                ('email', models.EmailField(max_length=254)),
                ('status', models.CharField(choices=[('sending', 'Sending'), ('sent', 'Sent'), ('failed', 'Failed')], default='sending', max_length=10)),
                ('error', models.TextField(blank=True, default='')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
        ),
        migrations.AddConstraint(
            model_name='emailsendlog',
            constraint=models.UniqueConstraint(fields=('campaign', 'email'), name='uniq_campaign_email'),
        ),
    ]
