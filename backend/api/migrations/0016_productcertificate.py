from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0015_pen_banner_toggle"),
    ]

    operations = [
        migrations.CreateModel(
            name="ProductCertificate",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("label", models.CharField(blank=True, default="", max_length=255)),
                ("filename", models.CharField(blank=True, default="", max_length=255)),
                ("content_type", models.CharField(blank=True, default="", max_length=100)),
                ("data", models.TextField()),
                ("uploaded_at", models.DateTimeField(auto_now_add=True)),
                ("product", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="certificates", to="api.product")),
            ],
            options={"ordering": ["id"]},
        ),
    ]
