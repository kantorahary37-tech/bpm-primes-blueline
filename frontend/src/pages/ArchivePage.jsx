import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getBonuses } from '../services/api';
import { ArrowLeftIcon, ChevronLeftIcon, DownloadIcon } from '../components/Icons';

const PAGE_SIZE = 4;

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

const ArchivePage = () => {
  const [bonuses, setBonuses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  useEffect(() => {
    getBonuses(null, null, null, null, null, true)
      .then(setBonuses)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const monthGroups = (() => {
    const groups = {};
    bonuses.forEach(b => {
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

  const totalPages = Math.max(1, Math.ceil(monthGroups.length / PAGE_SIZE));
  const visibleGroups = monthGroups.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => { setPage(1); }, [bonuses.length]);

  if (loading) {
    return <div className="flex justify-center items-center h-64"><span className="loading loading-spinner loading-lg" /></div>;
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Link to="/" className="p-2 rounded-lg hover:bg-gray-100"><ArrowLeftIcon className="w-5 h-5 text-gray-500" /></Link>
        <h1 className="text-2xl font-bold text-gray-900">Archive des primes payées</h1>
        <span className="text-xs font-medium bg-emerald-100 text-emerald-700 px-2.5 py-0.5 rounded-full">{bonuses.length} payée(s)</span>
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

      {monthGroups.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-gray-400 text-sm">Aucune prime payée</p>
        </div>
      ) : (
        <>
          <div className="space-y-4">
            {visibleGroups.map(({ ym, monthName, items }) => (
              <div key={ym}>
                <div className="flex items-center gap-2 px-3 py-2 rounded-t-xl bg-gray-100 text-gray-900">
                  <h2 className="font-semibold text-sm">{monthName}</h2>
                  <span className="ml-auto text-xs font-bold px-2 py-0.5 rounded-full bg-gray-300 text-gray-700">{items.length}</span>
                </div>
                <div className="p-2 bg-white rounded-b-xl border border-t-0 border-gray-200">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-1.5">
                    {items.map(b => (
                      <Link key={b.id} to={`/bonuses/${b.id}`}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white hover:border-emerald-300 hover:shadow-sm transition-all group">
                        <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold ${typeColor(b.bonus_type)}`}>
                          {typeLetter(b.bonus_type)}
                        </div>
                        <span className="text-[11px] text-gray-900 truncate min-w-0 flex-1">
                          <span className="font-medium">{b.employee?.name || 'N/A'}</span>
                        </span>
                        <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full shrink-0 bg-emerald-100 text-emerald-700">Payée</span>
                        <span className="text-[10px] font-semibold text-blue-600 shrink-0">{b.total_amount.toLocaleString('fr-FR')} Ar</span>
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 mt-6">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
                className="btn btn-sm btn-ghost text-gray-500 hover:text-gray-900 disabled:opacity-30 disabled:cursor-not-allowed">
                <ChevronLeftIcon className="w-4 h-4" /> Précédent
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
};

export default ArchivePage;