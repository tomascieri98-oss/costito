/* ============================================================
   COSTITO — Sección Producción (v2)
   Flujo en 2 bloques: Insumos (catálogo) → Receta (uso por tanda)
   ============================================================ */
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s || '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmtN = (n) => (isNaN(n) || !isFinite(n)) ? '—' : Math.round(n).toLocaleString('es-AR');

  const UNITS = ['g','kg','ml','l','u','taza','cdita','cda','pizca','oz','lb','sobre','lata','paq.'];

  const LS = {
    insumos:  'costito_prod_insumos',
    receta:   'costito_prod_receta',
    gastos:   'costito_prod_gastos',
    unidades: 'costito_prod_unidades',
  };

  // Estado persistido en localStorage
  let insumos  = parse(LS.insumos, []);
  let receta   = parse(LS.receta, []);
  let gastos   = parse(LS.gastos, []);
  let unidades = parseInt(localStorage.getItem(LS.unidades)) || 1;

  let insSec  = maxSeq(insumos);
  let recSec  = maxSeq(receta);
  let gastoSeq = maxSeq(gastos, 'g');
  let lastResult = null;
  let pendingDelInsId = null;
  const syncTimers = {};

  function parse(key, def) { try { return JSON.parse(localStorage.getItem(key)) || def; } catch { return def; } }
  function maxSeq(arr, prefix) { return arr.reduce((m, x) => Math.max(m, parseInt(x.id?.slice(1)) || 0), 0); }
  function auth() { return window.CostitoAuth && window.CostitoAuth.getUser() ? window.CostitoAuth : null; }

  function debouncedSyncInsumo(ins) {
    if (!auth()) return;
    clearTimeout(syncTimers[ins.id]);
    syncTimers[ins.id] = setTimeout(() => {
      auth() && auth().upsertInsumo({ supabaseId: ins.supabaseId || null, nombre: ins.nombre, cantidadComprada: ins.cantidadComprada, unidad: ins.unidad, precioTotal: ins.precioTotal })
        .then(id => { if (!ins.supabaseId) { ins.supabaseId = id; save(); } })
        .catch(() => {});
    }, 800);
  }

  function syncDeleteInsumo(ins) {
    if (ins && ins.supabaseId && auth()) {
      auth().deleteInsumo(ins.supabaseId).catch(() => {});
    }
  }

  function loadInsumosFromSb() {
    if (!auth()) return;
    auth().loadInsumos().then(sbInsumos => {
      if (!sbInsumos.length) {
        insumos.forEach(ins => debouncedSyncInsumo(ins));
        return;
      }
      insumos = sbInsumos.map(si => {
        const existing = insumos.find(li =>
          li.nombre.trim().toLowerCase() === si.nombre.trim().toLowerCase() && li.unidad === si.unidad
        );
        return { id: existing ? existing.id : 'i' + (++insSec), nombre: si.nombre, cantidadComprada: si.cantidadComprada, unidad: si.unidad, precioTotal: si.precioTotal, supabaseId: si.supabaseId };
      });
      save();
      renderInsumos();
      recalc();
    }).catch(() => {});
  }

  function save() {
    localStorage.setItem(LS.insumos, JSON.stringify(insumos));
    localStorage.setItem(LS.receta, JSON.stringify(receta));
    localStorage.setItem(LS.gastos, JSON.stringify(gastos));
    localStorage.setItem(LS.unidades, String(unidades));
  }

  function unitSel(val, field) {
    return '<select class="in-bare prod-unit-sel" data-field="' + field + '">' +
      UNITS.map(u => '<option value="' + u + '"' + (u === (val || 'g') ? ' selected' : '') + '>' + u + '</option>').join('') + '</select>';
  }

  function calcPU(ins) {
    if (!ins.cantidadComprada || !ins.precioTotal || ins.cantidadComprada <= 0) return 0;
    return ins.precioTotal / ins.cantidadComprada;
  }

  function fmtPU(pu, unidad) {
    if (!pu || !isFinite(pu)) return '—';
    const val = pu < 1
      ? pu.toFixed(4).replace('.', ',')
      : pu.toLocaleString('es-AR', { maximumFractionDigits: 2 });
    return '$ ' + val + ' / ' + esc(unidad || '');
  }

  // ============================================================
  // BUILD
  // ============================================================
  function buildProduccion() {
    const body = $('body-produccion');
    if (!body || body.dataset.built) return;
    body.dataset.built = '1';

    body.innerHTML = [
      // Modal confirmación eliminar insumo en uso
      '<div class="prod-confirm" id="prod-confirm" style="display:none">',
        '<p id="prod-confirm-msg" class="prod-confirm-txt"></p>',
        '<div class="prod-confirm-btns">',
          '<button class="prod-confirm-no" id="prod-confirm-no">Cancelar</button>',
          '<button class="prod-confirm-yes" id="prod-confirm-yes">Eliminar igual</button>',
        '</div>',
      '</div>',

      // BLOQUE A — INSUMOS (catálogo)
      '<div class="card" id="pinsumo-card">',
        '<div class="card-h">',
          '<span class="ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 7H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z"/><path d="M16 3H8a2 2 0 0 0-2 2v2h12V5a2 2 0 0 0-2-2z"/></svg></span>',
          '<div><h3>Insumos</h3><p>Cargá tus materias primas una sola vez. Después las usás en todas las composiciones.</p></div>',
        '</div>',
        '<div id="pinsumo-header" class="ping-header pinsumo-header">',
          '<span>Insumo</span>',
          '<span>Cantidad comprada</span>',
          '<span>Unidad</span>',
          '<span>Precio total <span class="help"><span class="q">?</span><span class="tip">Cuánto pagaste por esa cantidad. Ej: $1.200 por un kilo de harina.</span></span></span>',
          '<span>$ por unidad <span class="help"><span class="q">?</span><span class="tip">Se calcula solo: precio total ÷ cantidad comprada.</span></span></span>',
          '<span></span>',
        '</div>',
        '<div id="pinsumo-list"></div>',
        '<button class="s-add" id="pinsumo-add" type="button">+ Agregar insumo</button>',
      '</div>',

      // BLOQUE B — RECETA
      '<div class="card" id="preceta-card" style="margin-top:16px">',
        '<div class="card-h">',
          '<span class="ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg></span>',
          '<div><h3>Composición</h3><p>Elegí los insumos que usás y cuánto necesitás de cada uno para esta tanda.</p></div>',
        '</div>',
        '<div id="preceta-header" class="ping-header preceta-header">',
          '<span>Insumo</span>',
          '<span>Cantidad usada</span>',
          '<span>Unidad</span>',
          '<span>$ Unitario</span>',
          '<span>Costo</span>',
          '<span></span>',
        '</div>',
        '<div id="preceta-list"></div>',
        '<button class="s-add" id="preceta-add" type="button">+ Agregar insumo a la composición</button>',
        '<div class="imp-sub" id="preceta-subtotal" style="margin-top:12px;display:none">',
          '<span>Subtotal materia prima</span><span id="preceta-sub-val">$ —</span>',
        '</div>',
      '</div>',

      // BLOQUE C — Rendimiento
      '<div class="card" style="margin-top:16px">',
        '<div class="card-h">',
          '<span class="ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l4-8 4 4 4-6 4 4"/></svg></span>',
          '<div><h3>Rendimiento</h3><p>¿Cuántas unidades obtenés de esta tanda?</p></div>',
        '</div>',
        '<div class="field">',
          '<label>Unidades producidas por tanda <span class="help"><span class="q">?</span><span class="tip">La cantidad de unidades finales que salen de esta tanda. Ej: 24 facturas, 12 panes.</span></span></label>',
          '<div class="in"><input type="number" id="prod-unidades" inputmode="numeric" placeholder="Ej: 24" min="1" value="' + unidades + '" /></div>',
        '</div>',
        '<div class="imp-sub" style="margin-top:8px">',
          '<span>Costo de MP por unidad</span><span id="prod-mp-val">$ —</span>',
        '</div>',
      '</div>',

      // BLOQUE D — Gastos (colapsable, sin cambios)
      '<details class="card comp-card" style="margin-top:16px">',
        '<summary class="card-h comp-summary" style="padding-bottom:0">',
          '<span class="ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg></span>',
          '<div><h3>Otros gastos</h3><p>Alquiler, energía, envases… (opcional)</p></div>',
          '<svg class="comp-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>',
        '</summary>',
        '<div id="pgasto-list" style="margin-top:14px"></div>',
        '<button class="s-add" id="pgasto-add" type="button">+ Agregar gasto</button>',
        '<div class="imp-sub" style="margin-top:12px">',
          '<span>Gastos por unidad</span><span id="pgasto-val">$ —</span>',
        '</div>',
      '</details>',

      // Barra resultado sticky
      '<div class="prod-result-bar" id="prod-result-bar">',
        '<div class="prb-main">',
          '<div class="prb-label">Costo por unidad</div>',
          '<div class="prb-val" id="prb-costo-val">$ —</div>',
        '</div>',
        '<div class="prb-actions">',
          '<button class="prb-calc" id="prb-save-cost-btn" type="button">Guardar sin precio</button>',
          '<button class="prb-save" id="prb-save-btn" type="button">',
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>',
            'Guardar y ponerle precio →',
          '</button>',
        '</div>',
      '</div>',
    ].join('');

    // Eventos — Insumos
    $('pinsumo-add').addEventListener('click', addInsumo);
    $('pinsumo-list').addEventListener('input', onInsInput);
    $('pinsumo-list').addEventListener('change', onInsInput);
    $('pinsumo-list').addEventListener('click', onInsClick);

    // Eventos — Receta
    $('preceta-add').addEventListener('click', addRecetaRow);
    $('preceta-list').addEventListener('input', onRecetaInput);
    $('preceta-list').addEventListener('change', onRecetaChange);
    $('preceta-list').addEventListener('click', onRecetaClick);

    // Eventos — Rendimiento
    $('prod-unidades').addEventListener('input', () => {
      unidades = Math.max(parseInt($('prod-unidades').value) || 1, 1);
      save();
      recalc();
    });

    // Eventos — Gastos
    $('pgasto-add').addEventListener('click', addGasto);
    $('pgasto-list').addEventListener('click', onGastoClick);
    $('pgasto-list').addEventListener('input', onGastoInput);
    $('pgasto-list').addEventListener('change', onGastoChange);

    // Eventos — Acciones
    $('prb-save-btn').addEventListener('click', onSaveAndPrice);
    $('prb-save-cost-btn').addEventListener('click', onSave);

    // Eventos — Modal confirmación
    $('prod-confirm-yes').addEventListener('click', confirmDelete);
    $('prod-confirm-no').addEventListener('click', () => { pendingDelInsId = null; hideConfirm(); });

    renderInsumos();
    renderReceta();
    renderGastos();
    recalc();
  }

  function showConfirm(msg) {
    $('prod-confirm-msg').textContent = msg;
    $('prod-confirm').style.display = '';
  }
  function hideConfirm() { $('prod-confirm').style.display = 'none'; }

  // ============================================================
  // BLOQUE A — INSUMOS
  // ============================================================
  function addInsumo() {
    insumos.push({ id: 'i' + (++insSec), nombre: '', cantidadComprada: 0, unidad: 'g', precioTotal: 0, supabaseId: null });
    save();
    renderInsumos();
    const inputs = document.querySelectorAll('.pinsumo-nombre');
    if (inputs.length) inputs[inputs.length - 1].focus();
  }

  function renderInsumos() {
    const list = $('pinsumo-list');
    const header = $('pinsumo-header');
    if (!list) return;
    if (!insumos.length) {
      if (header) header.style.display = 'none';
      list.innerHTML = '<p class="prod-empty">Todavía no cargaste insumos. Tocá "+ Agregar insumo" para empezar.</p>';
      renderReceta();
      return;
    }
    if (header) header.style.display = '';
    list.innerHTML = insumos.map(ins => {
      const pu = calcPU(ins);
      return [
        '<div class="pinsumo-row" data-ins-id="' + ins.id + '">',
          '<input class="in-bare pinsumo-nombre" type="text" placeholder="Ej: Harina" value="' + esc(ins.nombre) + '" data-field="nombre" maxlength="40" />',
          '<input class="in-bare pinsumo-num" type="number" placeholder="1000" min="0" value="' + (ins.cantidadComprada || '') + '" data-field="cantidadComprada" inputmode="decimal" />',
          unitSel(ins.unidad, 'unidad'),
          '<div class="ping-pkt">',
            '<span class="in-bare-pre">$</span>',
            '<input class="in-bare pinsumo-num" type="number" placeholder="0" min="0" value="' + (ins.precioTotal || '') + '" data-field="precioTotal" inputmode="decimal" style="flex:1;min-width:0" />',
          '</div>',
          '<div class="pinsumo-pu">' + fmtPU(pu, ins.unidad) + '</div>',
          '<button class="imp-del" data-del-ins="' + ins.id + '" type="button" aria-label="Eliminar">×</button>',
        '</div>',
      ].join('');
    }).join('');
    renderReceta();
  }

  function onInsInput(e) {
    const row = e.target.closest('[data-ins-id]');
    if (!row) return;
    const ins = insumos.find(i => i.id === row.dataset.insId);
    if (!ins) return;
    const field = e.target.dataset.field;
    if (!field) return;
    if (field === 'nombre' || field === 'unidad') ins[field] = e.target.value;
    else ins[field] = parseFloat(e.target.value) || 0;

    // Actualizar celda PU sin re-renderizar (preserva foco)
    const pu = calcPU(ins);
    const puCell = row.querySelector('.pinsumo-pu');
    if (puCell) puCell.textContent = fmtPU(pu, ins.unidad);

    // Reactivo: actualizar filas de receta que usan este insumo
    receta.filter(r => r.insumoId === ins.id).forEach(recRow => {
      const domRow = document.querySelector('[data-rec-id="' + recRow.id + '"]');
      if (!domRow) return;
      const puCell2 = domRow.querySelector('.preceta-pu');
      const unitCell = domRow.querySelector('.preceta-unit');
      const costoCell = domRow.querySelector('.preceta-costo');
      if (puCell2) puCell2.textContent = pu > 0 ? '$ ' + pu.toLocaleString('es-AR', { maximumFractionDigits: 2 }) : '—';
      if (unitCell && field === 'unidad') unitCell.textContent = ins.unidad;
      const costo = (pu > 0 && recRow.cantidadUsada > 0) ? pu * recRow.cantidadUsada : 0;
      if (costoCell) costoCell.textContent = costo > 0 ? '$ ' + fmtN(costo) : '—';
    });

    // Si cambió el nombre, actualizar opciones del dropdown en receta
    if (field === 'nombre') {
      document.querySelectorAll('.preceta-ins-sel').forEach(sel => {
        const opt = sel.querySelector('option[value="' + ins.id + '"]');
        if (opt) opt.textContent = ins.nombre || 'Sin nombre';
      });
    }

    save();
    recalc();
    debouncedSyncInsumo(ins);
  }

  function onInsClick(e) {
    const del = e.target.closest('[data-del-ins]');
    if (!del) return;
    const id = del.dataset.delIns;
    const enUso = receta.some(r => r.insumoId === id);
    if (enUso) {
      pendingDelInsId = id;
      const ins = insumos.find(i => i.id === id);
      showConfirm((ins?.nombre ? '"' + ins.nombre + '"' : 'Este insumo') + ' se está usando en la composición. Si lo eliminás, se va a quitar también de ahí. ¿Confirmás?');
    } else {
      const ins = insumos.find(i => i.id === id);
      insumos = insumos.filter(i => i.id !== id);
      save();
      renderInsumos();
      recalc();
      syncDeleteInsumo(ins);
    }
  }

  function confirmDelete() {
    if (!pendingDelInsId) return;
    const ins = insumos.find(i => i.id === pendingDelInsId);
    receta = receta.filter(r => r.insumoId !== pendingDelInsId);
    insumos = insumos.filter(i => i.id !== pendingDelInsId);
    pendingDelInsId = null;
    hideConfirm();
    save();
    renderInsumos();
    recalc();
    syncDeleteInsumo(ins);
  }

  // ============================================================
  // BLOQUE B — RECETA
  // ============================================================
  function addRecetaRow() {
    if (!insumos.length) {
      const card = $('pinsumo-card');
      if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    receta.push({ id: 'r' + (++recSec), insumoId: insumos[0].id, cantidadUsada: 0 });
    save();
    renderReceta();
  }

  function insumoDropdown(selectedId) {
    return '<select class="in-bare preceta-ins-sel" data-field="insumoId">' +
      insumos.map(ins => '<option value="' + ins.id + '"' + (ins.id === selectedId ? ' selected' : '') + '>' + esc(ins.nombre || 'Sin nombre') + '</option>').join('') +
      '</select>';
  }

  function renderReceta() {
    const list = $('preceta-list');
    const header = $('preceta-header');
    const subtotal = $('preceta-subtotal');
    if (!list) return;

    if (!receta.length) {
      if (header) header.style.display = 'none';
      if (subtotal) subtotal.style.display = 'none';
      list.innerHTML = !insumos.length
        ? '<p class="prod-empty">Primero cargá los insumos arriba, después armás la composición acá.</p>'
        : '<p class="prod-empty">Tocá "+ Agregar insumo a la composición" para armar tu composición.</p>';
      return;
    }

    if (header) header.style.display = '';
    if (subtotal) subtotal.style.display = '';

    list.innerHTML = receta.map(row => {
      const ins = insumos.find(i => i.id === row.insumoId);
      const pu = ins ? calcPU(ins) : 0;
      const costo = (pu > 0 && row.cantidadUsada > 0) ? pu * row.cantidadUsada : 0;
      const unidadDisplay = ins ? esc(ins.unidad) : '—';
      const puDisplay = pu > 0 ? '$ ' + pu.toLocaleString('es-AR', { maximumFractionDigits: 2 }) : '—';
      return [
        '<div class="preceta-row" data-rec-id="' + row.id + '">',
          insumoDropdown(row.insumoId),
          '<input class="in-bare preceta-num" type="number" placeholder="500" min="0" value="' + (row.cantidadUsada || '') + '" data-field="cantidadUsada" inputmode="decimal" />',
          '<div class="preceta-unit">' + unidadDisplay + '</div>',
          '<div class="preceta-pu">' + puDisplay + '</div>',
          '<div class="preceta-costo">' + (costo > 0 ? '$ ' + fmtN(costo) : '—') + '</div>',
          '<button class="imp-del" data-del-rec="' + row.id + '" type="button" aria-label="Eliminar">×</button>',
        '</div>',
      ].join('');
    }).join('');
  }

  function onRecetaInput(e) {
    const row = e.target.closest('[data-rec-id]');
    if (!row) return;
    const rec = receta.find(r => r.id === row.dataset.recId);
    if (!rec) return;
    const field = e.target.dataset.field;
    if (!field || field === 'insumoId') return;
    rec[field] = parseFloat(e.target.value) || 0;
    // Actualizar celda costo directamente
    const ins = insumos.find(i => i.id === rec.insumoId);
    const pu = ins ? calcPU(ins) : 0;
    const costo = (pu > 0 && rec.cantidadUsada > 0) ? pu * rec.cantidadUsada : 0;
    const costoCell = row.querySelector('.preceta-costo');
    if (costoCell) costoCell.textContent = costo > 0 ? '$ ' + fmtN(costo) : '—';
    save();
    recalc();
  }

  function onRecetaChange(e) {
    const row = e.target.closest('[data-rec-id]');
    if (!row) return;
    const rec = receta.find(r => r.id === row.dataset.recId);
    if (!rec) return;
    if (e.target.dataset.field === 'insumoId') {
      rec.insumoId = e.target.value;
      save();
      renderReceta();
      recalc();
    }
  }

  function onRecetaClick(e) {
    const del = e.target.closest('[data-del-rec]');
    if (!del) return;
    receta = receta.filter(r => r.id !== del.dataset.delRec);
    save();
    renderReceta();
    recalc();
  }

  // ============================================================
  // BLOQUE D — GASTOS (sin cambios lógicos)
  // ============================================================
  function addGasto() {
    gastos.push({ id: 'g' + (++gastoSeq), nombre: '', tipo: 'tanda', monto: 0, unidadesMes: 100 });
    save();
    renderGastos();
    const inputs = document.querySelectorAll('.pgasto-row .pgasto-nombre');
    if (inputs.length) inputs[inputs.length - 1].focus();
  }

  function renderGastos() {
    const list = $('pgasto-list');
    if (!list) return;
    if (!gastos.length) {
      list.innerHTML = '<p style="font-size:13px;color:var(--tinta-soft);text-align:center;padding:0 0 4px">Opcional: alquiler, energía, envases, sueldos…</p>';
      return;
    }
    list.innerHTML = gastos.map(g => [
      '<div class="pgasto-row" data-gasto-id="' + g.id + '">',
        '<input class="in-bare pgasto-nombre" type="text" placeholder="Ej: Alquiler" value="' + esc(g.nombre) + '" data-field="nombre" />',
        '<select class="in-bare pgasto-tipo" data-field="tipo">',
          '<option value="tanda"' + (g.tipo === 'tanda' ? ' selected' : '') + '>A esta tanda</option>',
          '<option value="mensual"' + (g.tipo === 'mensual' ? ' selected' : '') + '>Mensual ÷ uds/mes</option>',
          '<option value="fijo"' + (g.tipo === 'fijo' ? ' selected' : '') + '>Fijo por unidad</option>',
        '</select>',
        '<div class="ping-pkt">',
          '<span class="in-bare-pre">$</span>',
          '<input class="in-bare pgasto-monto" type="number" placeholder="0" min="0" value="' + (g.monto || '') + '" data-field="monto" inputmode="decimal" style="flex:1;min-width:0" />',
        '</div>',
        g.tipo === 'mensual'
          ? '<div class="ping-pkt"><input class="in-bare" type="number" placeholder="100" min="1" value="' + (g.unidadesMes || '') + '" data-field="unidadesMes" inputmode="numeric" style="flex:1;min-width:0;width:70px" /><span class="in-bare-suf">uds/mes</span></div>'
          : '<div></div>',
        '<button class="imp-del" data-del-gasto="' + g.id + '" type="button" aria-label="Eliminar">×</button>',
      '</div>',
    ].join('')).join('');
  }

  function onGastoClick(e) {
    const del = e.target.closest('[data-del-gasto]');
    if (!del) return;
    gastos = gastos.filter(g => g.id !== del.dataset.delGasto);
    save();
    renderGastos();
    recalc();
  }

  function onGastoInput(e) {
    const row = e.target.closest('[data-gasto-id]');
    if (!row) return;
    const g = gastos.find(x => x.id === row.dataset.gastoId);
    if (!g) return;
    const field = e.target.dataset.field;
    if (!field) return;
    if (field === 'nombre') g.nombre = e.target.value;
    else g[field] = parseFloat(e.target.value) || 0;
    save();
    recalc();
  }

  function onGastoChange(e) {
    const row = e.target.closest('[data-gasto-id]');
    if (!row) return;
    const g = gastos.find(x => x.id === row.dataset.gastoId);
    if (!g) return;
    if (e.target.dataset.field === 'tipo') {
      g.tipo = e.target.value;
      save();
      renderGastos();
      recalc();
    }
  }

  // ============================================================
  // RECÁLCULO
  // ============================================================
  function recalc() {
    // Mapear receta + insumos al formato de CostitoCalc.costoProduccion()
    const ingParaCalc = receta.map(row => {
      const ins = insumos.find(i => i.id === row.insumoId);
      if (!ins) return null;
      return {
        id: row.id,
        cantidad: row.cantidadUsada,
        paqueteCosto: ins.precioTotal,
        paqueteCantidad: ins.cantidadComprada,
      };
    }).filter(Boolean);

    const r = CostitoCalc.costoProduccion({ ingredientes: ingParaCalc, unidades, gastos });
    lastResult = r;

    // Actualizar subtotal receta
    const sub = $('preceta-sub-val');
    if (sub) sub.textContent = '$ ' + fmtN(r.subtotalMP);

    // Actualizar celdas de costo por fila (sin re-renderizar, preserva foco)
    r.ingredientes.forEach(ri => {
      const domRow = document.querySelector('[data-rec-id="' + ri.id + '"]');
      if (!domRow) return;
      const cell = domRow.querySelector('.preceta-costo');
      if (cell) cell.textContent = ri.costoCalculado > 0 ? '$ ' + fmtN(ri.costoCalculado) : '—';
    });

    const m = $('prod-mp-val'); if (m) m.textContent = '$ ' + fmtN(r.costoMPPorUnidad);
    const gv = $('pgasto-val'); if (gv) gv.textContent = '$ ' + fmtN(r.totalGastosPorUnidad);
    const cv = $('prb-costo-val'); if (cv) cv.textContent = '$ ' + fmtN(r.costoTotalPorUnidad);
  }

  // ============================================================
  // GUARDAR / USAR COSTO
  // ============================================================
  // Secundario: guardar solo el costo + receta (ponerle precio después)
  function onSave() {
    if (!lastResult) return;
    window.Costito && window.Costito.abrirGuardarProduccion(lastResult.costoTotalPorUnidad, { insumos, receta, gastos, unidades });
  }

  // Primario: guardar la receta y seguir de largo a ponerle el precio de venta
  function onSaveAndPrice() {
    if (!lastResult || !lastResult.costoTotalPorUnidad) {
      const t = window.Costito && window.Costito.toast;
      if (t) t('Cargá al menos un insumo para calcular el costo');
      return;
    }
    window.Costito && window.Costito.guardarYponerPrecioProduccion(lastResult.costoTotalPorUnidad, { insumos, receta, gastos, unidades });
  }

  document.addEventListener('costito:authchange', (e) => {
    const user = e && e.detail && e.detail.user;
    if (user) loadInsumosFromSb();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', buildProduccion);
  } else {
    buildProduccion();
  }
})();
