# Implementation Plan — E8.3.2 · `auth/unauthorized-domain` en Vercel

**Estado:** CERRADO (smoke prod OK 2026-08-26).  
**Código `src/`:** sin cambios.  
**Proyecto Firebase:** `contai-15259`  
**Origen:** `https://cont-ai-psi.vercel.app`

---

## Condiciones del auditor (bloqueantes)

1. Añadir **solo** `cont-ai-psi.vercel.app` (Opción A piloto — sin previews).
2. Documentar en `docs/FASE1_CIERRE.md` §2.1.
3. Smoke: incógnito → login → bootstrap sin 403 → dashboard.
4. Evidencia al auditor (screenshot o confirmación explícita).
5. Commit de docs **solo** cuando el operador lo ordene (no push automático).

---

## Diagnóstico (cerrado)

Tras E8.3.1 el bundle apunta a ContAI; Auth rechaza el hostname porque no está en Authorized domains. Comportamiento correcto de seguridad. No es bug de `App.tsx` / rules / env.

---

## Ejecución

| Paso | Quién | Acción |
|------|--------|--------|
| 1 | Operador (Console) | Add domain `cont-ai-psi.vercel.app` en Auth settings |
| 2 | Operador | Esperar 1–5 min propagación |
| 3 | Operador | Smoke incógnito + evidencia |
| 4 | Agente | Docs en `docs/FASE1_CIERRE.md` §2.1 (hecho al aprobar) |
| 5 | Operador | Completar “Configurado por” + marcar estado en §2.1; ordenar commit |

### Anti-patrones (siguen prohibidos)

Redeploy innecesario · cambiar `authDomain` · previews en lista blanca · volver a `auditor-ia-*` · parches UI/rules.

---

## Criterio de cierre

- [x] Dominio prod en Authorized domains
- [x] Smoke login + bootstrap OK en Vercel (dashboard Panel General, usuario Admin)
- [x] Evidencia entregada (screenshot dashboard)
- [x] §2.1 con “Configurado por” + estado cerrado
- [x] Commit docs (ordenado por operador)

**Nota ops:** proyecto Vercel duplicado `cont-ai-93s6` eliminado por el operador. Producción = `cont-ai` → `cont-ai-psi.vercel.app`.
