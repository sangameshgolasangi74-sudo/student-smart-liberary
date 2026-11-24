import { useState } from 'react';
import { X } from 'lucide-react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  requireReason?: boolean;
  reasonLabel?: string;
  reasonPlaceholder?: string;
  destructive?: boolean;
  dark?: boolean;
  loading?: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  requireReason = false,
  reasonLabel = 'Reason',
  reasonPlaceholder = 'Provide a clear academic or administrative reason...',
  destructive = false,
  dark = false,
  loading = false,
  onCancel,
  onConfirm
}: ConfirmDialogProps) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (requireReason && reason.trim().length < 3) {
      setError('Please enter a reason (at least 3 characters).');
      return;
    }
    setError('');
    onConfirm(reason.trim());
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-[2px]">
      <div
        className={`w-full max-w-md rounded-md p-6 border ${
          dark
            ? 'bg-[#171717] border-[#292929] text-[#F7F5EF]'
            : 'bg-[#F7F5EF] border-[#DDD6C8] text-[#171717]'
        }`}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-serif text-xl font-semibold">{title}</h3>
            <p className={`mt-1.5 text-sm leading-relaxed ${dark ? 'text-neutral-400' : 'text-neutral-600'}`}>
              {description}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className={`p-1.5 rounded transition-colors ${dark ? 'hover:bg-[#292929] text-neutral-400' : 'hover:bg-[#EEEAE1] text-neutral-500'}`}
            aria-label="Close dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {requireReason && (
            <div>
              <label className={`block text-xs font-medium mb-1.5 ${dark ? 'text-neutral-300' : 'text-neutral-700'}`}>
                {reasonLabel}
              </label>
              <textarea
                rows={3}
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value);
                  if (error) setError('');
                }}
                placeholder={reasonPlaceholder}
                className={`w-full rounded px-3 py-2 text-sm border focus:outline-none focus:ring-1 focus:ring-[#C6A66B] ${
                  dark
                    ? 'bg-[#101010] border-[#292929] text-[#F7F5EF] placeholder:text-neutral-600'
                    : 'bg-white border-[#D6CFC2] text-[#171717] placeholder:text-neutral-400'
                }`}
              />
              {error && <p className="mt-1 text-xs text-rose-500">{error}</p>}
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              className={`px-4 py-2 text-xs font-medium rounded border transition-colors whitespace-nowrap ${
                dark
                  ? 'border-[#292929] text-neutral-300 hover:bg-[#292929]'
                  : 'border-[#D6CFC2] text-neutral-700 hover:bg-[#EEEAE1]'
              }`}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className={`px-4 py-2 text-xs font-medium rounded transition-colors whitespace-nowrap disabled:opacity-50 ${
                destructive
                  ? 'bg-rose-700 hover:bg-rose-800 text-white'
                  : 'bg-[#C6A66B] hover:bg-[#B39359] text-[#101010]'
              }`}
            >
              {loading ? 'Processing...' : confirmLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
