import { CheckCircle2, Clock, XCircle, AlertTriangle, RefreshCw, Ban, ShieldCheck } from 'lucide-react';

interface StatusIndicatorProps {
  status: string;
  dark?: boolean;
}

export function StatusIndicator({ status, dark = false }: StatusIndicatorProps) {
  const s = (status || '').toUpperCase();

  if (['APPROVED', 'VERIFIED', 'ACTIVE', 'AVAILABLE', 'COMPLETED', 'RESOLVED'].includes(s)) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap ${
          dark ? 'text-emerald-400' : 'text-emerald-800'
        }`}
      >
        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
        <span>{formatStatusLabel(s)}</span>
      </span>
    );
  }

  if (['PENDING', 'IN_PROGRESS', 'RESERVED', 'OPEN', 'NEW'].includes(s)) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap ${
          dark ? 'text-[#C6A66B]' : 'text-amber-800'
        }`}
      >
        {s === 'IN_PROGRESS' ? (
          <RefreshCw className="w-3.5 h-3.5 shrink-0" />
        ) : (
          <Clock className="w-3.5 h-3.5 shrink-0" />
        )}
        <span>{formatStatusLabel(s)}</span>
      </span>
    );
  }

  if (['REJECTED', 'SUSPENDED', 'REMOVED'].includes(s)) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap ${
          dark ? 'text-rose-400' : 'text-rose-700'
        }`}
      >
        <XCircle className="w-3.5 h-3.5 shrink-0" />
        <span>{formatStatusLabel(s)}</span>
      </span>
    );
  }

  if (['EXCHANGED', 'DONATED', 'REVIEWED'].includes(s)) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap ${
          dark ? 'text-[#A0AD99]' : 'text-stone-700'
        }`}
      >
        <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
        <span>{formatStatusLabel(s)}</span>
      </span>
    );
  }

  if (['CANCELLED', 'INACTIVE', 'DISMISSED', 'UNAVAILABLE'].includes(s)) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap ${
          dark ? 'text-neutral-400' : 'text-neutral-500'
        }`}
      >
        <Ban className="w-3.5 h-3.5 shrink-0" />
        <span>{formatStatusLabel(s)}</span>
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap ${dark ? 'text-neutral-300' : 'text-neutral-700'}`}>
      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
      <span>{formatStatusLabel(s)}</span>
    </span>
  );
}

function formatStatusLabel(s: string): string {
  return s
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
