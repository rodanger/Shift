from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers
from .models import Shift, Invoice, UserProfile


# ── Auth ──────────────────────────────────────────────────────────

class RegisterSerializer(serializers.ModelSerializer):
    password  = serializers.CharField(write_only=True, validators=[validate_password])
    password2 = serializers.CharField(write_only=True, label='Confirm password')
    full_name    = serializers.CharField(required=False, allow_blank=True, write_only=True)
    default_rate = serializers.CharField(required=False, allow_blank=True, write_only=True)
    currency     = serializers.CharField(required=False, allow_blank=True, write_only=True)

    class Meta:
        model  = User
        fields = ('id', 'username', 'email', 'password', 'password2',
                  'full_name', 'default_rate', 'currency')

    def validate(self, attrs):
        if attrs['password'] != attrs.pop('password2'):
            raise serializers.ValidationError({'password': 'Passwords do not match.'})
        return attrs

    def create(self, validated_data):
        full_name    = validated_data.pop('full_name', '')
        default_rate = validated_data.pop('default_rate', None)
        currency     = validated_data.pop('currency', 'CAD')

        user = User.objects.create_user(**validated_data)

        # Create profile with the extra fields
        UserProfile.objects.create(
            user=user,
            full_name=full_name,
            default_rate=default_rate or None,
            currency=currency,
        )
        return user


class UserProfileSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source='user.username', read_only=True)
    email    = serializers.CharField(source='user.email', read_only=True)

    class Meta:
        model  = UserProfile
        fields = (
            'username', 'email',
            'full_name', 'phone', 'default_rate', 'currency',
            'invoice_prefix', 'address', 'bank_details',
        )

    def update(self, instance, validated_data):
        # Remove nested user fields if they sneak in
        validated_data.pop('user', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        return instance


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
    status    = serializers.ChoiceField(choices=STATUS_CHOICES)
    paid_date = serializers.DateField(required=False, allow_null=True)