from django.db import models
from django.contrib.auth.models import User
from decimal import Decimal


class Shift(models.Model):
    STATUS_CHOICES = [
        ('pending',  'Pending'),
        ('invoiced', 'Invoiced'),
        ('paid',     'Paid'),
    ]

    user        = models.ForeignKey(User, on_delete=models.CASCADE, related_name='shifts')
    date        = models.DateField()
    start_time  = models.TimeField()
    end_time    = models.TimeField()
    hourly_rate = models.DecimalField(max_digits=8, decimal_places=2)
    client      = models.CharField(max_length=200, blank=True)
    location    = models.CharField(max_length=300, blank=True)
    role        = models.CharField(max_length=200, blank=True)
    notes       = models.TextField(blank=True)
    status      = models.CharField(max_length=10, choices=STATUS_CHOICES, default='pending')
    invoice     = models.ForeignKey(
        'Invoice', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='shifts'
    )
    created_at  = models.DateTimeField(auto_now_add=True)
    updated_at  = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-date', '-start_time']

    def __str__(self):
        return f'{self.user.username} | {self.date} | {self.client}'

    @property
    def hours_worked(self):
        from datetime import datetime, date, timedelta
        start = datetime.combine(date.today(), self.start_time)
        end   = datetime.combine(date.today(), self.end_time)
        delta = end - start
        if delta.total_seconds() < 0:
            delta += timedelta(hours=24)
        return Decimal(str(round(delta.total_seconds() / 3600, 4)))

    @property
    def total_pay(self):
        return (self.hours_worked * self.hourly_rate).quantize(Decimal('0.01'))


class Invoice(models.Model):
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('sent',  'Sent'),
        ('paid',  'Paid'),
        ('void',  'Void'),
    ]

    user           = models.ForeignKey(User, on_delete=models.CASCADE, related_name='invoices')
    invoice_number = models.CharField(max_length=50, unique=True)
    period_year    = models.PositiveSmallIntegerField()
    period_month   = models.PositiveSmallIntegerField()
    client_name    = models.CharField(max_length=200, blank=True)
    client_address = models.TextField(blank=True)
    subtotal       = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0'))
    tax_rate       = models.DecimalField(max_digits=5, decimal_places=4, default=Decimal('0'))
    tax_amount     = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0'))
    total          = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0'))
    notes          = models.TextField(blank=True)
    status         = models.CharField(max_length=10, choices=STATUS_CHOICES, default='draft')
    issued_date    = models.DateField(auto_now_add=True)
    due_date       = models.DateField(null=True, blank=True)
    paid_date      = models.DateField(null=True, blank=True)
    created_at     = models.DateTimeField(auto_now_add=True)
    updated_at     = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-period_year', '-period_month']

    def __str__(self):
        return f'{self.invoice_number} — {self.user.username}'

    def recalculate_totals(self):
        subtotal   = sum((s.total_pay for s in self.shifts.all()), Decimal('0'))
        tax_amount = (subtotal * self.tax_rate).quantize(Decimal('0.01'))
        self.subtotal   = subtotal
        self.tax_amount = tax_amount
        self.total      = (subtotal + tax_amount).quantize(Decimal('0.01'))
        self.save(update_fields=['subtotal', 'tax_amount', 'total', 'updated_at'])


class UserProfile(models.Model):
    user           = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profile')
    full_name      = models.CharField(max_length=200, blank=True)
    phone          = models.CharField(max_length=50, blank=True)
    default_rate   = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    currency       = models.CharField(max_length=10, default='CAD')
    invoice_prefix = models.CharField(max_length=10, default='INV')
    address        = models.TextField(blank=True)
    bank_details   = models.TextField(blank=True)

    def __str__(self):
        return f'Profile — {self.user.username}'