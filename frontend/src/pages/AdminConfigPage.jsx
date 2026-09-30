import { useSearchParams } from 'react-router-dom';
import PlafondsPage from './PlafondsPage';
import CommissionConfigPage from './CommissionConfigPage';
import CommissionGCConfigPage from './CommissionGCConfigPage';
import SystemConfigPage from './SystemConfigPage';
import ConfigSnapshotPage from './ConfigSnapshotPage';
import DatabaseBackupPage from './DatabaseBackupPage';
import OtherPrimesConfigPage from './OtherPrimesConfigPage';
import EmailTriggersPage from './EmailTriggersPage';
import OdooSyncPage from './OdooSyncPage';
import { useAuth } from '../contexts/AuthContext';
import { SettingsIcon, ChartIcon, ArchiveIcon, DatabaseIcon, BellIcon, BuildingIcon } from '../components/Icons';

// Commission GC : réservée au Directeur Commercial (+ Admin/DG/DRH)
const canAccessGC = (user) =>
  user?.is_admin || user?.is_dg || user?.is_drh ||
  (user?.is_directeur && user?.department === 'Direction Commerciale');

/**
 * Sections organisées par groupe métier.
 * - items : administrables par Admin/DG/DRH (selon roles)
 * - adminOnly : réservés Admin
 */
const SECTIONS_ALL = [
  {
    group: 'Primes & commissions',
    items: [
      { key: 'plafonds', label: 'Plafonds des primes', desc: 'Montants maximum par type de prime et département', Icon: SettingsIcon, roles: ['is_admin', 'is_dg', 'is_drh'] },
      { key: 'bareme', label: 'Barème Commission GP', desc: 'Taux de commission et objectifs par produit', Icon: ChartIcon, roles: ['is_admin', 'is_dg', 'is_drh'] },
      { key: 'otherPrimes', label: 'Autres primes', desc: 'Types de primes à montant fixe du formulaire mensuel', Icon: SettingsIcon, roles: ['is_admin', 'is_dg', 'is_drh'] },
      { key: 'commissionGC', label: 'Commission GC', desc: 'Objectifs et commissions Grand Compte', Icon: ChartIcon, check: canAccessGC },
    ],
  },
  {
    group: 'Notifications',
    items: [
      { key: 'emailTriggers', label: 'Déclencheurs email', desc: 'Rappels de validation, échéances, synthèse DG et RH', Icon: BellIcon, adminOnly: true },
    ],
  },
  {
    group: 'Données & maintenance',
    items: [
      { key: 'affectations', label: 'Affectations employés', desc: 'Sauvegarde et restauration des départements et services', Icon: ArchiveIcon, adminOnly: true },
      { key: 'odooSync', label: 'Comparaison Odoo', desc: 'Employés archivés dans Odoo à archiver dans l\'application', Icon: BuildingIcon, adminOnly: true },
      { key: 'databaseBackup', label: 'Sauvegardes complètes', desc: 'Dump SQL complet de la base (schéma + données)', Icon: DatabaseIcon, adminOnly: true },
      { key: 'system', label: 'Paramètres système', desc: 'SMTP, LDAP, SFTP, base de données et interface', Icon: SettingsIcon, adminOnly: true },
    ],
  },
];

export default function AdminConfigPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const SECTIONS = SECTIONS_ALL
    .map((g) => ({
      ...g,
      items: g.items.filter((t) =>
        (!t.adminOnly || user?.is_admin) &&
        (!t.roles || t.roles.some((r) => user?.[r])) &&
        (!t.check || t.check(user))
      ),
    }))
    .filter((g) => g.items.length > 0);

  const availableKeys = SECTIONS.flatMap((g) => g.items.map((i) => i.key));
  const requestedTab = searchParams.get('tab');

  // Onglet actif dérivé de l'URL (source de vérité unique, pas d'effet de synchro)
  const activeTab = availableKeys.includes(requestedTab)
    ? requestedTab
    : availableKeys[0] || 'plafonds';

  const switchTab = (key) => {
    setSearchParams({ tab: key }, { replace: true });
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Configuration</h1>
          <p className="text-sm text-gray-400">
            Centre d'administration : plafonds, barèmes, notifications et maintenance
          </p>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Navigation latérale groupée */}
        <aside className="lg:w-64 shrink-0">
          <div className="flex lg:flex-col gap-2 overflow-x-auto lg:overflow-visible pb-1 lg:pb-0">
            {SECTIONS.map((group) => (
              <div key={group.group} className="lg:mb-3">
                <p className="hidden lg:block px-3 mb-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                  {group.group}
                </p>
                <div className="flex lg:flex-col gap-1.5">
                  {group.items.map((item) => {
                    const active = activeTab === item.key;
                    const ItemIcon = item.Icon;
                    return (
                      <button
                        key={item.key}
                        onClick={() => switchTab(item.key)}
                        title={item.desc}
                        className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-left transition-all w-full min-w-max lg:min-w-0 ${
                          active
                            ? 'bg-blue-50 text-blue-700 font-semibold ring-1 ring-blue-100'
                            : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                        }`}
                      >
                        <ItemIcon className={`w-4 h-4 shrink-0 ${active ? 'text-blue-600' : 'text-gray-400'}`} />
                        <span className="flex-1 whitespace-nowrap lg:whitespace-normal">{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </aside>

        {/* Contenu */}
        <div className="flex-1 min-w-0">
          {activeTab === 'plafonds' && <PlafondsPage />}
          {activeTab === 'bareme' && <CommissionConfigPage />}
          {activeTab === 'otherPrimes' && <OtherPrimesConfigPage />}
          {activeTab === 'commissionGC' && canAccessGC(user) && <CommissionGCConfigPage />}
          {activeTab === 'emailTriggers' && user?.is_admin && <EmailTriggersPage />}
          {activeTab === 'affectations' && user?.is_admin && <ConfigSnapshotPage />}
          {activeTab === 'odooSync' && user?.is_admin && <OdooSyncPage />}
          {activeTab === 'databaseBackup' && user?.is_admin && <DatabaseBackupPage />}
          {activeTab === 'system' && user?.is_admin && <SystemConfigPage />}
        </div>
      </div>
    </div>
  );
}

