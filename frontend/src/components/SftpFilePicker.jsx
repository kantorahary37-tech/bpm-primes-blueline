import { useCallback, useEffect, useState } from 'react'
import Modal from './Modal'
import { sftpInfo, sftpList, sftpDownload } from '../services/api'

const fmtSize = (bytes) => {
  if (bytes == null) return '—'
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`
  return `${(bytes / (1024 * 1024)).toFixed(2)} Mo`
}

const fmtDate = (iso) => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('fr-FR') + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

const joinPath = (base, name) => (base === '/' ? `/${name}` : `${base}/${name}`)

const isCsv = (name) => name.toLowerCase().endsWith('.csv')

export default function SftpFilePicker({ open, onClose, onSelect }) {
  const [info, setInfo] = useState(null)
  const [path, setPath] = useState('')
  const [entries, setEntries] = useState([])
  const [selected, setSelected] = useState(null) // entrée fichier sélectionnée
  const [loading, setLoading] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState('')

  const loadList = useCallback(async (p) => {
    setLoading(true)
    setError('')
    setSelected(null)
    try {
      const data = await sftpList(p)
      setPath(data.path)
      setEntries(data.entries || [])
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Erreur de connexion au serveur SFTP.')
      setEntries([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    setError('')
    setSelected(null)
    setEntries([])
    sftpInfo().then(setInfo).catch(() => setInfo(null))
    loadList('.')
  }, [open, loadList])

  const goUp = () => {
    if (path === '/' || !path) return
    const parent = path.substring(0, path.lastIndexOf('/')) || '/'
    loadList(parent)
  }

  const navigateTo = (entry) => loadList(joinPath(path, entry.name))

  const selectFile = (entry) => {
    if (!isCsv(entry.name)) return
    setSelected(entry)
  }

  const handleConfirm = async () => {
    if (!selected) return
    setDownloading(true)
    setError('')
    try {
      const data = await sftpDownload(joinPath(path, selected.name))
      const binary = atob(data.content_base64)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
      const file = new File([bytes], data.name, { type: 'text/csv' })
      onSelect(file, { path: data.path, name: data.name })
      onClose()
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Erreur lors du téléchargement du fichier.')
    } finally {
      setDownloading(false)
    }
  }

  // Fil d'Ariane : / Prime / juillet_2026
  const segments = (path || '').split('/').filter(Boolean)
  const crumbs = segments.map((seg, i) => ({
    label: seg,
    path: '/' + segments.slice(0, i + 1).join('/'),
  }))

  return (
    <Modal open={open} onClose={onClose} title="Serveur SFTP — fichier CSV 4D" size="xl">
      {/* Bandeau de connexion */}
      <div className="flex items-center justify-between gap-2 mb-3 rounded-lg bg-base-200/60 border border-base-300 px-3 py-2 text-xs">
        <div className="flex items-center gap-2 min-w-0">
          <svg className="w-4 h-4 text-brand-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
          </svg>
          <span className="font-medium text-base-content/80 truncate">
            {info ? `sftp://${info.username}@${info.host}:${info.port}` : 'Connexion SFTP…'}
          </span>
        </div>
        <button type="button" onClick={() => loadList(path)} className="btn btn-xs btn-ghost gap-1" disabled={loading}>
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
          </svg>
          Actualiser
        </button>
      </div>

      {error && (
        <div className="mb-3 rounded-lg bg-red-50 text-red-700 text-sm px-3 py-2">
          {error}
        </div>
      )}

      {/* Fil d'Ariane */}
      <div className="flex items-center gap-1 mb-2 text-sm overflow-x-auto whitespace-nowrap pb-1">
        <button
          type="button"
          onClick={() => loadList('/')}
          className="px-1.5 py-0.5 rounded hover:bg-base-200 text-base-content/70 font-medium"
        >
          /
        </button>
        {crumbs.map((c) => (
          <span key={c.path} className="flex items-center gap-1">
            <span className="text-base-content/30">›</span>
            <button type="button" onClick={() => loadList(c.path)} className="px-1.5 py-0.5 rounded hover:bg-base-200 text-brand-600 font-medium">
              {c.label}
            </button>
          </span>
        ))}
      </div>

      {/* Liste des fichiers */}
      <div className="rounded-lg border border-base-300 overflow-hidden">
        <div className="grid grid-cols-12 gap-2 px-3 py-1.5 bg-base-200/60 text-[11px] font-medium text-base-content/60 uppercase tracking-wide">
          <div className="col-span-7">Nom de fichier</div>
          <div className="col-span-2 text-right">Taille</div>
          <div className="col-span-3 text-right">Dernière modification</div>
        </div>
        <div className="max-h-72 overflow-y-auto text-sm">
          {loading && (
            <div className="flex items-center justify-center py-8 text-base-content/50">
              <span className="loading loading-spinner loading-sm mr-2" /> Connexion au serveur…
            </div>
          )}
          {!loading && path !== '/' && (
            <button
              type="button"
              onClick={goUp}
              className="w-full grid grid-cols-12 gap-2 px-3 py-1.5 text-left hover:bg-base-200/60 border-b border-base-200/60"
            >
              <span className="col-span-7 text-base-content/70 font-medium">..</span>
              <span className="col-span-2" />
              <span className="col-span-3" />
            </button>
          )}
          {!loading && entries.length === 0 && !error && (
            <div className="py-8 text-center text-base-content/40">Dossier vide</div>
          )}
          {!loading && entries.map((entry) => {
            const csv = isCsv(entry.name)
            const isDir = entry.type === 'dir'
            return (
              <button
                key={entry.name}
                type="button"
                onClick={() => (isDir ? navigateTo(entry) : selectFile(entry))}
                disabled={!isDir && !csv}
                title={!isDir && !csv ? 'Seuls les fichiers .csv peuvent être sélectionnés' : undefined}
                className={`w-full grid grid-cols-12 gap-2 px-3 py-1.5 text-left border-b border-base-200/40 items-center ${
                  isDir ? 'hover:bg-base-200/60 cursor-pointer'
                  : selected?.name === entry.name ? 'bg-brand-50 ring-1 ring-inset ring-brand-500/40'
                  : csv ? 'hover:bg-base-200/60 cursor-pointer'
                  : 'opacity-40 cursor-not-allowed'
                }`}
              >
                <span className="col-span-7 flex items-center gap-2 min-w-0">
                  {isDir ? (
                    <svg className="w-4 h-4 text-amber-500 shrink-0" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M19.5 21a3 3 0 003-3v-4.5a3 3 0 00-3-3h-15a3 3 0 00-3 3V18a3 3 0 003 3h15zM1.5 10.146V6a3 3 0 013-3h5.379a2.25 2.25 0 011.59.659l2.122 2.121c.14.141.331.22.53.22H19.5a3 3 0 013 3v1.146A4.483 4.483 0 0019.5 9h-15a4.483 4.483 0 00-3 1.146z" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4 text-blue-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                    </svg>
                  )}
                  <span className={`truncate font-medium ${isDir ? 'text-base-content/80' : 'text-base-content'}`}>
                    {entry.name}
                  </span>
                  {!isDir && csv && (
                    <span className="badge badge-ghost badge-xs text-brand-600 shrink-0">CSV</span>
                  )}
                </span>
                <span className="col-span-2 text-right text-base-content/50">{isDir ? '—' : fmtSize(entry.size)}</span>
                <span className="col-span-3 text-right text-base-content/50">{fmtDate(entry.mtime)}</span>
              </button>
            )
          })}
        </div>
      </div>

      <p className="text-[11px] text-base-content/40 mt-2">
        Cliquez sur un dossier pour naviguer, sur un fichier <b>.csv</b> pour le sélectionner.
      </p>

      {/* Pied : boutons */}
      <div className="flex items-center justify-between gap-3 mt-4">
        <div className="min-w-0 text-sm text-base-content/60 truncate">
          {selected
            ? <span className="text-base-content"><b className="text-brand-600">{selected.name}</b> — {fmtSize(selected.size)}</span>
            : 'Aucun fichier sélectionné'}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button type="button" onClick={onClose} className="btn btn-sm btn-ghost">Annuler</button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!selected || downloading}
            className="btn btn-sm bg-brand-600 hover:bg-brand-700 text-white border-0"
          >
            {downloading ? <span className="loading loading-spinner loading-sm" /> : 'Utiliser ce fichier'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
