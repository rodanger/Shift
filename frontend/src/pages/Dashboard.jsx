import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import client from '../api/client.jsx'

function formatMoney(amount, currency = 'CAD') {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency', currency: currency || 'CAD', maximumFractionDigits: 2
  }).format(parseFloat(amount) || 0)
}

function fmtDate(iso) {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

const labelStatus = s => ({ pending: 'Pend', invoiced: 'Inv', paid: 'Paid' }[s] || s)
const badgeClass  = s => ({
  pending:  'bg-[#FFF3CD] text-[#7B5800]',
  invoiced: 'bg-[#D6E4F0] text-[#1F3864]',
  paid:     'bg-[#E1F5EE] text-[#0F6E56]',
  draft:    'bg-[#F1EFE8] text-[#5F5E5A]',
  sent:     'bg-[#D6E4F0] text-[#1F3864]',
  void:     'bg-[#FCEBEB] text-[#E24B4A]',
}[s] || 'bg-gray-100 text-gray-600')

export default function Dashboard() {
  const { currentUser } = useAuth()
  const navigate = useNavigate()
  const [summary, setSummary]   = useState(null)
  const [shifts, setShifts]     = useState([])
  const [invoices, setInvoices] = useState([])

  useEffect(() => {
    const now   = new Date()
    const year  = now.getFullYear()
    const month = now.getMonth() + 1

    client.get(`/shifts/summary/?year=${year}&month=${month}`)
      .then(r => setSummary(r.data))

    client.get('/shifts/?ordering=-date&page_size=5')
      .then(r => setShifts(r.data.results || r.data))

    client.get('/invoices/')
      .then(r => setInvoices(r.data.results || r.data))
  }, [])

  const cur     = currentUser?.currency || 'CAD'
  const pending = invoices.filter(i => i.status === 'draft' || i.status === 'sent').length

  return (
    <div className="w-full max-w-full overflow-hidden">
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard label="Shifts this month" value={summary?.shift_count ?? '–'} />
        <StatCard label="Hours worked"      value={summary ? `${summary.total_hours}h` : '–'} />
        <StatCard label="Monthly earnings"  value={summary ? formatMoney(summary.total_pay, cur) : '–'} accent />
        <StatCard label="Pending invoices"  value={pending ?? '–'} />
      </div>

      <div className="grid lg:grid-cols-7 gap-4">
        {/* Recent shifts */}
        <div className="lg:col-span-4 bg-white border border-[#E4E2DC] rounded-xl p-4 w-full overflow-hidden">
          <div className="flex justify-between items-center mb-4">
            <span className="text-sm font-semibold">Recent shifts</span>
            <button onClick={() => navigate('/shifts')} className="text-xs text-[#2E75B6]">View all →</button>
          </div>
          {shifts.length === 0 ? (
            <EmptyState icon="bi-clock" text="No shifts yet" />
          ) : (
            <div className="flex flex-col gap-2">
              {shifts.slice(0,5).map(s => (
                <div key={s.id} className="flex items-center gap-2 py-2 border-b border-[#E4E2DC] last:border-0 w-full min-w-0">
                  <span className="shrink-0 font-mono text-[11px] text-[#7A786F]">{fmtDate(s.date)}</span>
                  <span className="flex-1 truncate text-[13px] min-w-0">
                    {s.client || '—'}{s.role ? ` · ${s.role}` : ''}
                  </span>
                  <span className={`shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full ${badgeClass(s.status)}`}>
                    {labelStatus(s.status)}
                  </span>
                  <span className="shrink-0 font-mono font-semibold text-[12px]">
                    {formatMoney(s.total_pay, cur)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent invoices */}
        <div className="lg:col-span-3 bg-white border border-[#E4E2DC] rounded-xl p-4 w-full overflow-hidden">
          <div className="flex justify-between items-center mb-4">
            <span className="text-sm font-semibold">Recent invoices</span>
            <button onClick={() => navigate('/invoices')} className="text-xs text-[#2E75B6]">View all →</button>
          </div>
          {invoices.length === 0 ? (
            <EmptyState icon="bi-receipt" text="No invoices yet" />
          ) : (
            <div className="flex flex-col gap-2">
              {invoices.slice(0,4).map(inv => (
                <div key={inv.id} className="flex items-center gap-2 py-2 border-b border-[#E4E2DC] last:border-0 w-full min-w-0">
                  <span className="shrink-0 font-mono text-[11px] text-[#7A786F] truncate max-w-[90px]">
                    {inv.invoice_number}
                  </span>
                  <span className="flex-1 truncate text-[13px] min-w-0">
                    {inv.client_name || '—'}
                  </span>
                  <span className={`shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full ${badgeClass(inv.status)}`}>
                    {inv.status}
                  </span>
                  <span className="shrink-0 font-mono font-semibold text-[12px]">
                    {formatMoney(inv.total, cur)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function StatCard({ label, value, accent }) {
  return (
    <div className={`rounded-xl p-4 border ${accent ? 'bg-[#1F3864] border-[#1F3864]' : 'bg-white border-[#E4E2DC]'}`}>
      <div className={`text-xs font-semibold uppercase tracking-wide mb-1 ${accent ? 'text-white/70' : 'text-gray-400'}`}>
        {label}
      </div>
      <div className={`text-2xl font-semibold font-mono ${accent ? 'text-white' : 'text-[#1A1916]'}`}>
        {value}
      </div>
    </div>
  )
}

function EmptyState({ icon, text }) {
  return (
    <div className="text-center py-8 text-gray-300">
      <i className={`bi ${icon} text-3xl block mb-2`} />
      <p className="text-sm text-gray-400">{text}</p>
    </div>
  )
}