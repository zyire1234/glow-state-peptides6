"""
WSGI config for core project.

It exposes the WSGI callable as a module-level variable named ``application``.

For more information on this file, see
https://docs.djangoproject.com/en/6.0/howto/deployment/wsgi/
"""

import os

from django.core.wsgi import get_wsgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')

application = get_wsgi_application()

# Arms the timer for the scheduled promotional email (see api/scheduler.py).
# Only the web server imports this file, so manage.py commands / migrations
# never start it. It can never stop the site from booting.
try:
    from api import scheduler

    scheduler.start()
except Exception:  # pragma: no cover
    import logging

    logging.getLogger(__name__).exception("could not start promo scheduler")
