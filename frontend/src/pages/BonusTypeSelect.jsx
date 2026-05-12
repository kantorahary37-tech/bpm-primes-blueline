import { useNavigate } from 'react-router-dom'

const types = [
  {
    id: 'mensuel',
    title: 'Prime Mensuelle',
    desc: 'Prime basée sur la performance mensuelle, absences et retards',
    icon: '📅',
    color: 'from-brand-500 to-brand-600',
    bg: 'bg-brand-50 text-brand-600',
  },
  {
    id: 'astreinte',
    title: "Prime d'Astreinte",
    desc: 'Prime pour les jours d\'astreinte avec taux journalier',
    icon: '🌙',
    color: 'from-violet-500 to-violet-600',
    bg: 'bg-violet-50 text-violet-600',
  },
  {
    id: 'commission',
    title: 'Prime Commission',
    desc: 'Commission basée sur le CA réalisé vs objectif',
    icon: '📈',
    color: 'from-amber-500 to-amber-600',
    bg: 'bg-amber-50 text-amber-600',
  },
]

export default function BonusTypeSelect() {
  const navigate = useNavigate()

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Nouvelle prime</h1>
          <p className="text-sm text-base-content/50 mt-1">Choisissez le type de prime à créer</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl">
        {types.map((t) => (
          <button
            key={t.id}
            onClick={() => navigate(`/bonuses/new/${t.id}`)}
            className="group card-blueline-hover p-8 text-left cursor-pointer"
          >
            <div className={`w-14 h-14 rounded-2xl ${t.bg} flex items-center justify-center text-2xl mb-5 group-hover:scale-110 transition-transform`}>
              {t.icon}
            </div>
            <h3 className="text-lg font-semibold text-base-content mb-2">{t.title}</h3>
            <p className="text-sm text-base-content/50 leading-relaxed">{t.desc}</p>
          </button>
        ))}
      </div>
    </div>
  )
}
