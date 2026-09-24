import { useEffect, useState, useMemo, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useSystemConfig } from '../contexts/SystemConfigContext';
import { getBonuses, getUsers } from '../services/api';
import { ArrowLeftIcon, DownloadIcon, ChevronLeftIcon } from '../components/Icons';
import BonusTable from '../components/BonusTable';
import { formatTotalsByCurrency, formatCountsByCurrency } from '../utils/currencyTotals';

const ChevronRightIcon = (p) => <svg {...p} className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>;

const statusLabel = (bonus) => (bonus ? bonus.status : '');

const getBadgeClass = (status) => {
  const map = {
    'Initialisé': 'bg-orange-100 text-orange-700',
    'En attente N+2': 'bg-teal-100 text-teal-700',
    'En attente Directeur': 'bg-purple-100 text-purple-700',
    'En attente DG': 'bg-amber-100 text-amber-700',
    'Prime validée': 'bg-emerald-100 text-emerald-700',
    'Prime rejetée': 'bg-red-100 text-red-700',
  };
  return map[status] || 'bg-gray-100 text-gray-600';
};

// Regroupement par mois (même logique que la vue Primes en vue « Date »)
const groupByMonth = (bonuses) => {
  const groups = {};
  bonuses.forEach(b => {
    const ym = b.start_date ? b.start_date.slice(0, 7) : 'inconnu';
    if (!groups[ym]) groups[ym] = [];
    groups[ym].push(b);
  });
  return Object.keys(groups).sort().reverse().map(ym => {
    const [y, m] = ym.split('-');
    const monthName = ym === 'inconnu'
      ? 'Inconnu'
      : new Date(parseInt(y), parseInt(m) - 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    return { ym, monthName, items: groups[ym] };
  });
};

// Pagination : 2 mois par page, 10 primes affichées par mois (extensible via « Afficher tout »)
const PAGE_SIZE = 2;
const PRIMES_PER_MONTH = 10;

const ArchivePage = () => {
  const { user } = useAuth();
  const { canSeeAmounts } = useSystemConfig();
  const seeAmounts = canSeeAmounts(user);
  const navigate = useNavigate();
  const [validatedPaid, setValidatedPaid] = useState([]);
  const [validatedUnpaid, setValidatedUnpaid] = useState([]);
  const [loading, setLoading] = useState(true);
  const [initiatorMap, setInitiatorMap] = useState(new Map());
  const [sortBy, setSortBy] = useState('start_date');
  const [sortDir, setSortDir] = useState('desc');
  const [pageUnpaid, setPageUnpaid] = useState(1);
  const [pagePaid, setPagePaid] = useState(1);
  const [expandedMonths, setExpandedMonths] = useState({});

  const isDG = user?.is_dg && !user?.is_admin && !user?.is_drh;

  useEffect(() => {
    getUsers()
      .then((users) => setInitiatorMap(new Map((Array.isArray(users) ? users : []).map((u) => [u.id, u.name]))))
      .catch(() => setInitiatorMap(new Map()));
  }, []);

  useEffect(() => {
    const fetches = [
      getBonuses(null, null, null, null, null, false, false, true, { sortBy, sortDir }).then(setValidatedUnpaid),
    ];
    if (!isDG) {
      fetches.push(
        getBonuses(null, null, null, null, null, true, false, true, { sortBy, sortDir }).then(setValidatedPaid)
      );
    }
    Promise.all(fetches)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [isDG, sortBy, sortDir]);

  useEffect(() => { setPageUnpaid(1); }, [sortBy, sortDir, validatedUnpaid.length]);
  useEffect(() => { setPagePaid(1); }, [sortBy, sortDir, validatedPaid.length]);

  // Mise à jour du tri côté backend (même mécanisme que la vue Primes)
  const handleTableSort = useCallback((key) => {
    setSortBy((prev) => {
      if (prev === key) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        return prev;
      }
      setSortDir('asc');
      return key;
    });
  }, []);

  const monthGroupsUnpaid = useMemo(() => groupByMonth(validatedUnpaid), [validatedUnpaid]);
  const monthGroupsPaid = useMemo(() => groupByMonth(validatedPaid), [validatedPaid]);

  const totalPagesUnpaid = Math.max(1, Math.ceil(monthGroupsUnpaid.length / PAGE_SIZE));
  const totalPagesPaid = Math.max(1, Math.ceil(monthGroupsPaid.length / PAGE_SIZE));
  const safePageUnpaid = Math.min(pageUnpaid, totalPagesUnpaid);
  const safePagePaid = Math.min(pagePaid, totalPagesPaid);
  const visibleGroupsUnpaid = monthGroupsUnpaid.slice((safePageUnpaid - 1) * PAGE_SIZE, safePageUnpaid * PAGE_SIZE);
  const visibleGroupsPaid = monthGroupsPaid.slice((safePagePaid - 1) * PAGE_SIZE, safePagePaid * PAGE_SIZE);

  const renderSection = ({ sectionKey, label, badge, badgeColor, groups, safePage, totalPages, setPage, items }) => (
    <div>
      <div className="flex items-center gap-3 mb-3">
        <h2 className="text-lg font-bold text-gray-900">{items.length} {items.length > 1 ? 'primes' : 'prime'} {label}</h2>
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${badgeColor}`}>{badge}</span>
      </div>

      {items.length === 0 ? (
        <div className="text-center py-10 rounded-xl border border-gray-200 bg-white">
          <p className="text-gray-400 text-sm">Aucune prime dans cette catégorie</p>
        </div>
      ) : (
        <>
          {groups.map(({ ym, monthName, items: groupItems }) => {
            const expandKey = `${sectionKey}-${ym}`;
            const showAll = expandedMonths[expandKey];
            const visibleItems = showAll ? groupItems : groupItems.slice(0, PRIMES_PER_MONTH);
            const remaining = groupItems.length - PRIMES_PER_MONTH;
            return (
            <div key={ym} className="mb-6">
              <div className="flex items-center gap-2 px-4 py-3 rounded-t-xl bg-gray-100 text-gray-900">
                <h3 className="font-semibold text-sm">{monthName}</h3>
                <span className="text-sm font-bold text-blue-600">
                  {seeAmounts ? formatTotalsByCurrency(groupItems) : '••••••'}
                </span>
                <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-gray-300 text-gray-700">{formatCountsByCurrency(groupItems)}</span>
              </div>
              <div className="p-3 bg-white rounded-b-xl border border-t-0 border-gray-200">
                <BonusTable
                  bonuses={visibleItems}
                  getValidStep={() => null}
                  canSelect={() => false}
                  selectedBonuses={new Set()}
                  onToggleSelect={() => {}}
                  onSelectAll={() => {}}
                  onClearSelection={() => {}}
                  seeAmounts={seeAmounts}
                  initiatorMap={initiatorMap}
                  onView={(id) => navigate(`/bonuses/${id}`)}
                  onValidate={() => {}}
                  onEdit={() => {}}
                  badgeClass={getBadgeClass}
                  statusLabel={statusLabel}
                  sortBy={sortBy}
                  sortDir={sortDir}
                  onSort={handleTableSort}
                  showSelect={false}
                />
                {remaining > 0 && (
                  <button onClick={() => setExpandedMonths(prev => ({ ...prev, [expandKey]: !prev[expandKey] }))}
                    className="mt-2 text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors">
                    {showAll ? 'Réduire' : `Afficher tout (${groupItems.length})`}
                  </button>
                )}
              </div>
            </div>
            );
          })}

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 mt-4">
              <button disabled={safePage <= 1} onClick={() => setPage(p => p - 1)}
                className="btn btn-sm btn-ghost text-gray-500 hover:text-gray-900 disabled:opacity-30 disabled:cursor-not-allowed">
                <ChevronLeftIcon className="w-4 h-4" /> Précédent
              </button>
              <span className="text-xs text-gray-400 font-medium">Page {safePage} / {totalPages}</span>
              <button disabled={safePage >= totalPages} onClick={() => setPage(p => p + 1)}
                className="btn btn-sm btn-ghost text-gray-500 hover:text-gray-900 disabled:opacity-30 disabled:cursor-not-allowed">
                Suivant <ChevronRightIcon />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );

  if (loading) {
    return <div className="flex justify-center items-center h-64"><span className="loading loading-spinner loading-lg" /></div>;
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Link to="/" className="p-2 rounded-lg hover:bg-gray-100"><ArrowLeftIcon className="w-5 h-5 text-gray-500" /></Link>
        <h1 className="text-2xl font-bold text-gray-900">Archive</h1>
        {!isDG && (
          <button onClick={() => {
            const token = localStorage.getItem('token');
            fetch('/api/v1/bonuses/export?archive_mode=true', { headers: { Authorization: `Bearer ${token}` } })
              .then(r => r.blob())
              .then(blob => {
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `archive_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.csv`;
                a.click();
                URL.revokeObjectURL(url);
              });
          }} className="btn btn-sm bg-white border border-gray-300 text-gray-600 hover:bg-gray-50 hover:text-emerald-600 gap-1.5 shadow-sm">
            <DownloadIcon className="w-4 h-4" /> Exporter
          </button>
        )}
      </div>

      <div className={isDG ? '' : 'space-y-8'}>
        {renderSection({
          sectionKey: 'unpaid',
          label: 'en attente de traitement',
          badge: 'Validees',
          badgeColor: 'bg-green-100 text-green-700',
          groups: visibleGroupsUnpaid,
          safePage: safePageUnpaid,
          totalPages: totalPagesUnpaid,
          setPage: setPageUnpaid,
          items: validatedUnpaid,
        })}

        {!isDG && renderSection({
          sectionKey: 'paid',
          label: 'traitées',
          badge: 'Traitées',
          badgeColor: 'bg-emerald-100 text-emerald-700',
          groups: visibleGroupsPaid,
          safePage: safePagePaid,
          totalPages: totalPagesPaid,
          setPage: setPagePaid,
          items: validatedPaid,
        })}
      </div>
    </div>
  );
};

export default ArchivePage;
