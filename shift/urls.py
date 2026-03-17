from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from django.views.generic import TemplateView

urlpatterns = [
    path('admin/', admin.site.urls),

    # ✅ apunta a tu app real llamada 'app'
    path('api/', include('app.urls')),

    # Sirve el frontend en la raíz
    path('', TemplateView.as_view(template_name='index.html'), name='frontend'),

] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)