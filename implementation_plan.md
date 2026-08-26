# Implementation Plan — Sprint de Endurecimiento · H1

**Estado:** **✅ CERRADO H1** (209 passed, tsc limpio; indexes deploy)  
**Aprobación:** `APROBADO: Ejecutar Entregable H1` + refinamientos limit 5000, cleanup, ErrorBoundary console, índice audit.

## DoD H1

- [x] transactions YTD + orderBy fecha desc + limit 5000
- [x] audit_logs limit 100 + orderBy timestamp + índice en firestore.indexes.json
- [x] useOrgCollectionListeners + cleanup periodYear/org
- [x] ErrorBoundary root + AppTabRouter
- [x] Alert si truncated
- [x] Suite + tsc + deploy indexes

H2–H4: parked hasta evidencia H1.
