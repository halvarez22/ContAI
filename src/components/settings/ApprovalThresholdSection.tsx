import { useEffect, useState } from 'react';
import {
  APPROVAL_THRESHOLD_MAX,
  APPROVAL_THRESHOLD_MIN,
  formatApprovalThresholdPercent,
} from '../../config/autoApproval';
import { Button } from '../ui/Button';

const RANGE_MESSAGE = 'El umbral debe estar entre 0 y 1.';

type Props = {
  threshold: number;
  canManage: boolean;
  saving: boolean;
  onSave: (value: number) => Promise<void>;
};

function inRange(value: number): boolean {
  return (
    Number.isFinite(value) &&
    value >= APPROVAL_THRESHOLD_MIN &&
    value <= APPROVAL_THRESHOLD_MAX
  );
}

export function ApprovalThresholdSection({ threshold, canManage, saving, onSave }: Props) {
  const [draft, setDraft] = useState(String(threshold));
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(String(threshold));
    setLocalError(null);
  }, [threshold]);

  const parsed = Number(draft);
  const unchanged = parsed === threshold;
  const percent = formatApprovalThresholdPercent(threshold);

  return (
    <section className="space-y-3" aria-label="Aprobación por confianza">
      <h4 className="text-sm font-medium text-ink">Aprobación por confianza</h4>
      <p className="text-xs text-ink-muted">
        {`El umbral de esta organización es ${percent}%. Entre 0 y 1. 0.90 equivale a 90%.`}
      </p>
      {canManage ? (
        <>
          <label className="block text-sm text-ink" htmlFor="approval-threshold">
            Umbral de confianza
            <input
              id="approval-threshold"
              type="number"
              min={APPROVAL_THRESHOLD_MIN}
              max={APPROVAL_THRESHOLD_MAX}
              step="0.01"
              value={draft}
              disabled={saving}
              onChange={(event) => {
                setDraft(event.target.value);
                setLocalError(null);
              }}
              className="mt-1 w-full max-w-xs bg-surface border border-border rounded-lg px-3 py-2 text-sm text-ink font-mono"
            />
          </label>
          {localError || (draft.trim().length > 0 && !inRange(parsed)) ? (
            <p className="text-xs text-danger">{localError ?? RANGE_MESSAGE}</p>
          ) : null}
          <div className="flex gap-2">
            <Button
              type="button"
              disabled={saving || unchanged || !inRange(parsed)}
              onClick={() => {
                if (!inRange(parsed)) {
                  setLocalError(RANGE_MESSAGE);
                  return;
                }
                void onSave(parsed);
              }}
            >
              {saving ? 'Guardando…' : 'Guardar umbral'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={saving}
              onClick={() => {
                setDraft(String(threshold));
                setLocalError(null);
              }}
            >
              Cancelar
            </Button>
          </div>
        </>
      ) : (
        <p className="text-xs text-ink-muted">Solo el dueño o un administrador puede cambiarlo.</p>
      )}
    </section>
  );
}
