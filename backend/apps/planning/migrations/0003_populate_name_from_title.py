# Generated data migration to populate name field from title field

from django.db import migrations


def populate_name(apps, schema_editor):
    """Populate name field from title field, or set to 'legacy' if title doesn't exist or is empty."""
    ProrabPlanItem = apps.get_model('planning', 'ProrabPlanItem')
    
    for item in ProrabPlanItem.objects.all():
        # Check if title field exists and has a value
        # Use getattr with default to safely check for title attribute
        title_value = getattr(item, 'title', None)
        
        if title_value and str(title_value).strip():
            # Copy title to name
            item.name = str(title_value).strip()
        else:
            # Fallback to 'legacy' if title doesn't exist or is empty
            item.name = 'legacy'
        
        # Save without triggering signals (using update to avoid model validation)
        ProrabPlanItem.objects.filter(pk=item.pk).update(name=item.name)


def reverse_populate_name(apps, schema_editor):
    """Reverse migration - no-op since we can't reliably restore title from name."""
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('planning', '0002_add_name_to_prorabplanitem'),
    ]

    operations = [
        migrations.RunPython(populate_name, reverse_populate_name),
    ]

