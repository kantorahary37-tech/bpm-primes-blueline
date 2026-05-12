const statusConfig = {
  'Initialisé': { color: 'bg-slate-100 text-slate-700 border-slate-300', icon: '📋' },
  'En attente N+1': { color: 'bg-amber-50 text-amber-700 border-amber-300', icon: '⏳' },
  'En attente Directeur': { color: 'bg-amber-50 text-amber-700 border-amber-300', icon: '⏳' },
  'En attente DG': { color: 'bg-amber-50 text-amber-700 border-amber-300', icon: '⏳' },
  'Prime validée': { color: 'bg-emerald-50 text-emerald-700 border-emerald-300', icon: '✅' },
  'Prime rejetée': { color: 'bg-red-50 text-red-700 border-red-300', icon: '❌' },
}

export default function StatusBadge({ status, size = 'md' }) {
  const config = statusConfig[status] || { color: 'bg-gray-100 text-gray-600 border-gray-300', icon: '❓' }
  const sizeClass = size === 'sm' ? 'text-xs px-2 py-0.5' : 'text-sm px-3 py-1'

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border font-medium ${config.color} ${sizeClass}`}>
      <span className="text-xs">{config.icon}</span>
      {status}
    </span>
  )
}
