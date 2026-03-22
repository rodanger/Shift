# Abre el Procfile y cambia el contenido a:
web: python manage.py migrate && python manage.py collectstatic --noinput && gunicorn shift.wsgi:application --bind 0.0.0.0:$PORT --log-file -