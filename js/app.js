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
    theme: 'costito_theme', cur: 'costito_cur', prods: 'costito_productos',
    dolarTipo: 'costito_dolar_tipo', dolarCache: 'costito_dolar_cache',
  };

  // Estado en memoria
  const state = {
    cur: localStorage.getItem(LS.cur) || 'ARS',
    iva: 21,
    productos: JSON.parse(localStorage.getItem(LS.prods) || '[]'),
    dolarTipo: localStorage.getItem(LS.dolarTipo) || D.dolar.tipoDefault,
    dolares: JSON.parse(localStorage.getItem(LS.dolarCache) || 'null'), // { casa: {valor, fecha} }
  };

  // ---------- Helpers de formato ----------
  const fmt = (n) => Math.round(n).toLocaleString('es-AR');
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
    fmt, money, conv, symbol, setHTML, escapeHtml,
    toast: (m) => toast(m),
    waUrl: () => 'https://wa.me/' + D.premium.whatsapp + '?text=' + encodeURIComponent(D.premium.mensaje),
    isPremium: () => localStorage.getItem('costito_premium') === '1',
    setPremium(on) {
      localStorage.setItem('costito_premium', on ? '1' : '0');
      document.dispatchEvent(new CustomEvent('costito:premiumchange'));
    },
    // Carga un costo (ARS) en la calculadora principal y va a esa tab
    usarComoCosto(ars) {
      $('costo').value = Math.round(ars);
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
    procesadorId: PROCESADORES_LOCAL[0].id,
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
      .map((o) => '<option value="' + o.v + '"' + (o.v === 3.5 ? ' selected' : '') + '>' + o.label + ' (' + o.prov + ')</option>')
      .join(''));

    // Procesadores locales (calc tab)
    setHTML($('procesador-sel'), PROCESADORES_LOCAL.map((p) =>
      '<option value="' + p.id + '">' + p.nombre + '</option>'
    ).join(''));
    updateMedioLocalOptions(false);

    // Plataformas internet (calc tab)
    setHTML($('plataforma-sel'), PLATAFORMAS_INTERNET.map((p) =>
      '<option value="' + p.id + '">' + p.nombre + '</option>'
    ).join(''));
    updateProcOnlineOptions(false);

    // Medios tab — procesadores
    setHTML($('m-procesador-sel'), PROCESADORES_LOCAL.map((p) =>
      '<option value="' + p.id + '">' + p.nombre + '</option>'
    ).join(''));

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

  function updateMedioLocalOptions(reset) {
    const proc = PROCESADORES_LOCAL.find((p) => p.id === canalState.procesadorId) || PROCESADORES_LOCAL[0];
    setHTML($('medio-local-sel'), proc.medios.map((m) => {
      const pct = m.comision !== null ? ' (' + String(m.comision).replace('.', ',') + '%)' : '';
      return '<option value="' + m.id + '">' + m.label + pct + '</option>';
    }).join(''));
    if (reset) {
      canalState.medioId = proc.medios[0].id;
      $('medio-local-sel').value = canalState.medioId;
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
      const proc = PROCESADORES_LOCAL.find((p) => p.id === mediosState.procesadorId);
      $('m-canal-nota').textContent = proc ? proc.nota || '' : '';
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
    return {
      costo: $('costo').value,
      ivaProveedor: state.iva,
      margen: $('margen').value,
      comEfectiva: Calc.comisionEfectiva(comNominal(), $('ivaCom').checked),
      iibb: parseFloat($('iibb').value) || 0,
    };
  }

  function calc() {
    const r = Calc.precioPublicado(leerInputs());

    if (!r.ok) {
      $('finVal').textContent = '—';
      setHTML($('ganNote'), escapeHtml(r.motivo));
      ['bCosto', 'bCom', 'bIibb', 'bGan', 'bTotal'].forEach((id) => ($(id).textContent = '—'));
      $('addBtn').disabled = true;
      $('addBtn').style.opacity = .5;
      return;
    }
    $('addBtn').disabled = false;
    $('addBtn').style.opacity = 1;

    $('finVal').textContent = fmt(conv(r.precio));
    setHTML($('ganNote'), 'Con esto ganás <b>' + money(r.ganancia) + ' limpios</b> por unidad.');
    $('bCosto').textContent = money(r.costoConIva);
    $('bCom').textContent = '– ' + money(r.comAmt);
    $('bIibb').textContent = '– ' + money(r.iibbAmt);
    $('bGan').textContent = '+ ' + money(r.ganancia);
    $('bTotal').textContent = money(r.precio);
  }

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
    updateMedioLocalOptions(true);
    syncCanalUI();
  });

  // Medio de pago local
  $('medio-local-sel').addEventListener('change', () => {
    canalState.medioId = $('medio-local-sel').value;
    canalState.desvinculado = false;
    syncCanalUI();
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
  $('iibb').addEventListener('change', calc);
  ['costo', 'margen'].forEach((id) => $(id).addEventListener('input', calc));

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
    const base = parseFloat($('base').value) || 0;
    let items = [];

    if (mediosState.tipo === 'local') {
      const proc = PROCESADORES_LOCAL.find((p) => p.id === mediosState.procesadorId) || PROCESADORES_LOCAL[0];
      items = proc.medios.map((m) => ({ label: m.label, comision: m.comision, isBase: m.comision === 0 }));
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

  // Medios tab — procesador local
  $('m-procesador-sel').addEventListener('change', () => {
    mediosState.procesadorId = $('m-procesador-sel').value;
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

  function persistProds() {
    localStorage.setItem(LS.prods, JSON.stringify(state.productos));
  }

  function renderProds() {
    const list = $('plist');
    if (!state.productos.length) {
      setHTML(list, '<div class="empty">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7l8-4 8 4v10l-8 4-8-4z"/><path d="M4 7l8 4 8-4M12 11v10"/></svg>' +
        '<div>Todavía no guardaste ningún producto.<br/>Calculá un precio y tocá <b>"Guardar en mis productos"</b>.</div></div>');
      return;
    }
    setHTML(list, state.productos.map((p) =>
      '<div class="prod" data-id="' + p.id + '">' +
        '<span class="pic">' + TAG_ICO + '</span>' +
        '<div class="info"><h4>' + escapeHtml(p.nombre) + '</h4><p>' + escapeHtml(p.sub) + '</p></div>' +
        '<div class="pr">' +
          '<div style="text-align:right"><div class="n">' + money(p.precioARS) + '</div><div class="s">a publicar</div></div>' +
          '<button class="del" data-del="' + p.id + '" aria-label="Borrar">' + DEL_ICO + '</button>' +
        '</div></div>'
    ).join(''));
  }

  // Guardar el cálculo actual
  $('addBtn').addEventListener('click', () => {
    const r = Calc.precioPublicado(leerInputs());
    if (!r.ok) return;
    const nombre = (prompt('¿Cómo se llama este producto?', '') || '').trim() || 'Producto sin nombre';
    state.productos.unshift({
      id: Date.now(),
      nombre,
      sub: canalNombreDisplay() + ' · margen ' + $('margen').value + '% · ' + new Date().toLocaleDateString('es-AR'),
      precioARS: r.precio,
    });
    persistProds();
    renderProds();
    toast('Guardado en mis productos');
  });

  // Borrar producto (delegación)
  $('plist').addEventListener('click', (e) => {
    const b = e.target.closest('[data-del]');
    if (!b) return;
    state.productos = state.productos.filter((p) => String(p.id) !== b.dataset.del);
    persistProds();
    renderProds();
    toast('Producto borrado');
  });

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

  $('expPdf').addEventListener('click', () => {
    if (!state.productos.length) return toast('No hay productos para exportar');
    window.print(); // el navegador permite "Guardar como PDF"
  });

  // ============================================================
  // PREMIUM: botón WhatsApp del tab Productos
  // (las calculadoras Premium y sus gates viven en premium.js)
  // ============================================================
  $('waBtn').href = 'https://wa.me/' + D.premium.whatsapp + '?text=' + encodeURIComponent(D.premium.mensaje);

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
  buildControls();
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
})();
