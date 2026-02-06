# Generated migration to make name field required

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('planning', '0003_populate_name_from_title'),
    ]

    operations = [
        migrations.AlterField(
            model_name='prorabplanitem',
            name='name',
            field=models.CharField(help_text='Material name (e.g., бетон)', max_length=255),
        ),
    ]

