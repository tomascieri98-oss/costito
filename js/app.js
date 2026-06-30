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
  // Render de markup confiable / ya escapado (limpia y vuelve a insertar)
  const setHTML = (el, html) => { el.textContent = ''; el.insertAdjacentHTML('beforeend', html); };

  // Claves de localStorage
  const LS = {
    theme: 'costito_theme', cur: 'costito_cur', prods: 'costito_productos', procs: 'costito_procs',
    dolarTipo: 'costito_dolar_tipo', dolarCache: 'costito_dolar_cache', condFiscal: 'costito_cond_fiscal',
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
    $('pre2').textContent = symbol();
    $('finCur').textContent = symbol();
    $('dolarBar').style.display = state.cur === 'USD' ? 'flex' : 'none';
    calc(); medios(); renderProds();
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
        if (state.cur === 'USD') { calc(); medios(); renderProds(); document.dispatchEvent(new CustomEvent('costito:rerender')); }
      })
      .catch(() => { updateDolarBar(); }); // si falla, queda el cache o el fallback
  }

  // El cliente elige QUÉ dólar usar (el valor no se toca a mano)
  $('dolarTipo').addEventListener('change', function () {
    state.dolarTipo = this.value;
    localStorage.setItem(LS.dolarTipo, state.dolarTipo);
    updateDolarBar();
    calc(); medios(); renderProds();
    document.dispatchEvent(new CustomEvent('costito:rerender'));
  });

  // ============================================================
  // ESTADO DEL CANAL (calculadora principal)
  // ============================================================
  const canalState = {
    tipo: 'local',
    procesadorId: PROCESADORES_LOCAL[0].id,
    medioId: PROCESADORES_LOCAL[0].medios[0].id,
    plataformaId: PLATAFORMAS_INTERNET[0].id,
    procOnlineId: null,
    desvinculado: false,
  };

  // Estado del selector de canal en la tab Medios de pago
  const mediosState = {
    tipo: 'local',
    selectedProcIds: JSON.parse(localStorage.getItem(LS.procs) || 'null') || [PROCESADORES_LOCAL[0].id],
    plataformaId: PLATAFORMAS_INTERNET[0].id,
    procOnlineId: null,
  };

  function comisionComputada(cs) {
    if (cs.tipo === 'local') {
      const proc = PROCESADORES_LOCAL.find((p) => p.id === cs.procesadorId);
      if (!proc) return 0;
      const medio = proc.medios.find((m) => m.id === cs.medioId) || proc.medios[0];
      return medio ? medio.comision : 0;
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
      const proc = PROCESADORES_LOCAL.find((p) => p.id === canalState.procesadorId);
      const medio = proc && (proc.medios.find((m) => m.id === canalState.medioId) || proc.medios[0]);
      return (proc ? proc.nombre : 'Local') + (medio ? ' · ' + medio.label : '');
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

    // Procesadores locales (calc tab)
    setHTML($('procesador-sel'), PROCESADORES_LOCAL.map((p) =>
      '<option value="' + p.id + '">' + p.nombre + '</option>'
    ).join(''));
    // Sincronizar canalState con el valor real del select (puede estar restaurado por el browser)
    if ($('procesador-sel').value) {
      canalState.procesadorId = $('procesador-sel').value;
      resetMedioLocal();
    }

    // Plataformas internet (calc tab)
    setHTML($('plataforma-sel'), PLATAFORMAS_INTERNET.map((p) =>
      '<option value="' + p.id + '">' + p.nombre + '</option>'
    ).join(''));
    updateProcOnlineOptions(false);

    // Medios tab — procesadores (checkboxes multi-select)
    setHTML($('m-proc-checks'), PROCESADORES_LOCAL.map((p) => {
      const on = mediosState.selectedProcIds.includes(p.id);
      return '<label class="proc-check' + (on ? ' on' : '') + '">' +
        '<input type="checkbox" value="' + p.id + '"' + (on ? ' checked' : '') + ' />' +
        '<span>' + p.nombre + '</span></label>';
    }).join(''));

    // Medios tab — plataformas
    setHTML($('m-plataforma-sel'), PLATAFORMAS_INTERNET.map((p) =>
      '<option value="' + p.id + '">' + p.nombre + '</option>'
    ).join(''));
    updateMProcOnlineOptions(false);

    // Tipo de dólar (cotización en vivo)
    setHTML($('dolarTipo'), D.dolar.tipos
      .map((t) => '<option value="' + t.id + '"' + (t.id === state.dolarTipo ? ' selected' : '') + '>' + t.nombre + '</option>')
      .join(''));

    $('comDate').textContent = 'Comisiones de ' + D.comisionesActualizadas;

    syncCanalUI();
    syncMediosUI();
  }

  function resetMedioLocal() {
    const proc = PROCESADORES_LOCAL.find((p) => p.id === canalState.procesadorId) || PROCESADORES_LOCAL[0];
    if (proc && proc.medios.length) canalState.medioId = proc.medios[0].id;
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

  function updateMProcOnlineOptions(reset) {
    const plat = PLATAFORMAS_INTERNET.find((p) => p.id === mediosState.plataformaId) || PLATAFORMAS_INTERNET[0];
    const show = plat && plat.submodo && plat.procesadores_online && plat.procesadores_online.length > 0;
    $('m-proc-online-field').style.display = show ? '' : 'none';
    if (!show) return;
    setHTML($('m-proc-online-sel'), plat.procesadores_online.map((p) =>
      '<option value="' + p.id + '">' + p.label + '</option>'
    ).join(''));
    if (reset || !mediosState.procOnlineId) {
      mediosState.procOnlineId = plat.procesadores_online[0].id;
    }
  }

  function syncCanalUI() {
    const tipo = canalState.tipo;
    $('canal-local-wrap').style.display = tipo === 'local' ? '' : 'none';
    $('canal-internet-wrap').style.display = tipo === 'internet' ? '' : 'none';

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
      const proc = PROCESADORES_LOCAL.find((p) => p.id === canalState.procesadorId);
      $('procesador-nota').textContent = proc ? proc.nota || '' : '';
      $('plataforma-nota').textContent = '';
    } else {
      $('procesador-nota').textContent = '';
      const plat = PLATAFORMAS_INTERNET.find((p) => p.id === canalState.plataformaId);
      $('plataforma-nota').textContent = plat ? plat.nota || '' : '';
    }

    calc();
  }

  function syncMediosUI() {
    $('m-canal-local-wrap').style.display = mediosState.tipo === 'local' ? '' : 'none';
    $('m-canal-internet-wrap').style.display = mediosState.tipo === 'internet' ? '' : 'none';

    // Nota contextual para medios
    if (mediosState.tipo === 'local') {
      const n = mediosState.selectedProcIds.length;
      if (n > 1) {
        $('m-canal-nota').textContent = n + ' procesadores seleccionados — la tabla los combina.';
      } else {
        const proc = PROCESADORES_LOCAL.find((p) => p.id === mediosState.selectedProcIds[0]);
        $('m-canal-nota').textContent = proc ? proc.nota || '' : '';
      }
    } else {
      const plat = PLATAFORMAS_INTERNET.find((p) => p.id === mediosState.plataformaId);
      $('m-canal-nota').textContent = plat ? plat.nota || '' : '';
    }

    medios();
  }

  // ============================================================
  // CALCULADORA PRINCIPAL
  // ============================================================
  function comNominal() {
    return parseFloat($('comCustom').value) || 0;
  }
  function leerInputs() {
    const costo = parseNum($('costo').value);
    const comEfectiva = Calc.comisionEfectiva(comNominal(), $('ivaCom').checked);
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
      $('verMediosBtn').disabled = true;
      return;
    }
    $('addBtn').disabled = false;
    $('addBtn').style.opacity = 1;
    $('verMediosBtn').disabled = false;

    $('finVal').textContent = fmt(conv(r.precio));
    setHTML($('ganNote'), 'Con esto ganás <b>' + money(r.ganancia) + ' limpios</b> por unidad.');
    $('bCostoLabel').textContent = r.esRI ? 'Tu costo neto' : 'Te costó (con IVA)';
    $('bCosto').textContent = money(r.costoConIva);
    const hasCostosExtra = (r.costosFijos || 0) > 0;
    $('bCostosExtraRow').style.display = hasCostosExtra ? '' : 'none';
    if (hasCostosExtra) $('bCostosExtra').textContent = '– ' + money(r.costosFijos);
    $('bCom').textContent = '– ' + money(r.comAmt);
    $('bIibb').textContent = '– ' + money(r.iibbAmt);
    $('bGan').textContent = '+ ' + money(r.ganancia);
    $('bNetRow').style.display = r.esRI ? '' : 'none';
    $('bIvaRow').style.display = r.esRI ? '' : 'none';
    if (r.esRI) {
      $('bPrecioNeto').textContent = money(r.precioNeto);
      $('bIvaLabel').textContent = 'IVA a cobrar (' + r.ivaVenta + '%)';
      $('bIvaVenta').textContent = '+ ' + money(r.ivaVentaAmt);
    }
    $('bTotal').textContent = money(r.precio);
    if (state.modoGanancia === 'ars') {
      $('ganEquiv').textContent = '≡ ' + r.margenReal.toFixed(1).replace('.', ',') + '% de margen sobre el precio';
    }
    updateMarkupConv();
    renderComparacion();
    renderCanalMedios();
  }

  function renderCanalMedios() {
    const list = $('canal-medios-list');
    if (!list || canalState.tipo !== 'local') {
      if (list) list.style.display = 'none';
      return;
    }
    const proc = PROCESADORES_LOCAL.find((p) => p.id === canalState.procesadorId);
    if (!proc || !proc.medios.length) { list.style.display = 'none'; return; }
    list.style.display = '';
    const baseInputs = leerInputs();
    const rows = proc.medios.map((m) => {
      const isOn = m.id === canalState.medioId;
      const comDisp = m.comision === null ? '—'
        : m.comision === 0 ? 'Sin comisión'
        : String(m.comision).replace('.', ',') + '%';
      let precioStr = '—';
      if (m.comision !== null) {
        const r = Calc.precioPublicado({ ...baseInputs, comEfectiva: m.comision });
        if (r.ok) precioStr = money(r.precio);
      } else if (m.editable) {
        const r = Calc.precioPublicado(baseInputs);
        if (r.ok) precioStr = money(r.precio);
      }
      return '<div class="canal-medio-row' + (isOn ? ' on' : '') + '" data-mid="' + m.id + '">' +
        '<div><div class="canal-medio-name">' + m.label + '</div>' +
        '<div class="canal-medio-com">' + comDisp + '</div></div>' +
        '<div class="canal-medio-price">' + precioStr + '</div>' +
        '</div>';
    }).join('');
    setHTML(list, rows);
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

  // Procesador local
  $('procesador-sel').addEventListener('change', () => {
    canalState.procesadorId = $('procesador-sel').value;
    canalState.desvinculado = false;
    resetMedioLocal();
    syncCanalUI();
  });

  // Delegado de click para la lista de medios inline del canal
  $('canal-medios-list').addEventListener('click', (e) => {
    const row = e.target.closest('.canal-medio-row');
    if (!row) return;
    const proc = PROCESADORES_LOCAL.find((p) => p.id === canalState.procesadorId);
    if (!proc) return;
    const medio = proc.medios.find((m) => m.id === row.dataset.mid);
    if (!medio) return;
    canalState.medioId = medio.id;
    canalState.desvinculado = false;
    if (medio.comision !== null) {
      $('comCustom').value = medio.comision;
      $('com-desvin-badge').style.display = 'none';
    }
    calc();
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

  // Ver en Medios de pago: manda el precio SIN comisión de canal para evitar doble comisión
  $('goServicios').addEventListener('click', () => document.querySelector('[data-tab="servicios"]').click());

  $('verMediosBtn').addEventListener('click', () => {
    const inputs = leerInputs();
    if (!Calc.precioPublicado(inputs).ok) return;
    // Precio base = costo + IVA + margen + IIBB, sin comisión de canal
    const rBase = Calc.precioPublicado({ ...inputs, comEfectiva: 0 });
    const baseInput = $('base');
    baseInput.value = Math.round(rBase.precio).toLocaleString('es-AR');
    baseInput.dispatchEvent(new Event('input'));
    document.querySelector('[data-tab="medios"]').click();
    setTimeout(() => baseInput.focus(), 80);
  });

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
  // MEDIOS DE PAGO
  // ============================================================
  function medios() {
    const base = parseNum($('base').value);
    let items = [];

    if (mediosState.tipo === 'local') {
      let selectedProcs = PROCESADORES_LOCAL.filter((p) => mediosState.selectedProcIds.includes(p.id));
      if (!selectedProcs.length) selectedProcs = [PROCESADORES_LOCAL[0]];
      const showHeader = selectedProcs.length > 1;
      const rows = [];
      selectedProcs.forEach((proc) => {
        if (showHeader) rows.push({ header: proc.nombre });
        proc.medios.forEach((m) => rows.push({ label: m.label, comision: m.comision, isBase: m.comision === 0 }));
      });
      setHTML($('mediosBody'), rows.map((m) => {
        if (m.header) return '<tr class="proc-header"><td colspan="3">' + m.header + '</td></tr>';
        if (m.comision === null) {
          return '<tr><td>' + m.label + '</td><td>—</td>' +
            '<td style="color:var(--tinta-soft);font-size:12px">Ingresá la comisión</td></tr>';
        }
        const res = Calc.precioPorMedio(base, m.comision);
        const pct = m.comision > 0 ? String(m.comision).replace('.', ',') + '%' : '—';
        const reca = res.recargo > 0 ? '<div class="reca">+' + res.recargo.toFixed(1).replace('.', ',') + '%</div>' : '';
        return '<tr class="' + (m.isBase ? 'base' : '') + '">' +
          '<td><div class="m">' + m.label + '</div></td>' +
          '<td><span class="pct">' + pct + '</span></td>' +
          '<td><div class="price">' + money(res.precio) + '</div>' + reca + '</td></tr>';
      }).join(''));
      return;
    } else {
      const plat = PLATAFORMAS_INTERNET.find((p) => p.id === mediosState.plataformaId) || PLATAFORMAS_INTERNET[0];
      if (plat.submodo && plat.procesadores_online) {
        const proc = plat.procesadores_online.find((p) => p.id === mediosState.procOnlineId)
          || plat.procesadores_online[0];
        const total = proc && proc.comision !== null ? (plat.comision_base || 0) + proc.comision : null;
        items = [{ label: plat.nombre + (proc ? ' + ' + proc.label : ''), comision: total }];
      } else {
        items = [{ label: plat.nombre, comision: plat.editable ? null : plat.comision_base }];
      }
    }

    setHTML($('mediosBody'), items.map((m) => {
      if (m.comision === null) {
        return '<tr><td colspan="3" style="color:var(--tinta-soft);font-size:13px;padding:12px 0">Ingresá la comisión en el campo de arriba para calcular el precio.</td></tr>';
      }
      const res = Calc.precioPorMedio(base, m.comision);
      const pct = m.comision > 0 ? String(m.comision).replace('.', ',') + '%' : '—';
      const reca = res.recargo > 0 ? '<div class="reca">+' + res.recargo.toFixed(1).replace('.', ',') + '%</div>' : '';
      return '<tr class="' + (m.isBase ? 'base' : '') + '">' +
        '<td><div class="m">' + m.label + '</div></td>' +
        '<td><span class="pct">' + pct + '</span></td>' +
        '<td><div class="price">' + money(res.precio) + '</div>' + reca + '</td></tr>';
    }).join(''));
  }

  $('base').addEventListener('input', medios);

  // Medios tab — canal tipo
  $('m-canal-tipo-seg').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || !b.dataset.tipo) return;
    mediosState.tipo = b.dataset.tipo;
    document.querySelectorAll('#m-canal-tipo-seg button').forEach((x) => x.classList.remove('on'));
    b.classList.add('on');
    $('m-canal-local-wrap').style.display = mediosState.tipo === 'local' ? '' : 'none';
    $('m-canal-internet-wrap').style.display = mediosState.tipo === 'internet' ? '' : 'none';
    syncMediosUI();
  });

  // Medios tab — checkboxes de procesadores (multi-select)
  $('m-proc-checks').addEventListener('change', (e) => {
    const cb = e.target.closest('input[type=checkbox]');
    if (!cb) return;
    cb.closest('label').classList.toggle('on', cb.checked);
    const checked = Array.from($('m-proc-checks').querySelectorAll('input:checked')).map((el) => el.value);
    // Asegurar al menos uno seleccionado
    if (!checked.length) {
      cb.checked = true;
      cb.closest('label').classList.add('on');
      checked.push(cb.value);
    }
    mediosState.selectedProcIds = checked;
    localStorage.setItem(LS.procs, JSON.stringify(checked));
    syncMediosUI();
  });

  // Medios tab — plataforma internet
  $('m-plataforma-sel').addEventListener('change', () => {
    mediosState.plataformaId = $('m-plataforma-sel').value;
    updateMProcOnlineOptions(true);
    syncMediosUI();
  });

  // Medios tab — procesador online
  $('m-proc-online-sel').addEventListener('change', () => {
    mediosState.procOnlineId = $('m-proc-online-sel').value;
    syncMediosUI();
  });

  // ============================================================
  // MIS PRODUCTOS (localStorage)
  // ============================================================
  const TAG_ICO = '<svg viewBox="0 0 24 24" fill="none" stroke="var(--verde)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><circle cx="7" cy="7" r="1.4"/></svg>';
  const DEL_ICO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>';

  let catActiva = '';

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

    // Filter by tipo and then by category
    let pool = state.prodTipoActivo
      ? state.productos.filter((p) => (p.tipo || 'reventa') === state.prodTipoActivo)
      : state.productos;
    const visible = catActiva ? pool.filter((p) => p.categoria === catActiva) : pool;

    // Empty state when tipo filter active but no products of that type
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
    setHTML(list, visible.map((p) => {
      const tipo = p.tipo || 'reventa';
      const tipoBadge = showTipoBadge && tipo !== 'reventa'
        ? '<span class="tipo-tag">' + (TIPO_TABS.find((t) => t.id === tipo) || {}).label + '</span>'
        : '';
      const prLabel = TIPO_PRECIO_LABEL[tipo] || 'a publicar';
      return '<div class="prod" data-id="' + p.id + '">' +
        '<span class="pic">' + TAG_ICO + '</span>' +
        '<div class="info">' +
          (p.categoria ? '<span class="cat-tag">' + escapeHtml(p.categoria) + '</span>' : '') +
          tipoBadge +
          '<h4>' + escapeHtml(p.nombre) + (p.codigo ? ' <span class="sku-tag">' + escapeHtml(p.codigo) + '</span>' : '') + '</h4>' +
          '<p>' + escapeHtml(p.sub) + '</p>' +
        '</div>' +
        '<div class="pr">' +
          '<div style="text-align:right"><div class="n">' + money(p.precioARS) + '</div><div class="s">' + prLabel + '</div></div>' +
          '<button class="del" data-del="' + p.id + '" aria-label="Borrar">' + DEL_ICO + '</button>' +
        '</div></div>';
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

  function showSaveModal() {
    if (!window.CostitoAuth || !window.CostitoAuth.getUser()) {
      toast('Creá una cuenta para guardar tus productos en la nube');
      const authOverlay = $('authOverlay');
      if (authOverlay) { authOverlay.classList.add('on'); setTimeout(() => { const el = $('authEmail'); if (el) el.focus(); }, 60); }
      return;
    }
    if (!Costito.isPremium() && state.productos.length >= PROD_LIMIT_FREE) {
      toast('Llegaste al límite de 5 productos. ¡Pasate a Premium para guardar ilimitados! 🟢');
      const btn = document.getElementById('goPremium');
      if (btn) btn.closest('.acct-wrap') && document.getElementById('acctBtn').click();
      return;
    }
    const r = Calc.precioPublicado(leerInputs());
    if (!r.ok) return;
    pendingCalcResult = r;
    $('modalNombre').value = '';
    $('modalCategoria').value = '';
    $('modalCodigo').value = '';
    populateCatList();
    $('saveOverlay').classList.add('on');
    setTimeout(() => $('modalNombre').focus(), 60);
  }

  function closeSaveModal() {
    $('saveOverlay').classList.remove('on');
    pendingCalcResult = null;
    pendingServicio = null;
    pendingProduccion = null;
    pendingRecipeData = null;
  }

  function confirmSave() {
    if (!pendingCalcResult && !pendingServicio && !pendingProduccion) return;
    const fallback = pendingProduccion ? 'Producción sin nombre' : pendingServicio ? 'Servicio sin nombre' : 'Producto sin nombre';
    const nombre = $('modalNombre').value.trim() || fallback;
    const categoria = ($('modalCategoria').value || '').trim();
    const codigo = ($('modalCodigo').value || '').trim();
    addCat(categoria);
    let prod;
    if (pendingProduccion) {
      prod = {
        nombre,
        sub: ['Costo de producción', new Date().toLocaleDateString('es-AR')].join(' · '),
        precioARS: pendingProduccion,
        ganancia: 0,
        costo: pendingProduccion,
        margen: 0,
        canalNombre: 'Producción propia',
        categoria,
        codigo,
        tipo: 'produccion',
        recipeData: pendingRecipeData,
      };
    } else if (pendingServicio) {
      const r = pendingServicio;
      prod = {
        nombre,
        sub: ['Servicio por hora', new Date().toLocaleDateString('es-AR')].join(' · '),
        precioARS: r.precioHora,
        ganancia: 0,
        costo: r.costosFijos || 0,
        margen: 0,
        canalNombre: 'Servicio por hora',
        categoria,
        codigo,
        tipo: 'servicio',
      };
    } else {
      const inputs = leerInputs();
      const canalNom = canalNombreDisplay();
      const margenGuardar = Math.round(pendingCalcResult.margenReal * 10) / 10;
      prod = {
        nombre,
        sub: [canalNom, 'margen ' + margenGuardar + '%', new Date().toLocaleDateString('es-AR')].join(' · '),
        precioARS: pendingCalcResult.precio,
        ganancia: pendingCalcResult.ganancia,
        costo: inputs.costo,
        margen: margenGuardar,
        canalNombre: canalNom,
        categoria,
        codigo,
        tipo: 'reventa',
      };
    }
    const btn = $('modalConfirm');
    btn.disabled = true;
    closeSaveModal();
    window.CostitoAuth.saveProduct(prod)
      .then((id) => {
        state.productos.unshift({ id, nombre: prod.nombre, sub: prod.sub, precioARS: prod.precioARS, ganancia: prod.ganancia, categoria, codigo, tipo: prod.tipo || 'reventa' });
        renderProds();
        toast('Guardado en mis productos');
      })
      .catch((err) => toast('Error al guardar: ' + err.message))
      .finally(() => { btn.disabled = false; });
  }

  $('addBtn').addEventListener('click', showSaveModal);
  $('modalConfirm').addEventListener('click', confirmSave);
  $('modalCancel').addEventListener('click', closeSaveModal);
  $('saveOverlay').addEventListener('click', (e) => { if (e.target === $('saveOverlay')) closeSaveModal(); });
  $('modalNombre').addEventListener('keydown', (e) => { if (e.key === 'Enter') confirmSave(); });

  // Borrar producto / CTAs (delegación)
  $('plist').addEventListener('click', (e) => {
    if (e.target.closest('.reg-teaser-btn')) {
      const goto = e.target.closest('.reg-teaser-btn').dataset.gotoTab;
      if (goto) { document.querySelector('[data-tab="' + goto + '"]').click(); return; }
      document.getElementById('acctBtn').click();
      return;
    }
    const b = e.target.closest('[data-del]');
    if (!b) return;
    const id = b.dataset.del;
    window.CostitoAuth.deleteProduct(id)
      .then(() => {
        state.productos = state.productos.filter((p) => String(p.id) !== id);
        renderProds();
        toast('Producto borrado');
      })
      .catch((err) => toast('Error al borrar: ' + err.message));
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
    const prod = {
      nombre: nombre || 'Producto sin nombre',
      sub: [canalNom, 'margen ' + margenReal + '%', new Date().toLocaleDateString('es-AR')].join(' · '),
      precioARS: r.precio,
      ganancia: r.ganancia,
      costo: Number(costo) || 0,
      margen: margenReal,
      canalNombre: canalNom,
      categoria: categoria || '',
      tipo,
    };
    return window.CostitoAuth.saveProduct(prod).then((id) => {
      state.productos.unshift({ id, nombre: prod.nombre, sub: prod.sub, precioARS: prod.precioARS, ganancia: prod.ganancia, categoria: prod.categoria, tipo });
      return prod;
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
    $('saveOverlay').classList.add('on');
    setTimeout(() => $('modalNombre').focus(), 60);
  };

  // ============================================================
  // EXPORTAR
  // ============================================================
  $('expCsv').addEventListener('click', () => {
    if (!state.productos.length) return toast('No hay productos para exportar');
    const rows = [['Producto', 'Detalle', 'Precio (ARS)']].concat(
      state.productos.map((p) => [p.nombre, p.sub, Math.round(p.precioARS)])
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
  $('mediosPdfBtn').addEventListener('click', printMediosPdf);

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
      groups[cat].forEach((p) => lines.push('▸ ' + p.nombre + ' · ' + money(p.precioARS)));
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
    const rows = state.productos.map((p) =>
      '<tr><td><div class="n">' + escapeHtml(p.nombre) + '</div><div class="d">' + escapeHtml(p.sub) + '</div></td>' +
      '<td class="pr">' + money(p.precioARS) + '</td></tr>'
    ).join('');
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
  // PDF FORMATEADO — Medios de pago
  // ============================================================
  function printMediosPdf() {
    const base = parseNum($('base').value);
    const date = new Date().toLocaleDateString('es-AR');
    let sectionsHtml = '';

    if (mediosState.tipo === 'local') {
      let procs = PROCESADORES_LOCAL.filter((p) => mediosState.selectedProcIds.includes(p.id));
      if (!procs.length) procs = [PROCESADORES_LOCAL[0]];
      procs.forEach((proc) => {
        const rowsHtml = proc.medios.map((m) => {
          if (m.comision === null) return '<tr><td>' + m.label + '</td><td>—</td><td>—</td></tr>';
          const res = Calc.precioPorMedio(base, m.comision);
          const pct = m.comision > 0 ? String(m.comision).replace('.', ',') + '%' : '—';
          return '<tr><td>' + m.label + '</td><td>' + pct + '</td>' +
            '<td class="pr">' + money(res.precio) + '</td></tr>';
        }).join('');
        sectionsHtml += '<h2>' + proc.nombre + '</h2>' +
          '<table><thead><tr><th>Medio de pago</th><th>Comisión</th><th>Cobrás</th></tr></thead>' +
          '<tbody>' + rowsHtml + '</tbody></table>';
      });
    } else {
      const plat = PLATAFORMAS_INTERNET.find((p) => p.id === mediosState.plataformaId) || PLATAFORMAS_INTERNET[0];
      let com = plat.editable ? null : plat.comision_base;
      let label = plat.nombre;
      if (plat.submodo && plat.procesadores_online) {
        const proc = plat.procesadores_online.find((p) => p.id === mediosState.procOnlineId) || plat.procesadores_online[0];
        if (proc) { com = proc.comision !== null ? (plat.comision_base || 0) + proc.comision : null; label += ' + ' + proc.label; }
      }
      const rowHtml = com !== null
        ? (() => { const res = Calc.precioPorMedio(base, com); const pct = com > 0 ? String(com).replace('.', ',') + '%' : '—';
            return '<tr><td>' + label + '</td><td>' + pct + '</td><td class="pr">' + money(res.precio) + '</td></tr>'; })()
        : '<tr><td colspan="3">—</td></tr>';
      sectionsHtml = '<h2>' + plat.nombre + '</h2>' +
        '<table><thead><tr><th>Canal</th><th>Comisión</th><th>Cobrás</th></tr></thead><tbody>' + rowHtml + '</tbody></table>';
    }

    const baseStr = money(base);
    const html = '<!DOCTYPE html><html lang="es-AR"><head><meta charset="UTF-8">' +
      '<title>Costito — Medios de pago</title><style>' +
      'body{font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:30px auto;color:#19271F}' +
      '.logo{font-size:22px;font-weight:700;color:#1F8A5B;margin-bottom:2px}' +
      '.sub{color:#5E7268;font-size:12px;margin-bottom:16px}' +
      '.base-box{background:#E9F5EE;border-radius:8px;padding:11px 15px;margin-bottom:22px;font-size:13px}' +
      '.base-box b{color:#1F8A5B}' +
      'h2{font-size:13px;font-weight:700;color:#1F8A5B;margin:20px 0 6px;' +
      'border-bottom:2px solid #E9F5EE;padding-bottom:4px}' +
      'table{width:100%;border-collapse:collapse;margin-bottom:4px}' +
      'th{background:#1F8A5B;color:#fff;padding:8px 12px;text-align:left;font-size:11.5px;font-weight:600}' +
      'th:last-child{text-align:right}' +
      'td{padding:8px 12px;border-bottom:1px solid #E9F5EE;font-size:13px}' +
      '.pr{text-align:right;font-weight:700;color:#1F8A5B}' +
      'footer{margin-top:28px;color:#5E7268;font-size:11px;text-align:center;' +
      'border-top:1px solid #CBE5D6;padding-top:10px}' +
      '@media print{body{margin:10px}}' +
      '</style></head><body>' +
      '<div class="logo">Costito</div>' +
      '<div class="sub">Lista de precios por medio de pago · ' + date + '</div>' +
      '<div class="base-box">Precio base (efectivo / transferencia): <b>' + baseStr + '</b></div>' +
      sectionsHtml +
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
  bindMoneyInput('base', medios);
  // Valores iniciales con formato
  $('costo').value = (10000).toLocaleString('es-AR');
  $('base').value = (20000).toLocaleString('es-AR');

  // Restaurar condición fiscal guardada
  if (state.condFiscal !== 'mono') {
    document.querySelectorAll('#condFiscalSeg button').forEach((b) => {
      b.classList.toggle('on', b.dataset.cond === state.condFiscal);
    });
    $('ivaProvField').style.display = 'none';
    $('riNota').style.display = '';
  }

  buildControls();
  checkComisionesStale();
  if (state.cur === 'USD') {
    document.querySelectorAll('#cur button').forEach((x) => x.classList.toggle('on', x.dataset.cur === 'USD'));
    $('pre1').textContent = $('pre2').textContent = $('finCur').textContent = symbol();
    $('dolarBar').style.display = 'flex';
  }
  updateDolarBar();   // pinta desde cache al instante
  fetchDolares();     // y refresca en segundo plano
  calc();
  medios();
  renderProds();
  updateTabFades();

  // Sincronizar plan premium y productos con Supabase cuando cambia la sesión
  document.addEventListener('costito:authchange', (e) => {
    const user = e.detail;
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
