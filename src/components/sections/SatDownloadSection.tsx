import { PageHeader } from '../ui/PageHeader';
import { SatDownloadPanel } from '../SatDownloadPanel';
import type { SatDownloadSectionProps } from '../../types/appSections';

export function SatDownloadSection(props: SatDownloadSectionProps) {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Descarga SAT (Beta)"
        description="Solicita e importa CFDIs desde el SAT. FIEL nunca se procesa en el navegador."
      />
      <SatDownloadPanel {...props} />
    </div>
  );
}
