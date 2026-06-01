const Dot = ({ color }) => (
  <svg className={`w-2 h-2 ${color}`} viewBox="0 0 8 8" fill="currentColor">
    <circle cx="4" cy="4" r="4" />
  </svg>
)

const statusConfig = {
  'Initialisé': { color: 'bg-gray-100 text-gray-700 border-gray-300', dot: 'text-gray-400' },
  'En attente N+1': { color: 'bg-amber-50 text-amber-700 border-amber-300', dot: 'text-amber-400' },
  'En attente Directeur': { color: 'bg-amber-50 text-amber-700 border-amber-300', dot: 'text-amber-400' },
  'En attente DG': { color: 'bg-amber-50 text-amber-700 border-amber-300', dot: 'text-amber-400' },
  'Prime validée': { color: 'bg-emerald-50 text-emerald-700 border-emerald-300', dot: 'text-emerald-500' },
  'Validé': { color: 'bg-emerald-50 text-emerald-700 border-emerald-300', dot: 'text-emerald-500' },
  'Prime rejetée': { color: 'bg-red-50 text-red-700 border-red-300', dot: 'text-red-400' },
  'Rejeté': { color: 'bg-red-50 text-red-700 border-red-300', dot: 'text-red-400' },
}

export default function StatusBadge({ status, size = 'md' }) {
  const config = statusConfig[status] || { color: 'bg-gray-100 text-gray-600 border-gray-300', dot: 'text-gray-400' }
  const sizeClass = size === 'sm' ? 'text-xs px-2 py-0.5' : 'text-sm px-3 py-1'

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border font-medium ${config.color} ${sizeClass}`}>
      <Dot color={config.dot} />
      {status}
    </span>
  )
}
