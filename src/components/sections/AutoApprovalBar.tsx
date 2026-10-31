import { formatApprovalThresholdPercent } from '../../config/autoApproval';
import { Button } from '../ui/Button';

export type AutoApprovalBarProps = {
  approvedCount: number;
  threshold: number;
  disabled: boolean;
  disabledHint: string;
  busy: boolean;
  onApprove: () => void;
};

export function AutoApprovalBar({
  approvedCount,
  threshold,
  disabled,
  disabledHint,
  busy,
  onApprove,
}: AutoApprovalBarProps) {
  const percent = formatApprovalThresholdPercent(threshold);
  return (
    <div className="space-y-2 rounded-lg border border-border bg-surface-muted p-3">
      <p className="text-sm text-ink">
        {`Se aprobarán automáticamente ${approvedCount} transacciones con confianza ≥ ${percent}%.`}
      </p>
      <span title={disabled ? disabledHint : undefined}>
        <Button type="button" disabled={disabled} onClick={onApprove}>
          {busy ? 'Aprobando…' : 'Aprobar por confianza'}
        </Button>
      </span>
      {disabled && disabledHint ? <p className="text-xs text-ink-muted">{disabledHint}</p> : null}
    </div>
  );
}
