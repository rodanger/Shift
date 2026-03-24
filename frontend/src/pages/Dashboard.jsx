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
    <div>
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard label="Shifts this month" value={summary?.shift_count ?? '–'} />
        <StatCard label="Hours worked"      value={summary ? `${summary.total_hours}h` : '–'} />
        <StatCard label="Monthly earnings"  value={summary ? formatMoney(summary.total_pay, cur) : '–'} accent />
        <StatCard label="Pending invoices"  value={pending ?? '–'} />
      </div>

      <div className="grid lg:grid-cols-7 gap-4">
        {/* Recent shifts */}
        <div className="lg:col-span-4 bg-white border border-[#E4E2DC] rounded-xl p-5">
          <div className="flex justify-between items-center mb-4">
            <span className="text-sm font-semibold">Recent shifts</span>
            <button onClick={() => navigate('/shifts')} className="text-xs text-[#2E75B6]">View all →</button>
          </div>
          {shifts.length === 0 ? (
            <EmptyState icon="bi-clock" text="No shifts yet" />
          ) : (
            <div style={{overflowX:'auto'}}>
              <table style={{width:'100%', minWidth:'420px', borderCollapse:'collapse', fontSize:'13px'}}>
                <tbody>
                  {shifts.slice(0,5).map(s => (
                    <tr key={s.id} style={{borderBottom:'1px solid #E4E2DC'}}>
                      <td style={{padding:'8px 8px 8px 0', fontFamily:'monospace', fontSize:'11px', color:'#7A786F', whiteSpace:'nowrap'}}>{fmtDate(s.date)}</td>
                      <td style={{padding:'8px', maxWidth:'160px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{s.client || '—'}{s.role ? ` · ${s.role}` : ''}</td>
                      <td style={{padding:'8px', whiteSpace:'nowrap'}}>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${badgeClass(s.status)}`}>
                          {labelStatus(s.status)}
                        </span>
                      </td>
                      <td style={{padding:'8px 0 8px 8px', fontFamily:'monospace', fontWeight:600, fontSize:'12px', whiteSpace:'nowrap', textAlign:'right'}}>{formatMoney(s.total_pay, cur)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Recent invoices */}
        <div className="lg:col-span-3 bg-white border border-[#E4E2DC] rounded-xl p-5">
          <div className="flex justify-between items-center mb-4">
            <span className="text-sm font-semibold">Recent invoices</span>
            <button onClick={() => navigate('/invoices')} className="text-xs text-[#2E75B6]">View all →</button>
          </div>
          {invoices.length === 0 ? (
            <EmptyState icon="bi-receipt" text="No invoices yet" />
          ) : (
            <div style={{overflowX:'auto'}}>
              <table style={{width:'100%', minWidth:'360px', borderCollapse:'collapse', fontSize:'13px'}}>
                <tbody>
                  {invoices.slice(0,4).map(inv => (
                    <tr key={inv.id} style={{borderBottom:'1px solid #E4E2DC'}}>
                      <td style={{padding:'8px 8px 8px 0', fontFamily:'monospace', fontSize:'11px', color:'#7A786F', whiteSpace:'nowrap'}}>{inv.invoice_number}</td>
                      <td style={{padding:'8px', maxWidth:'120px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{inv.client_name || '—'}</td>
                      <td style={{padding:'8px', whiteSpace:'nowrap'}}>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${badgeClass(inv.status)}`}>
                          {inv.status}
                        </span>
                      </td>
                      <td style={{padding:'8px 0 8px 8px', fontFamily:'monospace', fontWeight:600, fontSize:'12px', whiteSpace:'nowrap', textAlign:'right'}}>{formatMoney(inv.total, cur)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
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