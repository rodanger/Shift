from django.contrib import admin
from .models import Shift, Invoice


class ShiftInline(admin.TabularInline):
    model         = Shift
    extra         = 0
    readonly_fields = ('date', 'start_time', 'end_time', 'hourly_rate', 'client', 'status')
    can_delete    = False


@admin.register(Shift)
class ShiftAdmin(admin.ModelAdmin):
    list_display   = ('user', 'date', 'start_time', 'end_time', 'hourly_rate', 'client', 'status')
    list_filter    = ('status', 'date')
    search_fields  = ('user__username', 'client', 'role')
    ordering       = ('-date',)
    readonly_fields = ('created_at', 'updated_at')


@admin.register(Invoice)
class InvoiceAdmin(admin.ModelAdmin):
    list_display   = ('invoice_number', 'user', 'period_year', 'period_month', 'total', 'status')
    list_filter    = ('status', 'period_year')
    search_fields  = ('invoice_number', 'user__username', 'client_name')
    ordering       = ('-period_year', '-period_month')
    readonly_fields = ('invoice_number', 'subtotal', 'tax_amount', 'total',
                       'issued_date', 'created_at', 'updated_at')
    inlines        = [ShiftInline]
