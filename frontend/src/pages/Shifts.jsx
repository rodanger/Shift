import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import client from '../api/client'
import Toast from '../components/Toast'

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

function todayISO() {
  return new Date().toISOString().split('T')[0]
}

const labelStatus = s => ({ pending: 'Pending', invoiced: 'Invoiced', paid: 'Paid' }[s] || s)
const badgeClass  = s => ({
  pending:  'bg-[#FFF3CD] text-[#7B5800]',
  invoiced: 'bg-[#D6E4F0] text-[#1F3864]',
  paid:     'bg-[#E1F5EE] text-[#0F6E56]',
}[s] || 'bg-gray-100 text-gray-600')

const MONTHS = ['','January','February','March','April','May','June',
                'July','August','September','October','November','December']

const emptyShift = (rate = '') => ({
  id: '', date: todayISO(), start_time: '', end_time: '',
  hourly_rate: rate, client: '', role: '', location: '', notes: ''
})

export default function Shifts() {
  const { currentUser } = useAuth()
  const cur = currentUser?.currency || 'CAD'

  const [shifts, setShifts]       = useState([])
  const [filters, setFilters]     = useState({
    year: new Date().getFullYear(), month: '', status: '', client: ''
  })
  const [toast, setToast]         = useState({ message: '', type: '' })
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm]           = useState(emptyShift())
  const [saving, setSaving]       = useState(false)
  const [formError, setFormError] = useState('')

  const years = Array.from({ length: 4 }, (_, i) => new Date().getFullYear() - i)

  const load = async () => {
    const p = new URLSearchParams({ ordering: '-date' })
    if (filters.year)   p.append('year',   filters.year)
    if (filters.month)  p.append('month',  filters.month)
    if (filters.status) p.append('status', filters.status)
    if (filters.client) p.append('client', filters.client)
    const res = await client.get(`/shifts/?${p}`)
    setShifts(res.data.results || res.data)
  }

  useEffect(() => { load() }, [])

  const openNew = () => {
    setForm(emptyShift(currentUser?.default_rate || ''))
    setFormError('')
    setModalOpen(true)
  }

  const openEdit = async id => {
    const res = await client.get(`/shifts/${id}/`)
    setForm({
      ...res.data,
      start_time: res.data.start_time.slice(0,5),
      end_time:   res.data.end_time.slice(0,5),
    })
    setFormError('')
    setModalOpen(true)
  }

  const deleteShift = async id => {
    if (!confirm('Delete this shift?')) return
    await client.delete(`/shifts/${id}/`)
    setToast({ message: 'Shift deleted', type: 'success' })
    load()
  }

  const saveShift = async e => {
    e.preventDefault()
    setSaving(true)
    setFormError('')
    try {
      if (form.id) {
        await client.patch(`/shifts/${form.id}/`, form)
        setToast({ message: 'Shift updated', type: 'success' })
      } else {
        await client.post('/shifts/', form)
        setToast({ message: 'Shift saved', type: 'success' })
      }
      setModalOpen(false)
      load()
    } catch (err) {
      const data = err.response?.data
      setFormError(typeof data === 'string' ? data : Object.values(data || {}).flat().join(' | '))
    } finally {
      setSaving(false)
    }
  }

  // Preview total
  const previewTotal = () => {
    const { start_time, end_time, hourly_rate } = form
    if (!start_time || !end_time || !hourly_rate) return '–'
    const [sh, sm] = start_time.split(':').map(Number)
    const [eh, em] = end_time.split(':').map(Number)
    let mins = (eh * 60 + em) - (sh * 60 + sm)
    if (mins <= 0) mins += 24 * 60
    return formatMoney((mins / 60) * parseFloat(hourly_rate), cur)
  }

  const totalHours = shifts.reduce((a, s) => a + parseFloat(s.hours_worked || 0), 0)
  const totalPay   = shifts.reduce((a, s) => a + parseFloat(s.total_pay   || 0), 0)

  return (
    <div>
      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '' })} />

      {/* Header button */}
      <div className="flex justify-end mb-4">
        <button
          onClick={openNew}
          className="flex items-center gap-1 px-3 py-1.5 border border-[#E4E2DC] rounded-lg text-sm font-medium hover:bg-[#F7F6F3] transition-colors"
        >
          <i className="bi bi-plus-lg" /> New shift
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white border border-[#E4E2DC] rounded-xl p-4 mb-4">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          <select
            className="border border-[#E4E2DC] rounded-lg px-3 py-1.5 text-sm"
            value={filters.year}
            onChange={e => setFilters({...filters, year: e.target.value})}
          >
            {years.map(y => <option key={y}>{y}</option>)}
          </select>
          <select
            className="border border-[#E4E2DC] rounded-lg px-3 py-1.5 text-sm"
            value={filters.month}
            onChange={e => setFilters({...filters, month: e.target.value})}
          >
            <option value="">All months</option>
            {MONTHS.slice(1).map((m,i) => <option key={i+1} value={i+1}>{m}</option>)}
          </select>
          <select
            className="border border-[#E4E2DC] rounded-lg px-3 py-1.5 text-sm"
            value={filters.status}
            onChange={e => setFilters({...filters, status: e.target.value})}
          >
            <option value="">All status</option>
            <option value="pending">Pending</option>
            <option value="invoiced">Invoiced</option>
            <option value="paid">Paid</option>
          </select>
          <input
            className="border border-[#E4E2DC] rounded-lg px-3 py-1.5 text-sm"
            placeholder="Search client…"
            value={filters.client}
            onChange={e => setFilters({...filters, client: e.target.value})}
          />
          <div className="flex gap-2">
            <button
              onClick={load}
              className="flex-1 bg-[#1F3864] text-white rounded-lg px-3 py-1.5 text-sm font-medium"
            >
              <i className="bi bi-funnel-fill mr-1" />Filter
            </button>
            <button
              onClick={() => { setFilters({ year: new Date().getFullYear(), month: '', status: '', client: '' }); load() }}
              className="border border-[#E4E2DC] rounded-lg px-3 py-1.5 text-sm"
            >
              <i className="bi bi-x-lg" />
            </button>
          </div>
        </div>
      </div>

      {/* Summary pills */}
      <div className="flex gap-3 mb-4 flex-wrap">
        <Pill icon="bi-list-ul"    text={`${shifts.length} shifts`} />
        <Pill icon="bi-clock"      text={`${totalHours.toFixed(1)}h`} />
        <Pill icon="bi-cash-stack" text={formatMoney(totalPay, cur)} />
      </div>

      {/* Table */}
      <div className="bg-white border border-[#E4E2DC] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#F7F6F3] border-b border-[#E4E2DC]">
                {['Date','Schedule','Client / Role','Hours','Total','Status','Actions'].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shifts.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-10 text-gray-400">No shifts found</td></tr>
              ) : shifts.map(s => (
                <tr key={s.id} className="border-b border-[#E4E2DC] last:border-0 hover:bg-[#F7F6F3]">
                  <td className="px-4 py-3 font-mono text-xs">{fmtDate(s.date)}</td>
                  <td className="px-4 py-3 font-mono text-xs">{s.start_time.slice(0,5)} – {s.end_time.slice(0,5)}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{s.client || '—'}</div>
                    {s.role && <div className="text-xs text-gray-400">{s.role}</div>}
                  </td>
                  <td className="px-4 py-3 font-mono text-right">{parseFloat(s.hours_worked).toFixed(2)}h</td>
                  <td className="px-4 py-3 font-mono font-semibold text-right">{formatMoney(s.total_pay, cur)}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${badgeClass(s.status)}`}>
                      {labelStatus(s.status)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 justify-center">
                      {s.status === 'pending' && (
                        <button onClick={() => openEdit(s.id)} className="p-1.5 rounded hover:bg-gray-100">
                          <i className="bi bi-pencil text-gray-500" />
                        </button>
                      )}
                      <button onClick={() => deleteShift(s.id)} className="p-1.5 rounded hover:bg-gray-100">
                        <i className="bi bi-trash text-red-400" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#E4E2DC] bg-[#F7F6F3] rounded-t-2xl">
              <h3 className="font-semibold">{form.id ? 'Edit shift' : 'New shift'}</h3>
              <button onClick={() => setModalOpen(false)}><i className="bi bi-x-lg text-gray-400" /></button>
            </div>
            <form onSubmit={saveShift} className="p-5 flex flex-col gap-3">
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Date *</label>
                <input type="date" required
                  className="w-full border border-[#E4E2DC] rounded-lg px-3 py-2 text-sm"
                  value={form.date}
                  onChange={e => setForm({...form, date: e.target.value})}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Start time *</label>
                  <input type="time" required
                    className="w-full border border-[#E4E2DC] rounded-lg px-3 py-2 text-sm"
                    value={form.start_time}
                    onChange={e => setForm({...form, start_time: e.target.value})}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">End time *</label>
                  <input type="time" required
                    className="w-full border border-[#E4E2DC] rounded-lg px-3 py-2 text-sm"
                    value={form.end_time}
                    onChange={e => setForm({...form, end_time: e.target.value})}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 items-end">
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Rate/hour *</label>
                  <input type="number" step="0.01" required
                    className="w-full border border-[#E4E2DC] rounded-lg px-3 py-2 text-sm"
                    value={form.hourly_rate}
                    onChange={e => setForm({...form, hourly_rate: e.target.value})}
                  />
                </div>
                <div className="border border-[#E4E2DC] rounded-lg px-3 py-2 bg-[#F7F6F3] text-center">
                  <div className="text-xs text-gray-400">Total</div>
                  <div className="font-semibold text-base">{previewTotal()}</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Client</label>
                  <input
                    className="w-full border border-[#E4E2DC] rounded-lg px-3 py-2 text-sm"
                    placeholder="Company / Event"
                    value={form.client}
                    onChange={e => setForm({...form, client: e.target.value})}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Role</label>
                  <input
                    className="w-full border border-[#E4E2DC] rounded-lg px-3 py-2 text-sm"
                    placeholder="Bartender, Staff…"
                    value={form.role}
                    onChange={e => setForm({...form, role: e.target.value})}
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Location</label>
                <input
                  className="w-full border border-[#E4E2DC] rounded-lg px-3 py-2 text-sm"
                  value={form.location}
                  onChange={e => setForm({...form, location: e.target.value})}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Notes</label>
                <textarea rows={2}
                  className="w-full border border-[#E4E2DC] rounded-lg px-3 py-2 text-sm"
                  value={form.notes}
                  onChange={e => setForm({...form, notes: e.target.value})}
                />
              </div>
              {formError && <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{formError}</p>}
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setModalOpen(false)}
                  className="px-4 py-2 border border-[#E4E2DC] rounded-lg text-sm">
                  Cancel
                </button>
                <button type="submit" disabled={saving}
                  className="px-4 py-2 bg-[#1F3864] text-white rounded-lg text-sm font-medium disabled:opacity-60">
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

function Pill({ icon, text }) {
  return (
    <div className="flex items-center gap-2 bg-white border border-[#E4E2DC] rounded-full px-4 py-1.5 text-xs font-medium">
      <i className={`bi ${icon}`} />
      <strong className="font-mono">{text}</strong>
    </div>
  )
}