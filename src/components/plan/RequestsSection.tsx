import { Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api } from '../../lib/apiClient';
import { cn } from '../../lib/cn';
import {
  KIND_LABEL,
  OPEN_STATUSES,
  REQUEST_KINDS,
  REQUEST_STATUSES,
  STATUS_LABEL,
  type MemberRequest,
  type RequestKind,
} from '../../lib/requests';
import { Field, inputClass, primaryButton, rowAction, secondaryButton } from '../ui';

type Props = {
  memberId: string;
  admin: boolean;
  /** Reloads the plan so the pending-request badge updates. */
  onChanged: () => Promise<void>;
  onError: (error: unknown) => void;
};

const STATUS_CLASS: Record<MemberRequest['status'], string> = {
  pendiente: 'border-red-300 bg-red-50 text-red-800',
  en_proceso: 'border-amber-300 bg-amber-50 text-amber-800',
  resuelta: 'border-emerald-300 bg-emerald-50 text-emerald-800',
  rechazada: 'border-border bg-border/30 text-ink/60',
};

const date = (iso: string) => new Date(iso).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' });

export function RequestsSection({ memberId, admin, onChanged, onError }: Props) {
  const [items, setItems] = useState<MemberRequest[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [showClosed, setShowClosed] = useState(false);

  const load = useCallback(async () => {
    try {
      setItems((await api<{ requests: MemberRequest[] }>(`/api/members/${memberId}/requests`)).requests);
    } catch (e) {
      onError(e);
    }
  }, [memberId, onError]);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(action: () => Promise<unknown>) {
    try {
      await action();
      await Promise.all([load(), onChanged()]);
    } catch (e) {
      onError(e);
    }
  }

  const open = (items ?? []).filter((r) => OPEN_STATUSES.includes(r.status));
  const closed = (items ?? []).filter((r) => !OPEN_STATUSES.includes(r.status));
  const pendingRequests = open.filter((r) => r.kind === 'solicitud').length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-widest text-accent">
          Recomendaciones de mejora y solicitudes
          {pendingRequests > 0 && (
            <span className="rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white" aria-label={`${pendingRequests} solicitudes pendientes`}>
              {pendingRequests}
            </span>
          )}
        </h4>
        {!creating && (
          <button type="button" className={secondaryButton} onClick={() => setCreating(true)}>
            Nueva
          </button>
        )}
      </div>

      {creating && (
        <NewRequest
          memberId={memberId}
          onDone={() => setCreating(false)}
          onCreated={() => run(async () => undefined)}
          onError={onError}
        />
      )}

      {items === null ? (
        <p className="text-sm text-ink/60">Cargando...</p>
      ) : open.length === 0 ? (
        <p className="text-sm text-ink/60">Sin solicitudes ni recomendaciones abiertas.</p>
      ) : (
        <ul className="space-y-2">
          {open.map((r) => (
            <RequestItem key={r.id} item={r} admin={admin} run={run} />
          ))}
        </ul>
      )}

      {closed.length > 0 && (
        <div className="space-y-2">
          <button type="button" className="text-xs text-ink/60 underline hover:text-ink" onClick={() => setShowClosed((v) => !v)}>
            {showClosed ? 'Ocultar' : 'Ver'} cerradas ({closed.length})
          </button>
          {showClosed && (
            <ul className="space-y-2">
              {closed.map((r) => (
                <RequestItem key={r.id} item={r} admin={admin} run={run} />
              ))}
            </ul>
          )}
        </div>
      )}
      {!admin && <p className="text-[11px] text-ink/50">Solo un administrador puede cambiar el estado o borrar.</p>}
    </div>
  );
}

function RequestItem({ item, admin, run }: { item: MemberRequest; admin: boolean; run: (action: () => Promise<unknown>) => Promise<void> }) {
  return (
    <li className="space-y-2 rounded-lg border border-border p-3 text-xs">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-mono uppercase tracking-wider text-ink/50">
            {KIND_LABEL[item.kind]} · {date(item.createdAt)}
            {item.resolvedAt && ` · cerrada ${date(item.resolvedAt)}`}
          </p>
          <p className="text-sm font-semibold">{item.title}</p>
          {item.description && <p className="whitespace-pre-wrap text-ink/70">{item.description}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-semibold', STATUS_CLASS[item.status])}>{STATUS_LABEL[item.status]}</span>
          {admin && (
            <button
              type="button"
              className={rowAction}
              aria-label={`Borrar ${item.title}`}
              onClick={() => {
                if (window.confirm(`¿Borrar "${item.title}"?`)) void run(() => api(`/api/requests/${item.id}`, 'DELETE'));
              }}
            >
              <Trash2 className="size-3.5" aria-hidden />
            </button>
          )}
        </div>
      </div>
      {admin && (
        <div className="flex flex-wrap gap-1.5">
          {REQUEST_STATUSES.map((status) => (
            <button
              key={status}
              type="button"
              disabled={status === item.status}
              onClick={() => void run(() => api(`/api/requests/${item.id}`, 'PATCH', { status }))}
              className={cn(
                'rounded-full border px-2.5 py-1 text-[11px] transition-colors disabled:cursor-default',
                status === item.status ? 'border-accent bg-accent text-bg' : 'border-border text-ink/70 hover:border-accent/60',
              )}
            >
              {STATUS_LABEL[status]}
            </button>
          ))}
        </div>
      )}
    </li>
  );
}

function NewRequest({
  memberId,
  onDone,
  onCreated,
  onError,
}: {
  memberId: string;
  onDone: () => void;
  onCreated: () => Promise<void>;
  onError: (error: unknown) => void;
}) {
  const [kind, setKind] = useState<RequestKind>('solicitud');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await api(`/api/members/${memberId}/requests`, 'POST', { kind, title, description });
      await onCreated();
      onDone();
    } catch (e) {
      onError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-lg border border-border p-3">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Tipo">
        {REQUEST_KINDS.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            aria-pressed={kind === k}
            className={cn(
              'rounded-full border px-2.5 py-1 text-[11px]',
              kind === k ? 'border-accent bg-accent text-bg' : 'border-border text-ink/70 hover:border-accent/60',
            )}
          >
            {KIND_LABEL[k]}
          </button>
        ))}
      </div>
      <Field label="Título">
        <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} required autoFocus />
      </Field>
      <Field label="Detalle">
        <textarea className={inputClass} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} />
      </Field>
      <div className="flex gap-2">
        <button type="submit" className={primaryButton} disabled={busy || !title.trim()}>
          {busy ? 'Guardando...' : 'Guardar'}
        </button>
        <button type="button" className={secondaryButton} onClick={onDone}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
