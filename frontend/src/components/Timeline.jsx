const iconMap = {
  creation: { icon: '📝', bg: 'bg-slate-100' },
  VALIDER: { icon: '✅', bg: 'bg-emerald-100' },
  REJETER: { icon: '❌', bg: 'bg-red-100' },
  AUTOMATIC: { icon: '🤖', bg: 'bg-slate-100' },
}

export default function Timeline({ items }) {
  if (!items || items.length === 0) {
    return <p className="text-sm text-base-content/40 py-4 text-center">Aucun historique</p>
  }

  return (
    <div className="relative pl-8 space-y-6">
      <div className="absolute left-[15px] top-2 bottom-2 w-0.5 bg-base-300" />
      {items.map((item, i) => {
        const cfg = iconMap[item.action] || iconMap[item.step] || { icon: '•', bg: 'bg-base-200' }
        return (
          <div key={i} className="relative">
            <div className={`absolute -left-8 w-8 h-8 rounded-full ${cfg.bg} flex items-center justify-center text-sm ring-4 ring-base-100`}>
              {cfg.icon}
            </div>
            <div className="card-blueline p-4">
              <div className="flex items-center justify-between gap-4">
                <p className="font-medium text-sm">
                  {item.step === 'CLOSED' ? 'Clôture automatique' : `Validation ${item.step || ''}`}
                  {item.validator_name && <span className="font-normal text-base-content/60"> — {item.validator_name}</span>}
                </p>
                {item.date && <span className="text-xs text-base-content/40 shrink-0">{item.date}</span>}
              </div>
              {item.action === 'REJETER' && item.motif_rejet && (
                <p className="text-sm text-red-600 mt-1">Motif : {item.motif_rejet}</p>
              )}
              {item.note && <p className="text-sm text-base-content/60 mt-1">{item.note}</p>}
            </div>
          </div>
        )
      })}
    </div>
  )
}
