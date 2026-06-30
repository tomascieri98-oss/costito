/* ============================================================
   COSTITO — Pagos (suscripción Premium con Mercado Pago)
   ------------------------------------------------------------
   El front solo INICIA el checkout: le pide a una Edge Function
   de Supabase la URL de pago (init_point) y redirige. El Access
   Token de MP nunca toca el navegador. Spec del backend: PAGOS.md

   Capa desacoplada (mismo patrón que CostitoAuth): cuando el socio
   despliegue la Edge Function, esto queda funcional sin tocar la UI.
   ============================================================ */
window.CostitoPay = (function () {
  const SUPABASE_URL = 'https://pedpqmrxzftddvgfwlxx.supabase.co';
  const ANON_KEY = 'sb_publishable_8boyR6fKSt7suaWyF038tw_heNNiiD1';
  const FN_URL = SUPABASE_URL + '/functions/v1/crear-suscripcion';

  // Cliente propio solo para leer la sesión (comparte el login que guardó auth.js)
  const sb = window.supabase ? window.supabase.createClient(SUPABASE_URL, ANON_KEY) : null;
  const toast = (m) => (window.Costito && window.Costito.toast ? window.Costito.toast(m) : null);

  async function cancelSubscription() {
    if (!confirm('¿Cancelar tu suscripción Premium?\n\nSeguís teniendo acceso hasta que venza el período ya pagado.')) return;
    try {
      const { data } = await sb.auth.getSession();
      const token = data && data.session && data.session.access_token;
      if (!token) { toast('Volvé a entrar a tu cuenta'); return; }
      const res = await fetch(SUPABASE_URL + '/functions/v1/cancelar-suscripcion', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token, 'apikey': ANON_KEY, 'Content-Type': 'application/json' },
        body: '{}',
      });
      if (res.status === 404) { toast('No encontramos una suscripción activa en tu cuenta.'); return; }
      if (!res.ok) throw new Error('fn ' + res.status);
      toast('Suscripción cancelada. Tu acceso sigue activo hasta que venza el período.');
    } catch (e) {
      toast('No se pudo cancelar automáticamente. Podés hacerlo en mercadopago.com.ar → Mis suscripciones');
    }
  }

  async function startCheckout() {
    // Premium está atado a la cuenta: si no hay sesión, pedir login primero
    if (!window.CostitoAuth || !window.CostitoAuth.getUser()) {
      toast('Entrá a tu cuenta para suscribirte');
      const btn = document.getElementById('acctBtn');
      const overlay = document.getElementById('authOverlay');
      if (btn && overlay && !overlay.classList.contains('on')) btn.click();
      return;
    }
    try {
      const { data } = await sb.auth.getSession();
      const token = data && data.session && data.session.access_token;
      if (!token) { toast('Volvé a entrar a tu cuenta'); return; }

      const res = await fetch(FN_URL, {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token, 'apikey': ANON_KEY, 'Content-Type': 'application/json' },
        body: '{}',
      });
      if (!res.ok) throw new Error('fn ' + res.status);
      const out = await res.json();
      if (out && out.init_point) { window.location.href = out.init_point; return; }
      throw new Error('sin init_point');
    } catch (e) {
      // Mientras la Edge Function no esté desplegada, cae acá (no rompe nada).
      toast('Estamos activando los pagos. Probá en un rato 🙌');
    }
  }

  // Al volver de Mercado Pago (back_url = ...?pago=ok)
  function handleReturn() {
    const params = new URLSearchParams(location.search);
    if (params.get('pago') === 'ok') {
      toast('¡Gracias! Estamos confirmando tu suscripción…');
      history.replaceState({}, '', location.pathname); // limpia el query
      // El webhook activa el plan; CostitoAuth re-emite cuando la sesión se actualiza.
    }
  }

  return { startCheckout, cancelSubscription, handleReturn };
})();

/* ---------- Botón "Pasate a Premium" en el menú de cuenta ---------- */
(function payUI() {
  const Pay = window.CostitoPay;
  const Auth = window.CostitoAuth;
  if (!Pay || !Auth) return;
  const menu = document.getElementById('acctMenu');
  const logout = document.getElementById('acctLogout');
  if (!menu || !logout) return;

  // COSTITO_DATA es un `const` de data.js (no cuelga de window): se referencia directo.
  const precio = (typeof COSTITO_DATA !== 'undefined' && COSTITO_DATA.premium && COSTITO_DATA.premium.precioMensual) || 0;
  const btn = document.createElement('button');
  btn.className = 'acct-premium';
  btn.id = 'goPremium';
  btn.type = 'button';
  btn.insertAdjacentHTML('beforeend',
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l2.4 6.9H21l-5.3 4 2 6.6L12 16l-5.7 3.5 2-6.6L3 8.9h6.6z"/></svg>'
    + '<span><b>Pasate a Premium</b><small>Productos ilimitados en la nube · $'
    + precio.toLocaleString('es-AR') + '/mes</small></span>');
  menu.insertBefore(btn, logout);

  btn.addEventListener('click', () => Pay.startCheckout());

  // Botón cancelar suscripción (solo visible para usuarios premium con MP)
  const btnCancel = document.createElement('button');
  btnCancel.className = 'acct-cancel';
  btnCancel.id = 'cancelPremium';
  btnCancel.type = 'button';
  btnCancel.textContent = 'Cancelar suscripción';
  menu.insertBefore(btnCancel, logout);
  btnCancel.addEventListener('click', () => Pay.cancelSubscription());

  // Banner de promo activa
  const promoEl = document.createElement('div');
  promoEl.className = 'acct-promo-badge';
  promoEl.id = 'promoBadge';
  promoEl.style.display = 'none';
  menu.insertBefore(promoEl, logout);

  function sync(u) {
    const isPremium = u && u.plan === 'premium';
    const isPromo   = isPremium && u.promoType === 'launch50';
    const isMpPlan  = isPremium && !isPromo;

    btn.style.display       = (!isPremium) ? 'flex' : 'none';
    btnCancel.style.display = isMpPlan ? 'flex' : 'none';

    if (isPromo && u.planValidUntil) {
      const vence = u.planValidUntil.toLocaleDateString('es-AR', { day: 'numeric', month: 'long' });
      promoEl.style.display = 'block';
      promoEl.innerHTML = '<b>30 días gratis activos</b><span>Vence el ' + vence + '</span>';
    } else {
      promoEl.style.display = 'none';
    }
  }
  Auth.onChange(sync);
  sync(Auth.getUser());

  Pay.handleReturn();
})();
