# Instrucciones para Claude Code — Proyecto Costito

Este archivo es la guía para trabajar en este repositorio. Léelo primero antes de hacer cualquier cambio.

## Contexto del proyecto

**Costito** es una calculadora web de precios con comisiones, pensada para comerciantes argentinos. Es un producto de **Operon** (umbrella de productos SaaS de Automatia para Argentina y Latam).

**Estado actual:** App reconstruida sobre el diseño final ("Menta" / "Bosque Nocturno"). Sin backend todavía, sin build step, sin dependencias externas. Estático puro, deployable en Vercel.

## Filosofía de desarrollo

1. **Iterar simple antes que complejo.** No agregar React, Next.js ni build tools hasta que el producto los necesite de verdad. Hoy es HTML + CSS + JS plano.

2. **Lenguaje del usuario, no del programador.** Toda la copy en español rioplatense (Argentina), explicando conceptos como si la persona no supiera matemática financiera. "vos", "tenés", "pagás".

3. **Separación de responsabilidades.** Los datos (comisiones), las fórmulas y el wiring del DOM viven en archivos distintos. Esto facilita que se actualicen comisiones, se testeen fórmulas y se empaquete mejor.

## Estructura del código (modular, sin build step)

```
costito/
├── index.html          → Markup limpio. Los <select>/segmentos se llenan desde JS.
├── css/styles.css      → Estilos + sistema de temas (claro/oscuro)
├── js/
│   ├── data.js         → COSTITO_DATA: comisiones, canales, medios, IIBB, IVA, premium.
│   │                     FUENTE DE VERDAD. Acá se actualizan los porcentajes.
│   ├── calc.js         → CostitoCalc: fórmulas PURAS (sin DOM). Testeables.
│   └── app.js          → Wiring del DOM: eventos, render, localStorage, temas.
└── assets/             → (logos, favicon, og:image — pendiente)
```

> **Nota:** el MVP viejo era un único `index.html` de 112 KB minificado. Se descartó por inmanejable. La versión actual es una reconstrucción limpia sobre el diseño final. La historia vieja queda en git (rama `main` previa).

## Sistema de temas

- El tema se controla con el atributo `data-theme` en `<html>` (`light` | `dark`).
- `:root` en `styles.css` = tema claro (Menta, default). `[data-theme="dark"]` = oscuro (Bosque Nocturno).
- Ambos temas comparten TODO el CSS; solo cambian ~12 variables de color.
- `app.js` (`applyTheme`) persiste la elección en `localStorage` y respeta `prefers-color-scheme` en la primera visita.
- **Regla de oro:** nunca hardcodear colores. Siempre usar las variables CSS (`var(--verde)`, etc.) para que el dark mode siga funcionando.

## Tabs y modelo freemium

Hay 6 tabs. **3 gratis** y **3 Premium** (marcadas con candado y con `data-premium="1"`):

| Tab | Estado | Qué hace |
|-----|--------|----------|
| Calculadora | Gratis | Precio de publicación (IVA + comisión + IIBB + margen) |
| Medios de pago | Gratis | Cuánto cobrar en cada medio para no perder por comisión |
| Mis productos | Gratis | Lista guardada en localStorage + export PDF/CSV |
| Importación | **Premium** | (gate con upsell a WhatsApp — lógica pendiente) |
| Compra mixta | **Premium** | (gate — pendiente) |
| Servicios | **Premium** | (gate — pendiente) |

Los tabs Premium hoy muestran un **gate** (`renderGates` en `app.js`) que explica la feature y lleva a WhatsApp. La lógica real de esas calculadoras se implementa más adelante.

## Modelo de datos (`data.js`)

```javascript
const COSTITO_DATA = {
  comisionesActualizadas: 'junio 2026',
  dolar: { endpoint, valor:'venta', tipoDefault, fallback, tipos:[{id,nombre}] },
  canales: [ {id, name, com, iva} ],     // com = % nominal; iva = si paga IVA sobre comisión
  ivaProveedor: [ {v, label} ],
  iibb: [ {v, label, prov} ],
  medios: [ {n, c, base?, col, ico} ],    // c = comisión del medio de pago
  premium: { whatsapp, mensaje },
};
```

**Cotización del dólar (en vivo):** el valor NO se hardcodea ni se edita a mano. Se trae de la API `dolarapi.com` (gratis, sin key, con CORS) en una sola llamada que cachea las 7 casas en `localStorage`. El cliente solo elige QUÉ dólar usar (blue, oficial, tarjeta, etc.) en la barra que aparece en modo USD; el valor viene de la API. `getRate()` en `app.js` resuelve la cotización vigente; si la API falla, usa el cache o `dolar.fallback`.

## Fórmulas críticas (`calc.js`)

**Fórmula maestra (material Cuentas Claras):**
```
comEfectiva = comNominal * (1.21 si paga IVA, sino 1)
costoConIva = costo * (1 + ivaProveedor)
precio = costoConIva / (1 - comEfectiva - IIBB - margen)
```

- Todo lo que es % entra como número entero (40 = 40%), no como fracción.
- `precioPublicado()` devuelve `{ ok }`. Si comisión + IIBB + margen ≥ 100%, devuelve `ok:false` con un `motivo` legible en vez de un número absurdo (guard de división por cero).
- **No usar markup como input principal.** Internamente siempre margen sobre precio. El markup solo en el conversor educativo (si se reincorpora).

## Convenciones de UI

- **Color primario:** `var(--verde)` (#1F8A5B claro / #2F6B45 oscuro)
- **Acento:** `var(--naranja)`
- **Tipografía:** **Fraunces** (serif) para títulos, logo y precios; **Inter** (sans) para el resto. Se cargan desde Google Fonts en el `<head>`. Spec completo de marca en `MARCA.md`. Nunca hardcodear fuentes: usar `var(--serif)`/`var(--sans)`.
- **Mobile-first:** todo tiene que verse bien en celular (probar a 375px)
- **Border radius:** 11-18px

## Cosas que NO hay que hacer

- ❌ No agregar dependencias npm/cdn sin justificación fuerte (única excepción aprobada: Google Fonts — Fraunces + Inter — por marca)
- ❌ No hardcodear colores — usar variables CSS (rompe el dark mode)
- ❌ No traducir copy a español neutro — usar argentino
- ❌ No mezclar markup y margen en la calculadora principal
- ❌ No asumir que el usuario sabe qué es FOB, IVA aduana, etc. — siempre explicar con el tooltip `.help`
- ❌ No meter lógica de cálculo en `app.js` — va en `calc.js` (puro, testeable)

## Seguridad

- El render usa `setHTML()` (un wrapper de `insertAdjacentHTML`) con markup confiable.
- El único texto que viene del usuario (nombre de producto) se pasa por `escapeHtml()` antes de inyectarse. Mantener esa regla si se agregan más inputs de texto libre.

## Trabajos pendientes (ordenados)

### Próximo
1. Implementar las 3 calculadoras Premium (Importación, Mixta, Servicios) — hoy son gates
2. Logo/favicon/og:image definitivos + marca Operon sutil en una esquina
3. Verificar comisiones contra fuentes oficiales y mostrar fecha de actualización

### Backend (fase siguiente)
4. Supabase: auth (magic link) + persistencia multi-usuario de productos
5. Gating Premium real (Free vs Pro) + Mercado Pago para suscripción

### Pre-launch
6. PWA (manifest + service worker), analytics sin cookies, SEO/metadatos, deploy en Vercel

## Material de referencia

El cálculo sigue el material interno de **Cuentas Claras**. Conceptos: fórmula maestra `Costo / (1 - Comisión - Margen)`, markup vs margen, comisiones por medio de pago, componentes del costo de importación.

## Tono y voz

Costito le habla al comerciante en argentino, sin tecnicismos:
- ✅ "Lo que se queda la plataforma" / ❌ "Comisión de procesamiento"
- ✅ "Bajá el margen o cambiá el canal" / ❌ "Margen excede capacidad operativa"

## Contacto

Proyecto a cargo de Tomi (Operon / Automatia). La estética/estructura la armó Santiago; la lógica profunda de funcionalidades la trabaja su equipo. Dudas conceptuales de cálculo: material Cuentas Claras.
