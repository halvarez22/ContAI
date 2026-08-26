# Implementation Plan — E8.3 Bootstrap / Resiliencia de Estado

**Estado:** CERRADO (ejecutado)  
**Fecha:** 2026-08-26  

## Hecho
- [x] `firestore.rules`: read de member inexistente si `memberId.matches('^' + uid + '_.*$')`
- [x] `useActiveOrganization`: `setBootstrapping(false)` en `finally`
- [x] Tests hook E8.3 (2) — suite **213** passed | 8 skipped
- [x] Test rules E8.3 (skipped sin emulador; listo para `test:rules`)
- [x] `tsc` limpio
- [x] Rules desplegadas en **contai-15259** (`DEPLOY_EXIT:0`)

## Verificación piloto
1. Hard refresh en http://localhost:3000
2. Cerrar sesión / volver a entrar con Google
3. Debe completar bootstrap y salir del spinner
