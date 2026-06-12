import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

const BONUS_TYPE_DEPARTMENTS = {
  mensuel: ['Clientèle', 'Commercial GP', 'Commercial entreprise', 'ADV', 'Fidélisation', 'Auditeur interne', 'DAF Contrôleur', 'DAF CDG', 'CTB', 'RH', 'Achat', 'BBS', 'Communication & Mktg', 'DO', 'DSI', 'DT', 'Logistique', 'DG'],
  astreinte: ['BBS', 'DO', 'DSI', 'DT'],
  commission: ['Commercial GP', 'Commercial entreprise'],
  exceptionnel: ['BBS', 'DO', 'DSI', 'DT'],
}

const CalendarSvg = () => (
  <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
  </svg>
)

const MoonSvg = () => (
  <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
  </svg>
)

const ChartSvg = () => (
  <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
  </svg>
)

const FlashSvg = () => (
  <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
  </svg>
)

const types = [
  {
    id: 'mensuel',
    title: 'Prime Mensuelle',
    desc: 'Prime basée sur la performance mensuelle, absences et retards',
    icon: CalendarSvg,
    bg: 'bg-blue-50 text-blue-600',
    border: 'hover:border-blue-400',
  },
  {
    id: 'astreinte',
    title: "Prime d'Astreinte",
    desc: "Prime pour les jours d'astreinte avec taux journalier",
    icon: MoonSvg,
    bg: 'bg-violet-50 text-violet-600',
    border: 'hover:border-violet-400',
  },
  {
    id: 'commission',
    title: 'Prime Commission',
    desc: 'Commission basée sur le CA réalisé vs objectif',
    icon: ChartSvg,
    bg: 'bg-amber-50 text-amber-600',
    border: 'hover:border-amber-400',
  },
  {
    id: 'exceptionnel',
    title: 'Intervention Exceptionnelle',
    desc: 'Prime pour intervention ponctuelle exceptionnelle',
    icon: FlashSvg,
    bg: 'bg-rose-50 text-rose-600',
    border: 'hover:border-rose-400',
  },
]

export default function BonusTypeSelect() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const isTypeAllowed = (typeId) => {
    const allowed = BONUS_TYPE_DEPARTMENTS[typeId]
    return allowed && user?.department ? allowed.includes(user.department) : true
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/bonuses')} className="p-2 rounded-lg hover:bg-gray-100">
          <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Nouvelle prime</h1>
          <p className="text-sm text-gray-400 mt-1">Choisissez le type de prime à créer</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full">
        {types.map((t) => {
          const Icon = t.icon
          const allowed = isTypeAllowed(t.id)
          return (
            <button
              key={t.id}
              onClick={() => allowed && navigate(`/bonuses/new/${t.id}`)}
              disabled={!allowed}
              className={`group bg-white rounded-xl shadow-sm border p-8 text-left transition-all duration-200
                ${allowed
                  ? `border-gray-200 cursor-pointer hover:shadow-md ${t.border}`
                  : 'border-gray-100 cursor-not-allowed opacity-50'
                }`}
            >
              <div className={`w-14 h-14 rounded-2xl ${t.bg} flex items-center justify-center mb-5 group-hover:scale-110 transition-transform`}>
                <Icon />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">{t.title}</h3>
              <p className="text-sm text-gray-400 leading-relaxed">{t.desc}</p>
              {!allowed && (
                <span className="inline-block mt-2 text-xs text-red-400">Non disponible pour votre département</span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
