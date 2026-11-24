import { Download, FileText, Trash2, Upload, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { api } from '../../lib/apiClient';
import { cn } from '../../lib/cn';
import type { Member } from '../../lib/kpis';
import {
  COLLABORATOR_SHARE,
  MAX_MANUAL_PROGRESS,
  PROJECT_POINTS_GOAL,
  PROJECT_STATUSES,
  progressOf,
  projectScore,
  shareOf,
  STATUS_INFO,
  type Project,
  type ProjectStatus,
} from '../../lib/projects';
import { DOCUMENTS_BUCKET, MAX_UPLOAD_BYTES } from '../../lib/storage';
import { supabase } from '../../lib/supabase';
import { Field, inputClass, primaryButton, rowAction, secondaryButton } from '../ui';

type Props = {
  memberId: string;
  /** Month (YYYY-MM) used for the project score. */
  period: string;
  admin: boolean;
  /** Everyone on the plan, to pick collaborators from. */
  members: Member[];
  /** Reloads the member's KPIs after a change that moves the project score. */
  onScoreChanged: () => Promise<void>;
  onError: (error: unknown) => void;
};

const MILESTONES: { at: number; label: string }[] = [
  { at: 50, label: 'Aceptado' },
  { at: 75, label: 'Producción' },
  { at: 100, label: 'Culminado' },
];

const fileSize = (bytes: number) =>
  bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

export function ProjectsSection({ memberId, period, admin, members, onScoreChanged, onError }: Props) {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      setProjects((await api<{ projects: Project[] }>(`/api/members/${memberId}/projects`)).projects);
    } catch (e) {
      onError(e);
    }
  }, [memberId, onError]);

  useEffect(() => {
    void load();
  }, [load]);

  const score = useMemo(
    () => (projects ? projectScore(projects.map((p) => ({ ...p, share: shareOf(p, memberId) })), period) : null),
    [projects, period, memberId],
  );

  const changed = useCallback(async () => {
    await Promise.all([load(), onScoreChanged()]);
  }, [load, onScoreChanged]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-ink/60">Proyectos propios y en los que colabora</span>
        {!creating && (
          <button type="button" className={secondaryButton} onClick={() => setCreating(true)}>
            Nuevo proyecto
          </button>
        )}
      </div>

      {score && (
        <div className="rounded-lg border border-border px-3 py-2 text-xs">
          <div className="flex items-baseline justify-between">
            <span className="font-mono uppercase tracking-wider text-ink/60 text-[10px]">Puntuación del mes</span>
            <span className="text-sm font-semibold tabular-nums">
              {score.score}
              <span className="text-xs font-normal text-ink/50"> / 100</span>
            </span>
          </div>
          <p className="mt-1 text-ink/60">
            {score.points} de {PROJECT_POINTS_GOAL} puntos: {score.milestonePoints} por hitos y {score.manualPoints} por avance de propuestas. En los
            proyectos donde colabora suma el {Math.round(COLLABORATOR_SHARE * 100)}% de los puntos.
          </p>
        </div>
      )}

      {creating && (
        <NewProject
          memberId={memberId}
          onDone={() => setCreating(false)}
          onCreated={load}
          onError={onError}
        />
      )}

      {projects === null ? (
        <p className="text-sm text-ink/60">Cargando proyectos...</p>
      ) : projects.length === 0 ? (
        <p className="text-sm text-ink/60">Sin proyectos registrados.</p>
      ) : (
        <ul className="space-y-3">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} viewerId={memberId} members={members} admin={admin} onChanged={changed} onError={onError} />
          ))}
        </ul>
      )}
    </div>
  );
}

function NewProject({
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
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await api(`/api/members/${memberId}/projects`, 'POST', { name, description });
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
      <Field label="Nombre del proyecto">
        <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required autoFocus />
      </Field>
      <Field label="Descripción">
        <textarea className={inputClass} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} />
      </Field>
      <div className="flex gap-2">
        <button type="submit" className={primaryButton} disabled={busy || !name.trim()}>
          {busy ? 'Creando...' : 'Crear proyecto'}
        </button>
        <button type="button" className={secondaryButton} onClick={onDone}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

/** Progress bar with the 50/75/100 milestones marked. */
function ProgressTrack({ status, progress }: { status: ProjectStatus; progress: number }) {
  return (
    <div className="space-y-1">
      <div
        className="relative h-2.5 w-full rounded-full bg-border/60"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress}
        aria-label={`Progreso ${progress}%`}
      >
        <div
          className="h-full rounded-full transition-[width] duration-300"
          style={{ width: `${progress}%`, backgroundColor: STATUS_INFO[status].color }}
        />
        {MILESTONES.slice(0, 2).map((m) => (
          <span key={m.at} aria-hidden className="absolute top-0 h-full w-px bg-surface" style={{ left: `${m.at}%` }} />
        ))}
      </div>
      <div className="relative h-3 text-[9px] font-mono uppercase tracking-wider text-ink/50" aria-hidden>
        {MILESTONES.map((m) => (
          <span
            key={m.at}
            className={cn('absolute', m.at === 100 ? 'right-0' : '-translate-x-1/2', progress >= m.at && 'text-ink/80')}
            style={m.at === 100 ? undefined : { left: `${m.at}%` }}
          >
            {m.at}% {m.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function ProjectCard({
  project,
  viewerId,
  members,
  admin,
  onChanged,
  onError,
}: {
  project: Project;
  /** Member whose file is open. */
  viewerId: string;
  members: Member[];
  admin: boolean;
  onChanged: () => Promise<void>;
  onError: (error: unknown) => void;
}) {
  const [manual, setManual] = useState(project.manualProgress);
  const [busy, setBusy] = useState(false);
  const progress = progressOf(project.status, project.status === 'propuesta' ? manual : project.manualProgress);
  const owned = project.memberId === viewerId;
  const canDelete = admin || (owned && project.status === 'propuesta');

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    try {
      await action();
      await onChanged();
    } catch (e) {
      onError(e);
    } finally {
      setBusy(false);
    }
  }

  const patch = (body: Record<string, unknown>) => run(() => api(`/api/projects/${project.id}`, 'PATCH', body));

  function remove() {
    if (!window.confirm(`¿Borrar el proyecto "${project.name}" y sus documentos?`)) return;
    void run(() => api(`/api/projects/${project.id}`, 'DELETE'));
  }

  return (
    <li className="space-y-3 rounded-lg border border-border p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold">{project.name}</p>
          <p className="text-[11px] text-ink/60">
            {owned ? 'Dueño del proyecto' : `Colaborador (${Math.round(COLLABORATOR_SHARE * 100)}% de los puntos) · dueño: ${project.ownerName}`}
          </p>
          {project.description && <p className="whitespace-pre-wrap text-xs text-ink/70">{project.description}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-semibold text-white"
            style={{ backgroundColor: STATUS_INFO[project.status].color }}
          >
            {STATUS_INFO[project.status].label} · {progress}%
          </span>
          {canDelete && (
            <button type="button" className={rowAction} onClick={remove} disabled={busy} aria-label="Borrar proyecto">
              <Trash2 className="size-3.5" aria-hidden />
            </button>
          )}
        </div>
      </div>

      <ProgressTrack status={project.status} progress={progress} />

      {project.status === 'propuesta' && (
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex flex-1 items-center gap-2 text-xs">
            <span className="text-ink/60">Avance</span>
            <input
              type="range"
              min={0}
              max={MAX_MANUAL_PROGRESS}
              value={manual}
              onChange={(e) => setManual(Number(e.target.value))}
              className="flex-1 accent-[#283d8c]"
              aria-label="Avance de la propuesta"
            />
            <span className="w-8 text-right tabular-nums">{manual}%</span>
          </label>
          <button
            type="button"
            className={secondaryButton}
            disabled={busy || manual === project.manualProgress}
            onClick={() => void patch({ manualProgress: manual })}
          >
            Guardar avance
          </button>
        </div>
      )}

      {admin && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-mono uppercase tracking-wider text-ink/60">Hito</span>
          {PROJECT_STATUSES.map((status) => (
            <button
              key={status}
              type="button"
              disabled={busy || status === project.status}
              onClick={() => void patch({ status })}
              className={cn(
                'rounded-full border px-2.5 py-1 text-[11px] transition-colors disabled:cursor-default',
                status === project.status ? 'border-accent bg-accent text-bg' : 'border-border text-ink/70 hover:border-accent/60',
              )}
            >
              {STATUS_INFO[status].label}
            </button>
          ))}
        </div>
      )}

      <Collaborators project={project} members={members} busy={busy} run={run} />

      <ProjectFiles project={project} busy={busy} run={run} />
    </li>
  );
}

function Collaborators({
  project,
  members,
  busy,
  run,
}: {
  project: Project;
  members: Member[];
  busy: boolean;
  run: (action: () => Promise<unknown>) => Promise<void>;
}) {
  const taken = new Set([project.memberId, ...project.collaborators.map((c) => c.memberId)]);
  const candidates = members.filter((m) => !taken.has(m.id)).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="space-y-1.5">
      <span className="text-[10px] font-mono uppercase tracking-wider text-ink/60">Colaboradores</span>
      <div className="flex flex-wrap items-center gap-1.5">
        {project.collaborators.length === 0 && <span className="text-xs text-ink/50">Sin colaboradores.</span>}
        {project.collaborators.map((c) => (
          <span key={c.memberId} className="flex items-center gap-1 rounded-full border border-border py-0.5 pl-2.5 pr-1 text-[11px]">
            {c.name}
            <button
              type="button"
              className={rowAction}
              disabled={busy}
              aria-label={`Quitar a ${c.name}`}
              onClick={() => void run(() => api(`/api/projects/${project.id}/collaborators/${c.memberId}`, 'DELETE'))}
            >
              <X className="size-3" aria-hidden />
            </button>
          </span>
        ))}
        {candidates.length > 0 && (
          <select
            aria-label="Añadir colaborador"
            className={cn(inputClass, 'w-auto py-1 text-xs')}
            value=""
            disabled={busy}
            onChange={(e) => {
              const memberId = e.target.value;
              if (memberId) void run(() => api(`/api/projects/${project.id}/collaborators`, 'POST', { memberId }));
            }}
          >
            <option value="">+ Añadir colaborador</option>
            {candidates.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} ({m.stationId})
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}

function ProjectFiles({
  project,
  busy,
  run,
}: {
  project: Project;
  busy: boolean;
  run: (action: () => Promise<unknown>) => Promise<void>;
}) {
  const input = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    if (file.size > MAX_UPLOAD_BYTES) throw new Error('El archivo supera el máximo de 50 MB');
    if (!supabase) throw new Error('Falta configurar las claves públicas de Supabase');
    const { path, token } = await api<{ path: string; token: string }>(`/api/projects/${project.id}/files/upload-url`, 'POST', {
      name: file.name,
      size: file.size,
    });
    const { error } = await supabase.storage.from(DOCUMENTS_BUCKET).uploadToSignedUrl(path, token, file);
    if (error) throw new Error(`No se pudo subir el archivo: ${error.message}`);
    await api(`/api/projects/${project.id}/files`, 'POST', { path, name: file.name, size: file.size });
  }

  async function download(fileId: string) {
    const { url } = await api<{ url: string }>(`/api/files/${fileId}`);
    // The signed link is created with a download name, so navigating to it saves the file without leaving the page.
    window.location.assign(url);
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-mono uppercase tracking-wider text-ink/60">Documentación</span>
        <button type="button" className={cn(secondaryButton, 'flex items-center gap-1.5')} disabled={busy} onClick={() => input.current?.click()}>
          <Upload className="size-3.5" aria-hidden />
          {busy ? 'Procesando...' : 'Subir archivo'}
        </button>
        <input
          ref={input}
          type="file"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void run(() => upload(file));
          }}
        />
      </div>
      {project.files.length === 0 ? (
        <p className="text-xs text-ink/50">Sin documentos.</p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {project.files.map((file) => (
            <li key={file.id} className="flex items-center gap-2 px-3 py-1.5 text-xs">
              <FileText className="size-3.5 shrink-0 text-ink/50" aria-hidden />
              <span className="flex-1 truncate">{file.name}</span>
              <span className="tabular-nums text-ink/50">{fileSize(file.size)}</span>
              <button type="button" className={rowAction} onClick={() => void run(() => download(file.id))} aria-label={`Descargar ${file.name}`}>
                <Download className="size-3.5" aria-hidden />
              </button>
              <button
                type="button"
                className={rowAction}
                onClick={() => {
                  if (window.confirm(`¿Borrar "${file.name}"?`)) void run(() => api(`/api/files/${file.id}`, 'DELETE'));
                }}
                aria-label={`Borrar ${file.name}`}
              >
                <Trash2 className="size-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
