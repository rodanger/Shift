import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import client from '../api/client.jsx'

export default function AuthPage() {
  const { login } = useAuth()
  const [tab, setTab]       = useState('login')
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState('')

  // Login
  const [loginForm, setLoginForm] = useState({ username: '', password: '' })

  // Register
  const [regForm, setRegForm] = useState({
    username: '', full_name: '', email: '',
    default_rate: '', currency: 'CAD',
    password: '', password2: '',
  })

  const handleLogin = async e => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(loginForm.username, loginForm.password)
    } catch {
      setError('Incorrect credentials')
    } finally {
      setLoading(false)
    }
  }

  const handleRegister = async e => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await client.post('/auth/register/', regForm, { headers: { Authorization: undefined } })
      setTab('login')
      setLoginForm({ username: regForm.username, password: '' })
    } catch (err) {
      const data = err.response?.data
      setError(typeof data === 'string' ? data : Object.values(data || {}).flat().join(' | '))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#1A1916] to-[#1F3864] px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-10">

        {/* Logo */}
        <div className="flex items-center gap-4 mb-6">
          <div className="w-12 h-12 bg-[#1F3864] rounded-xl flex items-center justify-center">
            <i className="bi bi-calendar2-week-fill text-white text-xl" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Shift & Invoice</h1>
            <p className="text-xs text-gray-400">Tracker for hourly workers</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex bg-[#F7F6F3] rounded-lg p-1 gap-1 mb-6">
          {['login','register'].map(t => (
            <button
              key={t}
              onClick={() => { setTab(t); setError('') }}
              className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-all
                ${tab === t ? 'bg-white text-[#1F3864] shadow' : 'text-gray-400'}`}
            >
              {t === 'login' ? 'Sign in' : 'Register'}
            </button>
          ))}
        </div>

        {/* Login */}
        {tab === 'login' && (
          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Username</label>
              <input
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#2E75B6] focus:ring-2 focus:ring-[#2E75B6]/10"
                placeholder="username"
                value={loginForm.username}
                onChange={e => setLoginForm({...loginForm, username: e.target.value})}
                required
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Password</label>
              <input
                type="password"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#2E75B6] focus:ring-2 focus:ring-[#2E75B6]/10"
                placeholder="••••••••"
                value={loginForm.password}
                onChange={e => setLoginForm({...loginForm, password: e.target.value})}
                required
              />
            </div>
            {error && <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="bg-[#1F3864] text-white rounded-lg py-2 text-sm font-medium hover:bg-[#162b4d] transition-colors disabled:opacity-60"
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        )}

        {/* Register */}
        {tab === 'register' && (
          <form onSubmit={handleRegister} className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Username</label>
                <input
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#2E75B6]"
                  placeholder="username"
                  value={regForm.username}
                  onChange={e => setRegForm({...regForm, username: e.target.value})}
                  required
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Full name</label>
                <input
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#2E75B6]"
                  placeholder="Your name"
                  value={regForm.full_name}
                  onChange={e => setRegForm({...regForm, full_name: e.target.value})}
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Email</label>
              <input
                type="email"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#2E75B6]"
                placeholder="you@email.com"
                value={regForm.email}
                onChange={e => setRegForm({...regForm, email: e.target.value})}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Hourly rate</label>
                <input
                  type="number"
                  step="0.01"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#2E75B6]"
                  placeholder="25.00"
                  value={regForm.default_rate}
                  onChange={e => setRegForm({...regForm, default_rate: e.target.value})}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Currency</label>
                <select
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#2E75B6]"
                  value={regForm.currency}
                  onChange={e => setRegForm({...regForm, currency: e.target.value})}
                >
                  {['USD','EUR','GBP','CAD','MXN','ARS'].map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Password</label>
                <input
                  type="password"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#2E75B6]"
                  value={regForm.password}
                  onChange={e => setRegForm({...regForm, password: e.target.value})}
                  required
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Confirm</label>
                <input
                  type="password"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#2E75B6]"
                  value={regForm.password2}
                  onChange={e => setRegForm({...regForm, password2: e.target.value})}
                  required
                />
              </div>
            </div>
            {error && <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="bg-[#1F3864] text-white rounded-lg py-2 text-sm font-medium hover:bg-[#162b4d] transition-colors disabled:opacity-60"
            >
              {loading ? 'Creating account…' : 'Create account'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}