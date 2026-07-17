import { CheckIcon, XCircleIcon, EditIcon, ClockIcon } from './Icons';

const iconMap = {
  creation: { icon: ClockIcon, bg: 'bg-slate-100 text-slate-600', label: 'Création' },
  VALIDER: { icon: CheckIcon, bg: 'bg-emerald-100 text-emerald-600', label: 'Validation' },
  REJETER: { icon: XCircleIcon, bg: 'bg-red-100 text-red-600', label: 'Rejet' },
  AUTOMATIC: { icon: CheckIcon, bg: 'bg-slate-100 text-slate-400', label: 'Clôture' },
  MODIFICATION: { icon: EditIcon, bg: 'bg-amber-100 text-amber-600', label: 'Modification' },
  PAIEMENT: { icon: CheckIcon, bg: 'bg-emerald-100 text-emerald-600', label: 'Paiement' },
}

const fieldLabels = {
  total_amount: 'Montant total',
  performance_score: 'Score',
  absences: 'Absences',
  retard: 'Retards',
  prime_mensuel_amount: 'Prime mensuelle',
  nb_jours_astreinte: 'Jours astreinte',
  taux_jour: 'Taux journalier',
  prime_astreinte_amount: 'Prime astreinte',
  ca_realise: 'CA réalisé',
  ca_objectif: 'CA objectif',
  taux_commission: 'Taux commission',
  commission_amount: 'Commission',
  details: 'Détails',
  statut: 'Statut',
}

function formatVal(v) {
  if (!v || v === 'None' || v === 'null') return '—'
  return v
}

export default function Timeline({ items }) {
  if (!items || items.length === 0) {
    return <p className="text-sm text-base-content/40 py-2 text-center">Aucun historique</p>
  }

  return (
    <div className="relative pl-8 space-y-1">
      <div className="absolute left-[15px] top-2 bottom-2 w-0.5 bg-gray-200" />
      {items.map((item, i) => {
        const cfg = iconMap[item.action] || iconMap[item.step] || { icon: null, bg: 'bg-gray-100 text-gray-500', label: item.action || item.step || '' }
        const Icon = cfg.icon

        const changes = item.description
          ? item.description.split('; ').filter(Boolean)
          : []

        const hasChanges = changes.length > 0 && changes.some(c => c.includes('→') || c.includes('détails'))

        return (
          <div key={i} className="relative group">
            <div className={`absolute -left-8 w-8 h-8 rounded-full ${cfg.bg} flex items-center justify-center ring-4 ring-white z-10 transition-transform group-hover:scale-110`}>
              {Icon ? <Icon className="w-4 h-4" /> : <span className="text-sm font-bold">•</span>}
            </div>
            <div className="ml-2 p-3 rounded-xl border border-gray-100 hover:border-gray-200 bg-white transition-colors">
              {/* Header row */}
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${cfg.bg}`}>
                    {cfg.label}
                  </span>
                  {item.step && item.step !== 'CLOSED' && item.action !== 'creation' && (
                    <span className="text-[10px] font-semibold text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded-md">
                      {item.step}
                    </span>
                  )}
                </div>
                {item.date && (
                  <span className="text-[11px] text-gray-400 shrink-0">{item.date}</span>
                )}
              </div>

              {/* Validator / user */}
              {item.validator_name && item.validator_name !== '—' && (
                <p className="text-xs text-gray-500 mt-1">
                  par <span className="font-semibold text-gray-700">{item.validator_name}</span>
                </p>
              )}

              {/* Rejection motif */}
              {item.action === 'REJETER' && item.motif_rejet && (
                <div className="mt-2 p-2 rounded-lg bg-red-50 border border-red-100">
                  <p className="text-xs font-medium text-red-600">Motif du rejet</p>
                  <p className="text-xs text-red-700 mt-0.5">{item.motif_rejet}</p>
                </div>
              )}

              {/* Note */}
              {item.note && !item.action?.includes('VALIDER') && (
                <p className="text-xs text-gray-500 mt-1 italic">{item.note}</p>
              )}

              {/* Detailed changes */}
              {hasChanges && (
                <div className="mt-2 space-y-1">
                  {changes.map((c, j) => {
                    if (c.includes('→')) {
                      const match = c.match(/^([^:]+):\s*(.+?)\s*→\s*(.+)$/)
                      if (match) {
                        const [, field, oldVal, newVal] = match
                        const label = fieldLabels[field.trim()] || field.trim()
                        if (field.trim() === 'details') {
                          return (
                            <p key={j} className="text-[11px] text-gray-400 italic pl-0">
                              Détails modifiés (critères, notes, coefficients)
                            </p>
                          )
                        }
                        return (
                          <div key={j} className="flex items-center gap-1.5 text-[11px]">
                            <span className="font-medium text-gray-600 shrink-0">{label}</span>
                            <span className="text-gray-300">·</span>
                            <span className="text-gray-400 line-through">{formatVal(oldVal.trim())}</span>
                            <span className="text-gray-300">→</span>
                            <span className="font-semibold text-gray-800">{formatVal(newVal.trim())}</span>
                          </div>
                        )
                      }
                    }
                    if (c.toLowerCase().includes('détails')) {
                      return <p key={j} className="text-[11px] text-gray-400 italic">Détails modifiés (critères, notes, coefficients)</p>
                    }
                    return <p key={j} className="text-[11px] text-gray-500">{c}</p>
                  })}
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
