import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { getNotifications, getUnreadCount, markAsRead, markAllRead } from '../services/api'
import { BellIcon, CheckBadgeIcon } from './Icons'

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

export default function NotificationDropdown() {
  const [allNotifs, setAllNotifs] = useState([])
  const [unread, setUnread] = useState(0)
  const [open, setOpen] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const ref = useRef(null)
  const navigate = useNavigate()

  const LIMIT_COMPACT = 5

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
      <button
        onClick={() => { fetch(); setOpen((prev) => { if (!prev) setShowAll(false); return !prev }) }}
        className="relative p-2 rounded-lg hover:bg-gray-100 transition-colors"
        title="Notifications"
      >
        <BellIcon className="w-5 h-5 text-gray-500" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 inline-flex items-center justify-center w-4.5 h-4.5 text-[10px] font-bold text-white bg-red-500 rounded-full min-w-[18px] min-h-[18px]">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className={`absolute right-0 top-full mt-2 w-80 sm:w-96 bg-white rounded-xl shadow-lg border border-gray-200 animate-scaleIn flex flex-col ${showAll ? 'max-h-[75vh]' : ''}`}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
            <h3 className="text-sm font-semibold text-gray-900">
              Notifications
              {!showAll && allNotifs.length > LIMIT_COMPACT && (
                <span className="text-xs font-normal text-gray-400 ml-1">({allNotifs.length})</span>
              )}
            </h3>
            {unread > 0 && (
              <button onClick={handleMarkAll} className="text-xs text-blue-600 hover:text-blue-700 font-medium">
                Tout marquer lu
              </button>
            )}
          </div>

          <div className={`overflow-y-auto ${showAll ? '' : ''}`}>
            {visible.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-gray-400">
                <BellIcon className="w-8 h-8 mb-2" />
                <p className="text-sm">Aucune notification</p>
              </div>
            ) : (
              visible.map((n) => (
                <div
                  key={n.id}
                  className={`flex items-start gap-3 px-4 py-2.5 border-b border-gray-50 cursor-pointer hover:bg-gray-50 transition-colors ${!n.is_read ? 'bg-blue-50/40' : ''}`}
                  onClick={() => goToBonus(n.bonus_id)}
                >
                  <div className={`mt-1 w-2 h-2 rounded-full shrink-0 ${!n.is_read ? 'bg-blue-500' : 'bg-transparent'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-900 leading-snug line-clamp-1">{n.message}</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      {n.sender_name && <span>par {n.sender_name} · </span>}
                      {timeAgo(n.created_at)}
                    </p>
                  </div>
                  {!n.is_read && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleMarkRead(n.id) }}
                      className="shrink-0 p-1 rounded hover:bg-gray-200 transition-colors"
                      title="Marquer comme lu"
                    >
                      <CheckBadgeIcon className="w-4 h-4 text-blue-500" />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>

          {allNotifs.length > LIMIT_COMPACT && (
            <button
              onClick={() => setShowAll(!showAll)}
              className="w-full text-center text-sm font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 py-2.5 rounded-b-xl transition-colors shrink-0"
            >
              {showAll ? 'Voir moins' : `Voir tout (${allNotifs.length})`}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
