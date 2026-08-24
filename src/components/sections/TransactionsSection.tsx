import { Download, Eye, FileText, Plus, Search, Tag, Upload } from 'lucide-react';
import { PageHeader } from '../ui/PageHeader';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { DataTable } from '../ui/DataTable';
import { Input } from '../ui/Input';
import { cn, formatCurrency, formatDate } from '../../lib/utils';
import type { TransactionRow, TransactionsSectionProps } from '../../types/appSections';

function statusBadgeVariant(status: string | null | undefined) {
  if (status === 'conciliado') return 'success' as const;
  if (status === 'revisión') return 'warning' as const;
  if (status === 'rechazado') return 'error' as const;
  return 'default' as const;
}

function statusLabel(status: string | null | undefined): string {
  if (status === 'conciliado') return 'Conciliado';
  if (status === 'revisión') return 'En Revisión';
  if (status === 'rechazado') return 'Rechazado';
  return 'Pendiente';
}

export function TransactionsSection({
  transactionsCount,
  filteredTransactions,
  filters,
  onFilterChange,
  onGenerateMonthlyReport,
  onExportCsv,
  onOpenExcelImport,
  onOpenManualTx,
  onSelectTransaction,
}: TransactionsSectionProps) {
  const columns = [
    {
      id: 'fecha',
      header: 'Fecha',
      cell: (tx: TransactionRow) => (
        <span className="text-ink-muted">{formatDate(tx.fecha)}</span>
      ),
    },
    {
      id: 'proveedor',
      header: 'Proveedor / Concepto',
      cell: (tx: TransactionRow) => (
        <div>
          <p className="font-bold text-ink">{tx.proveedor || 'S/P'}</p>
          <p className="text-xs text-ink-muted truncate max-w-[200px]">{tx.concepto}</p>
          {tx.tags && tx.tags.length > 0 ? (
            <div className="flex flex-wrap gap-1 mt-1">
              {tx.tags.map((tag) => (
                <span
                  key={tag}
                  className="text-[9px] px-1.5 py-0.5 bg-surface-muted text-ink-subtle rounded-md border border-border"
                >
                  {tag}
                </span>
              ))}
            </div>
          ) : null}
          <p className="text-[10px] text-ink-subtle mt-1">
            {tx.tipo === 'ingreso' ? 'Entrada' : 'Salida'}
          </p>
        </div>
      ),
    },
    {
      id: 'monto',
      header: 'Monto',
      cell: (tx: TransactionRow) => (
        <span
          className={cn(
            'font-bold',
            tx.tipo === 'ingreso' ? 'text-success' : 'text-danger'
          )}
        >
          {tx.tipo === 'ingreso' ? '+' : '-'}
          {formatCurrency(Number(tx.monto) || 0)}
        </span>
      ),
    },
    {
      id: 'moneda',
      header: 'Moneda',
      cell: (tx: TransactionRow) => tx.moneda || 'MXN',
    },
    {
      id: 'status',
      header: 'Estado IA',
      cell: (tx: TransactionRow) => (
        <div>
          <Badge variant={statusBadgeVariant(tx.status)}>{statusLabel(tx.status)}</Badge>
          {tx.confidence_score != null ? (
            <p className="text-[10px] text-ink-subtle mt-1">
              Confianza: {(tx.confidence_score * 100).toFixed(1)}%
            </p>
          ) : null}
        </div>
      ),
    },
    {
      id: 'cuenta',
      header: 'Cuenta',
      cell: (tx: TransactionRow) => tx.account_name || 'Sin clasificar',
    },
    {
      id: 'acciones',
      header: 'Acciones',
      className: 'text-right',
      cell: (tx: TransactionRow) => (
        <Button
          variant="ghost"
          className="text-xs flex items-center gap-2 ml-auto"
          onClick={() => onSelectTransaction(tx)}
        >
          <Eye className="w-4 h-4" />
          Ver Detalles
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Transacciones"
        description="Listado, filtros e importación de movimientos contables."
        actions={
          <>
            <Button variant="secondary" onClick={onGenerateMonthlyReport} className="flex-1 sm:flex-none">
              <FileText className="w-4 h-4" />
              Reporte Mensual
            </Button>
            <Button
              variant="secondary"
              onClick={onExportCsv}
              disabled={transactionsCount === 0}
              className="flex-1 sm:flex-none"
            >
              <Download className="w-4 h-4" />
              Exportar CSV
            </Button>
            <Button
              variant="secondary"
              onClick={onOpenExcelImport}
              className="flex-1 sm:flex-none"
              type="button"
            >
              <Upload className="w-4 h-4" />
              Importar Excel
            </Button>
            <Button onClick={onOpenManualTx} className="flex-1 sm:flex-none">
              <Plus className="w-4 h-4" />
              Capturar
            </Button>
          </>
        }
      />

      <Card className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-ink-subtle uppercase tracking-wider">
            Proveedor / Concepto
          </label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-subtle" />
            <Input
              type="text"
              placeholder="Buscar..."
              value={filters.filterProvider}
              onChange={(e) => onFilterChange.setFilterProvider(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-ink-subtle uppercase tracking-wider">
            Etiquetas
          </label>
          <div className="relative">
            <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-subtle z-10" />
            <Input
              type="text"
              placeholder="Filtrar por tag..."
              value={filters.filterTag}
              onChange={(e) => onFilterChange.setFilterTag(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>
        <div className="space-y-1">
          <label
            htmlFor="filter-type"
            className="text-[10px] font-bold text-ink-subtle uppercase tracking-wider"
          >
            Tipo
          </label>
          <select
            id="filter-type"
            value={filters.filterType}
            onChange={(e) => onFilterChange.setFilterType(e.target.value)}
            className="w-full bg-surface-muted border border-border rounded-lg px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-focus outline-none"
          >
            <option value="all">Todos los tipos</option>
            <option value="ingreso">Ingresos</option>
            <option value="egreso">Egresos</option>
          </select>
        </div>
        <div className="space-y-1">
          <label
            htmlFor="filter-status"
            className="text-[10px] font-bold text-ink-subtle uppercase tracking-wider"
          >
            Estado
          </label>
          <select
            id="filter-status"
            value={filters.filterStatus}
            onChange={(e) => onFilterChange.setFilterStatus(e.target.value)}
            className="w-full bg-surface-muted border border-border rounded-lg px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-focus outline-none"
          >
            <option value="all">Todos los estados</option>
            <option value="conciliado">Conciliado</option>
            <option value="revisión">En Revisión</option>
            <option value="rechazado">Rechazado</option>
            <option value="pendiente">Pendiente</option>
          </select>
        </div>
        <Input
          label="Desde"
          id="filter-start-date"
          name="filterStartDate"
          type="date"
          value={filters.filterStartDate}
          onChange={(e) => onFilterChange.setFilterStartDate(e.target.value)}
        />
        <Input
          label="Hasta"
          id="filter-end-date"
          name="filterEndDate"
          type="date"
          value={filters.filterEndDate}
          onChange={(e) => onFilterChange.setFilterEndDate(e.target.value)}
        />
      </Card>

      <DataTable
        columns={columns}
        rows={filteredTransactions}
        rowKey={(tx) => tx.id}
        emptyMessage="No hay transacciones que coincidan con los filtros."
      />
    </div>
  );
}
