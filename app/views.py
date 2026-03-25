from datetime import date
from decimal import Decimal
import io

from django.http import HttpResponse
from rest_framework import generics, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny

from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_RIGHT, TA_LEFT

from .models import Shift, Invoice, UserProfile
from .serializers import (
    RegisterSerializer, UserProfileSerializer,
    ShiftSerializer,
    InvoiceSerializer, InvoiceGenerateSerializer, InvoiceStatusSerializer,
)
from .excel import generate_invoice_xlsx

MONTHS = ['','January','February','March','April','May','June',
          'July','August','September','October','November','December']

GREEN       = colors.HexColor('#2D6A4F')
LIGHT_GREEN = colors.HexColor('#E2EFDA')
DARK        = colors.HexColor('#1a1a2e')
GRAY        = colors.HexColor('#666666')


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
        return qs.order_by(ordering)


class ShiftDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class   = ShiftSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Shift.objects.filter(user=self.request.user)

    def destroy(self, request, *args, **kwargs):
        shift = self.get_object()
        if shift.invoice:
            shift.invoice.recalculate_totals()
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

        pending = Shift.objects.filter(
            user=user, date__year=year, date__month=month, status='pending'
        )
        if not pending.exists():
            return Response(
                {'detail': 'No pending shifts found for this period.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            prefix = user.profile.invoice_prefix or 'INV'
        except UserProfile.DoesNotExist:
            prefix = 'INV'

        count          = Invoice.objects.filter(user=user).count() + 1
        invoice_number = f'{prefix}-U{user.id}-{year}-{month:02d}-{count:03d}'

        invoice = Invoice.objects.create(
            user=user, invoice_number=invoice_number,
            period_year=year, period_month=month,
            client_name=data.get('client_name', ''),
            client_address=data.get('client_address', ''),
            tax_rate=data.get('tax_rate', 0),
            due_date=data.get('due_date'),
            notes=data.get('notes', ''),
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

class InvoicePDFView(APIView):
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

        try:
            from django.template.loader import render_to_string
            from xhtml2pdf import pisa
            import io

            html_string = render_to_string('invoice_pdf.html', {'invoice': invoice})
            pdf_buffer  = io.BytesIO()
            pisa.CreatePDF(html_string, dest=pdf_buffer)
            pdf_buffer.seek(0)

            filename = f"invoice_{invoice.period_month:02d}_{invoice.period_year}.pdf"
            response = HttpResponse(content=pdf_buffer.read(), content_type='application/pdf')
            response['Content-Disposition'] = f'attachment; filename="{filename}"'
            return response
        except Exception as e:
            import traceback
            print("PDF ERROR:", traceback.format_exc())
            return Response({'detail': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        # ── Header ──────────────────────────────────────────────
        header_style = ParagraphStyle('header', fontSize=28, textColor=GREEN,
                                      fontName='Helvetica-Bold', spaceAfter=4)
        meta_style   = ParagraphStyle('meta', fontSize=9, textColor=GRAY, alignment=TA_RIGHT)

        month_name = MONTHS[invoice.period_month] if invoice.period_month <= 12 else str(invoice.period_month)
        meta_text  = (
            f"<b>{invoice.invoice_number}</b><br/>"
            f"Issued: {invoice.issued_date}<br/>"
            f"Period: {month_name} {invoice.period_year}<br/>"
            f"Status: {invoice.status.upper()}"
        )
        if invoice.due_date:
            meta_text += f"<br/>Due: {invoice.due_date}"

        header_table = Table(
            [[Paragraph('INVOICE', header_style), Paragraph(meta_text, meta_style)]],
            colWidths=[3.5*inch, 3.5*inch]
        )
        header_table.setStyle(TableStyle([
            ('VALIGN',        (0,0), (-1,-1), 'TOP'),
            ('LINEBELOW',     (0,0), (-1,0),  2, GREEN),
            ('BOTTOMPADDING', (0,0), (-1,0),  12),
        ]))
        elements.append(header_table)
        elements.append(Spacer(1, 0.3*inch))

        # ── Billed To / From ────────────────────────────────────
        label_style = ParagraphStyle('label', fontSize=8, textColor=GREEN,
                                     fontName='Helvetica-Bold', spaceAfter=4)
        body_style  = ParagraphStyle('body', fontSize=9, textColor=DARK, leading=14)

        try:
            profile   = invoice.user.profile
            from_name = profile.full_name or invoice.user.get_full_name() or invoice.user.username
            from_text = f"<b>{from_name}</b><br/>{invoice.user.email}"
            if profile.address:
                from_text += f"<br/>{profile.address}"
            if profile.phone:
                from_text += f"<br/>{profile.phone}"
        except Exception:
            from_text = f"<b>{invoice.user.username}</b><br/>{invoice.user.email}"

        client_text = f"<b>{invoice.client_name or '—'}</b>"
        if invoice.client_address:
            client_text += f"<br/>{invoice.client_address}"

        info_table = Table([[
            [Paragraph('BILLED TO', label_style), Paragraph(client_text, body_style)],
            [Paragraph('FROM',      label_style), Paragraph(from_text,   body_style)],
        ]], colWidths=[3.5*inch, 3.5*inch])
        info_table.setStyle(TableStyle([
            ('VALIGN',        (0,0), (-1,-1), 'TOP'),
            ('LEFTPADDING',   (0,0), (-1,-1), 12),
            ('RIGHTPADDING',  (0,0), (-1,-1), 12),
            ('TOPPADDING',    (0,0), (-1,-1), 10),
            ('BOTTOMPADDING', (0,0), (-1,-1), 10),
            ('BACKGROUND',    (0,0), (-1,-1), colors.HexColor('#f5fff5')),
            ('LINEBEFORE',    (0,0), (0,0),   3, GREEN),
            ('LINEBEFORE',    (1,0), (1,0),   3, GREEN),
        ]))
        elements.append(info_table)
        elements.append(Spacer(1, 0.3*inch))

        # ── Shifts Table ────────────────────────────────────────
        shifts = list(invoice.shifts.all())
        if shifts:
            th = ParagraphStyle('th', fontSize=9, textColor=colors.white, fontName='Helvetica-Bold')
            td = ParagraphStyle('td', fontSize=9, textColor=DARK)

            rows = [[
                Paragraph('Date',        th),
                Paragraph('Client',      th),
                Paragraph('Hours',       th),
                Paragraph('Rate ($/hr)', th),
                Paragraph('Amount',      th),
            ]]
            for s in shifts:
                rows.append([
                    Paragraph(str(s.date),         td),
                    Paragraph(s.client or '—',     td),
                    Paragraph(str(s.hours_worked), td),
                    Paragraph(f'${s.hourly_rate}', td),
                    Paragraph(f'${s.total_pay}',   td),
                ])

            shift_table = Table(rows, colWidths=[1.2*inch, 2*inch, 0.9*inch, 1.2*inch, 1.2*inch])
            shift_table.setStyle(TableStyle([
                ('BACKGROUND',    (0,0), (-1,0),  GREEN),
                ('ROWBACKGROUNDS',(0,1), (-1,-1), [colors.white, colors.HexColor('#f5fff5')]),
                ('GRID',          (0,0), (-1,-1), 0.5, colors.HexColor('#e8e8f0')),
                ('VALIGN',        (0,0), (-1,-1), 'MIDDLE'),
                ('TOPPADDING',    (0,0), (-1,-1), 7),
                ('BOTTOMPADDING', (0,0), (-1,-1), 7),
                ('LEFTPADDING',   (0,0), (-1,-1), 8),
            ]))
            elements.append(shift_table)
            elements.append(Spacer(1, 0.2*inch))

        # ── Totals ───────────────────────────────────────────────
        lr = ParagraphStyle('lr', fontSize=9, textColor=GRAY,  alignment=TA_LEFT)
        vr = ParagraphStyle('vr', fontSize=9, textColor=DARK,  fontName='Helvetica-Bold', alignment=TA_RIGHT)
        tw = ParagraphStyle('tw', fontSize=11, textColor=colors.white, fontName='Helvetica-Bold')
        tv = ParagraphStyle('tv', fontSize=11, textColor=colors.white, fontName='Helvetica-Bold', alignment=TA_RIGHT)

        totals_rows = [[Paragraph('Subtotal', lr), Paragraph(f'${invoice.subtotal}', vr)]]
        if invoice.tax_rate:
            tax_pct = float(invoice.tax_rate) * 100
            totals_rows.append([
                Paragraph(f'Tax ({tax_pct:.0f}%)', lr),
                Paragraph(f'${invoice.tax_amount}', vr),
            ])
        totals_rows.append([Paragraph('TOTAL', tw), Paragraph(f'${invoice.total}', tv)])

        total_idx    = len(totals_rows) - 1
        totals_table = Table(totals_rows, colWidths=[2*inch, 1.5*inch], hAlign='RIGHT')
        totals_table.setStyle(TableStyle([
            ('BACKGROUND',    (0, total_idx), (-1, total_idx), GREEN),
            ('TOPPADDING',    (0,0), (-1,-1), 6),
            ('BOTTOMPADDING', (0,0), (-1,-1), 6),
            ('LEFTPADDING',   (0,0), (-1,-1), 10),
            ('RIGHTPADDING',  (0,0), (-1,-1), 10),
            ('LINEABOVE',     (0,0), (-1,0),  0.5, colors.HexColor('#e8e8f0')),
        ]))
        elements.append(totals_table)

        # ── Notes ────────────────────────────────────────────────
        if invoice.notes:
            elements.append(Spacer(1, 0.2*inch))
            nl = ParagraphStyle('nl', fontSize=8, textColor=colors.HexColor('#f59e0b'),
                                fontName='Helvetica-Bold', spaceAfter=4)
            nb = ParagraphStyle('nb', fontSize=9, textColor=GRAY)
            notes_t = Table([[[Paragraph('NOTES', nl), Paragraph(invoice.notes, nb)]]],
                            colWidths=[7*inch])
            notes_t.setStyle(TableStyle([
                ('BACKGROUND',    (0,0), (-1,-1), colors.HexColor('#fffbf0')),
                ('LINEBEFORE',    (0,0), (0,-1),  3, colors.HexColor('#f59e0b')),
                ('LEFTPADDING',   (0,0), (-1,-1), 12),
                ('TOPPADDING',    (0,0), (-1,-1), 10),
                ('BOTTOMPADDING', (0,0), (-1,-1), 10),
            ]))
            elements.append(notes_t)

        # ── Bank Details ─────────────────────────────────────────
        try:
            if invoice.user.profile.bank_details:
                elements.append(Spacer(1, 0.2*inch))
                bl = ParagraphStyle('bl', fontSize=8, textColor=GREEN,
                                    fontName='Helvetica-Bold', spaceAfter=4)
                bb = ParagraphStyle('bb', fontSize=9, textColor=GRAY)
                bank_t = Table([[[Paragraph('PAYMENT DETAILS', bl),
                                  Paragraph(invoice.user.profile.bank_details, bb)]]],
                               colWidths=[7*inch])
                bank_t.setStyle(TableStyle([
                    ('BACKGROUND',    (0,0), (-1,-1), colors.HexColor('#f5fff5')),
                    ('LINEBEFORE',    (0,0), (0,-1),  3, GREEN),
                    ('LEFTPADDING',   (0,0), (-1,-1), 12),
                    ('TOPPADDING',    (0,0), (-1,-1), 10),
                    ('BOTTOMPADDING', (0,0), (-1,-1), 10),
                ]))
                elements.append(bank_t)
        except Exception:
            pass

        # ── Footer ───────────────────────────────────────────────
        elements.append(Spacer(1, 0.3*inch))
        elements.append(Paragraph('Generated by HourTracker',
                                  ParagraphStyle('ft', fontSize=9, textColor=GRAY)))

        doc.build(elements)
        buffer.seek(0)

        filename = f"invoice_{invoice.period_month:02d}_{invoice.period_year}.pdf"
        response = HttpResponse(content=buffer.read(), content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response