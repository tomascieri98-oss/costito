/* ============================================================
   COSTITO — App (wiring del DOM)
   Conecta los datos (data.js) y las fórmulas (calc.js) con la UI.
   No hay lógica de cálculo acá: solo lectura del DOM, render y eventos.

   Nota de seguridad: el único texto que viene del usuario es el nombre
   del producto, que se sanitiza con escapeHtml() antes de inyectarse.
   El render usa setHTML() (insertAdjacentHTML) con markup confiable
   o ya escapado.
   ============================================================ */

(function () {
  const D = COSTITO_DATA;
  const Calc = CostitoCalc;
  const $ = (id) => document.getElementById(id);

  // Configuración de promo lanzamiento — cambiar activa:false para desactivar
  const PROMO = { activa: true, maxUsos: 50, dias: 30 };
  // Render de markup confiable / ya escapado (limpia y vuelve a insertar)
  const setHTML = (el, html) => { el.textContent = ''; el.insertAdjacentHTML('beforeend', html); };

  // Claves de localStorage
  const LS = {
    theme: 'costito_theme', cur: 'costito_cur', prods: 'costito_productos', procs: 'costito_procs',
    dolarTipo: 'costito_dolar_tipo', dolarCache: 'costito_dolar_cache', condFiscal: 'costito_cond_fiscal',
    customMedios: 'costito_custom_medios',
    mediosChecked: 'costito_medios_ck',
    procesadorIds: 'costito_proc_ids',
    helpSeen: 'costito_help_seen',
  };

  // Estado en memoria
  const state = {
    cur: localStorage.getItem(LS.cur) || 'ARS',
    iva: 21,
    condFiscal: localStorage.getItem(LS.condFiscal) || 'mono',
    modoGanancia: 'ars',
    productos: [],
    dolarTipo: localStorage.getItem(LS.dolarTipo) || D.dolar.tipoDefault,
    dolares: JSON.parse(localStorage.getItem(LS.dolarCache) || 'null'), // { casa: {valor, fecha} }
    prodTipoActivo: null,
  };

  // ---------- Helpers de formato ----------
  const fmt = (n) => Math.round(n).toLocaleString('es-AR');
  // Parsea números con formato argentino: "10.000,50" → 10000.5
  const parseNum = (s) => parseFloat(String(s || '').trim().replace(/\./g, '').replace(',', '.')) || 0;
  const symbol = () => (state.cur === 'ARS' ? '$' : 'US$');
  // Cotización vigente del tipo elegido (de la API); si no hay, el fallback.
  const getRate = () => (state.dolares && state.dolares[state.dolarTipo] && state.dolares[state.dolarTipo].valor) || D.dolar.fallback;
  const conv = (ars) => (state.cur === 'ARS' ? ars : ars / getRate());
  const money = (ars) => symbol() + fmt(conv(ars));

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ============================================================
  // API COMPARTIDA (la usa premium.js)
  // ============================================================
  // Se expone una superficie chica para que las calculadoras Premium
  // (en premium.js) reutilicen formato, toast y el estado de moneda
  // sin duplicar lógica ni romper el encapsulamiento.
  window.Costito = {
    D, Calc,
    fmt, money, conv, symbol, setHTML, escapeHtml, parseNum,
    toast: (m) => toast(m),
    waUrl: () => 'https://wa.me/' + D.premium.whatsapp + '?text=' + encodeURIComponent(D.premium.mensaje),
    isPremium: () => localStorage.getItem('costito_premium') === '1',
    setPremium(on) {
      localStorage.setItem('costito_premium', on ? '1' : '0');
      document.dispatchEvent(new CustomEvent('costito:premiumchange'));
    },
    // Carga un costo (ARS) en la calculadora principal y va a esa tab
    usarComoCosto(ars) {
      $('costo').value = Math.round(ars).toLocaleString('es-AR');
      document.querySelector('[data-tab="calc"]').click();
      $('costo').dispatchEvent(new Event('input'));
      toast('Costo cargado en la calculadora');
    },
  };

  // ============================================================
  // TEMA (claro / oscuro)
  // ============================================================
  function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    localStorage.setItem(LS.theme, t);
  }
  (function initTheme() {
    const saved = localStorage.getItem(LS.theme);
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    applyTheme(saved || (prefersDark ? 'dark' : 'light'));
  })();
  $('themeToggle').addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    applyTheme(next);
  });

  // ============================================================
  // NAVEGACIÓN ENTRE TABS
  // ============================================================
  const tabsEl = $('tabs');
  const navEl = tabsEl.closest('nav');

  // Muestra/oculta los degradés según haya más tabs hacia cada lado
  function updateTabFades() {
    const max = tabsEl.scrollWidth - tabsEl.clientWidth;
    navEl.classList.toggle('can-left', tabsEl.scrollLeft > 2);
    navEl.classList.toggle('can-right', tabsEl.scrollLeft < max - 2);
  }
  tabsEl.addEventListener('scroll', updateTabFades, { passive: true });
  window.addEventListener('resize', updateTabFades);

  // En desktop la rueda vertical no scrollea contenedores horizontales:
  // la traducimos a scroll horizontal para poder llegar a las tabs de la derecha.
  tabsEl.addEventListener('wheel', (e) => {
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      tabsEl.scrollLeft += e.deltaY;
      e.preventDefault();
    }
  }, { passive: false });

  tabsEl.addEventListener('click', (e) => {
    const b = e.target.closest('.tab');
    if (!b) return;
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('on'));
    b.classList.add('on');
    document.querySelectorAll('.panel').forEach((p) => p.classList.remove('on'));
    $(b.dataset.tab).classList.add('on');
    // Centrar la tab clickeada (útil cuando estaba cortada en el borde)
    b.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
    showHelpBanner(b.dataset.tab);
    window.fbtrack('PageView');
  });

  // ============================================================
  // MONEDA
  // ============================================================
  $('cur').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    state.cur = b.dataset.cur;
    localStorage.setItem(LS.cur, state.cur);
    document.querySelectorAll('#cur button').forEach((x) => x.classList.remove('on'));
    b.classList.add('on');
    $('pre1').textContent = symbol();
    $('finCur').textContent = symbol();
    $('dolarBar').style.display = state.cur === 'USD' ? 'flex' : 'none';
    calc(); renderProds();
    document.dispatchEvent(new CustomEvent('costito:rerender'));
  });

  // ============================================================
  // COTIZACIÓN DEL DÓLAR (en vivo, no editable a mano)
  // ============================================================
  function updateDolarBar() {
    const d = state.dolares && state.dolares[state.dolarTipo];
    $('dolarVal').textContent = d ? '$' + fmt(d.valor) : '—';
    if (d && d.fecha) {
      const f = new Date(d.fecha);
      $('dolarFecha').textContent = '· actualizado ' +
        f.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    } else {
      $('dolarFecha').textContent = state.dolares ? '' : '· sin conexión, valor estimado';
    }
  }

  // Trae todas las cotizaciones de la API en una sola llamada y cachea.
  function fetchDolares() {
    fetch(D.dolar.endpoint, { cache: 'no-store' })
      .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then((list) => {
        const map = {};
        list.forEach((d) => { map[d.casa] = { valor: d[D.dolar.valor], fecha: d.fechaActualizacion }; });
        state.dolares = map;
        localStorage.setItem(LS.dolarCache, JSON.stringify(map));
        updateDolarBar();
        if (state.cur === 'USD') { calc(); renderProds(); document.dispatchEvent(new CustomEvent('costito:rerender')); }
      })
      .catch(() => { updateDolarBar(); }); // si falla, queda el cache o el fallback
  }

  // El cliente elige QUÉ dólar usar (el valor no se toca a mano)
  $('dolarTipo').addEventListener('change', function () {
    state.dolarTipo = this.value;
    localStorage.setItem(LS.dolarTipo, state.dolarTipo);
    updateDolarBar();
    calc(); renderProds();
    document.dispatchEvent(new CustomEvent('costito:rerender'));
  });

  // ============================================================
  // ESTADO DEL CANAL (calculadora principal)
  // ============================================================
  const canalState = {
    tipo: 'local',
    procesadorIds: [PROCESADORES_LOCAL[0].id],
    plataformaId: PLATAFORMAS_INTERNET[0].id,
    procOnlineId: null,
    desvinculado: false,
  };

  function comisionComputada(cs) {
    if (cs.tipo === 'local') {
      return 0;
    }
    const plat = PLATAFORMAS_INTERNET.find((p) => p.id === cs.plataformaId);
    if (!plat) return 0;
    if (plat.editable) return null;
    if (plat.submodo && plat.procesadores_online) {
      const proc = plat.procesadores_online.find((p) => p.id === cs.procOnlineId)
        || plat.procesadores_online[0];
      if (!proc || proc.comision === null) return null;
      return (plat.comision_base || 0) + proc.comision;
    }
    return plat.comision_base;
  }

  function canalNombreDisplay() {
    if (canalState.tipo === 'local') {
      if (canalState.procesadorIds.length === 1) {
        const proc = PROCESADORES_LOCAL.find((p) => p.id === canalState.procesadorIds[0]);
        return proc ? proc.nombre : 'Local';
      }
      return 'Local (' + canalState.procesadorIds.length + ' procesadores)';
    }
    const plat = PLATAFORMAS_INTERNET.find((p) => p.id === canalState.plataformaId);
    if (!plat) return 'Internet';
    if (plat.submodo && plat.procesadores_online) {
      const proc = plat.procesadores_online.find((p) => p.id === canalState.procOnlineId)
        || plat.procesadores_online[0];
      return plat.nombre + (proc ? ' + ' + proc.label : '');
    }
    return plat.nombre;
  }

  // ============================================================
  // HELP BANNERS — tutorial colapsable por sección
  // ============================================================
  const HB_TABS = ['calc', 'prod'];

  function showHelpBanner(tabId) {
    if (!HB_TABS.includes(tabId)) return;
    // Siempre colapsado por defecto — el usuario lo abre si quiere
    const reopen = $('hb-' + tabId + '-reopen');
    if (reopen) reopen.classList.add('visible');
  }

  function initPromoBar() {
    const bar = $('promoBar');
    if (!bar) return;
    if (!PROMO.activa || localStorage.getItem('costito_promo_bar_closed')) {
      bar.style.display = 'none';
      return;
    }
    const txt = $('promoBarTxt');
    if (txt) txt.textContent = `Promo lanzamiento: primeros ${PROMO.maxUsos} registros tienen ${PROMO.dias} días gratis del plan completo. Sin tarjeta.`;
    const heroNote = $('heroPromoNote');
    if (heroNote) heroNote.textContent = `Promo: ${PROMO.dias} días del plan completo para los primeros ${PROMO.maxUsos} registros`;
    const guestPromo = $('guestCtaPromo');
    if (guestPromo) guestPromo.textContent = `Primeros ${PROMO.maxUsos} registros: ${PROMO.dias} días del plan completo gratis.`;
    const closeBtn = $('promoBarClose');
    if (closeBtn) closeBtn.addEventListener('click', () => {
      bar.style.display = 'none';
      localStorage.setItem('costito_promo_bar_closed', '1');
    });
  }

  function initHero() {
    const btn = $('heroCtaBtn');
    if (!btn) return;
    btn.addEventListener('click', () => {
      const costoEl = $('costo');
      if (costoEl) {
        costoEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => costoEl.focus(), 600);
      }
    });
    if (!PROMO.activa) {
      const heroNote = $('heroPromoNote');
      if (heroNote) heroNote.parentElement.style.display = 'none';
    }
  }

  function updateGuestCta(user) {
    const addBtnTxt = $('addBtnTxt');
    if (addBtnTxt) addBtnTxt.textContent = user ? 'Guardar en mis productos' : 'Guardar este cálculo gratis';
    const guestCta = $('guestCta');
    if (guestCta) guestCta.style.display = user ? 'none' : '';
  }

  function initHelpBanners() {
    document.querySelectorAll('.hb-dismiss').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.hb;
        const seen = JSON.parse(localStorage.getItem(LS.helpSeen) || '[]');
        if (!seen.includes(id)) { seen.push(id); localStorage.setItem(LS.helpSeen, JSON.stringify(seen)); }
        const banner = $('hb-' + id);
        const reopen = $('hb-' + id + '-reopen');
        if (banner) banner.classList.remove('on');
        if (reopen) reopen.classList.add('visible');
      });
    });
    document.querySelectorAll('.hb-reopen').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.hb;
        const banner = $('hb-' + id);
        if (banner) banner.classList.add('on');
        btn.classList.remove('visible');
      });
    });
    showHelpBanner('calc');
  }

  // ============================================================
  // POBLAR SELECTORES DESDE LOS DATOS
  // ============================================================
  function buildControls() {
    setHTML($('ivaSeg'), D.ivaProveedor
      .map((o) => '<button data-iva="' + o.v + '"' + (o.v === 21 ? ' class="on"' : '') + '>' + o.label + '</button>')
      .join(''));

    setHTML($('iibb'), D.iibb
      .map((o) => '<option value="' + o.v + '"' + (o.label === 'Buenos Aires' ? ' selected' : '') + '>' +
        o.label + (o.prov ? ' (' + o.prov + ')' : '') + '</option>')
      .join(''));

    // Procesadores locales (calc tab) — restaurar desde localStorage
    const savedPids = JSON.parse(localStorage.getItem(LS.procesadorIds) || '["' + PROCESADORES_LOCAL[0].id + '"]');
    canalState.procesadorIds = savedPids.filter((pid) => PROCESADORES_LOCAL.some((p) => p.id === pid));
    if (!canalState.procesadorIds.length) canalState.procesadorIds = [PROCESADORES_LOCAL[0].id];
    renderProcesadores();
    syncProcNota();

    // Plataformas internet (calc tab)
    setHTML($('plataforma-sel'), PLATAFORMAS_INTERNET.map((p) =>
      '<option value="' + p.id + '">' + p.nombre + '</option>'
    ).join(''));
    updateProcOnlineOptions(false);

    // Tipo de dólar (cotización en vivo)
    setHTML($('dolarTipo'), D.dolar.tipos
      .map((t) => '<option value="' + t.id + '"' + (t.id === state.dolarTipo ? ' selected' : '') + '>' + t.nombre + '</option>')
      .join(''));

    $('comDate').textContent = 'Comisiones de ' + D.comisionesActualizadas;

    syncCanalUI();
  }

  function renderProcesadores() {
    const container = $('procesador-checks');
    if (!container) return;
    const html = PROCESADORES_LOCAL.map((proc) => {
      const isOn = canalState.procesadorIds.includes(proc.id);
      return '<label class="proc-check-row' + (isOn ? ' on' : '') + '" data-pid="' + proc.id + '">' +
        '<input type="checkbox" data-pck="' + proc.id + '"' + (isOn ? ' checked' : '') + ' />' +
        '<span class="proc-check-name">' + proc.nombre + '</span>' +
        '</label>';
    }).join('');
    setHTML(container, html);
  }

  function syncProcNota() {
    const notaEl = $('procesador-nota');
    if (!notaEl) return;
    if (canalState.procesadorIds.length === 1) {
      const proc = PROCESADORES_LOCAL.find((p) => p.id === canalState.procesadorIds[0]);
      notaEl.textContent = proc ? proc.nota || '' : '';
      notaEl.style.display = proc && proc.nota ? '' : 'none';
    } else {
      notaEl.style.display = 'none';
    }
  }

  function updateProcOnlineOptions(reset) {
    const plat = PLATAFORMAS_INTERNET.find((p) => p.id === canalState.plataformaId) || PLATAFORMAS_INTERNET[0];
    const show = plat && plat.submodo && plat.procesadores_online && plat.procesadores_online.length > 0;
    $('proc-online-field').style.display = show ? '' : 'none';
    if (!show) return;
    setHTML($('proc-online-sel'), plat.procesadores_online.map((p) => {
      const pct = p.comision !== null ? ' (' + String(p.comision).replace('.', ',') + '%)' : '';
      return '<option value="' + p.id + '">' + p.label + pct + '</option>';
    }).join(''));
    if (reset) {
      canalState.procOnlineId = plat.procesadores_online[0].id;
      $('proc-online-sel').value = canalState.procOnlineId;
    } else {
      canalState.procOnlineId = plat.procesadores_online[0].id;
    }
  }

  function syncCanalUI() {
    const tipo = canalState.tipo;
    $('canal-local-wrap').style.display = tipo === 'local' ? '' : 'none';
    $('canal-internet-wrap').style.display = tipo === 'internet' ? '' : 'none';
    $('com-field-wrap').style.display = tipo === 'local' ? 'none' : '';
    $('canal-medios-footer').style.display = tipo === 'local' ? '' : 'none';

    // Sync comCustom (if not desvinculado)
    if (!canalState.desvinculado) {
      const com = comisionComputada(canalState);
      if (com !== null) {
        $('comCustom').value = com;
        $('comCustom').placeholder = '';
      } else {
        $('comCustom').value = '';
        $('comCustom').placeholder = 'Ingresá la comisión';
      }
      $('com-desvin-badge').style.display = 'none';
    }

    // IVA checkbox: hide for local (% already include IVA), show for internet when relevant
    if (tipo === 'local') {
      $('ivaComWrap').style.display = 'none';
      $('ivaCom').checked = false;
    } else {
      const plat = PLATAFORMAS_INTERNET.find((p) => p.id === canalState.plataformaId);
      const com = canalState.desvinculado ? (parseFloat($('comCustom').value) || 0) : comisionComputada(canalState);
      const showIva = plat && plat.iva_sobre_comision && com !== null && com > 0;
      $('ivaComWrap').style.display = showIva ? 'flex' : 'none';
      if (!canalState.desvinculado) $('ivaCom').checked = !!showIva;
    }

    // Costos adicionales: cargo fijo (ML) y envío a cargo del vendedor (ML, TN, Shopify)
    const platId = canalState.plataformaId;
    const showCargoFijo = tipo === 'internet' && (platId === 'ml_clasica' || platId === 'ml_premium');
    const showEnvio = tipo === 'internet' && (platId === 'ml_clasica' || platId === 'ml_premium' || platId === 'tiendanube' || platId === 'shopify');
    $('costos-extra-wrap').style.display = (showCargoFijo || showEnvio) ? '' : 'none';
    $('cargo-fijo-field').style.display = showCargoFijo ? '' : 'none';

    // Nota contextual
    if (tipo === 'local') {
      syncProcNota();
      $('plataforma-nota').textContent = '';
    } else {
      if ($('procesador-nota')) $('procesador-nota').style.display = 'none';
      const plat = PLATAFORMAS_INTERNET.find((p) => p.id === canalState.plataformaId);
      $('plataforma-nota').textContent = plat ? plat.nota || '' : '';
    }

    // Para LOCAL: renderizar checkboxes de procesadores
    if (tipo === 'local') {
      renderProcesadores();
    }

    calc();
  }

  // ============================================================
  // CALCULADORA PRINCIPAL
  // ============================================================
  function comNominal() {
    return parseFloat($('comCustom').value) || 0;
  }
  function leerInputs() {
    const costo = parseNum($('costo').value);
    const comEfectiva = canalState.tipo === 'local' ? 0 : Calc.comisionEfectiva(comNominal(), $('ivaCom').checked);
    const iibb = $('iibb').value === 'custom'
      ? (parseFloat($('iibbCustom').value) || 0)
      : (parseFloat($('iibb').value) || 0);
    const condicionFiscal = state.condFiscal;
    let margen;
    if (state.modoGanancia === 'ars') {
      const G = parseNum($('gananciaARS').value);
      const esRI = condicionFiscal !== 'mono';
      const costoBase = esRI ? costo : costo * (1 + (state.iva || 0) / 100);
      const com = comEfectiva / 100;
      const ib = iibb / 100;
      const libre = 1 - com - ib;
      margen = (libre > 0 && costoBase + G > 0) ? G * libre / (costoBase + G) * 100 : 0;
    } else {
      margen = $('margen').value;
    }
    const cargoFijo = parseNum($('cargoFijoInput').value) || 0;
    const costoEnvio = parseNum($('envioInput').value) || 0;
    return { costo, ivaProveedor: state.iva, margen, comEfectiva, iibb, condicionFiscal, costosFijos: cargoFijo + costoEnvio };
  }

  function calc() {
    const r = Calc.precioPublicado(leerInputs());

    if (!r.ok) {
      $('finVal').textContent = '—';
      setHTML($('ganNote'), escapeHtml(r.motivo));
      ['bCosto', 'bCom', 'bIibb', 'bGan', 'bTotal', 'bPrecioNeto', 'bIvaVenta'].forEach((id) => ($(id).textContent = '—'));
      $('bCostosExtraRow').style.display = 'none';
      $('addBtn').disabled = true;
      $('addBtn').style.opacity = .5;
      const mediosNoteErr = $('precio-medios-note');
      if (mediosNoteErr) mediosNoteErr.style.display = 'none';
      const subNoteErr = $('precioSubNote');
      if (subNoteErr) subNoteErr.style.display = 'none';
      return;
    }
    $('addBtn').disabled = false;
    $('addBtn').style.opacity = 1;

    let finVal = r.precio;
    let comAmtDisplay = r.comAmt;
    // Para LOCAL: usar el precio del medio más caro entre los seleccionados
    if (canalState.tipo === 'local') {
      const allMedios = getCanalMedios();
      const checked = getCanalMediosChecked();
      const prices = allMedios
        .filter((m) => checked.has(m.uid) && m.comision !== null)
        .map((m) => Calc.precioPorMedio(r.precio, m.comision).precio);
      if (prices.length) {
        finVal = Math.max(...prices);
        comAmtDisplay = finVal - r.precio; // comisión = diferencia entre precio publicado y base
      }
    }
    // Mostrar/ocultar nota de precio máximo y sub-nota resultado
    const mediosNote = $('precio-medios-note');
    if (mediosNote) mediosNote.style.display = canalState.tipo === 'local' ? '' : 'none';
    const subNote = $('precioSubNote');
    if (subNote) subNote.style.display = canalState.tipo === 'local' ? 'none' : '';

    $('finVal').textContent = fmt(conv(finVal));
    setHTML($('ganNote'), 'Con esto ganás <b>' + money(r.ganancia) + ' limpios</b> por unidad.');
    $('bCostoLabel').textContent = r.esRI ? 'Tu costo neto' : 'Te costó (con IVA)';
    $('bCosto').textContent = money(r.costoConIva);
    const hasCostosExtra = (r.costosFijos || 0) > 0;
    $('bCostosExtraRow').style.display = hasCostosExtra ? '' : 'none';
    if (hasCostosExtra) $('bCostosExtra').textContent = '– ' + money(r.costosFijos);
    $('bCom').textContent = '– ' + money(comAmtDisplay);
    $('bIibb').textContent = '– ' + money(r.iibbAmt);
    $('bGan').textContent = '+ ' + money(r.ganancia);
    $('bNetRow').style.display = r.esRI ? '' : 'none';
    $('bIvaRow').style.display = r.esRI ? '' : 'none';
    if (r.esRI) {
      $('bPrecioNeto').textContent = money(r.precioNeto);
      $('bIvaLabel').textContent = 'IVA a cobrar (' + r.ivaVenta + '%)';
      $('bIvaVenta').textContent = '+ ' + money(r.ivaVentaAmt);
    }
    $('bTotal').textContent = money(finVal);
    if (state.modoGanancia === 'ars') {
      $('ganEquiv').textContent = '≡ ' + r.margenReal.toFixed(1).replace('.', ',') + '% de margen sobre el precio';
    }
    updateMarkupConv();
    renderComparacion();
    renderCanalMedios();
  }

  function getCanalMedios() {
    const result = [];
    for (const pid of canalState.procesadorIds) {
      const proc = PROCESADORES_LOCAL.find((p) => p.id === pid);
      if (!proc) continue;
      const base = proc.medios.map((m) => ({
        ...m,
        uid: pid + '::' + m.id,
        procesadorId: pid,
        procesadorNombre: proc.nombre,
        isCustom: false,
      }));
      const customKey = LS.customMedios + '_' + pid;
      const customs = JSON.parse(localStorage.getItem(customKey) || '[]').map((c) => ({
        ...c,
        uid: pid + '::' + c.id,
        procesadorId: pid,
        procesadorNombre: proc.nombre,
        isCustom: true,
      }));
      result.push(...base, ...customs);
    }
    return result;
  }

  function getCanalMediosChecked() {
    const allMedios = getCanalMedios();
    const checked = new Set();
    for (const pid of canalState.procesadorIds) {
      const ckKey = LS.mediosChecked + '_' + pid;
      const saved = localStorage.getItem(ckKey);
      const procMedios = allMedios.filter((m) => m.procesadorId === pid);
      if (saved) {
        JSON.parse(saved).forEach((uid) => checked.add(uid));
      } else {
        procMedios.forEach((m) => checked.add(m.uid));
      }
    }
    return checked;
  }

  function saveCanalMediosChecked(set) {
    for (const pid of canalState.procesadorIds) {
      const ckKey = LS.mediosChecked + '_' + pid;
      const procUids = [...set].filter((uid) => uid.startsWith(pid + '::'));
      localStorage.setItem(ckKey, JSON.stringify(procUids));
    }
  }

  function renderCanalMedios() {
    const list = $('canal-medios-list');
    if (!list || canalState.tipo !== 'local') {
      if (list) list.style.display = 'none';
      return;
    }
    if (!canalState.procesadorIds.length) { list.style.display = 'none'; return; }

    list.style.display = '';
    const baseResult = Calc.precioPublicado(leerInputs());
    const basePrice = baseResult.ok ? baseResult.precio : 0;
    const allMedios = getCanalMedios();
    const checked = getCanalMediosChecked();
    const showHeaders = canalState.procesadorIds.length > 1;

    // Agrupar por procesador
    const groups = canalState.procesadorIds.map((pid) => ({
      pid,
      nombre: (PROCESADORES_LOCAL.find((p) => p.id === pid) || {}).nombre || pid,
      medios: allMedios.filter((m) => m.procesadorId === pid),
    }));

    const html = groups.map((group) => {
      const header = showHeaders
        ? '<div class="canal-proc-group-hdr">' + group.nombre + '</div>'
        : '';
      const rows = group.medios.map((m) => {
        const isOn = checked.has(m.uid);
        const comDisp = m.comision === null ? '—'
          : m.comision === 0 ? 'Sin comisión'
          : String(m.comision).replace('.', ',') + '%';
        let precioStr = '—';
        if (m.comision !== null && basePrice > 0) {
          const r = Calc.precioPorMedio(basePrice, m.comision);
          precioStr = money(r.precio);
        } else if (m.editable) {
          precioStr = basePrice > 0 ? money(basePrice) : '—';
        }
        const delBtn = m.isCustom
          ? '<button class="canal-medio-del" data-del="' + m.uid + '" title="Eliminar" aria-label="Eliminar medio">×</button>'
          : '';
        return '<div class="canal-medio-row' + (isOn ? '' : ' off') + '" data-uid="' + m.uid + '">' +
          '<div><div class="canal-medio-name">' + m.label + '</div>' +
          '<div class="canal-medio-com">' + comDisp + '</div></div>' +
          '<div class="canal-medio-price">' + precioStr + '</div>' +
          delBtn +
          '<input type="checkbox" class="canal-medio-ck" data-ck="' + m.uid + '"' + (isOn ? ' checked' : '') + ' />' +
          '</div>';
      }).join('');
      return header + rows;
    }).join('');

    setHTML(list, html);

    // Mostrar "Agregar medio" si hay un solo procesador O si "personalizado" está en la lista
    const addBtn = $('toggleAddMedioBtn');
    const hasPersonalizado = canalState.procesadorIds.includes('personalizado');
    if (addBtn) addBtn.style.display = (canalState.procesadorIds.length === 1 || hasPersonalizado) ? '' : 'none';
  }

  // Condición fiscal
  $('condFiscalSeg').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    state.condFiscal = b.dataset.cond;
    localStorage.setItem(LS.condFiscal, state.condFiscal);
    document.querySelectorAll('#condFiscalSeg button').forEach((x) => x.classList.remove('on'));
    b.classList.add('on');
    const esRI = state.condFiscal !== 'mono';
    $('ivaProvField').style.display = esRI ? 'none' : '';
    $('riNota').style.display = esRI ? '' : 'none';
    calc();
  });

  // Toggle % margen / $ en pesos
  $('gananciaModoSeg').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || b.dataset.modo === state.modoGanancia) return;
    if (b.dataset.modo === 'ars' && !$('gananciaARS').value) {
      const rActual = Calc.precioPublicado(leerInputs());
      if (rActual.ok) $('gananciaARS').value = Math.round(rActual.ganancia).toLocaleString('es-AR');
    }
    state.modoGanancia = b.dataset.modo;
    document.querySelectorAll('#gananciaModoSeg button').forEach((x) => x.classList.remove('on'));
    b.classList.add('on');
    const esArs = state.modoGanancia === 'ars';
    $('ganModoPct').style.display = esArs ? 'none' : '';
    $('ganModoArs').style.display = esArs ? '' : 'none';
    $('convRow').style.display = esArs ? 'none' : '';
    if (esArs) setTimeout(() => $('gananciaARS').focus(), 30);
    calc();
  });

  // Eventos de la calculadora
  $('ivaSeg').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    state.iva = parseFloat(b.dataset.iva);
    document.querySelectorAll('#ivaSeg button').forEach((x) => x.classList.remove('on'));
    b.classList.add('on');
    calc();
  });

  // Canal tipo: Local / Internet
  $('canal-tipo-seg').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || !b.dataset.tipo) return;
    canalState.tipo = b.dataset.tipo;
    canalState.desvinculado = false;
    document.querySelectorAll('#canal-tipo-seg button').forEach((x) => x.classList.remove('on'));
    b.classList.add('on');
    syncCanalUI();
  });

  // Procesadores locales: event delegation en el contenedor
  const procChecksContainer = $('procesador-checks');
  if (procChecksContainer) {
    procChecksContainer.addEventListener('change', (e) => {
      const cb = e.target.closest('input[data-pck]');
      if (!cb) return;
      const pid = cb.dataset.pck;
      if (cb.checked) {
        if (!canalState.procesadorIds.includes(pid)) canalState.procesadorIds.push(pid);
      } else {
        canalState.procesadorIds = canalState.procesadorIds.filter((id) => id !== pid);
        if (!canalState.procesadorIds.length) {
          // al menos 1 siempre seleccionado
          canalState.procesadorIds = [pid];
          cb.checked = true;
          const row = cb.closest('.proc-check-row');
          if (row) row.classList.add('on');
          return;
        }
      }
      // Actualizar clases on/off
      procChecksContainer.querySelectorAll('.proc-check-row').forEach((row) => {
        const rowPid = row.dataset.pid;
        row.classList.toggle('on', canalState.procesadorIds.includes(rowPid));
      });
      // Guardar en localStorage
      localStorage.setItem(LS.procesadorIds, JSON.stringify(canalState.procesadorIds));
      // Actualizar nota del procesador
      syncProcNota();
      renderCanalMedios();
      calc();
    });
  }

  // Delegado de click para la lista de medios inline del canal (multi-select con checkboxes)
  $('canal-medios-list').addEventListener('click', (e) => {
    // Eliminar medio custom
    const delBtn = e.target.closest('.canal-medio-del');
    if (delBtn) {
      const uid = delBtn.dataset.del;
      const pid = uid.split('::')[0];
      const mid = uid.split('::').slice(1).join('::');
      const customKey = LS.customMedios + '_' + pid;
      const customs = JSON.parse(localStorage.getItem(customKey) || '[]');
      localStorage.setItem(customKey, JSON.stringify(customs.filter((m) => m.id !== mid)));
      const ck = getCanalMediosChecked();
      ck.delete(uid);
      saveCanalMediosChecked(ck);
      renderCanalMedios();
      calc();
      return;
    }
    // Toggle checkbox (click en checkbox O en la fila)
    const row = e.target.closest('.canal-medio-row');
    if (!row) return;
    const uid = row.dataset.uid;
    if (!uid) return;
    const ck = getCanalMediosChecked();
    if (ck.has(uid)) ck.delete(uid); else ck.add(uid);
    saveCanalMediosChecked(ck);
    renderCanalMedios();
    calc();
  });

  // Toggle formulario agregar medio
  $('toggleAddMedioBtn').addEventListener('click', () => {
    const form = $('canal-add-form');
    const isOpen = form.style.display !== 'none';
    form.style.display = isOpen ? 'none' : '';
    if (!isOpen) setTimeout(() => $('nuevoMedioNombre').focus(), 30);
  });

  // Confirmar agregar medio
  $('nuevoMedioBtn').addEventListener('click', () => {
    const nombre = $('nuevoMedioNombre').value.trim();
    const com = parseFloat($('nuevoMedioCom').value);
    if (!nombre) { $('nuevoMedioNombre').focus(); return; }
    if (isNaN(com) || com < 0 || com > 60) { $('nuevoMedioCom').focus(); return; }
    // Si "personalizado" está entre los procesadores seleccionados, agregar siempre a él
    const pid = canalState.procesadorIds.includes('personalizado')
      ? 'personalizado'
      : canalState.procesadorIds[0];
    const customKey = LS.customMedios + '_' + pid;
    const customs = JSON.parse(localStorage.getItem(customKey) || '[]');
    const id = 'custom_' + Date.now();
    customs.push({ id, label: nombre, comision: com, isCustom: true });
    localStorage.setItem(customKey, JSON.stringify(customs));
    // Marcar como checked (uid = pid::id)
    const uid = pid + '::' + id;
    const ck = getCanalMediosChecked();
    ck.add(uid);
    saveCanalMediosChecked(ck);
    $('nuevoMedioNombre').value = '';
    $('nuevoMedioCom').value = '';
    $('canal-add-form').style.display = 'none';
    renderCanalMedios();
    calc();
  });

  // Descargar PDF de lista de medios
  $('exportMediosPdfBtn').addEventListener('click', () => {
    const procNombre = canalState.procesadorIds.length === 1
      ? (PROCESADORES_LOCAL.find((p) => p.id === canalState.procesadorIds[0]) || {}).nombre || ''
      : canalState.procesadorIds.map((pid) => (PROCESADORES_LOCAL.find((p) => p.id === pid) || {}).nombre || pid).join(' + ');
    const base = Calc.precioPublicado(leerInputs());
    if (!base.ok) { toast('Calculá un precio primero para descargar la lista.'); return; }
    const allMedios = getCanalMedios();
    const checked = getCanalMediosChecked();
    const selected = allMedios.filter((m) => checked.has(m.uid) && m.comision !== null);
    if (!selected.length) { toast('No hay medios seleccionados para exportar.'); return; }

    const rows = selected.map((m) => {
      const r = Calc.precioPorMedio(base.precio, m.comision);
      const pct = m.comision === 0 ? 'Sin comisión' : String(m.comision).replace('.', ',') + '%';
      return '<tr><td>' + m.label + '</td><td style="text-align:center">' + pct + '</td>' +
        '<td style="text-align:right;font-weight:700">' + money(r.precio) + '</td></tr>';
    }).join('');

    const fecha = new Date().toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });
    const html = '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/>' +
      '<title>Lista de precios — Costito</title>' +
      '<style>body{font-family:Arial,sans-serif;max-width:480px;margin:24px auto;color:#1a2e22}' +
      'h2{color:#1F8A5B;margin-bottom:4px;font-size:20px}' +
      '.fecha{font-size:13px;color:#666;margin-bottom:16px}' +
      'table{width:100%;border-collapse:collapse;font-size:14px}' +
      'th{background:#f0f7f3;padding:8px 10px;text-align:left;font-weight:700;color:#1a2e22}' +
      'td{padding:8px 10px;border-bottom:1px solid #eee}' +
      'tr:last-child td{border-bottom:none}' +
      '.footer{margin-top:20px;font-size:11px;color:#aaa}' +
      '</style></head><body>' +
      '<h2>Lista de precios</h2>' +
      '<div class="fecha">' + (procNombre ? procNombre + ' · ' : '') + fecha + '</div>' +
      '<table><thead><tr><th>Medio de cobro</th><th style="text-align:center">Comisión</th><th style="text-align:right">Cobrás</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table>' +
      '<div class="footer">Calculado con Costito · costito.online</div>' +
      '</body></html>';

    const w = window.open('', '_blank', 'width=540,height=600');
    if (!w) { toast('Activá las ventanas emergentes para descargar el PDF'); return; }
    w.document.write(html);
    w.document.close();
    setTimeout(() => { try { w.print(); } catch (e) {} }, 300);
  });

  // Plataforma internet
  $('plataforma-sel').addEventListener('change', () => {
    canalState.plataformaId = $('plataforma-sel').value;
    canalState.desvinculado = false;
    updateProcOnlineOptions(true);
    syncCanalUI();
  });

  // Procesador online
  $('proc-online-sel').addEventListener('change', () => {
    canalState.procOnlineId = $('proc-online-sel').value;
    canalState.desvinculado = false;
    syncCanalUI();
  });

  // Comisión manual (desvincula del selector)
  $('comCustom').addEventListener('input', () => {
    canalState.desvinculado = true;
    $('com-desvin-badge').style.display = 'inline';
    calc();
  });

  $('ivaCom').addEventListener('change', calc);
  $('cargoFijoInput').addEventListener('input', calc);
  $('envioInput').addEventListener('input', calc);
  $('iibb').addEventListener('change', () => {
    const isCustom = $('iibb').value === 'custom';
    $('iibbCustomWrap').style.display = isCustom ? '' : 'none';
    if (isCustom) setTimeout(() => $('iibbCustom').focus(), 30);
    calc();
  });
  $('iibbCustom').addEventListener('input', calc);
  // #costo tiene su listener en bindMoneyInput (init); margen se mantiene acá
  $('margen').addEventListener('input', calc);

  // Conversor markup ↔ margen
  $('markupInp').addEventListener('input', () => {
    const markup = parseFloat($('markupInp').value);
    if (!isNaN(markup) && markup >= 0) {
      $('margen').value = Calc.markupAMargen(markup).toFixed(1);
    }
    calc();
  });

  $('goServicios').addEventListener('click', () => document.querySelector('[data-tab="servicios"]').click());

  // Copiar precio
  $('copyBtn').addEventListener('click', () => {
    const precio = symbol() + $('finVal').textContent;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(precio).then(
        () => toast('Precio copiado: ' + precio),
        () => toast('No se pudo copiar')
      );
    } else {
      toast('No se pudo copiar');
    }
  });

  // ============================================================
  // MIS PRODUCTOS (localStorage)
  // ============================================================
  const TAG_ICO = '<svg viewBox="0 0 24 24" fill="none" stroke="var(--verde)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><circle cx="7" cy="7" r="1.4"/></svg>';
  const DEL_ICO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>';

  let catActiva = '';
  let precioTargetProductId = null; // producto pre-seleccionado al abrir el modal desde "Agregar precio"

  function renderCatFilter() {
    const el = $('catFilter');
    if (!el) return;
    const cats = [...new Set(state.productos.map((p) => p.categoria).filter(Boolean))];
    if (cats.length < 2) { el.style.display = 'none'; catActiva = ''; return; }
    el.style.display = 'flex';
    setHTML(el,
      '<button class="cat-pill' + (catActiva === '' ? ' on' : '') + '" data-cat="">Todos</button>' +
      cats.map((c) => '<button class="cat-pill' + (catActiva === c ? ' on' : '') + '" data-cat="' + escapeHtml(c) + '">' + escapeHtml(c) + '</button>').join('')
    );
  }

  const TIPO_TABS = [
    { id: null,          label: 'Todos' },
    { id: 'produccion',  label: '🍞 Producción' },
    { id: 'reventa',     label: '🏪 Reventa' },
    { id: 'servicio',    label: '🔧 Servicio' },
    { id: 'importacion', label: '📦 Importación' },
  ];
  const TIPO_PRECIO_LABEL = { produccion: 'costo/u', servicio: 'precio/hora', importacion: 'costo unit.', reventa: 'a publicar' };
  const TIPO_EMPTY = {
    produccion:  { msg: 'Todavía no tenés productos de producción.', cta: 'Ir a Producción →', tab: 'produccion' },
    reventa:     { msg: 'Todavía no tenés productos de reventa.', cta: 'Ir a Calculadora →', tab: 'calc' },
    servicio:    { msg: 'Todavía no tenés servicios guardados.', cta: 'Ir a Servicios →', tab: 'servicios' },
    importacion: { msg: 'Todavía no tenés productos importados.', cta: 'Ir a Importación →', tab: 'import' },
  };

  function renderTipoTabs() {
    const el = $('prodTipoTabs');
    if (!el) return;
    const loggedIn = window.CostitoAuth && window.CostitoAuth.getUser();
    if (!loggedIn || !state.productos.length) { el.style.display = 'none'; return; }
    const tiposPresentes = new Set(state.productos.map((p) => p.tipo || 'reventa'));
    if (tiposPresentes.size < 2) { el.style.display = 'none'; state.prodTipoActivo = null; return; }
    const visibles = TIPO_TABS.filter((t) => t.id === null || tiposPresentes.has(t.id));
    el.style.display = 'flex';
    setHTML(el, visibles.map((t) =>
      '<button class="tipo-pill' + (state.prodTipoActivo === t.id ? ' on' : '') + '" data-tipo="' + (t.id || '') + '">' + t.label + '</button>'
    ).join(''));
  }

  const TIPO_COSTO_LABEL = { produccion: 'costo/u', servicio: 'costo/hora', importacion: 'costo unit.', reventa: 'costo' };

  function renderProds() {
    const list = $('plist');
    const n = state.productos.length;
    const loggedIn = window.CostitoAuth && window.CostitoAuth.getUser();
    const countEl = $('prodCount');
    const free = loggedIn && !Costito.isPremium();
    const limitTxt = free ? n + '/5 productos' : n + (n === 1 ? ' producto guardado' : ' productos guardados');
    if (countEl) countEl.textContent = loggedIn && n > 0 ? limitTxt : '';

    renderTipoTabs();
    renderCatFilter();

    if (!loggedIn) {
      setHTML(list,
        '<div class="reg-teaser">' +
          '<div class="reg-teaser-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7l8-4 8 4v10l-8 4-8-4z"/><path d="M4 7l8 4 8-4M12 11v10"/></svg></div>' +
          '<h3>Guardá tus precios en la nube</h3>' +
          '<p>Creá tu cuenta gratis y accedé a tu lista de productos desde cualquier dispositivo. Tus precios siempre a mano.</p>' +
          '<button class="reg-teaser-btn">Crear cuenta gratis →</button>' +
        '</div>'
      );
      return;
    }
    if (!n) {
      setHTML(list, '<div class="empty">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7l8-4 8 4v10l-8 4-8-4z"/><path d="M4 7l8 4 8-4M12 11v10"/></svg>' +
        '<div>Todavía no guardaste ningún producto.<br/>Calculá un precio y tocá <b>"Guardar en mis productos"</b>.</div></div>');
      return;
    }

    let pool = state.prodTipoActivo
      ? state.productos.filter((p) => (p.tipo || 'reventa') === state.prodTipoActivo)
      : state.productos;
    const visible = catActiva ? pool.filter((p) => p.categoria === catActiva) : pool;

    if (!visible.length) {
      const info = state.prodTipoActivo && TIPO_EMPTY[state.prodTipoActivo];
      if (info) {
        setHTML(list, '<div class="empty">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7l8-4 8 4v10l-8 4-8-4z"/><path d="M4 7l8 4 8-4M12 11v10"/></svg>' +
          '<div>' + escapeHtml(info.msg) + '<br/>' +
          '<button class="reg-teaser-btn" style="margin-top:12px" data-goto-tab="' + info.tab + '">' + escapeHtml(info.cta) + '</button></div></div>');
      } else {
        setHTML(list, '<div class="empty"><div>No hay productos en esta vista.</div></div>');
      }
      return;
    }

    const showTipoBadge = !state.prodTipoActivo;

    const ADD_ICO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v8M8 12h8"/></svg>';

    setHTML(list, visible.map((p) => {
      const tipo = p.tipo || 'reventa';
      const tipoBadge = showTipoBadge && tipo !== 'reventa'
        ? '<span class="tipo-tag">' + (TIPO_TABS.find((t) => t.id === tipo) || {}).label + '</span>'
        : '';
      const costoLabel = TIPO_COSTO_LABEL[tipo] || 'costo';

      const preciosHtml = (p.precios && p.precios.length)
        ? p.precios.map((pr) =>
            '<div class="prod-precio-row">' +
              '<div class="prod-precio-info">' +
                '<span class="prod-precio-canal">' + escapeHtml(pr.canal) + '</span>' +
                (pr.margen ? '<span class="prod-precio-margen">' + String(pr.margen).replace('.', ',') + '% margen</span>' : '') +
              '</div>' +
              '<span class="prod-precio-val">' + money(pr.precioARS) + '</span>' +
              '<button class="prod-precio-del" data-del-precio="' + pr.id + '" aria-label="Borrar precio">×</button>' +
            '</div>'
          ).join('')
        : '<p class="prod-no-precios">Sin precios de venta aún</p>';

      const hasRecipe = p.tipo === 'produccion' && p.recipeData;
      return '<div class="prod" data-id="' + p.id + '">' +
        '<div class="prod-card-top">' +
          '<span class="pic">' + TAG_ICO + '</span>' +
          '<div class="info">' +
            (p.categoria ? '<span class="cat-tag">' + escapeHtml(p.categoria) + '</span>' : '') +
            tipoBadge +
            '<h4>' + escapeHtml(p.nombre) + (p.codigo ? ' <span class="sku-tag">' + escapeHtml(p.codigo) + '</span>' : '') + '</h4>' +
            '<p>' + costoLabel + ' · ' + money(p.costoARS) +
              ' <button class="prod-edit-ico" data-edit-costo="' + p.id + '" title="Editar costo" aria-label="Editar costo">✏</button>' +
            '</p>' +
          '</div>' +
          '<button class="del" data-del="' + p.id + '" aria-label="Borrar producto">' + DEL_ICO + '</button>' +
        '</div>' +
        '<div class="prod-edit-bar" style="display:none">' +
          '<span class="prod-edit-label">Nuevo costo</span>' +
          '<div class="prod-edit-in"><span>$</span><input type="number" class="prod-edit-input" value="' + p.costoARS + '" inputmode="decimal" /></div>' +
          '<button class="prod-edit-save" data-edit-save="' + p.id + '">Guardar</button>' +
          '<button class="prod-edit-cancel" data-edit-cancel>Cancelar</button>' +
        '</div>' +
        (hasRecipe ? '<button class="prod-recalcular" data-recalcular="' + p.id + '">↻ Recalcular desde insumos actuales</button>' : '') +
        '<div class="prod-precios">' + preciosHtml + '</div>' +
        '<button class="prod-add-precio" data-add-precio="' + p.id + '" data-costo="' + p.costoARS + '">' +
          ADD_ICO + ' Agregar precio de venta' +
        '</button>' +
      '</div>';
    }).join(''));
  }

  $('catFilter').addEventListener('click', (e) => {
    const b = e.target.closest('.cat-pill');
    if (!b) return;
    catActiva = b.dataset.cat;
    renderProds();
  });

  $('prodTipoTabs').addEventListener('click', (e) => {
    const b = e.target.closest('.tipo-pill');
    if (!b) return;
    state.prodTipoActivo = b.dataset.tipo || null;
    catActiva = '';
    renderProds();
  });

  // ============================================================
  // MODAL: guardar producto
  // ============================================================
  let pendingCalcResult = null;
  let pendingServicio = null;
  let pendingProduccion = null;  // costoTotalPorUnidad (number)
  let pendingRecipeData = null;

  const PROD_LIMIT_FREE = 5;
  const CATS_DEFAULT = ['Ropa y calzado','Electrónica','Hogar y deco','Alimentos','Belleza','Deportes','Herramientas','Servicios','Otro'];
  const CATS_LS = 'costito_cats';
  function getCats() { try { return JSON.parse(localStorage.getItem(CATS_LS)) || []; } catch(e) { return []; } }
  function addCat(cat) {
    if (!cat) return;
    const c = getCats();
    if (!CATS_DEFAULT.includes(cat) && !c.includes(cat)) { c.unshift(cat); localStorage.setItem(CATS_LS, JSON.stringify(c.slice(0, 30))); }
  }
  function populateCatList() {
    const dl = $('categoriasData');
    if (!dl) return;
    const all = [...CATS_DEFAULT, ...getCats().filter((c) => !CATS_DEFAULT.includes(c))];
    setHTML(dl, all.map((c) => '<option value="' + escapeHtml(c) + '">').join(''));
  }

  function populateModalLinkSel(preSelectedId) {
    const sel = $('modalLinkSel');
    const wrap = $('modalLinkWrap');
    const newFields = $('modalNewProdFields');
    if (!sel || !wrap) return;
    if (!state.productos.length) {
      wrap.style.display = 'none';
      if (newFields) newFields.style.display = '';
      return;
    }
    wrap.style.display = '';
    setHTML(sel,
      '<option value="">Nuevo producto</option>' +
      state.productos.map((p) => '<option value="' + p.id + '">' + escapeHtml(p.nombre) + '</option>').join('')
    );
    if (preSelectedId) sel.value = preSelectedId;
    function syncFields() {
      const isNew = !sel.value;
      if (newFields) newFields.style.display = isNew ? '' : 'none';
      const titleEl = $('modalTitle');
      const hintEl = $('modalHint');
      if (titleEl) titleEl.textContent = isNew ? 'Guardar precio de venta' : 'Agregar precio de venta';
      if (hintEl) hintEl.textContent = isNew
        ? 'Ingresá el nombre del producto para organizarlo en tu lista.'
        : 'Se va a agregar un precio de venta al producto seleccionado.';
    }
    sel.onchange = syncFields;
    syncFields();
  }

  function showSaveModal() {
    if (!window.CostitoAuth || !window.CostitoAuth.getUser()) {
      toast('Creá una cuenta para guardar tus productos en la nube');
      const authOverlay = $('authOverlay');
      if (authOverlay) { authOverlay.classList.add('on'); setTimeout(() => { const el = $('authEmail'); if (el) el.focus(); }, 60); }
      return;
    }
    const r = Calc.precioPublicado(leerInputs());
    if (!r.ok) return;
    pendingCalcResult = r;
    $('modalNombre').value = '';
    $('modalCategoria').value = '';
    $('modalCodigo').value = '';
    populateCatList();
    populateModalLinkSel(precioTargetProductId);
    precioTargetProductId = null;
    $('saveOverlay').classList.add('on');
    const linkSel = $('modalLinkSel');
    const focusEl = (linkSel && linkSel.value) ? linkSel : $('modalNombre');
    setTimeout(() => focusEl.focus(), 60);
  }

  function closeSaveModal() {
    $('saveOverlay').classList.remove('on');
    pendingCalcResult = null;
    pendingServicio = null;
    pendingProduccion = null;
    pendingRecipeData = null;
    const linkWrap = $('modalLinkWrap');
    if (linkWrap) linkWrap.style.display = 'none';
    const newFields = $('modalNewProdFields');
    if (newFields) newFields.style.display = '';
  }

  function confirmSave() {
    if (!pendingCalcResult && !pendingServicio && !pendingProduccion) return;

    const linkSel = $('modalLinkSel');
    const linkId = (linkSel && linkSel.value) ? linkSel.value : '';
    const isNewProd = !linkId;

    const fallback = pendingProduccion ? 'Producción sin nombre' : pendingServicio ? 'Servicio sin nombre' : 'Producto sin nombre';
    const nombre = ($('modalNombre').value || '').trim() || fallback;
    const categoria = ($('modalCategoria').value || '').trim();
    const codigo = ($('modalCodigo').value || '').trim();
    addCat(categoria);

    if (isNewProd && !Costito.isPremium() && state.productos.length >= PROD_LIMIT_FREE) {
      toast('Llegaste al límite de 5 productos. ¡Pasate a Premium para guardar ilimitados! 🟢');
      return;
    }

    const btn = $('modalConfirm');
    btn.disabled = true;
    closeSaveModal();

    const hoy = new Date().toLocaleDateString('es-AR');

    function buildPriceData() {
      if (pendingServicio) {
        return { canal: 'Servicio por hora', margen: 0, precioARS: pendingServicio.precioHora, ganancia: 0 };
      }
      const canalNom = canalNombreDisplay();
      const margenReal = Math.round(pendingCalcResult.margenReal * 10) / 10;
      return { canal: canalNom, margen: margenReal, precioARS: pendingCalcResult.precio, ganancia: pendingCalcResult.ganancia };
    }

    const hasPrice = !!(pendingCalcResult || pendingServicio);

    // Caso A: agregar precio a producto existente
    if (!isNewProd && hasPrice) {
      const priceData = buildPriceData();
      window.CostitoAuth.savePrecio(linkId, priceData)
        .then((priceId) => {
          const prod = state.productos.find((p) => String(p.id) === linkId);
          if (prod) {
            prod.precios = prod.precios || [];
            prod.precios.push({ id: priceId, canal: priceData.canal, margen: priceData.margen, precioARS: priceData.precioARS, ganancia: priceData.ganancia, fecha: hoy });
          }
          renderProds();
          toast('Precio de venta guardado');
        })
        .catch((err) => toast('Error al guardar: ' + err.message))
        .finally(() => { btn.disabled = false; });
      return;
    }

    // Caso B: nuevo producto
    let prodData;
    if (pendingProduccion) {
      prodData = { nombre, costo: pendingProduccion, tipo: 'produccion', categoria, codigo, canalNombre: 'Producción propia', recipeData: pendingRecipeData };
    } else if (pendingServicio) {
      prodData = { nombre, costo: pendingServicio.costosFijos || 0, tipo: 'servicio', categoria, codigo, canalNombre: 'Servicio por hora' };
    } else {
      const inputs = leerInputs();
      const canalNom = canalNombreDisplay();
      prodData = { nombre, costo: inputs.costo, tipo: 'reventa', categoria, codigo, canalNombre: canalNom, margen: Math.round(pendingCalcResult.margenReal * 10) / 10 };
    }

    window.CostitoAuth.saveProduct(prodData)
      .then((productId) => {
        const newProd = { id: productId, nombre: prodData.nombre, costoARS: prodData.costo, categoria, codigo, tipo: prodData.tipo, recipeData: prodData.recipeData || null, precios: [] };
        state.productos.unshift(newProd);
        if (hasPrice) {
          const priceData = buildPriceData();
          return window.CostitoAuth.savePrecio(productId, priceData).then((priceId) => {
            newProd.precios.push({ id: priceId, canal: priceData.canal, margen: priceData.margen, precioARS: priceData.precioARS, ganancia: priceData.ganancia, fecha: hoy });
          });
        }
      })
      .then(() => {
        renderProds();
        toast(pendingProduccion ? 'Producto guardado' : 'Precio de venta guardado');
      })
      .catch((err) => toast('Error al guardar: ' + err.message))
      .finally(() => { btn.disabled = false; });
  }

  $('addBtn').addEventListener('click', showSaveModal);
  $('modalConfirm').addEventListener('click', confirmSave);
  $('modalCancel').addEventListener('click', closeSaveModal);
  $('saveOverlay').addEventListener('click', (e) => { if (e.target === $('saveOverlay')) closeSaveModal(); });
  $('modalNombre').addEventListener('keydown', (e) => { if (e.key === 'Enter') confirmSave(); });

  // Borrar producto / precio / CTAs (delegación)
  $('plist').addEventListener('click', (e) => {
    if (e.target.closest('.reg-teaser-btn')) {
      const goto = e.target.closest('.reg-teaser-btn').dataset.gotoTab;
      if (goto) { document.querySelector('[data-tab="' + goto + '"]').click(); return; }
      document.getElementById('acctBtn').click();
      return;
    }

    // Editar costo — mostrar barra
    const editIco = e.target.closest('[data-edit-costo]');
    if (editIco) {
      const card = editIco.closest('.prod');
      const bar = card && card.querySelector('.prod-edit-bar');
      if (bar) { bar.style.display = ''; const inp = bar.querySelector('.prod-edit-input'); if (inp) inp.select(); }
      return;
    }

    // Editar costo — cancelar
    if (e.target.closest('[data-edit-cancel]')) {
      const bar = e.target.closest('.prod-edit-bar');
      if (bar) bar.style.display = 'none';
      return;
    }

    // Editar costo — guardar
    const saveEditBtn = e.target.closest('[data-edit-save]');
    if (saveEditBtn) {
      const id = saveEditBtn.dataset.editSave;
      const bar = e.target.closest('.prod-edit-bar');
      const inp = bar && bar.querySelector('.prod-edit-input');
      const newCosto = parseFloat(inp && inp.value) || 0;
      const prod = state.productos.find((p) => String(p.id) === id);
      if (!prod) return;
      window.CostitoAuth.updateProduct(id, { costo: newCosto, recipeData: prod.recipeData })
        .then(() => { prod.costoARS = newCosto; renderProds(); toast('Costo actualizado'); })
        .catch((err) => toast('Error: ' + err.message));
      return;
    }

    // Recalcular costo desde insumos actuales
    const recalcBtn = e.target.closest('[data-recalcular]');
    if (recalcBtn) {
      const id = recalcBtn.dataset.recalcular;
      const prod = state.productos.find((p) => String(p.id) === id);
      if (!prod || !prod.recipeData) return;
      recalcBtn.textContent = '↻ Calculando…';
      recalcBtn.disabled = true;
      window.CostitoAuth.loadInsumos()
        .then((currentInsumos) => {
          const snap = prod.recipeData;
          const updatedInsumos = snap.insumos.map((si) => {
            const cur = currentInsumos.find((ci) =>
              ci.nombre.trim().toLowerCase() === si.nombre.trim().toLowerCase() && ci.unidad === si.unidad
            );
            return cur ? { ...si, precioTotal: cur.precioTotal, cantidadComprada: cur.cantidadComprada } : si;
          });
          const ingParaCalc = snap.receta.map((row) => {
            const ins = updatedInsumos.find((i) => i.id === row.insumoId);
            return ins ? { id: row.id, cantidad: row.cantidadUsada, paqueteCosto: ins.precioTotal, paqueteCantidad: ins.cantidadComprada } : null;
          }).filter(Boolean);
          const result = Calc.costoProduccion({ ingredientes: ingParaCalc, unidades: snap.unidades, gastos: snap.gastos || [] });
          const newCosto = result.costoTotalPorUnidad;
          const newRecipeData = { ...snap, insumos: updatedInsumos };
          return window.CostitoAuth.updateProduct(id, { costo: newCosto, recipeData: newRecipeData })
            .then(() => { prod.costoARS = newCosto; prod.recipeData = newRecipeData; renderProds(); toast('Costo recalculado: ' + money(newCosto)); });
        })
        .catch((err) => { recalcBtn.textContent = '↻ Recalcular desde insumos actuales'; recalcBtn.disabled = false; toast('Error: ' + err.message); });
      return;
    }

    // Borrar solo un precio de venta
    const delPrecioBtn = e.target.closest('[data-del-precio]');
    if (delPrecioBtn) {
      const priceId = delPrecioBtn.dataset.delPrecio;
      window.CostitoAuth.deletePrecio(priceId)
        .then(() => {
          state.productos.forEach((p) => {
            p.precios = (p.precios || []).filter((pr) => String(pr.id) !== priceId);
          });
          renderProds();
          toast('Precio borrado');
        })
        .catch((err) => toast('Error al borrar: ' + err.message));
      return;
    }

    // Borrar producto entero (con todos sus precios, CASCADE en BD)
    const delBtn = e.target.closest('[data-del]');
    if (delBtn) {
      const id = delBtn.dataset.del;
      window.CostitoAuth.deleteProduct(id)
        .then(() => {
          state.productos = state.productos.filter((p) => String(p.id) !== id);
          renderProds();
          toast('Producto borrado');
        })
        .catch((err) => toast('Error al borrar: ' + err.message));
      return;
    }

    // Ir a calculadora para agregar un precio de venta al producto
    const addPrecioBtn = e.target.closest('[data-add-precio]');
    if (addPrecioBtn) {
      precioTargetProductId = addPrecioBtn.dataset.addPrecio;
      const costoARS = parseFloat(addPrecioBtn.dataset.costo) || 0;
      Costito.usarComoCosto(costoARS);
    }
  });

  // ============================================================
  // IMPORTAR (lo usa import.js) — calcula el precio con la config
  // actual de la calculadora y guarda, igual que el alta manual.
  // ============================================================
  window.Costito.importarProducto = function ({ nombre, costo, margen, categoria, tipo = 'reventa' }) {
    const base = leerInputs();
    const r = Calc.precioPublicado({ ...base, costo: Number(costo) || 0, margen: Number(margen) || 0 });
    if (!r.ok) return Promise.reject(new Error(r.motivo || 'No se pudo calcular el precio'));
    const canalNom = canalNombreDisplay();
    const margenReal = Math.round(r.margenReal * 10) / 10;
    const prodData = {
      nombre: nombre || 'Producto sin nombre',
      costo: Number(costo) || 0,
      margen: margenReal,
      canalNombre: canalNom,
      categoria: categoria || '',
      tipo,
    };
    return window.CostitoAuth.saveProduct(prodData).then((productId) => {
      const priceData = { canal: canalNom, margen: margenReal, precioARS: r.precio, ganancia: r.ganancia };
      return window.CostitoAuth.savePrecio(productId, priceData).then((priceId) => {
        const newProd = {
          id: productId, nombre: prodData.nombre, costoARS: prodData.costo,
          categoria: prodData.categoria, codigo: '', tipo,
          recipeData: null,
          precios: [{ id: priceId, canal: canalNom, margen: margenReal, precioARS: r.precio, ganancia: r.ganancia, fecha: new Date().toLocaleDateString('es-AR') }],
        };
        state.productos.unshift(newProd);
        return { ...prodData, precio: r.precio };
      });
    });
  };
  // Datos de la config actual para mostrarlos en el preview del importador
  window.Costito.configActual = () => ({ canal: canalNombreDisplay(), cond: state.condFiscal });
  window.Costito.refreshProds = () => renderProds();
  window.Costito.abrirGuardarServicio = function (r) {
    if (!window.CostitoAuth || !window.CostitoAuth.getUser()) {
      toast('Creá una cuenta para guardar tus servicios en la nube');
      const ao = $('authOverlay');
      if (ao) { ao.classList.add('on'); setTimeout(() => { const el = $('authEmail'); if (el) el.focus(); }, 60); }
      return;
    }
    if (!Costito.isPremium() && state.productos.length >= PROD_LIMIT_FREE) {
      toast('Llegaste al límite de 5 productos. ¡Pasate a Premium para guardar ilimitados! 🟢');
      document.getElementById('acctBtn').click();
      return;
    }
    pendingServicio = r;
    pendingCalcResult = null;
    pendingProduccion = null;
    pendingRecipeData = null;
    $('modalNombre').value = '';
    $('modalCategoria').value = '';
    $('modalCodigo').value = '';
    populateCatList();
    const lw = $('modalLinkWrap'); if (lw) lw.style.display = 'none';
    const nf = $('modalNewProdFields'); if (nf) nf.style.display = '';
    const th = $('modalTitle'); if (th) th.textContent = 'Guardar servicio';
    const mh = $('modalHint'); if (mh) mh.textContent = 'Ingresá el nombre del servicio para organizarlo en tu lista.';
    $('saveOverlay').classList.add('on');
    setTimeout(() => $('modalNombre').focus(), 60);
  };

  window.Costito.abrirGuardarProduccion = function (costoTotal, recipeData) {
    if (!window.CostitoAuth || !window.CostitoAuth.getUser()) {
      toast('Creá una cuenta para guardar tus productos en la nube');
      const ao = $('authOverlay');
      if (ao) { ao.classList.add('on'); setTimeout(() => { const el = $('authEmail'); if (el) el.focus(); }, 60); }
      return;
    }
    if (!Costito.isPremium() && state.productos.length >= PROD_LIMIT_FREE) {
      toast('Llegaste al límite de 5 productos. ¡Pasate a Premium para guardar ilimitados! 🟢');
      document.getElementById('acctBtn').click();
      return;
    }
    pendingProduccion = costoTotal;
    pendingRecipeData = recipeData || null;
    pendingCalcResult = null;
    pendingServicio = null;
    $('modalNombre').value = '';
    $('modalCategoria').value = '';
    $('modalCodigo').value = '';
    populateCatList();
    const lw = $('modalLinkWrap'); if (lw) lw.style.display = 'none';
    const nf = $('modalNewProdFields'); if (nf) nf.style.display = '';
    const th = $('modalTitle'); if (th) th.textContent = 'Guardar producto de producción';
    const mh = $('modalHint'); if (mh) mh.textContent = 'Ingresá el nombre del producto. Desde "Mis productos" podés agregarle precios de venta después.';
    $('saveOverlay').classList.add('on');
    setTimeout(() => $('modalNombre').focus(), 60);
  };

  // ============================================================
  // EXPORTAR
  // ============================================================
  $('expCsv').addEventListener('click', () => {
    if (!state.productos.length) return toast('No hay productos para exportar');
    const rows = [['Producto', 'Canal de venta', 'Margen', 'Precio de venta (ARS)', 'Costo (ARS)']].concat(
      state.productos.flatMap((p) =>
        (p.precios && p.precios.length)
          ? p.precios.map((pr) => [p.nombre, pr.canal, (pr.margen || 0) + '%', Math.round(pr.precioARS), Math.round(p.costoARS)])
          : [[p.nombre, '—', '—', '—', Math.round(p.costoARS)]]
      )
    );
    const csv = rows.map((r) => r.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'costito-productos.csv';
    a.click();
    URL.revokeObjectURL(url);
    toast('Excel (CSV) descargado');
  });

  $('expPdf').addEventListener('click', printProductosPdf);

  $('shareWa').addEventListener('click', () => {
    const visible = catActiva ? state.productos.filter((p) => p.categoria === catActiva) : state.productos;
    if (!visible.length) return toast('No hay productos para compartir');

    const negocio = window.CostitoNegocio ? window.CostitoNegocio.get() : { nombre: '' };
    const titulo = negocio.nombre ? '🏷️ *Lista de precios — ' + negocio.nombre + '*' : '🏷️ *Lista de precios*';

    // Agrupar por categoría, sin categoría al final
    const groups = {};
    visible.forEach((p) => {
      const cat = p.categoria || '';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(p);
    });
    const cats = Object.keys(groups).sort((a, b) => a === '' ? 1 : b === '' ? -1 : a.localeCompare(b));
    const multiCat = cats.some((c) => c !== '');

    const lines = [titulo, ''];
    cats.forEach((cat) => {
      if (multiCat && cat) lines.push('*' + cat + '*');
      groups[cat].forEach((p) => {
        if (!p.precios || !p.precios.length) {
          lines.push('▸ ' + p.nombre + ' (costo: ' + money(p.costoARS) + ')');
        } else if (p.precios.length === 1) {
          lines.push('▸ ' + p.nombre + ' · ' + money(p.precios[0].precioARS));
        } else {
          lines.push('▸ *' + p.nombre + '*');
          p.precios.forEach((pr) => lines.push('  · ' + pr.canal + ': ' + money(pr.precioARS)));
        }
      });
      if (multiCat && cat) lines.push('');
    });
    lines.push('');
    lines.push('📅 ' + new Date().toLocaleDateString('es-AR') + ' · costito.online');

    window.open('https://wa.me/?text=' + encodeURIComponent(lines.join('\n')), '_blank');
  });

  // ============================================================
  // PDF FORMATEADO — Mis productos
  // ============================================================
  function printProductosPdf() {
    if (!state.productos.length) return toast('No hay productos para exportar');
    const date = new Date().toLocaleDateString('es-AR');
    const rows = state.productos.flatMap((p) => {
      if (!p.precios || !p.precios.length) {
        return ['<tr><td><div class="n">' + escapeHtml(p.nombre) + '</div><div class="d">Costo: ' + money(p.costoARS) + '</div></td><td class="pr">—</td></tr>'];
      }
      return p.precios.map((pr, i) =>
        '<tr><td>' +
        (i === 0 ? '<div class="n">' + escapeHtml(p.nombre) + '</div>' : '') +
        '<div class="d">' + escapeHtml(pr.canal) + (pr.margen ? ' · ' + String(pr.margen).replace('.', ',') + '% margen' : '') + '</div></td>' +
        '<td class="pr">' + money(pr.precioARS) + '</td></tr>'
      );
    }).join('');
    const neg = (window.CostitoNegocio && window.CostitoNegocio.get) ? window.CostitoNegocio.get() : { nombre: '', logo: '' };
    const header = (neg.logo || neg.nombre)
      ? '<div class="biz">' + (neg.logo ? '<img class="bizlogo" src="' + neg.logo + '">' : '') +
        '<div><div class="bizname">' + escapeHtml(neg.nombre || 'Mi negocio') + '</div>' +
        '<div class="sub">Lista de precios · ' + date + '</div></div></div>'
      : '<div class="logo">Costito</div><div class="sub">Lista de productos · ' + date + '</div>';
    const html = '<!DOCTYPE html><html lang="es-AR"><head><meta charset="UTF-8">' +
      '<title>Costito — Mis Productos</title><style>' +
      'body{font-family:Arial,Helvetica,sans-serif;max-width:680px;margin:30px auto;color:#19271F}' +
      '.logo{font-size:22px;font-weight:700;color:#1F8A5B;margin-bottom:2px}' +
      '.sub{color:#5E7268;font-size:12px;margin-bottom:22px}' +
      '.biz{display:flex;align-items:center;gap:13px;margin-bottom:22px}' +
      '.bizlogo{width:56px;height:56px;object-fit:contain}' +
      '.bizname{font-size:21px;font-weight:700;color:#19271F}' +
      '.biz .sub{margin:2px 0 0}' +
      'table{width:100%;border-collapse:collapse}' +
      'th{background:#1F8A5B;color:#fff;padding:10px 14px;text-align:left;font-size:12px;font-weight:600}' +
      'th:last-child{text-align:right}' +
      'td{padding:11px 14px;border-bottom:1px solid #E9F5EE;vertical-align:top}' +
      '.n{font-weight:700;font-size:14px}.d{color:#5E7268;font-size:11px;margin-top:2px}' +
      '.pr{text-align:right;font-weight:700;color:#1F8A5B;font-size:15px;white-space:nowrap}' +
      'footer{margin-top:28px;color:#5E7268;font-size:11px;text-align:center;' +
      'border-top:1px solid #CBE5D6;padding-top:10px}' +
      '@media print{body{margin:10px}}' +
      '</style></head><body>' +
      header +
      '<table><thead><tr><th>Producto</th><th>Precio</th></tr></thead><tbody>' + rows + '</tbody></table>' +
      '<footer>Calculado con Costito · costito.online</footer>' +
      '</body></html>';
    abrirVentanaPdf(html);
  }

  // ============================================================
  // CONVERSOR MARKUP ↔ MARGEN
  // ============================================================
  function updateMarkupConv() {
    const margen = parseFloat($('margen').value) || 0;
    if (margen <= 0 || margen >= 100) {
      if (document.activeElement !== $('markupInp')) $('markupInp').value = '';
      $('convMult').textContent = '—× el costo';
      return;
    }
    const markup = Calc.margenAMarkup(margen);
    const mult = 1 + markup / 100;
    if (document.activeElement !== $('markupInp')) {
      $('markupInp').value = markup.toFixed(1);
    }
    $('convMult').textContent = mult.toFixed(2).replace('.', ',') + '× el costo';
  }

  // ============================================================
  // COMPARATIVA DE CANALES
  // ============================================================
  function renderComparacion() {
    const ins = leerInputs();
    let prevGrupo = null;
    setHTML($('compRows'), COMPARACION.map((item) => {
      let header = '';
      if (item.grupo !== prevGrupo) {
        prevGrupo = item.grupo;
        header = '<tr class="comp-group"><td colspan="3">' + item.grupo + '</td></tr>';
      }
      const r = Calc.precioPublicado({ ...ins, comEfectiva: item.comEfectiva });
      if (!r.ok) return header + '<tr><td>' + item.nombre + '</td><td colspan="2">—</td></tr>';
      const lossClass = r.ganancia < 0 ? ' class="comp-loss"' : '';
      return header +
        '<tr><td>' + item.nombre + '</td>' +
        '<td class="comp-price">' + money(r.precio) + '</td>' +
        '<td class="comp-price' + (r.ganancia < 0 ? ' comp-loss' : '') + '">' + money(r.ganancia) + '</td></tr>';
    }).join(''));
  }

  function abrirVentanaPdf(html) {
    const w = window.open('', '_blank', 'width=740,height=820');
    if (!w) return toast('Activá las ventanas emergentes para guardar el PDF');
    w.document.write(html);
    w.document.close();
    setTimeout(() => { try { w.print(); } catch (e) {} }, 350);
  }

  // ============================================================
  // PREMIUM: botón WhatsApp del tab Productos
  // (las calculadoras Premium y sus gates viven en premium.js)
  // ============================================================
  // waBtn removido — upsell Premium reemplazado por teaser de cuenta cloud

  // ============================================================
  // TOAST
  // ============================================================
  const toastEl = $('toast');
  let toastTimer;
  function toast(msg) {
    $('toastMsg').textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2200);
  }
  window.costitoToast = toast;

  // ============================================================
  // INIT
  // ============================================================
  function checkComisionesStale() {
    const meta = D.comisionesMetadata;
    if (!meta) return;
    const days = (Date.now() - new Date(meta.lastVerified)) / 86400000;
    const badge = $('comStale');
    if (badge) badge.style.display = days > meta.alertThresholdDays ? 'inline-flex' : 'none';
  }

  // Formateo automático de campos de monto al perder el foco
  function bindMoneyInput(id, onInput) {
    const el = $(id);
    el.addEventListener('blur', () => {
      const v = parseNum(el.value);
      el.value = v > 0 ? v.toLocaleString('es-AR') : '';
    });
    el.addEventListener('focus', () => {
      const v = parseNum(el.value);
      if (v > 0) el.value = String(v);
    });
    if (onInput) el.addEventListener('input', onInput);
  }
  bindMoneyInput('costo', calc);
  bindMoneyInput('gananciaARS', calc);
  // Valores iniciales con formato
  $('costo').value = (10000).toLocaleString('es-AR');

  // Restaurar condición fiscal guardada
  if (state.condFiscal !== 'mono') {
    document.querySelectorAll('#condFiscalSeg button').forEach((b) => {
      b.classList.toggle('on', b.dataset.cond === state.condFiscal);
    });
    $('ivaProvField').style.display = 'none';
    $('riNota').style.display = '';
  }

  buildControls();
  initPromoBar();
  initHero();
  updateGuestCta(null);
  initHelpBanners();
  checkComisionesStale();
  if (state.cur === 'USD') {
    document.querySelectorAll('#cur button').forEach((x) => x.classList.toggle('on', x.dataset.cur === 'USD'));
    $('pre1').textContent = $('finCur').textContent = symbol();
    $('dolarBar').style.display = 'flex';
  }
  updateDolarBar();   // pinta desde cache al instante
  fetchDolares();     // y refresca en segundo plano
  calc();
  renderProds();
  updateTabFades();

  // Sincronizar plan premium y productos con Supabase cuando cambia la sesión
  document.addEventListener('costito:authchange', (e) => {
    const user = e.detail;
    updateGuestCta(user);
    Costito.setPremium(user && user.plan === 'premium');
    if (user) {
      window.CostitoAuth.loadProducts()
        .then((prods) => { state.productos = prods; renderProds(); })
        .catch(() => {});
    } else {
      state.productos = [];
      renderProds();
    }
  });
})();
