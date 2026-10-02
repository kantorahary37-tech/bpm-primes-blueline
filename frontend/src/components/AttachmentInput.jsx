import { useRef, useState } from 'react';
import { uploadFile } from '../services/api';
import { PaperclipIcon, XCircleIcon } from './Icons';

const ACCEPT = '.pdf,.png,.jpg,.jpeg,.gif,.doc,.docx,.xls,.xlsx';

/**
 * Sélecteur de pièce jointe facultatif pour une validation.
 *
 * Le fichier est téléversé immédiatement (POST /upload : extension, signature et
 * taille sont contrôlées côté API) et sa référence est remontée au parent via
 * `onChange` pour être jointe à l'étape de validation.
 */
const AttachmentInput = ({ value, onChange, hint, color = 'emerald' }) => {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const handleFile = async (file) => {
    if (!file) return;
    setError('');
    setUploading(true);
    try {
      const uploaded = await uploadFile(file);
      onChange({
        filename: uploaded.filename,
        original_name: uploaded.original_name || file.name,
        url: uploaded.url,
        size: file.size,
      });
    } catch (err) {
      setError(err.response?.data?.detail || 'Échec du téléversement');
      onChange(null);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const btn = color === 'indigo'
    ? 'bg-indigo-600 hover:bg-indigo-700'
    : 'bg-emerald-600 hover:bg-emerald-700';

  return (
    <div className="rounded-lg border border-dashed border-gray-300 p-3 bg-gray-50/60">
      <div className="flex items-center gap-2 mb-2">
        <PaperclipIcon className="w-4 h-4 text-gray-400" />
        <span className="text-xs font-semibold text-gray-700">Pièce jointe pour le Directeur (facultatif)</span>
      </div>

      {value ? (
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-700 truncate flex-1" title={value.original_name}>
            {value.original_name}
          </span>
          <button type="button" onClick={() => onChange(null)}
            className="text-gray-400 hover:text-red-500" title="Retirer la pièce jointe">
            <XCircleIcon className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <input ref={inputRef} type="file" accept={ACCEPT} onChange={(e) => handleFile(e.target.files?.[0])} className="hidden" />
          <input type="text" readOnly value={uploading ? 'Téléversement…' : 'Aucun fichier choisi'}
            className="flex-1 min-w-0 px-2 py-1 rounded border border-gray-300 bg-gray-50 text-gray-400 text-sm cursor-not-allowed" />
          <button type="button" disabled={uploading} onClick={() => inputRef.current?.click()}
            className={`btn btn-xs ${btn} text-white border-0 whitespace-nowrap`}>
            {uploading ? 'Envoi…' : 'Choisir un fichier'}
          </button>
        </div>
      )}

      {error && <p className="text-[11px] text-red-600 mt-1.5">{error}</p>}
      {!error && <p className="text-[11px] text-gray-400 mt-1.5">{hint}</p>}
    </div>
  );
};

export default AttachmentInput;