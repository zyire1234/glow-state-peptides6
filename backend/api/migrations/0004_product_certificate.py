# Generated manually for the Product Certificate (COA) feature.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0003_payment'),
    ]

    operations = [
        migrations.AddField(
            model_name='product',
            name='certificate_data',
            field=models.TextField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='product',
            name='certificate_filename',
            field=models.CharField(blank=True, max_length=255, null=True),
        ),
        migrations.AddField(
            model_name='product',
            name='certificate_content_type',
            field=models.CharField(blank=True, max_length=100, null=True),
        ),
        migrations.AddField(
            model_name='product',
            name='certificate_uploaded_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
