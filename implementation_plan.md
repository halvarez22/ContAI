# Implementation Plan — Entregable 11.1 (Auditoría Riesgo Fiscal 69-B)

**Estado F0:** ✅ Tipos + servicio + tests + rules/indexes (local)  
**Siguiente:** UI (`FiscalRiskListPanel` + badge + KPI)

## F0 entregado

- `normalizeRfc` / `normalizeHeaderKey` / `FISCAL_RISK_COPY`
- `fiscalRiskService`: parse CSV/rows, match exacto, **upsert versionado** (chunks 400 + meta)
- Tests: match +/−, filas sin RFC, headers sucios, audit upload
- Rules: `fiscal_risk_list_entries` + `fiscal_risk_list_meta` (`canManageOrg` write)
- Índice: `organization_id + version`

## Gobernanza

| Paso | Estado |
|------|--------|
| E11.1 F0 | ✅ |
| E11.1 UI | Pendiente tras commit F0 |
| E10.x | Parked |
