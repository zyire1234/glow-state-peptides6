from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0013_paymentdetails_paypal_enabled"),
    ]

    operations = [
        migrations.AddField(
            model_name="product",
            name="addon_enabled",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="product",
            name="addon_pen_in_customer_view",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="product",
            name="addon_show_view_pen_button",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="orderitem",
            name="addon_selected",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="orderitem",
            name="addon_name",
            field=models.CharField(blank=True, default="", max_length=255),
        ),
        migrations.AddField(
            model_name="orderitem",
            name="addon_price",
            field=models.DecimalField(decimal_places=2, default=0, max_digits=10),
        ),
    ]
