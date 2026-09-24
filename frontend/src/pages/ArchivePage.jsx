import { useEffect, useState, useMemo, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';
import { useSystemConfig } from '../contexts/SystemConfigContext';
import { getBonuses, getUsers, getArchivedEmployees, restoreEmployee } from '../services/api';
import { ArrowLeftIcon, DownloadIcon, ChevronLeftIcon, ArchiveIcon } from '../components/Icons';
import BonusTable from '../components/BonusTable';
import { formatTotalsAndCountsByCurrency, formatCountsByCurrency } from '../utils/currencyTotals';
import Modal from '../components/Modal';

const ChevronRightIcon = (p) => <svg {...p} className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>;
const RestoreIcon = (p) => <svg {...p} className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M2.985 19.644l3.181-3.183m0 0a8.25 8.25 0 0113.803-3.7" /></svg>;

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

  // Onglet actif : « primes » ou « employes »
  const [tab, setTab] = useState('primes');

  // ---- Onglet Primes (existant) ----
  const [validatedPaid, setValidatedPaid] = useState([]);
  const [validatedUnpaid, setValidatedUnpaid] = useState([]);
  const [loading, setLoading] = useState(true);
  const [initiatorMap, setInitiatorMap] = useState(new Map());
  const [sortBy, setSortBy] = useState('start_date');
  const [sortDir, setSortDir] = useState('desc');
  const [pageUnpaid, setPageUnpaid] = useState(1);
  const [pagePaid, setPagePaid] = useState(1);
  const [expandedMonths, setExpandedMonths] = useState({});

  // ---- Onglet Employés (archivage interne) ----
  const [archivedEmployees, setArchivedEmployees] = useState([]);
  const [archivedLoading, setArchivedLoading] = useState(true);
  const [archivedRefresh, setArchivedRefresh] = useState(0);
  const [archivedSearch, setArchivedSearch] = useState('');
  const [restoringId, setRestoringId] = useState(null);
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [employeeToRestore, setEmployeeToRestore] = useState(null);

  const isDG = user?.is_dg && !user?.is_admin && !user?.is_drh;
  const isAdmin = !!user?.is_admin;

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

  // Chargement des employés archivés (rechargé en incrémentant archivedRefresh)
  useEffect(() => {
    let cancelled = false;
    getArchivedEmployees()
      .then((data) => { if (!cancelled) setArchivedEmployees(Array.isArray(data) ? data : []); })
      .catch(() => { if (!cancelled) { setArchivedEmployees([]); toast.error('Erreur lors du chargement des employés archivés'); } })
      .finally(() => { if (!cancelled) setArchivedLoading(false); });
    return () => { cancelled = true; };
  }, [archivedRefresh]);

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

  // Recherche sur les employés archivés (nom / matricule / département)
  const filteredArchivedEmployees = useMemo(() => {
    const q = archivedSearch.trim().toLowerCase();
    if (!q) return archivedEmployees;
    return archivedEmployees.filter(e =>
      (e.name || '').toLowerCase().includes(q) ||
      (e.matricule || '').toLowerCase().includes(q) ||
      (e.department || '').toLowerCase().includes(q)
    );
  }, [archivedEmployees, archivedSearch]);

  const openRestoreModal = (emp) => {
    setEmployeeToRestore(emp);
    setShowRestoreModal(true);
  };

  const handleRestore = async () => {
    if (!employeeToRestore) return;
    setRestoringId(employeeToRestore.id);
    try {
      await restoreEmployee(employeeToRestore.id);
      toast.success(`${employeeToRestore.name} restauré — il réapparaît dans toutes les listes`);
      setShowRestoreModal(false);
      setEmployeeToRestore(null);
      setArchivedRefresh(k => k + 1);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erreur lors de la restauration');
    } finally {
      setRestoringId(null);
    }
  };

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
                  {seeAmounts ? formatTotalsAndCountsByCurrency(groupItems) : formatCountsByCurrency(groupItems)}
                </span>
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

  const formatDate = (d) => d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Link to="/" className="p-2 rounded-lg hover:bg-gray-100"><ArrowLeftIcon className="w-5 h-5 text-gray-500" /></Link>
        <h1 className="text-2xl font-bold text-gray-900">Archive</h1>
        {tab === 'primes' && !isDG && (
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

      {/* Onglets Primes / Employés */}
      <div className="flex items-center gap-2 mb-6 border-b border-gray-200">
        <button
          onClick={() => setTab('primes')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
            tab === 'primes'
              ? 'border-blue-600 text-blue-700'
              : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300'
          }`}
        >
          Primes
        </button>
        <button
          onClick={() => setTab('employes')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-1.5 ${
            tab === 'employes'
              ? 'border-blue-600 text-blue-700'
              : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300'
          }`}
        >
          Employés
          {archivedEmployees.length > 0 && (
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${tab === 'employes' ? 'bg-blue-100 text-blue-700' : 'bg-gray-200 text-gray-600'}`}>
              {archivedEmployees.length}
            </span>
          )}
        </button>
      </div>

      {/* ---------------- Onglet PRIMES ---------------- */}
      {tab === 'primes' && (loading ? (
        <div className="flex justify-center items-center h-64"><span className="loading loading-spinner loading-lg" /></div>
      ) : (
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
      ))}

      {/* ---------------- Onglet EMPLOYÉS ---------------- */}
      {tab === 'employes' && (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-lg font-bold text-gray-900">{filteredArchivedEmployees.length} employé(s) archivé(s)</h2>
            {!isAdmin && (
              <span className="text-xs text-gray-400 italic">La restauration est réservée aux administrateurs</span>
            )}
            <div className="relative ml-auto">
              <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
              <input
                type="text"
                value={archivedSearch}
                onChange={(e) => setArchivedSearch(e.target.value)}
                placeholder="Rechercher nom / matricule / département..."
                className="w-72 pl-9 pr-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
              />
            </div>
          </div>

          {isAdmin && (
            <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-2.5 mb-4">
              <p className="text-xs text-blue-700">
                💡              En cas d'erreur (employé archivé par erreur), vous pouvez le restaurer : il réapparaîtra immédiatement dans toutes les listes.
              </p>
            </div>
          )}

          {archivedLoading ? (
            <div className="flex justify-center py-10"><span className="loading loading-spinner loading-lg" /></div>
          ) : filteredArchivedEmployees.length === 0 ? (
            <div className="text-center py-12 rounded-xl border border-gray-200 bg-white">
              <ArchiveIcon className="w-10 h-10 text-gray-300 mx-auto mb-2" />
              <p className="text-gray-400 text-sm">Aucun employé archivé</p>
              <p className="text-gray-300 text-xs mt-1">Les employés archivés depuis la page Employés apparaîtront ici.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredArchivedEmployees.map((emp) => (
                <div key={emp.id} className="flex items-center gap-3 px-4 py-3 bg-white border border-gray-200 rounded-xl hover:border-gray-300 transition-colors">
                  <div className="w-9 h-9 rounded-full bg-gray-200 text-gray-500 flex items-center justify-center font-semibold text-xs shrink-0">
                    {emp.name ? emp.name.charAt(0).toUpperCase() : '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 text-sm truncate">
                      {emp.name}
                      <span className="text-[11px] text-gray-400 font-normal"> — {emp.matricule}</span>
                      {emp.poste && <span className="text-[11px] text-gray-400 font-normal"> · {emp.poste}</span>}
                    </p>
                    <p className="text-[11px] text-gray-400 truncate">
                      {emp.department || 'Sans département'}{emp.service ? ` · ${emp.service}` : ''}
                    </p>
                    <p className="text-[11px] text-gray-400 truncate">
                      Archivé le {formatDate(emp.archived_at)}
                      {emp.archived_by_name ? ` par ${emp.archived_by_name}` : ''}
                      {emp.archive_reason ? ` — Motif : ${emp.archive_reason}` : ''}
                    </p>
                  </div>
                  {isAdmin && (
                    <button
                      onClick={() => openRestoreModal(emp)}
                      disabled={restoringId === emp.id}
                      className="btn btn-sm bg-white border border-emerald-300 text-emerald-700 hover:bg-emerald-50 gap-1.5 shrink-0"
                      title="Restaurer cet employé dans toutes les listes"
                    >
                      {restoringId === emp.id ? <span className="loading loading-spinner loading-xs" /> : <RestoreIcon className="w-4 h-4" />}
                      Restaurer
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Restauration (admin) */}
      <Modal open={showRestoreModal} onClose={() => setShowRestoreModal(false)} title="Restaurer un employé" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Restaurer <strong>{employeeToRestore?.name}</strong>{employeeToRestore?.matricule ? ` (${employeeToRestore.matricule})` : ''} ?
          </p>
          <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-3">
            <ul className="text-xs text-emerald-700 list-disc pl-4 space-y-1">
              <li>L'employé réapparaîtra <strong>immédiatement dans toutes les listes</strong> (employés, services, évaluations...).</li>
              <li>Son historique de primes a été conservé pendant l'archivage.</li>
            </ul>
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
            <button onClick={() => setShowRestoreModal(false)} className="btn btn-sm btn-ghost">Annuler</button>
            <button onClick={handleRestore} disabled={restoringId !== null} className="btn btn-sm bg-emerald-600 hover:bg-emerald-700 text-white border-0">
              {restoringId !== null ? <span className="loading loading-spinner loading-xs" /> : <RestoreIcon className="w-4 h-4" />}
              Restaurer
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default ArchivePage;
