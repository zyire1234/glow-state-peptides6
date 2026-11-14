from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0017_orderitem_addon_quantity"),
    ]

    operations = [
        migrations.AddField(
            model_name="paymentdetails",
            name="orders_paused",
            field=models.BooleanField(
                default=False,
                help_text="Tick to stop customers placing orders. They see 'Sorry, you can't process orders right now. Thank you.' instead.",
            ),
        ),
    ]
