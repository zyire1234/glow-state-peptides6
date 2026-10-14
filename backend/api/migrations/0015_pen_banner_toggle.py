from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0014_pen_addon"),
    ]

    operations = [
        migrations.AddField(
            model_name="paymentdetails",
            name="pen_banner_enabled",
            field=models.BooleanField(
                default=True,
                help_text="Untick to hide the 'Pre-filled Pen Option' banner on the homepage (e.g. when pens are out of stock).",
            ),
        ),
    ]
