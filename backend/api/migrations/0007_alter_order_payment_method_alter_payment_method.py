from django.db import migrations, models


def set_existing_addon_quantity(apps, schema_editor):
    # Orders placed before multi-pen support could only have ONE pen per line.
    OrderItem = apps.get_model("api", "OrderItem")
    OrderItem.objects.filter(addon_selected=True).update(addon_quantity=1)


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0016_productcertificate"),
    ]

    operations = [
        migrations.AddField(
            model_name="orderitem",
            name="addon_quantity",
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.RunPython(set_existing_addon_quantity, migrations.RunPython.noop),
    ]
