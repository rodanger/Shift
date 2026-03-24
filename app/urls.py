from django.urls import path
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from . import views

urlpatterns = [
    # Auth
    path('auth/register/',      views.RegisterView.as_view(),        name='register'),
    path('auth/login/',         TokenObtainPairView.as_view(),        name='login'),
    path('auth/token/refresh/', TokenRefreshView.as_view(),           name='token-refresh'),
    path('auth/profile/',       views.ProfileView.as_view(),          name='profile'),

    # Shifts
    path('shifts/',             views.ShiftListCreateView.as_view(),  name='shift-list'),
    path('shifts/summary/',     views.ShiftSummaryView.as_view(),     name='shift-summary'),
    path('shifts/<int:pk>/',    views.ShiftDetailView.as_view(),      name='shift-detail'),

    # Invoices
    path('invoices/',                       views.InvoiceListView.as_view(),     name='invoice-list'),
    path('invoices/generate/',              views.InvoiceGenerateView.as_view(), name='invoice-generate'),
    path('invoices/<int:pk>/',              views.InvoiceDetailView.as_view(),   name='invoice-detail'),
    path('invoices/<int:pk>/status/',       views.InvoiceStatusView.as_view(),   name='invoice-status'),
    path('invoices/<int:pk>/delete/',       views.InvoiceDeleteView.as_view(),   name='invoice-delete'),
    path('invoices/<int:pk>/export/excel/', views.InvoiceExcelView.as_view(),    name='invoice-excel'),
    path('invoices/<int:pk>/export/pdf/',   views.InvoicePDFView.as_view(),      name='invoice-pdf'),
]