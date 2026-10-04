from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0012_emailsendlog"),
    ]

    operations = [
        migrations.AddField(
            model_name="paymentdetails",
            name="paypal_enabled",
            field=models.BooleanField(
                default=True,
                help_text="Untick to hide PayPal from the public checkout (e.g. while PayPal has an issue).",
            ),
        ),
    ]
