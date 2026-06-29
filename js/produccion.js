/* ============================================================
   COSTITO — Sección Producción
   Calcula el costo de producir por unidad con materia prima y gastos.
   ============================================================ */
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s || '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmtN = (n) => Math.round(n).toLocaleString('es-AR');

  let ingredientes = [];
  let gastos = [];
  let unidades = 1;
  let ingSeq = 0;
  let gastoSeq = 0;
  let lastResult = null;

  function buildProduccion() {
    const body = $('body-produccion');
    if (!body || body.dataset.built) return;
    body.dataset.built = '1';

    body.innerHTML = [
      // Block 1 – Materia prima
      '<div class="card">',
        '<div class="card-h">',
          '<span class="ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3h7l1 9h9"/><circle cx="9" cy="19" r="2"/><circle cx="19" cy="19" r="2"/><path d="M3 3l-1-2"/></svg></span>',
          '<div><h3>Materia prima</h3><p>Los ingredientes o materiales que usás para producir</p></div>',
        '</div>',
        '<datalist id="prod-units"><option value="g"><option value="kg"><option value="ml"><option value="litros"><option value="l"><option value="mg"><option value="u"><option value="taza"><option value="cdita"><option value="cda"><option value="pizca"><option value="oz"><option value="lb"><option value="sobre"><option value="lata"><option value="paq."></datalist>',
        '<div id="ping-header" class="ping-header">',
          '<span>Ingrediente</span>',
          '<span>Cantidad <span class="help"><span class="q">?</span><span class="tip">Cuánto usás de este ingrediente en la receta. Ej: 500 g de harina.</span></span></span>',
          '<span>$ Paquete <span class="help"><span class="q">?</span><span class="tip">Cuánto te costó el paquete que comprás. Ej: $1.200 la bolsa de harina.</span></span></span>',
          '<span>Rinde <span class="help"><span class="q">?</span><span class="tip">Cuánto contiene ese paquete. Ej: 1000 g. Con esto calculamos el costo proporcional a lo que usás.</span></span></span>',
          '<span>Costo</span><span></span>',
        '</div>',
        '<div id="ping-list"></div>',
        '<button class="s-add" id="ping-add" type="button">+ Agregar ingrediente</button>',
        '<div class="imp-sub" id="ping-subtotal" style="margin-top:12px">',
          '<span>Subtotal materia prima</span><span id="ping-sub-val">$ —</span>',
        '</div>',
      '</div>',

      // Block 2 – Rendimiento
      '<div class="card" style="margin-top:16px">',
        '<div class="card-h">',
          '<span class="ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l4-8 4 4 4-6 4 4"/></svg></span>',
          '<div><h3>Rendimiento</h3><p>¿Cuántas unidades obtenés de esta tanda?</p></div>',
        '</div>',
        '<div class="field">',
          '<label>Unidades producidas por tanda <span class="help"><span class="q">?</span><span class="tip">La cantidad de unidades finales que salen de esta tanda. Ej: 24 facturas, 12 panes. Se usa para distribuir el costo entre cada unidad.</span></span></label>',
          '<div class="in"><input type="number" id="prod-unidades" inputmode="numeric" placeholder="Ej: 24" min="1" value="1" /></div>',
        '</div>',
        '<div class="imp-sub" style="margin-top:8px">',
          '<span>Costo de MP por unidad</span><span id="prod-mp-val">$ —</span>',
        '</div>',
      '</div>',

      // Block 3 – Gastos (colapsable)
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

      // Sticky result bar
      '<div class="prod-result-bar" id="prod-result-bar">',
        '<div class="prb-main">',
          '<div class="prb-label">Costo por unidad</div>',
          '<div class="prb-val" id="prb-costo-val">$ —</div>',
        '</div>',
        '<div class="prb-actions">',
          '<button class="prb-save" id="prb-save-btn">',
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>',
            'Guardar',
          '</button>',
          '<button class="prb-calc" id="prb-calc-btn">Ir a Calculadora →</button>',
        '</div>',
      '</div>',
    ].join('');

    // Attach events
    $('ping-add').addEventListener('click', addIng);
    $('pgasto-add').addEventListener('click', addGasto);
    $('prod-unidades').addEventListener('input', () => {
      unidades = Math.max(parseInt($('prod-unidades').value) || 1, 1);
      recalc();
    });
    $('ping-list').addEventListener('click', onIngClick);
    $('ping-list').addEventListener('input', onIngInput);
    $('pgasto-list').addEventListener('click', onGastoClick);
    $('pgasto-list').addEventListener('input', onGastoInput);
    $('pgasto-list').addEventListener('change', onGastoChange);
    $('prb-save-btn').addEventListener('click', onSave);
    $('prb-calc-btn').addEventListener('click', onUsarCosto);

    renderIng();
    renderGastos();
    recalc();
  }

  /* ---- Ingredientes ---- */
  function addIng() {
    ingredientes.push({ id: 'i' + (++ingSeq), nombre: '', cantidad: 0, unidad: 'g', paqueteCosto: 0, paqueteCantidad: 0, unidadRinde: 'g', costoCalculado: 0 });
    renderIng();
    const inputs = document.querySelectorAll('.ping-row .ping-nombre');
    if (inputs.length) inputs[inputs.length - 1].focus();
  }

  function renderIng() {
    const list = $('ping-list');
    const header = $('ping-header');
    if (!list) return;
    if (!ingredientes.length) {
      if (header) header.style.display = 'none';
      list.innerHTML = '<p style="font-size:13px;color:var(--tinta-soft);text-align:center;padding:6px 0 4px">Tocá "+ Agregar ingrediente" para empezar</p>';
      return;
    }
    if (header) header.style.display = '';
    list.innerHTML = ingredientes.map((ing) => [
      '<div class="ping-row" data-ing-id="' + ing.id + '">',
        '<input class="in-bare ping-nombre" type="text" placeholder="Ej: Harina" value="' + esc(ing.nombre) + '" data-field="nombre" />',
        '<div class="ping-pkt">',
          '<input class="in-bare ping-num" type="number" placeholder="500" min="0" value="' + (ing.cantidad || '') + '" data-field="cantidad" inputmode="decimal" style="flex:1;min-width:0" />',
          '<input class="in-bare ping-unit" type="text" placeholder="g" list="prod-units" value="' + esc(ing.unidad) + '" data-field="unidad" />',
        '</div>',
        '<div class="ping-pkt">',
          '<span class="in-bare-pre">$</span>',
          '<input class="in-bare ping-num" type="number" placeholder="0" min="0" value="' + (ing.paqueteCosto || '') + '" data-field="paqueteCosto" inputmode="decimal" style="flex:1;min-width:0" />',
        '</div>',
        '<div class="ping-pkt">',
          '<input class="in-bare ping-num" type="number" placeholder="1000" min="0" value="' + (ing.paqueteCantidad || '') + '" data-field="paqueteCantidad" inputmode="decimal" style="flex:1;min-width:0" />',
          '<input class="in-bare ping-unit" type="text" placeholder="g" list="prod-units" value="' + esc(ing.unidadRinde) + '" data-field="unidadRinde" />',
        '</div>',
        '<div class="ping-costo">' + (ing.costoCalculado > 0 ? '$ ' + fmtN(ing.costoCalculado) : '—') + '</div>',
        '<button class="imp-del" data-del-ing="' + ing.id + '" type="button" aria-label="Eliminar">×</button>',
      '</div>',
    ].join('')).join('');
  }

  function onIngClick(e) {
    const del = e.target.closest('[data-del-ing]');
    if (!del) return;
    ingredientes = ingredientes.filter((i) => i.id !== del.dataset.delIng);
    renderIng();
    recalc();
  }

  function onIngInput(e) {
    const row = e.target.closest('[data-ing-id]');
    if (!row) return;
    const ing = ingredientes.find((i) => i.id === row.dataset.ingId);
    if (!ing) return;
    const field = e.target.dataset.field;
    if (!field) return;
    if (['nombre', 'unidad', 'unidadRinde'].includes(field)) ing[field] = e.target.value;
    else ing[field] = parseFloat(e.target.value) || 0;
    recalc();
  }

  /* ---- Gastos ---- */
  function addGasto() {
    gastos.push({ id: 'g' + (++gastoSeq), nombre: '', tipo: 'tanda', monto: 0, unidadesMes: 100 });
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
    list.innerHTML = gastos.map((g) => [
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
    gastos = gastos.filter((g) => g.id !== del.dataset.delGasto);
    renderGastos();
    recalc();
  }

  function onGastoInput(e) {
    const row = e.target.closest('[data-gasto-id]');
    if (!row) return;
    const g = gastos.find((x) => x.id === row.dataset.gastoId);
    if (!g) return;
    const field = e.target.dataset.field;
    if (!field) return;
    if (field === 'nombre') g.nombre = e.target.value;
    else g[field] = parseFloat(e.target.value) || 0;
    recalc();
  }

  function onGastoChange(e) {
    const row = e.target.closest('[data-gasto-id]');
    if (!row) return;
    const g = gastos.find((x) => x.id === row.dataset.gastoId);
    if (!g) return;
    if (e.target.dataset.field === 'tipo') {
      g.tipo = e.target.value;
      renderGastos();
      recalc();
    }
  }

  /* ---- Recálculo ---- */
  function recalc() {
    const r = CostitoCalc.costoProduccion({ ingredientes, unidades, gastos });
    lastResult = r;

    // Update ing costos in state
    r.ingredientes.forEach((ri) => {
      const ing = ingredientes.find((i) => i.id === ri.id);
      if (ing) ing.costoCalculado = ri.costoCalculado;
    });

    // Update cost cells without re-rendering rows (preserve focus)
    document.querySelectorAll('.ping-row').forEach((row) => {
      const ri = r.ingredientes.find((i) => i.id === row.dataset.ingId);
      if (!ri) return;
      const cell = row.querySelector('.ping-costo');
      if (cell) cell.textContent = ri.costoCalculado > 0 ? '$ ' + fmtN(ri.costoCalculado) : '—';
    });

    const s = $('ping-sub-val'); if (s) s.textContent = '$ ' + fmtN(r.subtotalMP);
    const m = $('prod-mp-val'); if (m) m.textContent = '$ ' + fmtN(r.costoMPPorUnidad);
    const gv = $('pgasto-val'); if (gv) gv.textContent = '$ ' + fmtN(r.totalGastosPorUnidad);
    const cv = $('prb-costo-val'); if (cv) cv.textContent = '$ ' + fmtN(r.costoTotalPorUnidad);
  }

  /* ---- Acciones ---- */
  function onSave() {
    if (!lastResult) return;
    const recipeData = {
      ingredientes: ingredientes.map(({ id: _id, costoCalculado: _c, ...rest }) => rest),
      gastos: gastos.map(({ id: _id, costoPorUnidad: _c, ...rest }) => rest),
      unidades,
    };
    window.Costito && window.Costito.abrirGuardarProduccion(lastResult.costoTotalPorUnidad, recipeData);
  }

  function onUsarCosto() {
    if (!lastResult || !lastResult.costoTotalPorUnidad) return;
    window.Costito && window.Costito.usarComoCosto(lastResult.costoTotalPorUnidad);
  }

  // Build on load (scripts are at end of body so DOM is ready)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', buildProduccion);
  } else {
    buildProduccion();
  }
})();
