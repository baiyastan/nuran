# Generated migration to add name field to ProrabPlanItem

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('planning', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='prorabplanitem',
            name='name',
            field=models.CharField(blank=True, default='', help_text='Material name (e.g., бетон)', max_length=255),
        ),
    ]

