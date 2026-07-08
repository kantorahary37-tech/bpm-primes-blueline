import { CheckIcon, XCircleIcon, EditIcon } from './Icons';

const iconMap = {
  creation: { icon: EditIcon, bg: 'bg-slate-100 text-slate-600' },
  VALIDER: { icon: CheckIcon, bg: 'bg-emerald-100 text-emerald-600' },
  REJETER: { icon: XCircleIcon, bg: 'bg-red-100 text-red-600' },
  AUTOMATIC: { icon: CheckIcon, bg: 'bg-slate-100 text-slate-400' },
}

export default function Timeline({ items }) {
  if (!items || items.length === 0) {
    return <p className="text-sm text-base-content/40 py-2 text-center">Aucun historique</p>
  }

  return (
    <div className="relative pl-8 space-y-2">
      <div className="absolute left-[15px] top-2 bottom-2 w-0.5 bg-base-300" />
      {items.map((item, i) => {
        const cfg = iconMap[item.action] || iconMap[item.step] || { icon: null, bg: 'bg-base-200' }
        const Icon = cfg.icon
        return (
          <div key={i} className="relative">
            <div className={`absolute -left-8 w-8 h-8 rounded-full ${cfg.bg} flex items-center justify-center ring-4 ring-base-100`}>
              {Icon ? <Icon className="w-4 h-4" /> : <span className="text-sm">•</span>}
            </div>
            <div className="card-blueline p-2.5">
              <div className="flex items-center justify-between gap-4">
                <p className="font-medium text-sm">
                  {item.step === 'CLOSED' ? 'Clôture automatique' : `Validation ${item.step || ''}`}
                  {item.validator_name && <span className="font-normal text-base-content/60"> — {item.validator_name}</span>}
                </p>
                {item.date && <span className="text-xs text-base-content/40 shrink-0">{item.date}</span>}
              </div>
              {item.action === 'REJETER' && item.motif_rejet && (
                <p className="text-sm text-red-600 mt-0.5">Motif : {item.motif_rejet}</p>
              )}
              {item.note && <p className="text-sm text-base-content/60 mt-0.5">{item.note}</p>}
            </div>
          </div>
        )
      })}
    </div>
  )
}
