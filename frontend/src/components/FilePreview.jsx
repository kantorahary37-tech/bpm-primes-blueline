import { useState, useEffect, useCallback } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { getFileBlob, openFile } from '../services/api';
import { DownloadIcon, EyeIcon, XMarkIcon } from './Icons';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif'];

function getExt(name) {
  return (name || '').split('.').pop().toLowerCase();
}

function isImage(name) {
  return IMAGE_EXTS.includes(getExt(name));
}

function isPdf(name) {
  return getExt(name) === 'pdf';
}

export default function FilePreview({ file, compact = false }) {
  const [expanded, setExpanded] = useState(false);
  const [blobUrl, setBlobUrl] = useState(null);
  const [numPages, setNumPages] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const canPreview = isImage(file?.original_name) || isPdf(file?.original_name);

  const loadPreview = useCallback(async () => {
    if (!file?.url || blobUrl) return;
    setLoading(true);
    setError(null);
    try {
      const url = await getFileBlob(file.url);
      setBlobUrl(url);
    } catch {
      setError("Impossible de charger l'aperçu");
    } finally {
      setLoading(false);
    }
  }, [file?.url, blobUrl]);

  useEffect(() => {
    if (expanded && !blobUrl && !loading) {
      loadPreview();
    }
  }, [expanded, blobUrl, loading, loadPreview]);

  useEffect(() => {
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [blobUrl]);

  if (!file?.url) return null;

  const handleDownload = () => openFile(file.url);

  const togglePreview = () => {
    if (!canPreview) {
      handleDownload();
      return;
    }
    setExpanded((v) => !v);
  };

  const buttons = (
    <div className="flex items-center gap-2 mt-1.5">
      <button
        type="button"
        onClick={togglePreview}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-colors ${
          expanded
            ? 'bg-red-50 text-red-700 hover:bg-red-100 border-red-200'
            : 'bg-blue-50 text-blue-700 hover:bg-blue-100 border-blue-200'
        }`}
      >
        {expanded ? (
          <>
            <XMarkIcon className="w-3 h-3" />
            Fermer l'aperçu
          </>
        ) : canPreview ? (
          <>
            <EyeIcon className="w-3 h-3" />
            Aperçu
          </>
        ) : (
          <>
            <DownloadIcon className="w-3 h-3" />
            Ouvrir
          </>
        )}
      </button>
      <button
        type="button"
        onClick={handleDownload}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-gray-50 text-gray-600 hover:bg-gray-100 border border-gray-200 transition-colors"
      >
        <DownloadIcon className="w-3 h-3" />
        Télécharger
      </button>
    </div>
  );

  if (compact) return buttons;

  return (
    <div className="mt-1.5">
      {buttons}

      {expanded && (
        <div className="mt-2 rounded-xl border border-gray-200 bg-gray-50 overflow-hidden">
          {loading && (
            <div className="flex items-center justify-center py-8">
              <span className="loading loading-spinner loading-sm" />
              <span className="ml-2 text-xs text-gray-500">Chargement de l'aperçu...</span>
            </div>
          )}

          {error && (
            <div className="flex items-center justify-center py-6 text-xs text-red-500">{error}</div>
          )}

          {!loading && !error && blobUrl && isImage(file.original_name) && (
            <div className="p-3 flex justify-center max-h-[500px] overflow-auto">
              <img
                src={blobUrl}
                alt={file.original_name}
                className="max-w-full max-h-[480px] rounded-lg object-contain shadow-sm"
              />
            </div>
          )}

          {!loading && !error && blobUrl && isPdf(file.original_name) && (
            <div className="max-h-[600px] overflow-auto">
              <Document
                file={blobUrl}
                onLoadSuccess={({ numPages: n }) => setNumPages(n)}
                onLoadError={(err) => setError('Erreur lors du chargement du PDF')}
                loading={
                  <div className="flex items-center justify-center py-8">
                    <span className="loading loading-spinner loading-sm" />
                    <span className="ml-2 text-xs text-gray-500">Chargement du PDF...</span>
                  </div>
                }
                error={
                  <div className="flex items-center justify-center py-6 text-xs text-red-500">
                    Impossible de charger le PDF
                  </div>
                }
              >
                {Array.from({ length: numPages || 0 }, (_, i) => (
                  <div key={i + 1} className="flex justify-center border-b border-gray-200 last:border-0">
                    <Page
                      pageNumber={i + 1}
                      renderTextLayer={true}
                      renderAnnotationLayer={true}
                      className="shadow-sm"
                      width={Math.min(600, window.innerWidth - 100)}
                    />
                  </div>
                ))}
              </Document>
              {numPages && (
                <div className="text-center py-2 text-[11px] text-gray-400 border-t border-gray-200">
                  {numPages} page{numPages > 1 ? 's' : ''}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
