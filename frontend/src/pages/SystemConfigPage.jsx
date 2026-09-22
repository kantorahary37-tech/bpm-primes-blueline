import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { getSystemConfig, bulkUpdateSystemConfig } from '../services/api';
import { SettingsIcon, CheckIcon, MailIcon, BuildingIcon, FolderIcon, KeyIcon, BellIcon, DatabaseIcon, EyeIcon, EyeOffIcon, ServerIcon, ArchiveIcon } from '../components/Icons';

const CATEGORY_META = {
  interface: { label: 'Interface', Icon: ServerIcon, desc: 'Paramètres d\'affichage de l\'application' },
  email: { label: 'Email (SMTP)', Icon: MailIcon, desc: 'Configuration du serveur de messagerie' },
  ldap: { label: 'LDAP', Icon: BuildingIcon, desc: 'Authentification et synchronisation LDAP' },
  sftp: { label: 'SFTP (serveur 4D)', Icon: FolderIcon, desc: 'Connexion au serveur de fichiers 4D' },
  auth: { label: 'Authentification', Icon: KeyIcon, desc: 'Clés JWT et URL du frontend' },
  reminders: { label: 'Rappels', Icon: BellIcon, desc: 'Planification des rappels quotidiens et de la date limite de validation' },
  backups: { label: 'Sauvegardes automatiques', Icon: ArchiveIcon, desc: 'Planification et rétention des sauvegardes de la base' },
  database: { label: 'Base de données', Icon: DatabaseIcon, desc: 'Connexion PostgreSQL (requiert redémarrage)' },
};

const PASSWORD_KEYS = new Set(['SMTP_PASSWORD', 'LDAP_BIND_PASSWORD', 'SFTP_PASSWORD', 'SECRET_KEY']);

export default function SystemConfigPage() {
  const [categories, setCategories] = useState({});
  const [edits, setEdits] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeCategory, setActiveCategory] = useState(null);
  const [showPasswords, setShowPasswords] = useState({});

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    try {
      const data = await getSystemConfig();
      setCategories(data.categories || {});
      const firstCat = Object.keys(data.categories || {})[0];
      if (firstCat) setActiveCategory(firstCat);
    } catch {
      toast.error('Erreur lors du chargement de la configuration');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (key, value) => {
    setEdits(prev => ({ ...prev, [key]: value }));
  };

  const hasChanges = Object.keys(edits).length > 0;

  const handleSave = async () => {
    if (!hasChanges) return;
    setSaving(true);
    try {
      await bulkUpdateSystemConfig(edits);
      setEdits({});
      toast.success('Configuration mise à jour avec succès');
      fetchConfig();
    } catch {
      toast.error('Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  const togglePassword = (key) => {
    setShowPasswords(prev => ({ ...prev, [key]: !prev[key] }));
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <span className="loading loading-spinner loading-lg"></span>
      </div>
    );
  }

  const categoryKeys = Object.keys(categories);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <SettingsIcon className="w-5 h-5 text-blue-600" />
            Paramètres système
          </h2>
          <p className="text-sm text-gray-400 mt-1">
            Modifiez les paramètres de l'application. Les changements sont appliqués immédiatement.
          </p>
        </div>
        {hasChanges && (
          <button onClick={handleSave} disabled={saving} className="btn btn-primary btn-sm gap-2">
            {saving ? <span className="loading loading-spinner loading-xs"></span> : <CheckIcon className="w-4 h-4" />}
            Sauvegarder ({Object.keys(edits).length})
          </button>
        )}
      </div>

      {categoryKeys.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          Aucune configuration disponible.
        </div>
      ) : (
        <div className="flex gap-6">
          {/* Sidebar */}
          <div className="w-56 shrink-0">
            <div className="space-y-1">
              {categoryKeys.map(cat => {
                const meta = CATEGORY_META[cat] || { label: cat, Icon: SettingsIcon, desc: '' };
                const catEdits = (categories[cat] || []).filter(item => edits[item.key] !== undefined).length;
                const CatIcon = meta.Icon;
                return (
                  <button
                    key={cat}
                    onClick={() => setActiveCategory(cat)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors ${
                      activeCategory === cat
                        ? 'bg-blue-50 text-blue-700 font-medium'
                        : 'text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <CatIcon className="w-4 h-4 shrink-0" />
                      <span>{meta.label}</span>
                      {catEdits > 0 && (
                        <span className="ml-auto badge badge-primary badge-xs">{catEdits}</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {activeCategory && categories[activeCategory] && (
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <div className="mb-4">
                  <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                    {(() => {
                      const ActiveIcon = CATEGORY_META[activeCategory]?.Icon || SettingsIcon;
                      return <ActiveIcon className="w-5 h-5 text-blue-600" />;
                    })()}
                    {CATEGORY_META[activeCategory]?.label || activeCategory}
                  </h3>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {CATEGORY_META[activeCategory]?.desc}
                  </p>
                </div>
                {activeCategory === 'sftp' && (() => {
                  const getVal = (key, fallback = '') => {
                    const item = (categories['sftp'] || []).find(i => i.key === key);
                    return item ? item.value : fallback;
                  };
                  const cacheEnabled = getVal('SFTP_CACHE_ENABLED', 'true') === 'true';
                  return (
                    <div className="mb-4 rounded-lg border border-blue-100 bg-blue-50/60 p-4">
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-2 text-xs">
                        <div>
                          <p className="text-gray-400">Serveur</p>
                          <p className="font-medium font-mono">
                            {getVal('SFTP_USERNAME', '?')}@{getVal('SFTP_HOST', '?')}:{getVal('SFTP_PORT', '22')}
                          </p>
                        </div>
                        <div>
                          <p className="text-gray-400">Connexions persistantes (pool)</p>
                          <p className="font-medium">
                            {getVal('SFTP_POOL_SIZE', '2')} session(s) · renouvelées toutes les {getVal('SFTP_CONNECTION_TTL', '900')} s
                          </p>
                        </div>
                        <div>
                          <p className="text-gray-400">Cache des listes de dossiers</p>
                          <p className="font-medium">{getVal('SFTP_LIST_CACHE_TTL', '30')} s</p>
                        </div>
                        <div>
                          <p className="text-gray-400">Cache local des fichiers</p>
                          <p className="font-medium">
                            {cacheEnabled ? 'Activé' : 'Désactivé'} · validité {getVal('SFTP_CACHE_TTL', '3600')} s
                          </p>
                        </div>
                        <div className="col-span-2">
                          <p className="text-gray-400">Dossier de cache</p>
                          <p className="font-medium font-mono truncate" title={getVal('SFTP_CACHE_DIR')}>
                            {getVal('SFTP_CACHE_DIR') || 'Dossier par défaut du serveur (backend/app/sftp_cache)'}
                          </p>
                        </div>
                      </div>
                      <p className="text-[11px] text-blue-700/80 mt-2 border-t border-blue-100 pt-2">
                        Les connexions SFTP sont réutilisées entre les requêtes et les fichiers déjà téléchargés sont servis
                        depuis le cache local : navigation et import CSV 4D plus rapides, sans reconnexion à chaque appel.
                      </p>
                    </div>
                  );
                })()}
                <div className="space-y-4">
                  {categories[activeCategory].map(item => {
                    const isBoolean = item.type === 'boolean';
                    const isPassword = PASSWORD_KEYS.has(item.key);
                    const showPwd = showPasswords[item.key];
                    const currentValue = edits[item.key] !== undefined ? edits[item.key] : item.value;
                    const isModified = edits[item.key] !== undefined;

                    return (
                      <div key={item.key} className="form-control">
                        <label className="label pb-1">
                          <span className="label-text text-xs font-medium text-gray-600">{item.key}</span>
                          {isModified && (
                            <span className="label-text-alt text-xs text-amber-500">modifié</span>
                          )}
                        </label>
                        <p className="text-[11px] text-gray-400 mb-1">{item.description}</p>
                        {isBoolean ? (
                          <select
                            value={currentValue}
                            onChange={e => handleChange(item.key, e.target.value)}
                            className={`select select-bordered select-sm w-full font-mono text-sm ${
                              isModified ? 'select-warning' : ''
                            }`}
                          >
                            <option value="true">Oui / Activé (true)</option>
                            <option value="false">Non / Désactivé (false)</option>
                          </select>
                        ) : (
                          <div className="flex items-center gap-2">
                            {isPassword ? (
                              <div className="join flex-1">
                                <input
                                  type={showPwd ? 'text' : 'password'}
                                  value={currentValue}
                                  onChange={e => handleChange(item.key, e.target.value)}
                                  className={`input input-bordered input-sm join-item flex-1 font-mono text-sm ${
                                    isModified ? 'input-warning' : ''
                                  }`}
                                />
                                <button
                                  type="button"
                                  onClick={() => togglePassword(item.key)}
                                  className="btn btn-sm btn-ghost join-item"
                                >
                                  {showPwd ? <EyeOffIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
                                </button>
                              </div>
                            ) : (
                              <input
                                type={item.type === 'number' ? 'number' : 'text'}
                                value={currentValue}
                                onChange={e => handleChange(item.key, e.target.value)}
                                className={`input input-bordered input-sm flex-1 font-mono text-sm ${
                                  isModified ? 'input-warning' : ''
                                }`}
                              />
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Sticky save bar */}
      {hasChanges && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
          <div className="bg-gray-900 text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-4 text-sm animate-slideUp">
            <span>{Object.keys(edits).length} modification(s) en attente</span>
            <button onClick={() => setEdits({})} className="btn btn-ghost btn-xs text-gray-300">
              Annuler
            </button>
            <button onClick={handleSave} disabled={saving} className="btn btn-primary btn-sm">
              {saving ? <span className="loading loading-spinner loading-xs"></span> : 'Sauvegarder'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
