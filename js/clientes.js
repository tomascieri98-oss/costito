/* ============================================================
   COSTITO — Clientes
   ============================================================ */
window.CostitoClientes = (function () {
  const $ = (id) => document.getElementById(id);
  let clientes = [];
  let editId = null;

  function auth() {
    const a = window.CostitoAuth;
    return a && a.getUser() ? a : null;
  }

  function fmt(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function render() {
    const list = $('cli-list');
    if (!list) return;
    if (!clientes.length) {
      list.innerHTML = '<p class="cli-empty">Todavía no tenés clientes. Agregá el primero arriba.</p>';
      return;
    }
    list.innerHTML = clientes.map((c) => `
      <div class="cli-card" data-id="${fmt(c.id)}">
        <div class="cli-card-body">
          <div class="cli-nombre">${fmt(c.nombre)}</div>
          ${c.contacto ? `<div class="cli-contacto">${fmt(c.contacto)}</div>` : ''}
        </div>
        <div class="cli-card-actions">
          <button class="cli-btn-edit" data-edit="${fmt(c.id)}" title="Editar">✏</button>
          <button class="cli-btn-del" data-del="${fmt(c.id)}" title="Eliminar">🗑</button>
        </div>
      </div>
    `).join('');
  }

  function resetForm() {
    const n = $('cli-nombre-in');
    const c = $('cli-contacto-in');
    if (n) n.value = '';
    if (c) c.value = '';
    editId = null;
    const btn = $('cli-save-btn');
    if (btn) btn.textContent = 'Agregar cliente';
    const cancel = $('cli-cancel-btn');
    if (cancel) cancel.style.display = 'none';
  }

  function toast(msg) {
    if (window.Costito && window.Costito.toast) window.Costito.toast(msg);
  }

  async function load() {
    const a = auth();
    if (!a) { clientes = []; render(); return; }
    try {
      clientes = await a.loadClientes();
    } catch (e) { clientes = []; }
    render();
  }

  function init() {
    const form = $('cli-form');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const a = auth();
      if (!a) return;
      const nombre = ($('cli-nombre-in').value || '').trim();
      const contacto = ($('cli-contacto-in').value || '').trim();
      if (!nombre) { toast('Ingresá el nombre del cliente.'); return; }
      const btn = $('cli-save-btn');
      btn.disabled = true;
      try {
        if (editId) {
          await a.updateCliente(editId, { nombre, contacto });
          const idx = clientes.findIndex((c) => c.id === editId);
          if (idx !== -1) { clientes[idx].nombre = nombre; clientes[idx].contacto = contacto; }
          toast('Cliente actualizado.');
        } else {
          const id = await a.saveCliente({ nombre, contacto });
          clientes.push({ id, nombre, contacto });
          clientes.sort((a, b) => a.nombre.localeCompare(b.nombre));
          toast('Cliente agregado.');
        }
        resetForm();
        render();
      } catch (err) { toast('Error: ' + err.message); }
      finally { btn.disabled = false; }
    });

    $('cli-cancel-btn').addEventListener('click', resetForm);

    $('cli-list').addEventListener('click', async (e) => {
      const editBtn = e.target.closest('[data-edit]');
      const delBtn = e.target.closest('[data-del]');

      if (editBtn) {
        const id = editBtn.dataset.edit;
        const c = clientes.find((x) => x.id === id);
        if (!c) return;
        editId = id;
        $('cli-nombre-in').value = c.nombre;
        $('cli-contacto-in').value = c.contacto || '';
        $('cli-save-btn').textContent = 'Guardar cambios';
        $('cli-cancel-btn').style.display = '';
        $('cli-nombre-in').focus();
      }

      if (delBtn) {
        const id = delBtn.dataset.del;
        const c = clientes.find((x) => x.id === id);
        if (!c) return;
        if (!confirm(`¿Eliminás a "${c.nombre}"? Sus presupuestos quedarán sin cliente asignado.`)) return;
        const a = auth();
        if (!a) return;
        try {
          await a.deleteCliente(id);
          clientes = clientes.filter((x) => x.id !== id);
          if (editId === id) resetForm();
          toast('Cliente eliminado.');
          render();
        } catch (err) { toast('Error: ' + err.message); }
      }
    });

    document.addEventListener('costito:authchange', load);
    load();
  }

  function getClientes() { return clientes; }

  return { init, load, getClientes };
})();

document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('cli-form')) window.CostitoClientes.init();
});
