/* ============================================================
   COSTITO — Presupuestos
   ============================================================ */
window.CostitoPresupuestos = (function () {
  const $ = (id) => document.getElementById(id);

  let presupuestos = [];
  let currentPpto = null; // presupuesto abierto en el builder
  let currentItems = [];

  function auth() {
    const a = window.CostitoAuth;
    return a && a.getUser() ? a : null;
  }

  function fmt(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function formatARS(n) {
    const num = Number(n) || 0;
    return '$ ' + num.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }

  function formatFecha(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  function toast(msg) {
    if (window.Costito && window.Costito.toast) window.Costito.toast(msg);
  }

  function estadoBadge(estado) {
    const map = { borrador: 'Borrador', enviado: 'Enviado', aceptado: 'Aceptado', rechazado: 'Rechazado' };
    return `<span class="ppto-badge ppto-badge-${fmt(estado)}">${fmt(map[estado] || estado)}</span>`;
  }

  /* ---- LISTA DE PRESUPUESTOS ---- */
  function renderLista() {
    const list = $('ppto-list');
    if (!list) return;
    if (!auth()) {
      list.innerHTML = '<p class="ppto-empty">Todavía no creaste ningún presupuesto. Usá el botón de abajo para empezar.</p>';
      return;
    }
    if (!presupuestos.length) {
      list.innerHTML = '<p class="ppto-empty">Todavía no creaste ningún presupuesto. Usá el botón de abajo para empezar.</p>';
      return;
    }
    list.innerHTML = presupuestos.map((p) => `
      <div class="ppto-card" data-id="${fmt(p.id)}">
        <div class="ppto-card-top">
          <div>
            <div class="ppto-titulo">${fmt(p.titulo)}</div>
            ${p.clienteNombre ? `<div class="ppto-cliente">${fmt(p.clienteNombre)}</div>` : ''}
          </div>
          <div class="ppto-card-right">
            ${estadoBadge(p.estado)}
            <div class="ppto-total">${formatARS(p.total)}</div>
          </div>
        </div>
        <div class="ppto-card-foot">
          <span class="ppto-fecha">${formatFecha(p.createdAt)}</span>
          <div class="ppto-card-actions">
            <button class="ppto-btn-open" data-open="${fmt(p.id)}">Abrir</button>
            <button class="ppto-btn-wa" data-wa="${fmt(p.id)}" title="Enviar por WhatsApp">
              <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.116.554 4.104 1.523 5.827L.057 23.885a.5.5 0 0 0 .606.61l6.199-1.625A11.945 11.945 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.794 9.794 0 0 1-4.98-1.362l-.356-.212-3.696.968.986-3.594-.232-.37A9.793 9.793 0 0 1 2.182 12C2.182 6.57 6.57 2.182 12 2.182S21.818 6.57 21.818 12 17.43 21.818 12 21.818z"/></svg>
              WA
            </button>
            <button class="ppto-btn-del" data-del="${fmt(p.id)}" title="Eliminar">🗑</button>
          </div>
        </div>
      </div>
    `).join('');
  }

  /* ---- BUILDER ---- */
  function calcTotal() {
    return currentItems.reduce((sum, it) => sum + (it.montoUnitario || 0) * (it.cantidad || 1), 0);
  }

  function renderBuilder() {
    const builder = $('ppto-builder');
    if (!builder || !currentPpto) return;
    builder.style.display = '';
    $('ppto-lista-wrap').style.display = 'none';

    $('ppto-builder-titulo').textContent = currentPpto.titulo;
    $('ppto-estado-sel').value = currentPpto.estado || 'borrador';
    $('ppto-notas-in').value = currentPpto.notas || '';

    // Llenar select de clientes
    const sel = $('ppto-cliente-sel');
    const clientes = window.CostitoClientes ? window.CostitoClientes.getClientes() : [];
    sel.innerHTML = '<option value="">Sin cliente</option>' +
      clientes.map((c) => `<option value="${fmt(c.id)}" ${c.id === currentPpto.clienteId ? 'selected' : ''}>${fmt(c.nombre)}</option>`).join('');

    renderItems();
  }

  function renderItems() {
    const tbody = $('ppto-items-body');
    if (!tbody) return;
    const total = calcTotal();

    if (!currentItems.length) {
      tbody.innerHTML = '<tr><td colspan="4" class="ppto-items-empty">Agregá el primer ítem abajo.</td></tr>';
    } else {
      tbody.innerHTML = currentItems.map((it) => `
        <tr data-item-id="${fmt(it.id)}">
          <td class="ppto-it-desc">
            <span class="ppto-it-desc-txt">${fmt(it.descripcion)}</span>
            <input class="ppto-it-desc-in" type="text" value="${fmt(it.descripcion)}" style="display:none" maxlength="120" />
          </td>
          <td class="ppto-it-cant"><input type="number" class="ppto-it-cant-in" value="${it.cantidad}" min="1" step="1" /></td>
          <td class="ppto-it-monto"><span class="pre-ars">$</span><input type="text" class="ppto-it-monto-in" value="${it.montoUnitario}" inputmode="numeric" /></td>
          <td class="ppto-it-sub">${formatARS((it.montoUnitario || 0) * (it.cantidad || 1))}</td>
          <td class="ppto-it-del"><button data-item-del="${fmt(it.id)}">✕</button></td>
        </tr>
      `).join('');
    }

    const totalEl = $('ppto-total-val');
    if (totalEl) totalEl.textContent = formatARS(total);

    const sena = currentPpto.senaRequerida || 0;
    const senaEl = $('ppto-sena-val');
    if (senaEl) senaEl.textContent = sena > 0 ? formatARS(sena) : '—';

    // Link público
    const linkWrap = $('ppto-link-wrap');
    const linkIn = $('ppto-link-in');
    if (linkWrap && linkIn && currentPpto.token) {
      linkWrap.style.display = '';
      linkIn.value = window.location.origin + '/presupuesto.html?token=' + currentPpto.token;
    }
  }

  async function saveItemChange(id, fields) {
    try { await auth().updatePresupuestoItem(id, fields); } catch (e) { /* silent */ }
  }

  async function syncTotal() {
    const total = calcTotal();
    if (currentPpto) currentPpto.total = total;
    try { await auth().updatePresupuesto(currentPpto.id, { total }); } catch (e) { /* silent */ }
    const totalEl = $('ppto-total-val');
    if (totalEl) totalEl.textContent = formatARS(total);
    // update lista
    const idx = presupuestos.findIndex((p) => p.id === currentPpto.id);
    if (idx !== -1) presupuestos[idx].total = total;
  }

  function initBuilderEvents() {
    const items = $('ppto-items-body');
    if (!items) return;

    items.addEventListener('input', (e) => {
      const tr = e.target.closest('tr[data-item-id]');
      if (!tr) return;
      const id = tr.dataset.itemId;
      const it = currentItems.find((x) => x.id === id);
      if (!it) return;

      if (e.target.classList.contains('ppto-it-cant-in')) {
        it.cantidad = parseInt(e.target.value) || 1;
        tr.querySelector('.ppto-it-sub').textContent = formatARS(it.montoUnitario * it.cantidad);
        clearTimeout(it._t);
        it._t = setTimeout(() => { saveItemChange(id, { cantidad: it.cantidad }); syncTotal(); }, 700);
      }
      if (e.target.classList.contains('ppto-it-monto-in')) {
        const raw = e.target.value.replace(/\./g, '').replace(',', '.');
        it.montoUnitario = parseFloat(raw) || 0;
        tr.querySelector('.ppto-it-sub').textContent = formatARS(it.montoUnitario * it.cantidad);
        clearTimeout(it._t);
        it._t = setTimeout(() => { saveItemChange(id, { montoUnitario: it.montoUnitario }); syncTotal(); }, 700);
      }
      if (e.target.classList.contains('ppto-it-desc-in')) {
        it.descripcion = e.target.value;
        clearTimeout(it._td);
        it._td = setTimeout(() => saveItemChange(id, { descripcion: it.descripcion }), 700);
      }
    });

    items.addEventListener('click', async (e) => {
      const delBtn = e.target.closest('[data-item-del]');
      const descTxt = e.target.closest('.ppto-it-desc-txt');

      if (delBtn) {
        const id = delBtn.dataset.itemDel;
        const a = auth(); if (!a) return;
        try {
          await a.deletePresupuestoItem(id);
          currentItems = currentItems.filter((x) => x.id !== id);
          renderItems();
          syncTotal();
        } catch (err) { toast('Error: ' + err.message); }
      }
      if (descTxt) {
        const tr = descTxt.closest('tr');
        descTxt.style.display = 'none';
        const inp = tr.querySelector('.ppto-it-desc-in');
        inp.style.display = '';
        inp.focus();
        inp.addEventListener('blur', () => { descTxt.textContent = inp.value || descTxt.textContent; descTxt.style.display = ''; inp.style.display = 'none'; }, { once: true });
      }
    });

    // Agregar ítem
    const addForm = $('ppto-add-item-form');
    if (addForm) {
      addForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const a = auth(); if (!a) return;
        const desc = ($('ppto-add-desc').value || '').trim();
        const cant = parseInt($('ppto-add-cant').value) || 1;
        const rawMonto = ($('ppto-add-monto').value || '').replace(/\./g, '').replace(',', '.');
        const monto = parseFloat(rawMonto) || 0;
        if (!desc) { toast('Ingresá una descripción para el ítem.'); return; }
        const btn = $('ppto-add-item-btn');
        btn.disabled = true;
        try {
          const id = await a.savePresupuestoItem(currentPpto.id, { descripcion: desc, cantidad: cant, montoUnitario: monto, origen: 'manual' });
          currentItems.push({ id, descripcion: desc, cantidad: cant, montoUnitario: monto, origen: 'manual' });
          $('ppto-add-desc').value = '';
          $('ppto-add-cant').value = '1';
          $('ppto-add-monto').value = '';
          renderItems();
          syncTotal();
        } catch (err) { toast('Error: ' + err.message); }
        finally { btn.disabled = false; }
      });
    }

    // Cambios de estado / cliente / notas
    const estadoSel = $('ppto-estado-sel');
    if (estadoSel) {
      estadoSel.addEventListener('change', async () => {
        const a = auth(); if (!a) return;
        currentPpto.estado = estadoSel.value;
        await auth().updatePresupuesto(currentPpto.id, { estado: currentPpto.estado });
        const idx = presupuestos.findIndex((p) => p.id === currentPpto.id);
        if (idx !== -1) presupuestos[idx].estado = currentPpto.estado;
      });
    }

    const clienteSel = $('ppto-cliente-sel');
    if (clienteSel) {
      clienteSel.addEventListener('change', async () => {
        const a = auth(); if (!a) return;
        currentPpto.clienteId = clienteSel.value || null;
        await auth().updatePresupuesto(currentPpto.id, { clienteId: currentPpto.clienteId });
      });
    }

    const notasIn = $('ppto-notas-in');
    if (notasIn) {
      let _nt;
      notasIn.addEventListener('input', () => {
        currentPpto.notas = notasIn.value;
        clearTimeout(_nt);
        _nt = setTimeout(() => auth() && auth().updatePresupuesto(currentPpto.id, { notas: currentPpto.notas }), 800);
      });
    }

    const tituloEl = $('ppto-builder-titulo');
    if (tituloEl) {
      tituloEl.addEventListener('click', () => {
        const nuevo = prompt('Título del presupuesto:', currentPpto.titulo);
        if (nuevo === null || !nuevo.trim()) return;
        currentPpto.titulo = nuevo.trim();
        tituloEl.textContent = currentPpto.titulo;
        auth() && auth().updatePresupuesto(currentPpto.id, { titulo: currentPpto.titulo });
        const idx = presupuestos.findIndex((p) => p.id === currentPpto.id);
        if (idx !== -1) presupuestos[idx].titulo = currentPpto.titulo;
      });
    }

    // Copiar link
    const copyLink = $('ppto-copy-link');
    if (copyLink) {
      copyLink.addEventListener('click', () => {
        const val = $('ppto-link-in').value;
        navigator.clipboard.writeText(val).then(() => toast('Link copiado.'));
      });
    }

    // Enviar por WA desde builder
    const waBuilder = $('ppto-wa-builder');
    if (waBuilder) {
      waBuilder.addEventListener('click', () => sendWA(currentPpto.id));
    }

    // Seña
    const senaIn = $('ppto-sena-in');
    if (senaIn) {
      let _st;
      senaIn.addEventListener('input', () => {
        const raw = senaIn.value.replace(/\./g, '').replace(',', '.');
        const v = parseFloat(raw) || 0;
        currentPpto.senaRequerida = v;
        const el = $('ppto-sena-val');
        if (el) el.textContent = v > 0 ? formatARS(v) : '—';
        clearTimeout(_st);
        _st = setTimeout(() => auth() && auth().updatePresupuesto(currentPpto.id, { senaRequerida: v }), 700);
      });
    }

    // Volver a la lista
    const back = $('ppto-back');
    if (back) {
      back.addEventListener('click', () => {
        currentPpto = null;
        currentItems = [];
        $('ppto-builder').style.display = 'none';
        $('ppto-lista-wrap').style.display = '';
        renderLista();
      });
    }
  }

  function sendWA(id) {
    const p = presupuestos.find((x) => x.id === id);
    if (!p) return;
    const link = window.location.origin + '/presupuesto.html?token=' + p.token;
    const msg = encodeURIComponent(`Hola${p.clienteNombre ? ' ' + p.clienteNombre : ''}! Te mando el presupuesto "${p.titulo}" (${formatARS(p.total)}): ${link}`);
    window.open('https://wa.me/?text=' + msg, '_blank');
  }

  async function openBuilder(id) {
    const p = presupuestos.find((x) => x.id === id);
    if (!p) return;
    currentPpto = { ...p };
    const a = auth(); if (!a) return;
    try {
      currentItems = await a.loadPresupuestoItems(id);
    } catch (e) { currentItems = []; }
    renderBuilder();
  }

  async function load() {
    const a = auth();
    if (!a) { presupuestos = []; renderLista(); return; }
    try { presupuestos = await a.loadPresupuestos(); }
    catch (e) { presupuestos = []; }
    renderLista();
  }

  function init() {
    const wrap = $('ppto-lista-wrap');
    if (!wrap) return;

    initBuilderEvents();

    // Crear nuevo presupuesto
    const newBtn = $('ppto-new-btn');
    if (newBtn) {
      newBtn.addEventListener('click', async () => {
        const a = auth();
        if (!a) { toast('Iniciá sesión para crear presupuestos.'); return; }
        newBtn.disabled = true;
        try {
          const { id, token } = await a.savePresupuesto({ titulo: 'Nuevo presupuesto', notas: '', senaRequerida: 0 });
          const ppto = { id, clienteId: null, titulo: 'Nuevo presupuesto', estado: 'borrador', total: 0, senaRequerida: 0, token, notas: '', createdAt: new Date().toISOString(), clienteNombre: null };
          presupuestos.unshift(ppto);
          currentItems = [];
          currentPpto = { ...ppto };
          renderBuilder();
        } catch (err) { toast('Error: ' + err.message); }
        finally { newBtn.disabled = false; }
      });
    }

    // Eventos en lista
    const list = $('ppto-list');
    if (list) {
      list.addEventListener('click', async (e) => {
        const openBtn = e.target.closest('[data-open]');
        const waBtn = e.target.closest('[data-wa]');
        const delBtn = e.target.closest('[data-del]');

        if (openBtn) await openBuilder(openBtn.dataset.open);

        if (waBtn) sendWA(waBtn.dataset.wa);

        if (delBtn) {
          const id = delBtn.dataset.del;
          const p = presupuestos.find((x) => x.id === id);
          if (!p) return;
          if (!confirm(`¿Eliminás el presupuesto "${p.titulo}"? Esta acción no se puede deshacer.`)) return;
          const a = auth(); if (!a) return;
          try {
            await a.deletePresupuesto(id);
            presupuestos = presupuestos.filter((x) => x.id !== id);
            toast('Presupuesto eliminado.');
            renderLista();
          } catch (err) { toast('Error: ' + err.message); }
        }
      });
    }

    document.addEventListener('costito:authchange', load);
    load();
  }

  return { init, load };
})();

document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('ppto-lista-wrap')) window.CostitoPresupuestos.init();
});
