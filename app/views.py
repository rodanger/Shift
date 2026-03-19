from datetime import date
from decimal import Decimal

from django.http import HttpResponse
from rest_framework import generics, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny

from .models import Shift, Invoice, UserProfile
from .serializers import (
    RegisterSerializer, UserProfileSerializer,
    ShiftSerializer,
    InvoiceSerializer, InvoiceGenerateSerializer, InvoiceStatusSerializer,
)
from .excel import generate_invoice_xlsx


# ── Auth ──────────────────────────────────────────────────────────

class HomeView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        return Response({'message': 'Welcome to Shift!'})


class RegisterView(generics.CreateAPIView):
    serializer_class   = RegisterSerializer
    permission_classes = [AllowAny]


class ProfileView(generics.RetrieveUpdateAPIView):
    serializer_class   = UserProfileSerializer
    permission_classes = [IsAuthenticated]

    def get_object(self):
        profile, _ = UserProfile.objects.get_or_create(user=self.request.user)
        return profile

    def partial_update(self, request, *args, **kwargs):
        kwargs['partial'] = True
        return self.update(request, *args, **kwargs)


# ── Shifts ────────────────────────────────────────────────────────

class ShiftListCreateView(generics.ListCreateAPIView):
    serializer_class   = ShiftSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = Shift.objects.filter(user=self.request.user)
        p  = self.request.query_params

        if p.get('year'):      qs = qs.filter(date__year=p['year'])
        if p.get('month'):     qs = qs.filter(date__month=p['month'])
        if p.get('status'):    qs = qs.filter(status=p['status'])
        if p.get('client'):    qs = qs.filter(client__icontains=p['client'])
        if p.get('date_from'): qs = qs.filter(date__gte=p['date_from'])
        if p.get('date_to'):   qs = qs.filter(date__lte=p['date_to'])

        ordering = p.get('ordering', '-date')
        qs = qs.order_by(ordering)

        return qs


class ShiftDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class   = ShiftSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Shift.objects.filter(user=self.request.user)

    def destroy(self, request, *args, **kwargs):
        shift = self.get_object()
        if shift.status != 'pending':
            return Response(
                {'detail': 'Only pending shifts can be deleted.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        return super().destroy(request, *args, **kwargs)


class ShiftSummaryView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = Shift.objects.filter(user=request.user)
        p  = request.query_params

        if p.get('year'):  qs = qs.filter(date__year=p['year'])
        if p.get('month'): qs = qs.filter(date__month=p['month'])

        shifts      = list(qs)
        total_hours = sum((s.hours_worked for s in shifts), Decimal('0'))
        total_pay   = sum((s.total_pay   for s in shifts), Decimal('0'))

        return Response({
            'year':        p.get('year'),
            'month':       p.get('month'),
            'shift_count': len(shifts),
            'total_hours': round(total_hours, 2),
            'total_pay':   round(total_pay,   2),
            'by_status': {
                'pending':  sum(1 for s in shifts if s.status == 'pending'),
                'invoiced': sum(1 for s in shifts if s.status == 'invoiced'),
                'paid':     sum(1 for s in shifts if s.status == 'paid'),
            }
        })


# ── Invoices ──────────────────────────────────────────────────────

class InvoiceListView(generics.ListAPIView):
    serializer_class   = InvoiceSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Invoice.objects.filter(user=self.request.user).prefetch_related('shifts')


class InvoiceDetailView(generics.RetrieveAPIView):
    serializer_class   = InvoiceSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Invoice.objects.filter(user=self.request.user).prefetch_related('shifts')


class InvoiceGenerateView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = InvoiceGenerateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data  = serializer.validated_data
        user  = request.user
        year  = data['year']
        month = data['month']

        if Invoice.objects.filter(user=user, period_year=year, period_month=month).exists():
            return Response(
                {'detail': f'An invoice already exists for {year}-{month:02d}.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        pending = Shift.objects.filter(
            user=user, date__year=year,
            date__month=month, status='pending'
        )
        if not pending.exists():
            return Response(
                {'detail': 'No pending shifts found for this period.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Use invoice_prefix from profile if available
        try:
            prefix = user.profile.invoice_prefix or 'INV'
        except UserProfile.DoesNotExist:
            prefix = 'INV'

        count          = Invoice.objects.filter(user=user).count() + 1
        invoice_number = f'{prefix}-U{user.id}-{year}-{month:02d}-{count:03d}'

        invoice = Invoice.objects.create(
            user           = user,
            invoice_number = invoice_number,
            period_year    = year,
            period_month   = month,
            client_name    = data.get('client_name', ''),
            client_address = data.get('client_address', ''),
            tax_rate       = data.get('tax_rate', 0),
            due_date       = data.get('due_date'),
            notes          = data.get('notes', ''),
        )

        pending.update(invoice=invoice, status='invoiced')
        invoice.recalculate_totals()

        return Response(InvoiceSerializer(invoice).data, status=status.HTTP_201_CREATED)


class InvoiceStatusView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        try:
            invoice = Invoice.objects.get(pk=pk, user=request.user)
        except Invoice.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        serializer = InvoiceStatusSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        new_status = serializer.validated_data['status']
        invoice.status = new_status

        if new_status == 'paid':
            invoice.paid_date = serializer.validated_data.get('paid_date') or date.today()
            invoice.shifts.all().update(status='paid')
        elif new_status == 'void':
            invoice.shifts.all().update(status='pending', invoice=None)

        invoice.save()
        return Response(InvoiceSerializer(invoice).data)


class InvoiceDeleteView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, pk):
        try:
            invoice = Invoice.objects.get(pk=pk, user=request.user)
        except Invoice.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        if invoice.status not in ('draft', 'void'):
            return Response(
                {'detail': 'Only draft or void invoices can be deleted.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        invoice.shifts.all().update(status='pending', invoice=None)
        invoice.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class InvoiceExcelView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        try:
            invoice = (
                Invoice.objects
                .prefetch_related('shifts')
                .select_related('user')
                .get(pk=pk, user=request.user)
            )
        except Invoice.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        xlsx_bytes = generate_invoice_xlsx(invoice)
        response   = HttpResponse(
            content=xlsx_bytes,
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        )
        response['Content-Disposition'] = f'attachment; filename="{invoice.invoice_number}.xlsx"'
        return response