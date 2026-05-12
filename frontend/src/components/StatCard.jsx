export default function StatCard({ icon, label, value, color = 'brand', sub }) {
  const colorMap = {
    brand: 'bg-brand-100 text-brand-600',
    amber: 'bg-amber-100 text-amber-600',
    emerald: 'bg-emerald-100 text-emerald-600',
    violet: 'bg-violet-100 text-violet-600',
    rose: 'bg-rose-100 text-rose-600',
  }

  return (
    <div className="stat-card">
      <div className={`stat-icon ${colorMap[color] || colorMap.brand}`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-base-content/60">{label}</p>
        <p className="text-2xl font-bold text-base-content mt-0.5">{value}</p>
        {sub && <p className="text-xs text-base-content/40 mt-1">{sub}</p>}
      </div>
    </div>
  )
}
