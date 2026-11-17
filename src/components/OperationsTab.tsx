import { Card, secondaryButton } from './ui';

export function OperationsTab({ onLogout }: { onLogout: () => Promise<void> }) {
  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <button type="button" className={secondaryButton} onClick={() => void onLogout()}>
          Salir
        </button>
      </div>
      <Card title="Operaciones">
        <p className="text-sm text-ink/60">Sin contenido todavía.</p>
      </Card>
    </div>
  );
}
