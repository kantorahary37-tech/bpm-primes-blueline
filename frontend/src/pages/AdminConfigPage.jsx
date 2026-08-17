import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import PlafondsPage from './PlafondsPage';
import CommissionConfigPage from './CommissionConfigPage';
import { SettingsIcon, ChartIcon } from '../components/Icons';

const TABS = [
  { key: 'plafonds', label: 'Plafonds', Icon: SettingsIcon },
  { key: 'bareme', label: 'Barème commission', Icon: ChartIcon },
];

export default function AdminConfigPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') || 'plafonds';
  const [activeTab, setActiveTab] = useState(
    TABS.some(t => t.key === initialTab) ? initialTab : 'plafonds'
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
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Configuration</h1>
        <p className="text-sm text-gray-400">
          Gérer les plafonds des primes et le barème des commissions
        </p>
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
      </div>
    </div>
  );
}
