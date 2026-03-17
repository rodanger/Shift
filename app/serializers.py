from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

from .models import Shift, Invoice


# ── Auth ──────────────────────────────────────────────────────────

class RegisterSerializer(serializers.ModelSerializer):
    password  = serializers.CharField(write_only=True, validators=[validate_password])
    password2 = serializers.CharField(write_only=True, label='Confirm password')

    # Extra fields sent by the frontend (stored in first_name for simplicity)
    full_name    = serializers.CharField(required=False, allow_blank=True, write_only=True)
    default_rate = serializers.CharField(required=False, allow_blank=True, write_only=True)
    currency     = serializers.CharField(required=False, allow_blank=True, write_only=True)

    class Meta:
        model  = User
        fields = ('id', 'username', 'email', 'password', 'password2',
                  'full_name', 'default_rate', 'currency')

    def validate(self, attrs):
        if attrs['password'] != attrs.pop('password2'):
            raise serializers.ValidationError({'password': 'Las contraseñas no coinciden.'})
        # Remove extra fields not in the User model before create
        attrs.pop('default_rate', None)
        attrs.pop('currency', None)
        full_name = attrs.pop('full_name', '')
        if full_name:
            parts = full_name.split(' ', 1)
            attrs['first_name'] = parts[0]
            attrs['last_name']  = parts[1] if len(parts) > 1 else ''
        return attrs

    def create(self, validated_data):
        return User.objects.create_user(**validated_data)


class UserProfileSerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField()

    class Meta:
        model  = User
        fields = ('id', 'username', 'email', 'first_name', 'last_name', 'full_name')
        read_only_fields = ('id', 'email')

    def get_full_name(self, obj):
        return f'{obj.first_name} {obj.last_name}'.strip() or obj.username


# ── Shifts ────────────────────────────────────────────────────────

class ShiftSerializer(serializers.ModelSerializer):
    hours_worked = serializers.DecimalField(max_digits=6, decimal_places=4, read_only=True)
    total_pay    = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)

    class Meta:
        model  = Shift
        fields = (
            'id', 'date', 'start_time', 'end_time', 'hourly_rate',
            'client', 'location', 'role', 'notes', 'status',
            'hours_worked', 'total_pay', 'invoice', 'created_at',
        )
        read_only_fields = ('id', 'status', 'invoice', 'created_at', 'hours_worked', 'total_pay')

    def create(self, validated_data):
        validated_data['user'] = self.context['request'].user
        return super().create(validated_data)


# ── Invoices ──────────────────────────────────────────────────────

class InvoiceSerializer(serializers.ModelSerializer):
    shifts = ShiftSerializer(many=True, read_only=True)

    class Meta:
        model  = Invoice
        fields = (
            'id', 'invoice_number', 'period_year', 'period_month',
            'client_name', 'client_address', 'subtotal', 'tax_rate',
            'tax_amount', 'total', 'notes', 'status',
            'issued_date', 'due_date', 'paid_date', 'shifts',
        )
        read_only_fields = fields


class InvoiceGenerateSerializer(serializers.Serializer):
    year           = serializers.IntegerField()
    month          = serializers.IntegerField(min_value=1, max_value=12)
    client_name    = serializers.CharField(required=False, allow_blank=True)
    client_address = serializers.CharField(required=False, allow_blank=True)
    tax_rate       = serializers.DecimalField(
                        max_digits=5, decimal_places=4,
                        required=False, default=0)
    due_date       = serializers.DateField(required=False, allow_null=True)
    notes          = serializers.CharField(required=False, allow_blank=True)


class InvoiceStatusSerializer(serializers.Serializer):
    STATUS_CHOICES = ['draft', 'sent', 'paid', 'void']
    status   = serializers.ChoiceField(choices=STATUS_CHOICES)
    paid_date = serializers.DateField(required=False, allow_null=True)