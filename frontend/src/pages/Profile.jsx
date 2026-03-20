import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import client from '../api/client.jsx'
import Toast from '../components/Toast'

export default function Profile() {
  const { currentUser, setCurrentUser } = useAuth()
  const [form, setForm]   = useState({
    full_name: '', phone: '', default_rate: '', currency: 'CAD',
    invoice_prefix: 'INV', address: '', bank_details: ''
  })
  const [saving, setSaving] = useState(false)
  const [toast, setToast]   = useState({ message: '', type: '' })

  useEffect(() => {
    client.get('/auth/profile/').then(res => {
      setForm({
        full_name:      res.data.full_name      || '',
        phone:          res.data.phone          || '',
        default_rate:   res.data.default_rate   || '',
        currency:       res.data.currency       || 'CAD',
        invoice_prefix: res.data.invoice_prefix || 'INV',
        address:        res.data.address        || '',
        bank_details:   res.data.bank_details   || '',
      })
    })
  }, [])

  const save = async e => {
    e.preventDefault()
    setSaving(true)
    try {
      const res = await client.patch('/auth/profile/', form)
      setCurrentUser(res.data)
      setToast({ message: 'Profile updated', type: 'success' })
    } catch (err) {
      const data = err.response?.data
      setToast({
        message: typeof data === 'string' ? data : Object.values(data || {}).flat().join(' | '),
        type: 'danger'
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex justify-center">
      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '' })} />

      <div className="w-full max-w-2xl bg-white border border-[#E4E2DC] rounded-xl p-6">
        <h5 className="font-semibold mb-5">Profile details</h5>
        <form onSubmit={save} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Full name</label>
              <input
                className="w-full border border-[#E4E2DC] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#2E75B6]"
                value={form.full_name}
                onChange={e => setForm({...form, full_name: e.target.value})}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Phone</label>
              <input
                className="w-full border border-[#E4E2DC] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#2E75B6]"
                value={form.phone}
                onChange={e => setForm({...form, phone: e.target.value})}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-1">
              <label className="text-xs font-medium text-gray-500 mb-1 block">Hourly rate</label>
              <input
                type="number" step="0.01"
                className="w-full border border-[#E4E2DC] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#2E75B6]"
                value={form.default_rate}
                onChange={e => setForm({...form, default_rate: e.target.value})}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Currency</label>
              <select
                className="w-full border border-[#E4E2DC] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#2E75B6]"
                value={form.currency}
                onChange={e => setForm({...form, currency: e.target.value})}
              >
                {['USD','EUR','GBP','CAD','MXN','ARS'].map(c => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Invoice prefix</label>
              <input
                maxLength={10}
                className="w-full border border-[#E4E2DC] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#2E75B6]"
                value={form.invoice_prefix}
                onChange={e => setForm({...form, invoice_prefix: e.target.value})}
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Address</label>
            <textarea rows={2}
              className="w-full border border-[#E4E2DC] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#2E75B6]"
              value={form.address}
              onChange={e => setForm({...form, address: e.target.value})}
            />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">
              Banking details <span className="text-gray-400">(shown on invoices)</span>
            </label>
            <textarea rows={3}
              className="w-full border border-[#E4E2DC] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#2E75B6]"
              value={form.bank_details}
              onChange={e => setForm({...form, bank_details: e.target.value})}
            />
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-1 px-5 py-2 bg-[#1F3864] text-white rounded-lg text-sm font-medium disabled:opacity-60 hover:bg-[#162b4d] transition-colors"
            >
              <i className="bi bi-check2" />
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}