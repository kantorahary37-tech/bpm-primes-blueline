import { useState, useEffect, useMemo } from 'react';
import toast from 'react-hot-toast';
import { useSearchParams } from 'react-router-dom';
import PlafondsPage from './PlafondsPage';
import CommissionConfigPage from './CommissionConfigPage';
import SystemConfigPage from './SystemConfigPage';
import { useAuth } from '../contexts/AuthContext';
import { useDepartments } from '../contexts/DepartmentsContext';
import { adminLdapSyncDepartments } from '../services/api';
import { SettingsIcon, ChartIcon, ArchiveIcon } from '../components/Icons';

const TABS_ALL = [
  { key: 'plafonds', label: 'Plafonds', Icon: SettingsIcon },
  { key: 'bareme', label: 'Barème commission', Icon: ChartIcon },
  { key: 'system', label: 'Paramètres système', Icon: SettingsIcon, adminOnly: true },
];

export default function AdminConfigPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const TABS = TABS_ALL.filter(t => !t.adminOnly || user?.is_admin);
  const initialTab = searchParams.get('tab') || TABS[0]?.key || 'plafonds';
  const [activeTab, setActiveTab] = useState(
    TABS.some(t => t.key === initialTab) ? initialTab : TABS[0]?.key || 'plafonds'
  );

  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab && TABS.some(t => t.key === tab)) {
      setActiveTab(tab);
    }
  }, [searchParams]);

  const switchTab = (key) => {
    setActiveTab(key);
    setSearchParams({ tab: key }, { replace: true });
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Configuration</h1>
          <p className="text-sm text-gray-400">
            Gérer les plafonds des primes et le barème des commissions
          </p>
        </div>
        <SyncDepartmentsButton />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-xl mb-6 w-fit">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => switchTab(tab.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab.key
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <tab.Icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div>
        {activeTab === 'plafonds' && <PlafondsPage />}
        {activeTab === 'bareme' && <CommissionConfigPage />}
        {activeTab === 'system' && user?.is_admin && <SystemConfigPage />}
      </div>
    </div>
  );
}

function SyncDepartmentsButton() {
  const { user } = useAuth();
  const { refresh } = useDepartments();
  const [syncing, setSyncing] = useState(false);

  if (!user?.is_admin) return null;

  const handleSync = async () => {
    setSyncing(true);
    try {
      const result = await adminLdapSyncDepartments();
      if (result.success) {
        refresh();
        toast.success('Synchronisation LDAP des départements terminée');
      } else {
        toast.error('Erreur lors de la synchronisation LDAP');
      }
    } catch {
      toast.error('Erreur de connexion lors de la synchronisation');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <button onClick={handleSync} disabled={syncing} className="btn bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 btn-sm flex items-center gap-1.5">
      {syncing ? <span className="loading loading-spinner loading-xs"></span> : <ArchiveIcon className="w-4 h-4" />}
      Sync départements
    </button>
  );
}
