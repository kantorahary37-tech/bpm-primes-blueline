import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getBonuses } from '../services/api';
import { ArrowLeftIcon, ChevronLeftIcon, DownloadIcon, EyeIcon } from '../components/Icons';

const PAGE_SIZE = 4;

const typeLetter = (t) => t === 'mensuel' ? 'M' : t === 'astreinte' ? 'A' : t === 'commission' ? 'C' : '?';

const ChevronRightIcon = (p) => <svg {...p} className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>;

const getBadgeClass = (status) => {
  const map = {
    'Prime validée': 'bg-emerald-100 text-emerald-700',
    'Payée': 'bg-emerald-100 text-emerald-700',
  };
  return map[status] || 'bg-gray-100 text-gray-600';
};

const ArchivePage = () => {
  const { user } = useAuth();
  const isDG = user?.is_dg;

  const [validatedList, setValidatedList] = useState([]);
  const [paidList, setPaidList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pageValidated, setPageValidated] = useState(1);
  const [pagePaid, setPagePaid] = useState(1);

  useEffect(() => {
    const fetchDG = async () => {
      try {
        const [notPaid, paid] = await Promise.all([
          getBonuses(null, null, null, null, null, false, false, true),
          getBonuses(null, null, null, null, null, true, false, true),
        ]);
        setValidatedList(notPaid);
        setPaidList(paid);
      } catch (err) {
        console.error('Erreur:', err);
      } finally {
        setLoading(false);
      }
    };

    const fetchDRH = async () => {
      try {
        const data = await getBonuses(null, null, null, null, null, true);
        setPaidList(data);
      } catch (err) {
        console.error('Erreur:', err);
      } finally {
        setLoading(false);
      }
    };

    if (isDG) fetchDG();
    else fetchDRH();
  }, [isDG]);

  const formatAmount = (v) => (v || 0).toLocaleString('fr-FR') + ' Ar';

  const renderRow = (bonus, badgeLabel) => (
    <Link key={bonus.id} to={`/bonuses/${bonus.id}`}
      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white hover:border-emerald-300 hover:shadow-sm transition-all group">
      <div className="w-5 h-5 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 text-[10px] font-bold">
        {typeLetter(bonus.bonus_type)}
      </div>
      <span className="text-[11px] text-gray-900 truncate min-w-0 flex-1">
        <span className="font-medium" title={bonus.employee?.name || 'N/A'}>{bonus.employee?.name || 'N/A'}</span>
      </span>
      <span className="text-[9px] text-gray-400 shrink-0 hidden sm:inline">{bonus.employee?.department || ''}</span>
      <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full shrink-0 ${getBadgeClass(badgeLabel)}`}>
        {badgeLabel}
      </span>
      <span className="text-[10px] font-semibold text-blue-600 shrink-0">{Number(bonus.total_amount).toLocaleString('fr-FR')} Ar</span>
      <EyeIcon className="w-3 h-3 text-gray-300 shrink-0" />
    </Link>
  );

  const renderMonthGroups = (items, badgeLabel, page, setPage) => {
    const groups = {};
    items.forEach(b => {
      const ym = b.start_date ? b.start_date.slice(0, 7) : 'inconnu';
      if (!groups[ym]) groups[ym] = [];
      groups[ym].push(b);
    });
    const monthGroups = Object.keys(groups).sort().reverse().map(ym => {
      const [y, m] = ym.split('-');
      const monthName = new Date(parseInt(y), parseInt(m) - 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
      return { ym, monthName, items: groups[ym] };
    });
    const totalPages = Math.max(1, Math.ceil(monthGroups.length / PAGE_SIZE));
    const safePage = Math.min(page, totalPages);
    const visibleGroups = monthGroups.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

    return (
      <>
        {visibleGroups.map(({ ym, monthName, items: groupItems }) => (
          <div key={ym}>
            <div className="flex items-center gap-2 px-3 py-2 rounded-t-xl bg-gray-100 text-gray-900">
              <h2 className="font-semibold text-sm">{monthName}</h2>
              <span className="ml-auto text-xs font-bold px-2 py-0.5 rounded-full bg-gray-300 text-gray-700">{groupItems.length}</span>
            </div>
            <div className="p-2 bg-white rounded-b-xl border border-t-0 border-gray-200">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {groupItems.map(b => renderRow(b, badgeLabel))}
              </div>
            </div>
          </div>
        ))}
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
    );
  };

  const renderSection = (title, items, badgeLabel, emptyText, headerBg = 'bg-gray-100', page, setPage) => (
    <div className="mb-6">
      <div className={`flex items-center gap-2 px-4 py-3 rounded-t-xl ${headerBg} text-gray-900`}>
        <h2 className="font-semibold text-sm">{title}</h2>
        <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-gray-300 text-gray-700">{items.length}</span>
        <span className="text-sm font-bold text-blue-600 ml-1">{formatAmount(items.reduce((sum, b) => sum + (parseFloat(b.total_amount) || 0), 0))}</span>
      </div>
      <div className="p-3 bg-white rounded-b-xl border border-t-0 border-gray-200">
        {items.length === 0 ? (
          <p className="text-center text-gray-400 text-sm py-4">{emptyText}</p>
        ) : (
          renderMonthGroups(items, badgeLabel, page, setPage)
        )}
      </div>
    </div>
  );

  if (loading) {
    return <div className="flex justify-center items-center h-64"><span className="loading loading-spinner loading-lg" /></div>;
  }

  // DRH : page archive classique (payées uniquement)
  if (!isDG) {
    return (
      <div>
        <div className="flex items-center gap-3 mb-6">
          <Link to="/" className="p-2 rounded-lg hover:bg-gray-100"><ArrowLeftIcon className="w-5 h-5 text-gray-500" /></Link>
          <h1 className="text-2xl font-bold text-gray-900">Archive des primes payées</h1>
          <span className="text-xs font-medium bg-emerald-100 text-emerald-700 px-2.5 py-0.5 rounded-full">{paidList.length} payée(s)</span>
          <button onClick={() => {
            const token = localStorage.getItem('token');
            fetch('/api/v1/bonuses/export?show_paid=true', { headers: { Authorization: `Bearer ${token}` } })
              .then(r => r.blob())
              .then(blob => {
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `archive_payees_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.csv`;
                a.click();
                URL.revokeObjectURL(url);
              });
          }} className="btn btn-sm bg-white border border-gray-300 text-gray-600 hover:bg-gray-50 hover:text-emerald-600 gap-1.5 shadow-sm">
            <DownloadIcon className="w-4 h-4" /> Exporter
          </button>
        </div>

        {paidList.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-gray-400 text-sm">Aucune prime payée</p>
          </div>
        ) : (
          <div className="space-y-4">
            {renderMonthGroups(paidList, 'Payée', pagePaid, setPagePaid)}
          </div>
        )}
      </div>
    );
  }

  // DG : archive avec 2 sections
  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Link to="/" className="p-2 rounded-lg hover:bg-gray-100"><ArrowLeftIcon className="w-5 h-5 text-gray-500" /></Link>
        <h1 className="text-2xl font-bold text-gray-900">Mon archive</h1>
      </div>

      {renderSection(
        'Validées',
        validatedList,
        'Validée',
        'Aucune prime validée en attente de paiement',
        'bg-blue-600 text-white',
        pageValidated,
        setPageValidated
      )}

      {renderSection(
        'Payées',
        paidList,
        'Payée',
        'Aucune prime marquée payée',
        'bg-emerald-600 text-white',
        pagePaid,
        setPagePaid
      )}
    </div>
  );
};

export default ArchivePage;
