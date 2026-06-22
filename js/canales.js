/* ============================================================
   COSTITO — Canales de venta (procesadores locales + plataformas online)
   Última verificación de comisiones: junio 2026.
   Los % de procesadores locales YA INCLUYEN IVA.
   Los % de plataformas online pueden o no incluir IVA (ver iva_sobre_comision).
   ============================================================ */

const PROCESADORES_LOCAL = [
  {
    id: 'mercadopago',
    nombre: 'Mercado Pago',
    nota: 'Los % ya incluyen IVA. Verificá tu plan vigente en la app de MP.',
    medios: [
      { id: 'qr',        label: 'QR / Transferencia',   comision: 0.8  },
      { id: 'debito',    label: 'Débito',                comision: 1.5  },
      { id: 'credito1',  label: 'Crédito 1 cuota',       comision: 3.99 },
      { id: 'credito3',  label: 'Crédito 3 cuotas',      comision: 6.99 },
      { id: 'credito6',  label: 'Crédito 6 cuotas',      comision: 9.99 },
      { id: 'credito12', label: 'Crédito 12 cuotas',     comision: 15.99 },
    ],
  },
  {
    id: 'nave_inmediata',
    nombre: 'Nave / BBVA (cobro inmediato)',
    nota: 'Acreditación inmediata. Los % ya incluyen IVA. Verificá con tu ejecutivo.',
    medios: [
      { id: 'debito',   label: 'Débito',            comision: 1.3  },
      { id: 'credito1', label: 'Crédito 1 cuota',   comision: 3.2  },
      { id: 'credito3', label: 'Crédito 3 cuotas',  comision: 6.9  },
      { id: 'credito6', label: 'Crédito 6 cuotas',  comision: 10.5 },
    ],
  },
  {
    id: 'nave_diferida',
    nombre: 'Nave / BBVA (cobro diferido)',
    nota: 'Acreditación a los 30 días. Menor comisión a cambio de esperar. Los % ya incluyen IVA.',
    medios: [
      { id: 'debito',   label: 'Débito',            comision: 0.6 },
      { id: 'credito1', label: 'Crédito 1 cuota',   comision: 1.8 },
      { id: 'credito3', label: 'Crédito 3 cuotas',  comision: 5.4 },
      { id: 'credito6', label: 'Crédito 6 cuotas',  comision: 8.9 },
    ],
  },
  {
    id: 'uala',
    nombre: 'Ualá Bis',
    nota: 'Los % ya incluyen IVA. El QR sin costo. Verificá tu categoría en la app.',
    medios: [
      { id: 'qr',       label: 'QR / Transferencia', comision: 0    },
      { id: 'debito',   label: 'Débito',              comision: 1.5  },
      { id: 'credito1', label: 'Crédito 1 cuota',     comision: 3.49 },
      { id: 'credito3', label: 'Crédito 3 cuotas',    comision: 6.99 },
      { id: 'credito6', label: 'Crédito 6 cuotas',    comision: 11.99 },
    ],
  },
  {
    id: 'getnet',
    nombre: 'Getnet (Santander)',
    nota: 'Los % ya incluyen IVA. Consultá con tu ejecutivo del banco.',
    medios: [
      { id: 'debito',    label: 'Débito',             comision: 1.5  },
      { id: 'credito1',  label: 'Crédito 1 cuota',    comision: 3.5  },
      { id: 'credito3',  label: 'Crédito 3 cuotas',   comision: 7.0  },
      { id: 'credito6',  label: 'Crédito 6 cuotas',   comision: 11.0 },
      { id: 'credito12', label: 'Crédito 12 cuotas',  comision: 17.0 },
    ],
  },
  {
    id: 'fiserv',
    nombre: 'Fiserv / First Data',
    nota: 'Los % ya incluyen IVA. Las tasas varían por banco y contrato.',
    medios: [
      { id: 'debito',   label: 'Débito',           comision: 1.5  },
      { id: 'credito1', label: 'Crédito 1 cuota',  comision: 3.5  },
      { id: 'credito3', label: 'Crédito 3 cuotas', comision: 7.5  },
      { id: 'credito6', label: 'Crédito 6 cuotas', comision: 12.0 },
    ],
  },
  {
    id: 'personalizado',
    nombre: 'Mi procesador / otro',
    nota: 'Ingresá la comisión según tu contrato. Los % de los procesadores generalmente ya incluyen IVA.',
    medios: [
      { id: 'custom', label: 'Mi medio de cobro', comision: null, editable: true },
    ],
  },
];

const PLATAFORMAS_INTERNET = [
  {
    id: 'ml_clasica',
    nombre: 'Mercado Libre Clásica',
    nota: 'Publicaciones en modalidad Clásica. Comisión solo si vendés. ML cobra IVA sobre su comisión.',
    comision_base: 13,
    iva_sobre_comision: true,
    submodo: false,
  },
  {
    id: 'ml_premium',
    nombre: 'Mercado Libre Premium',
    nota: 'Publicaciones Premium con más exposición. ML cobra IVA sobre su comisión.',
    comision_base: 28,
    iva_sobre_comision: true,
    submodo: false,
  },
  {
    id: 'tiendanube',
    nombre: 'Tienda Nube',
    nota: 'La comisión total combina el cargo de TN más el del procesador de cobro. TN cobra IVA sobre su parte.',
    comision_base: 2.99,
    iva_sobre_comision: true,
    submodo: true,
    procesadores_online: [
      { id: 'mp_checkout',  label: 'Mercado Pago Checkout', comision: 4.99 },
      { id: 'modo',         label: 'Modo',                  comision: 3.99 },
      { id: 'transferencia',label: 'Transferencia / CVU',   comision: 0    },
    ],
  },
  {
    id: 'instagram_whatsapp',
    nombre: 'Instagram / WhatsApp',
    nota: 'Sin comisión de plataforma. Pagás solo la comisión del procesador que uses para el link de pago.',
    comision_base: 0,
    iva_sobre_comision: false,
    submodo: true,
    procesadores_online: [
      { id: 'mp_link',      label: 'Mercado Pago (link)',   comision: 4.99 },
      { id: 'uala_link',    label: 'Ualá (link de pago)',   comision: 3.99 },
      { id: 'transferencia',label: 'Transferencia / CVU',   comision: 0    },
    ],
  },
  {
    id: 'shopify',
    nombre: 'Shopify',
    nota: 'La comisión total es el cargo de Shopify (según plan) más el procesador de pago.',
    comision_base: 2.0,
    iva_sobre_comision: true,
    submodo: true,
    procesadores_online: [
      { id: 'mp_checkout', label: 'Mercado Pago', comision: 3.99 },
      { id: 'paypal',      label: 'PayPal',        comision: 3.5  },
      { id: 'stripe',      label: 'Stripe',        comision: 2.9  },
    ],
  },
  {
    id: 'woocommerce',
    nombre: 'WooCommerce',
    nota: 'Sin comisión de plataforma. Pagás solo al procesador que instales como plugin.',
    comision_base: 0,
    iva_sobre_comision: false,
    submodo: true,
    procesadores_online: [
      { id: 'mp_checkout',  label: 'Mercado Pago', comision: 4.99 },
      { id: 'paypal',       label: 'PayPal',        comision: 3.5  },
      { id: 'transferencia',label: 'Transferencia / CVU', comision: 0 },
    ],
  },
  {
    id: 'personalizado',
    nombre: 'Mi canal / otro',
    nota: 'Ingresá el porcentaje total de comisión a mano.',
    comision_base: null,
    iva_sobre_comision: false,
    submodo: false,
    editable: true,
  },
];
