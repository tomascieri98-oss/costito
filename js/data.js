/* ============================================================
   COSTITO — Datos / fuente de verdad
   Comisiones, canales, medios de pago e impuestos.
   Última actualización de comisiones: junio 2026.
   Si pasa el tiempo, verificar contra fuentes oficiales.
   ============================================================ */

const COSTITO_DATA = {

  // Metadata de comisiones: cuándo se verificaron por última vez y cuándo avisar
  comisionesMetadata: {
    lastVerified: '2026-06-23',   // fecha de la última verificación manual
    alertThresholdDays: 30,       // si pasaron más de N días, mostrar aviso en UI
  },

  // Fecha visible en la UI (texto libre, se actualiza junto con lastVerified)
  comisionesActualizadas: 'junio 2026',

  // Cotización del dólar. El VALOR viene en vivo de la API (no se edita a mano);
  // el cliente solo elige QUÉ dólar usar. Una sola llamada trae todas las casas.
  dolar: {
    endpoint: 'https://dolarapi.com/v1/dolares',
    valor: 'venta',        // usamos el precio de venta para convertir
    tipoDefault: 'blue',
    fallback: 1500,        // valor de emergencia si la API no responde
    tipos: [
      { id: 'oficial',   nombre: 'Oficial' },
      { id: 'blue',      nombre: 'Blue' },
      { id: 'bolsa',     nombre: 'MEP / Bolsa' },
      { id: 'mayorista', nombre: 'Mayorista' },
      { id: 'tarjeta',   nombre: 'Tarjeta' },
      { id: 'cripto',    nombre: 'Cripto' },
    ],
  },

  // Canales de venta del dropdown principal.
  // com = comisión nominal en %. El IVA sobre la comisión se aplica aparte (checkbox).
  canales: [
    { id: 'local',      name: 'Local / mano a mano',        com: 0,    iva: false },
    { id: 'ml-clasica', name: 'Mercado Libre Clásica',      com: 13,   iva: true  },
    { id: 'ml-premium', name: 'Mercado Libre Premium',      com: 28,   iva: true  },
    { id: 'tiendanube', name: 'Tienda Nube',                com: 6.99, iva: true  },
    { id: 'posnet',     name: 'Posnet / tarjeta',           com: 3.5,  iva: true  },
    { id: 'qr',         name: 'Transferencia / QR',         com: 0.8,  iva: true  },
    { id: 'custom',     name: 'Otro… lo pongo a mano',      com: 10,   iva: true  },
  ],

  // Alícuotas de IVA sobre el costo del proveedor
  ivaProveedor: [
    { v: 0,    label: 'Sin IVA' },
    { v: 10.5, label: '10,5%'   },
    { v: 21,   label: '21%'     },
  ],

  // Ingresos Brutos por jurisdicción (alícuotas de referencia)
  iibb: [
    { v: 0,   label: 'No pago / exento',  prov: '0%'   },
    { v: 3.5, label: 'Buenos Aires',      prov: '3,5%' },
    { v: 3,   label: 'CABA',              prov: '3%'   },
    { v: 4,   label: 'Córdoba',           prov: '4%'   },
    { v: 3.6, label: 'Santa Fe',          prov: '3,6%' },
    { v: 4.5, label: 'Mendoza',           prov: '4,5%' },
  ],

  // Medios de pago para la tabla "¿Cuánto cobrar en cada uno?".
  // c = recargo/comisión que se le descuenta al comercio.
  medios: [
    { n: 'Efectivo / contado', c: 0,    base: true, col: 'var(--verde)',   ico: '<path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>' },
    { n: 'Débito',             c: 1.5,  col: 'var(--verde-2)', ico: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 9h20"/>' },
    { n: 'Crédito 1 pago',     c: 3.5,  col: 'var(--naranja)', ico: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 9h20M6 15h4"/>' },
    { n: 'Crédito 3 cuotas',   c: 8.9,  col: 'var(--naranja)', ico: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M6 15h6"/>' },
    { n: 'Crédito 6 cuotas',   c: 14.5, col: 'var(--naranja)', ico: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M6 15h8"/>' },
    { n: 'QR / Mercado Pago',  c: 0.8,  col: 'var(--verde)',   ico: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3M21 21h.01M17 21h.01M21 17h.01"/>' },
    { n: 'Transferencia',      c: 0,    col: 'var(--verde-2)', ico: '<path d="M7 10l5-5 5 5M12 5v14"/>' },
  ],

  // Ítems precargados de la calculadora de importación.
  // Separados en 3 bloques que reflejan el proceso real de una importación.
  // origen: sobre el FOB en USD (tipo 'usd' = monto USD total, 'pct' = % del FOB)
  // aduana: los cargos en aduana argentina (tipo 'pct' = % sobre CIF, 'fijo' = ARS)
  // interno: logística dentro de Argentina (tipo 'fijo' = ARS)
  importDefault: {
    origen: [
      { label: 'Flete internacional', tipo: 'usd', valor: 0,   nota: 'Total del envío en USD' },
      { label: 'Seguro de carga',     tipo: 'pct', valor: 0.5, nota: '~0,5% del FOB. Cotizá con el despachante.' },
    ],
    aduana: [
      { label: 'Aranceles',           tipo: 'pct', valor: 16,   nota: '% sobre el valor CIF. Depende de la posición arancelaria.' },
      { label: 'IVA aduana (10,5%)',  tipo: 'pct', valor: 10.5, nota: 'Tasa reducida para la mayoría de productos. Puede ser 21% si aplica.' },
      { label: 'Tasa estadística',    tipo: 'pct', valor: 3,    nota: '% sobre CIF. Verificar con despachante.' },
      { label: 'Honorarios despachante', tipo: 'fijo', valor: 0, nota: 'Monto fijo en ARS. Pedí cotización.' },
      { label: 'Depósito fiscal',     tipo: 'fijo', valor: 0,   nota: 'ARS. Solo si hay demoras en aduana.' },
    ],
    interno: [
      { label: 'Flete interno',       tipo: 'fijo', valor: 0,   nota: 'ARS. Costo de mover la mercadería al depósito.' },
    ],
  },

  // Configuración del upsell Premium
  premium: {
    // Número en formato internacional sin + ni espacios (se completa en producción)
    whatsapp: '5491100000000',
    mensaje: 'Hola! Quiero activar Costito Premium 🟢',
    // Suscripción mensual. El cobro real lo define el plan en Mercado Pago;
    // este número es solo para mostrar (debe coincidir con PREMIUM_PRECIO_ARS del backend).
    precioMensual: 2000,
  },
};
