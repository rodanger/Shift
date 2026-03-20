import { useEffect } from 'react'

export default function Toast({ message, type, onClose }) {
  useEffect(() => {
    if (!message) return
    const t = setTimeout(onClose, 3000)
    return () => clearTimeout(t)
  }, [message])

  if (!message) return null

  const bg = type === 'success' ? 'bg-[#1D9E75]' : type === 'danger' ? 'bg-[#E24B4A]' : 'bg-[#1A1916]'

  return (
    <div className={`fixed bottom-4 right-4 z-50 flex items-center gap-3 px-4 py-3 rounded-xl text-white text-sm min-w-60 ${bg} shadow-lg`}>
      <span className="flex-1">{message}</span>
      <button onClick={onClose} className="text-white/70 hover:text-white">
        <i className="bi bi-x-lg text-xs" />
      </button>
    </div>
  )
}