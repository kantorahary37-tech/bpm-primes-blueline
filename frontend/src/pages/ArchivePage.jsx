import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getBonuses } from '../services/api';
import { ArrowLeftIcon, ChevronLeftIcon, DownloadIcon } from '../components/Icons';

const PAGE_SIZE = 8;

const formatDate = (d) => new Date(d).toLocaleDateString('fr-FR', {
  day: '2-digit', month: 'short', year: 'numeric',
});

const typeLetter = (t) => t === 'mensuel' ? 'M' : t === 'astreinte' ? 'A' : t === 'commission' ? 'C' : '?';

const typeColor = (t) => {
  if (t === 'mensuel') return 'bg-blue-50 text-blue-600';
  if (t === 'astreinte') return 'bg-violet-50 text-violet-600';
  if (t === 'commission') return 'bg-amber-50 text-amber-600';
  return 'bg-gray-50 text-gray-600';
};

const ChevronRightIcon = (p) => <svg {...p} className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>;

function BonusSection({ title, badge, badgeColor, items, page, setPage, totalPages }) {
  const monthGroups = (() => {
    const groups = {};
    items.forEach(b => {
      const ym = b.start_date ? b.start_date.slice(0, 7) : 'inconnu';
      if (!groups[ym]) groups[ym] = [];
      groups[ym].push(b);
    });
    return Object.keys(groups).sort().reverse().map(ym => {
      const [y, m] = ym.split('-');
      const monthName = new Date(parseInt(y), parseInt(m) - 1)
        .toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
      return { ym, monthName, items: groups[ym] };
    });
  })();

  const visibleGroups = monthGroups.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-base font-bold text-gray-900">{title}</h2>
        <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${badgeColor}`}>{badge}</span>
      </div>

      {items.length === 0 ? (
        <div className="text-center py-10 rounded-xl border border-gray-200 bg-white">
          <p className="text-gray-400 text-sm">Aucune prime dans cette categorie</p>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {visibleGroups.map(({ ym, monthName, items: groupItems }) => (
              <div key={ym}>
                <div className="flex items-center gap-2 px-3 py-2 rounded-t-xl bg-gray-100 text-gray-900">
                  <h3 className="font-semibold text-sm">{monthName}</h3>
                  <span className="ml-auto text-xs font-bold px-2 py-0.5 rounded-full bg-gray-300 text-gray-700">{groupItems.length}</span>
                </div>
                <div className="p-2 bg-white rounded-b-xl border border-t-0 border-gray-200">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-1.5">
                    {groupItems.map(b => (
                      <Link key={b.id} to={`/bonuses/${b.id}`}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white hover:border-emerald-300 hover:shadow-sm transition-all group">
                        <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold ${typeColor(b.bonus_type)}`}>
                          {typeLetter(b.bonus_type)}
                        </div>
                        <span className="text-[11px] text-gray-900 truncate min-w-0 flex-1">
                          <span className="font-medium">{b.employee?.name || 'N/A'}</span>
                        </span>
                        <span className="text-[10px] font-semibold text-blue-600 shrink-0">{b.total_amount.toLocaleString('fr-FR')} Ar</span>
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 mt-4">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
                className="btn btn-sm btn-ghost text-gray-500 hover:text-gray-900 disabled:opacity-30 disabled:cursor-not-allowed">
                <ChevronLeftIcon className="w-4 h-4" /> Precedent
              </button>
              <span className="text-xs text-gray-400 font-medium">Page {page} / {totalPages}</span>
              <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
                className="btn btn-sm btn-ghost text-gray-500 hover:text-gray-900 disabled:opacity-30 disabled:cursor-not-allowed">
                Suivant <ChevronRightIcon />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

const ArchivePage = () => {
  const { user } = useAuth();
  const [validatedPaid, setValidatedPaid] = useState([]);
  const [validatedUnpaid, setValidatedUnpaid] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagePaid, setPagePaid] = useState(1);
  const [pageUnpaid, setPageUnpaid] = useState(1);

  const isDG = user?.is_dg && !user?.is_admin && !user?.is_drh;
  const isDRHOrAdmin = user?.is_admin || user?.is_drh || user?.is_dg;

  useEffect(() => {
    const fetches = [
      getBonuses(null, null, null, null, null, false, false, true).then(setValidatedUnpaid),
    ];
    if (!isDG) {
      fetches.push(
        getBonuses(null, null, null, null, null, true, false, true).then(setValidatedPaid)
      );
    }
    Promise.all(fetches)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [isDG]);

  useEffect(() => { setPageUnpaid(1); }, [validatedUnpaid.length]);
  useEffect(() => { setPagePaid(1); }, [validatedPaid.length]);

  const totalUnpaidPages = Math.max(1, Math.ceil(validatedUnpaid.length / PAGE_SIZE));
  const totalPaidPages = Math.max(1, Math.ceil(validatedPaid.length / PAGE_SIZE));

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
        <BonusSection
          title="Primes validees"
          badge={`${validatedUnpaid.length} en attente de paiement`}
          badgeColor="bg-amber-100 text-amber-700"
          items={validatedUnpaid}
          page={pageUnpaid}
          setPage={setPageUnpaid}
          totalPages={totalUnpaidPages}
        />

        {!isDG && (
          <BonusSection
            title="Primes payees"
            badge={`${validatedPaid.length} payee(s)`}
            badgeColor="bg-emerald-100 text-emerald-700"
            items={validatedPaid}
            page={pagePaid}
            setPage={setPagePaid}
            totalPages={totalPaidPages}
          />
        )}
      </div>
    </div>
  );
};

export default ArchivePage;
