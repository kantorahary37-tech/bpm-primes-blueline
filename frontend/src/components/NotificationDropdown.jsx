import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { getNotifications, getUnreadCount, markAsRead, markAllRead } from '../services/api'
import { BellIcon, CheckBadgeIcon, EditIcon, CheckIcon, XCircleIcon } from './Icons'

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "à l'instant"
  if (mins < 60) return `il y a ${mins} min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `il y a ${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 30) return `il y a ${days}j`
  return new Date(dateStr).toLocaleDateString('fr-FR')
}

const TYPE_CONFIG = {
  MODIF_DIR: { icon: EditIcon, color: 'text-amber-600', bg: 'bg-amber-50', label: 'Modification' },
  MODIF_DG:  { icon: EditIcon, color: 'text-amber-600', bg: 'bg-amber-50', label: 'Modification DG' },
  VALID_N1:  { icon: CheckIcon, color: 'text-blue-600', bg: 'bg-blue-50', label: 'Validé N+1' },
  VALID_DIRECTEUR: { icon: CheckIcon, color: 'text-emerald-600', bg: 'bg-emerald-50', label: 'Validé Directeur' },
  VALID_DG:  { icon: CheckIcon, color: 'text-purple-600', bg: 'bg-purple-50', label: 'Validé DG' },
  REJET:     { icon: XCircleIcon, color: 'text-red-600', bg: 'bg-red-50', label: 'Rejet' },
}

function parseMessage(msg) {
  const parts = msg.split(' — ')
  return { employee: parts[0] || msg, detail: parts.slice(1).join(' — ') || '' }
}

export default function NotificationDropdown() {
  const [allNotifs, setAllNotifs] = useState([])
  const [unread, setUnread] = useState(0)
  const [open, setOpen] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const ref = useRef(null)
  const navigate = useNavigate()

  const LIMIT_COMPACT = 8

  const fetch = useCallback(async () => {
    try {
      const [notifData, countData] = await Promise.all([getNotifications(), getUnreadCount()])
      setAllNotifs(notifData)
      setUnread(countData.count)
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    fetch()
    const interval = setInterval(fetch, 30000)
    return () => clearInterval(interval)
  }, [fetch])

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setShowAll(false) }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleMarkRead = async (id) => {
    try {
      await markAsRead(id)
      setAllNotifs((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)))
      setUnread((prev) => Math.max(0, prev - 1))
    } catch { /* ignore */ }
  }

  const handleMarkAll = async () => {
    try {
      await markAllRead()
      setAllNotifs((prev) => prev.map((n) => ({ ...n, is_read: true })))
      setUnread(0)
    } catch { /* ignore */ }
  }

  const goToBonus = (bonusId) => {
    setOpen(false)
    setShowAll(false)
    navigate(`/bonuses/${bonusId}`)
  }

  const visible = showAll ? allNotifs : allNotifs.slice(0, LIMIT_COMPACT)

  return (
    <div className="relative" ref={ref}>
      {/* <button
        onClick={() => { fetch(); setOpen((prev) => { if (!prev) setShowAll(false); return !prev }) }}
        className="relative p-2 rounded-lg hover:bg-gray-100 transition-colors"
        title="Notifications"
      >
        <BellIcon className="w-5 h-5 text-gray-500" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 inline-flex items-center justify-center text-[10px] font-bold text-white bg-red-500 rounded-full min-w-[18px] h-[18px] px-1 animate-pulse">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button> */}

      {open && (
        <div className={`absolute right-0 top-full mt-2 w-[400px] sm:w-[440px] bg-white rounded-2xl shadow-xl border border-gray-200/80 flex flex-col overflow-hidden ${showAll ? 'max-h-[75vh]' : ''}`}>
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 bg-gradient-to-r from-gray-50 to-white border-b border-gray-100 shrink-0">
            <div className="flex items-center gap-2.5">
              <h3 className="text-sm font-bold text-gray-900">Notifications</h3>
              {unread > 0 && (
                <span className="text-[10px] font-bold text-white bg-blue-600 px-1.5 py-0.5 rounded-full">
                  {unread}
                </span>
              )}
            </div>
            {unread > 0 && (
              <button onClick={handleMarkAll} className="text-xs text-blue-600 hover:text-blue-700 font-medium transition-colors">
                Tout marquer lu
              </button>
            )}
          </div>

          {/* List */}
          <div className="overflow-y-auto">
            {visible.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                <div className="w-14 h-14 rounded-full bg-gray-50 flex items-center justify-center mb-3">
                  <BellIcon className="w-7 h-7 text-gray-300" />
                </div>
                <p className="text-sm font-medium text-gray-500">Aucune notification</p>
                <p className="text-xs text-gray-400 mt-1">Vous serez notifie ici</p>
              </div>
            ) : (
              visible.map((n) => {
                const cfg = TYPE_CONFIG[n.type] || { icon: BellIcon, color: 'text-gray-600', bg: 'bg-gray-50', label: '' }
                const Icon = cfg.icon
                const { employee, detail } = parseMessage(n.message)

                return (
                  <div
                    key={n.id}
                    className={`flex items-start gap-3 px-5 py-3.5 border-b border-gray-50 cursor-pointer transition-all hover:bg-gray-50/80 ${!n.is_read ? 'bg-blue-50/30' : ''}`}
                    onClick={() => goToBonus(n.bonus_id)}
                  >
                    {/* Type icon */}
                    <div className={`mt-0.5 w-9 h-9 rounded-xl ${cfg.bg} flex items-center justify-center shrink-0`}>
                      <Icon className={`w-4 h-4 ${cfg.color}`} />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-[13px] font-semibold text-gray-900 leading-snug">{employee}</p>
                        {!n.is_read && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleMarkRead(n.id) }}
                            className="shrink-0 w-5 h-5 rounded-full bg-blue-100 hover:bg-blue-200 flex items-center justify-center transition-colors"
                            title="Marquer comme lu"
                          >
                            <CheckBadgeIcon className="w-3 h-3 text-blue-600" />
                          </button>
                        )}
                      </div>
                      {detail && (
                        <p className="text-xs text-gray-500 mt-0.5 leading-relaxed line-clamp-2">{detail}</p>
                      )}
                      <div className="flex items-center gap-2 mt-1.5">
                        {cfg.label && (
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${cfg.bg} ${cfg.color}`}>
                            {cfg.label}
                          </span>
                        )}
                        {n.sender_name && (
                          <span className="text-[11px] text-gray-400">par {n.sender_name}</span>
                        )}
                        <span className="text-[11px] text-gray-300 ml-auto">{timeAgo(n.created_at)}</span>
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {/* Footer */}
          {allNotifs.length > LIMIT_COMPACT && (
            <button
              onClick={() => setShowAll(!showAll)}
              className="w-full text-center text-xs font-semibold text-blue-600 hover:text-blue-700 hover:bg-blue-50/50 py-3 transition-colors shrink-0 border-t border-gray-100"
            >
              {showAll ? 'Voir moins' : `Voir tout (${allNotifs.length})`}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
