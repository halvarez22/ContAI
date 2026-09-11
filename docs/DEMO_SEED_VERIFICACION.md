# ContAI — Verificación del mes demo (E14.0)

**Periodo:** el mes/año seleccionado en la barra superior.  
**Requisito:** `VITE_ENABLE_DEMO_SEED=true` y rol **owner** o **admin**.

## Cómo cargar

1. Panel General (modo Operativo) → **Cargar mes demo**.
2. Confirma el diálogo.
3. Se descarga automáticamente `banco_demo_YYYY-MM.csv` (para Conciliación).

## Números ancla (calculadora)

| Concepto | Valor esperado |
|----------|----------------|
| Nómina Juan Pérez — neto | $8,500.00 |
| Nómina Juan — bruto / ISR / IMSS | $10,000 / $1,200 / $300 |
| Póliza Juan | **4 líneas**; Σ cargos = Σ abonos = $10,000 |
| Nómina Ana Ruiz — IMSS | $0 → **3 líneas** en póliza |
| Venta Factura A (IVA 16%) | Total $11,600 → IVA trasladado **≥ $1,600** |
| Compra Suministros (IVA 16% acred.) | Total $5,800 → IVA acreditable **≥ $800** |
| Showcase IA | Cuenta **Gastos Operativos**, confianza **92%**, status revisión |

## Checklist piloto

- [ ] Panel muestra KPIs / tareas ≠ 0
- [ ] Banner “Datos de demostración” visible
- [ ] Transacciones: ~18 movimientos; varias nóminas con cuenta Gastos de Nómina
- [ ] Una TX con confianza IA ~92% lista para aprobar
- [ ] Exportar póliza (.txt) habilitado; cargos = abonos
- [ ] Abrir `.txt`: asiento Juan 4 partidas; Ana sin línea IMSS
- [ ] Fiscal / Tax Preview: IVA trasladado y acreditable coherentes
- [ ] Conciliación: subir el CSV descargado (opcional confirmar matches)
- [ ] Volver a **Cargar mes demo** no borra TX reales (solo `source=demo_seed` del periodo)

## Qué no valida este demo

- Descarga SAT real (sigue en Beta/simulación).
- Que los XML “llegaron solos” del portal.
- Datos de la empresa real del despacho (usar Importar CFDI con XML propios después).
