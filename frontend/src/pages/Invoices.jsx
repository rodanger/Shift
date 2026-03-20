import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import client from '../api/client.jsx'
import Toast from '../components/Toast'

function formatMoney(amount, currency = 'CAD') {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency', currency: currency || 'CAD', maximumFractionDigits: 2
  }).format(parseFloat(amount) || 0)
}

const MONTHS = ['','January','February','March','April','May','June',
                'July','August','September','October','November','December']

const badgeClass = s => ({
  draft:    'bg-[#F1EFE8] text-[#5F5E5A]',
  sent:     'bg-[#D6E4F0] text-[#1F3864]',
  paid:     'bg-[#E1F5EE] text-[#0F6E56]',
  void:     'bg-[#FCEBEB] text-[#E24B4A]',
}[s] || 'bg-gray-100 text-gray-600')

const emptyForm = () => {
  const now = new Date()
  return {
    year: now.getFullYear(), month: now.getMonth() + 1,
    client_name: '', client_address: '', tax_rate: 0,
    due_date: '', notes: ''
  }
}

export default function Invoices() {
  const { currentUser } = useAuth()
  const cur = currentUser?.currency || 'CAD'

  const [invoices, setInvoices]   = useState([])
  const [toast, setToast]         = useState({ message: '', type: '' })
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm]           = useState(emptyForm())
  const [saving, setSaving]       = useState(false)
  const [formError, setFormError] = useState('')

  const load = async () => {
    const res = await client.get('/invoices/')
    setInvoices(res.data.results || res.data)
  }

  useEffect(() => { load() }, [])

  const openModal = () => {
    setForm(emptyForm())
    setFormError('')
    setModalOpen(true)
  }

  const generate = async e => {
    e.preventDefault()
    setSaving(true)
    setFormError('')
    try {
      await client.post('/invoices/generate/', {
        ...form,
        year:     parseInt(form.year),
        month:    parseInt(form.month),
        tax_rate: parseFloat(form.tax_rate) || 0,
        due_date: form.due_date || null,
      })
      setToast({ message: 'Invoice generated successfully', type: 'success' })
      setModalOpen(false)
      load()
    } catch (err) {
      const data = err.response?.data
      setFormError(data?.detail || Object.values(data || {}).flat().join(' | '))
    } finally {
      setSaving(false)
    }
  }

  const markInvoice = async (id, status) => {
    try {
      await client.patch(`/invoices/${id}/status/`, { status })
      setToast({ message: `Invoice marked as ${status}`, type: 'success' })
      load()
    } catch {
      setToast({ message: 'Could not update invoice', type: 'danger' })
    }
  }

  const deleteInvoice = async (id, status) => {
    if (!confirm('Are you sure you want to delete this invoice? This action cannot be undone.')) return
    try {
      if (status !== 'draft') {
        await client.patch(`/invoices/${id}/status/`, { status: 'void' })
      }
      await client.delete(`/invoices/${id}/delete/`)
      setToast({ message: 'Invoice deleted', type: 'success' })
      load()
    } catch {
      setToast({ message: 'Could not delete invoice', type: 'danger' })
    }
  }

  const downloadExcel = async id => {
    const token = localStorage.getItem('sit_access')
    const res = await fetch(`/api/invoices/${id}/export/excel/`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    if (!res.ok) { setToast({ message: 'Error downloading Excel', type: 'danger' }); return }
    const blob = await res.blob()
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `invoice-${id}.xlsx`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '' })} />

      <div className="flex justify-end mb-4">
        <button
          onClick={openModal}
          className="flex items-center gap-1 px-3 py-1.5 border border-[#E4E2DC] rounded-lg text-sm font-medium hover:bg-[#F7F6F3] transition-colors"
        >
          <i className="bi bi-lightning-fill" /> Generate invoice
        </button>
      </div>

      {invoices.length === 0 ? (
        <div className="text-center py-20 text-gray-300">
          <i className="bi bi-receipt-cutoff text-5xl block mb-3" />
          <p className="text-gray-400 text-sm">No invoices yet. Generate one from the Shifts view.</p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {invoices.map(inv => (
            <div key={inv.id} className="bg-white border border-[#E4E2DC] rounded-xl p-5 hover:shadow-md transition-shadow">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <div className="font-mono text-xs text-gray-400">{inv.invoice_number}</div>
                  <div className="text-xs text-gray-400">{MONTHS[inv.period_month]} {inv.period_year}</div>
                </div>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${badgeClass(inv.status)}`}>
                  {inv.status}
                </span>
              </div>
              <div className="font-mono font-semibold text-2xl my-3">
                {formatMoney(inv.total, cur)}
              </div>
              <div className="text-xs text-gray-400 mb-4">
                {inv.client_name || '—'} · {inv.shifts?.length || 0} shift(s)
              </div>
              <div className="flex gap-2 flex-wrap">
                {inv.status === 'draft' && (
                  <button
                    onClick={() => markInvoice(inv.id, 'sent')}
                    className="flex items-center gap-1 px-3 py-1.5 bg-[#1F3864] text-white rounded-lg text-xs font-medium"
                  >
                    <i className="bi bi-send" /> Send
                  </button>
                )}
                {inv.status === 'sent' && (
                  <button
                    onClick={() => markInvoice(inv.id, 'paid')}
                    className="flex items-center gap-1 px-3 py-1.5 bg-[#1F3864] text-white rounded-lg text-xs font-medium"
                  >
                    <i className="bi bi-check2-circle" /> Mark as paid
                  </button>
                )}
                <button
                  onClick={() => downloadExcel(inv.id)}
                  className="flex items-center gap-1 px-3 py-1.5 border border-[#E4E2DC] rounded-lg text-xs font-medium hover:bg-[#F7F6F3]"
                >
                  <i className="bi bi-file-earmark-spreadsheet" /> Excel
                </button>
                <button
                  onClick={() => deleteInvoice(inv.id, inv.status)}
                  className="p-1.5 border border-[#E4E2DC] rounded-lg hover:bg-gray-50"
                >
                  <i className="bi bi-trash text-red-400" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#E4E2DC] bg-[#F7F6F3] rounded-t-2xl">
              <h3 className="font-semibold">Generate invoice</h3>
              <button onClick={() => setModalOpen(false)}><i className="bi bi-x-lg text-gray-400" /></button>
            </div>
            <form onSubmit={generate} className="p-5 flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Year *</label>
                  <input type="number" required
                    className="w-full border border-[#E4E2DC] rounded-lg px-3 py-2 text-sm"
                    value={form.year}
                    onChange={e => setForm({...form, year: e.target.value})}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Month *</label>
                  <select required
                    className="w-full border border-[#E4E2DC] rounded-lg px-3 py-2 text-sm"
                    value={form.month}
                    onChange={e => setForm({...form, month: e.target.value})}
                  >
                    {MONTHS.slice(1).map((m,i) => (
                      <option key={i+1} value={i+1}>{m}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Client / company</label>
                <input
                  className="w-full border border-[#E4E2DC] rounded-lg px-3 py-2 text-sm"
                  value={form.client_name}
                  onChange={e => setForm({...form, client_name: e.target.value})}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Client address</label>
                <textarea rows={2}
                  className="w-full border border-[#E4E2DC] rounded-lg px-3 py-2 text-sm"
                  value={form.client_address}
                  onChange={e => setForm({...form, client_address: e.target.value})}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Tax rate (0.13 = 13%)</label>
                  <input type="number" step="0.01" min="0" max="1"
                    className="w-full border border-[#E4E2DC] rounded-lg px-3 py-2 text-sm"
                    value={form.tax_rate}
                    onChange={e => setForm({...form, tax_rate: e.target.value})}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Due date</label>
                  <input type="date"
                    className="w-full border border-[#E4E2DC] rounded-lg px-3 py-2 text-sm"
                    value={form.due_date}
                    onChange={e => setForm({...form, due_date: e.target.value})}
                  />
                </div>
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
                  {saving ? 'Generating…' : 'Generate'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}