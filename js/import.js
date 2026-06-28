/* ============================================================
   COSTITO — Importador de productos desde CSV (feature Premium)
   ------------------------------------------------------------
   Flujo: "Importar CSV" → modal (plantilla + subir archivo) → preview con
   validación → confirmar → se calcula el precio de cada fila con la config
   actual de la calculadora (Costito.importarProducto) y se guarda en la nube.
   ============================================================ */
(function () {
  const $ = (id) => document.getElementById(id);
  const C = window.Costito;
  const toast = (m) => (C && C.toast ? C.toast(m) : null);

  const btn = $('impCsv');
  const fileInput = $('impFile');
  const overlay = $('impOverlay');
  const body = $('impBody');
  if (!btn || !fileInput || !overlay || !body || !C) return;

  let parsedRows = [];

  // ---------- Plantilla ----------
  function descargarPlantilla() {
    const csv = 'nombre,costo,margen,categoria\n'
      + 'Remera lisa,5000,40,Ropa y calzado\n'
      + 'Taza cerámica,1200,50,Hogar y deco\n'
      + 'Auriculares,8000,35,Electrónica\n';
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'costito-plantilla.csv'; a.click();
    URL.revokeObjectURL(url);
    toast('Plantilla descargada');
  }

  // ---------- Parser CSV (detecta separador y respeta comillas) ----------
  function detectDelim(line) {
    const c = { ',': (line.match(/,/g) || []).length, ';': (line.match(/;/g) || []).length, '\t': (line.match(/\t/g) || []).length };
    return Object.keys(c).sort((a, b) => c[b] - c[a])[0] || ',';
  }
  function parseLine(line, delim) {
    const out = []; let cur = ''; let q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (q) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') q = false;
        else cur += ch;
      } else if (ch === '"') q = true;
      else if (ch === delim) { out.push(cur); cur = ''; }
      else cur += ch;
    }
    out.push(cur);
    return out.map((s) => s.trim());
  }
  function parseCSV(text) {
    const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim() !== '');
    if (!lines.length) return { rows: [], errores: ['El archivo está vacío.'] };
    const delim = detectDelim(lines[0]);
    const headers = parseLine(lines[0], delim).map((h) => h.toLowerCase());
    const idx = { nombre: headers.indexOf('nombre'), costo: headers.indexOf('costo'), margen: headers.indexOf('margen'), categoria: headers.indexOf('categoria') };
    if (idx.nombre < 0 || idx.costo < 0) {
      return { rows: [], errores: ['El archivo necesita al menos las columnas "nombre" y "costo". Usá la plantilla.'] };
    }
    const rows = []; const errores = [];
    for (let i = 1; i < lines.length; i++) {
      const cells = parseLine(lines[i], delim);
      const nombre = (cells[idx.nombre] || '').trim();
      const costoRaw = cells[idx.costo] || '';
      const margenRaw = idx.margen >= 0 ? (cells[idx.margen] || '') : '';
      const categoria = idx.categoria >= 0 ? (cells[idx.categoria] || '').trim() : '';
      if (!nombre && !costoRaw.trim()) continue; // fila vacía
      const costo = C.parseNum(costoRaw);
      const margen = margenRaw.trim() ? C.parseNum(margenRaw) : 40; // default 40%
      if (!nombre) { errores.push('Fila ' + (i + 1) + ': falta el nombre.'); continue; }
      if (!(costo > 0)) { errores.push('Fila ' + (i + 1) + ': costo inválido (“' + costoRaw + '”).'); continue; }
      if (margen < 0 || margen >= 100) { errores.push('Fila ' + (i + 1) + ': margen fuera de rango (“' + margenRaw + '”).'); continue; }
      rows.push({ nombre, costo, margen, categoria });
    }
    return { rows, errores };
  }

  // ---------- Modal ----------
  function openModal() { overlay.classList.add('on'); }
  function closeModal() { overlay.classList.remove('on'); parsedRows = []; }

  function renderChooser() {
    const cfg = C.configActual ? C.configActual() : { canal: '' };
    C.setHTML(body,
      '<h3 class="modal-title">Importar productos</h3>' +
      '<p class="modal-hint">Subí un CSV con tus productos. Calculamos el precio de cada uno con la configuración actual de la calculadora.</p>' +
      '<ol class="imp-steps">' +
        '<li><b>1.</b> Bajá la plantilla y llenala en Excel o Google Sheets.</li>' +
        '<li><b>2.</b> Subí el archivo. Vas a ver un preview antes de guardar.</li>' +
      '</ol>' +
      '<div class="imp-cfg">Precios calculados con: <b>' + C.escapeHtml(cfg.canal || 'el canal actual') + '</b>. Cambialo en la Calculadora si hace falta.</div>' +
      '<div class="imp-actions">' +
        '<button class="imp-tpl" id="impTpl">Descargar plantilla</button>' +
        '<button class="imp-pick" id="impPick">Elegir archivo CSV</button>' +
      '</div>');
    $('impTpl').addEventListener('click', descargarPlantilla);
    $('impPick').addEventListener('click', () => fileInput.click());
  }

  function renderPreview(result) {
    parsedRows = result.rows;
    const n = result.rows.length;
    const filas = result.rows.slice(0, 8).map((r) =>
      '<tr><td>' + C.escapeHtml(r.nombre) + '</td><td>$' + C.fmt(r.costo) + '</td><td>' + r.margen + '%</td><td>' + C.escapeHtml(r.categoria || '—') + '</td></tr>'
    ).join('');
    const errHtml = result.errores.length
      ? '<div class="imp-errs"><b>' + result.errores.length + ' fila(s) con problemas (se omiten):</b><ul>' +
        result.errores.slice(0, 5).map((e) => '<li>' + C.escapeHtml(e) + '</li>').join('') +
        (result.errores.length > 5 ? '<li>…y ' + (result.errores.length - 5) + ' más</li>' : '') + '</ul></div>'
      : '';
    C.setHTML(body,
      '<h3 class="modal-title">Revisá antes de importar</h3>' +
      '<p class="modal-hint">' + (n ? n + ' producto(s) listos para guardar.' : 'No encontramos filas válidas.') + '</p>' +
      (n ? '<div class="imp-tblwrap"><table class="imp-tbl"><thead><tr><th>Producto</th><th>Costo</th><th>Margen</th><th>Categoría</th></tr></thead><tbody>' +
        filas + '</tbody></table></div>' + (n > 8 ? '<p class="imp-more">…y ' + (n - 8) + ' más</p>' : '') : '') +
      errHtml +
      '<div class="imp-actions">' +
        '<button class="imp-tpl" id="impBack">Volver</button>' +
        (n ? '<button class="imp-go" id="impGo">Importar ' + n + ' producto' + (n > 1 ? 's' : '') + '</button>' : '') +
      '</div>');
    $('impBack').addEventListener('click', renderChooser);
    if (n) $('impGo').addEventListener('click', commitImport);
  }

  // ---------- Commit (secuencial para no martillar la API) ----------
  function commitImport() {
    const go = $('impGo');
    go.disabled = true;
    const total = parsedRows.length;
    let ok = 0; let fail = 0;
    const run = (i) => {
      if (i >= total) {
        if (C.refreshProds) C.refreshProds();
        closeModal();
        toast(ok + ' producto(s) importados' + (fail ? ' · ' + fail + ' fallaron' : '') + ' 🟢');
        return;
      }
      go.textContent = 'Importando… ' + (i + 1) + '/' + total;
      C.importarProducto(parsedRows[i])
        .then(() => { ok++; })
        .catch(() => { fail++; })
        .finally(() => run(i + 1));
    };
    run(0);
  }

  // ---------- Gating + eventos ----------
  btn.addEventListener('click', () => {
    if (!window.CostitoAuth || !window.CostitoAuth.getUser()) {
      toast('Creá una cuenta para importar tus productos');
      const ao = $('authOverlay');
      if (ao) { ao.classList.add('on'); setTimeout(() => { const el = $('authEmail'); if (el) el.focus(); }, 60); }
      return;
    }
    if (!C.isPremium()) {
      toast('Importar en masa es Premium. ¡Pasate por $2.000/mes! 🟢');
      $('acctBtn').click();
      return;
    }
    renderChooser();
    openModal();
  });

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => renderPreview(parseCSV(String(reader.result)));
    reader.onerror = () => toast('No se pudo leer el archivo');
    reader.readAsText(file, 'UTF-8');
    fileInput.value = '';
  });

  $('impClose').addEventListener('click', closeModal);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
})();
