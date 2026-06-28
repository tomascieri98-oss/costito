/* ============================================================
   COSTITO — Mi negocio (nombre + logo para brandear el PDF)
   ------------------------------------------------------------
   El logo se redimensiona/comprime en el navegador y se guarda en
   localStorage (cloud más adelante con el bucket de Supabase del socio).
   app.js lee CostitoNegocio.get() al armar el PDF de la lista de precios.
   ============================================================ */
window.CostitoNegocio = (function () {
  const LS = 'costito_negocio';
  const MAX = 260; // lado máximo del logo en px (mantiene chico el localStorage)

  function get() {
    try { return JSON.parse(localStorage.getItem(LS)) || { nombre: '', logo: '' }; }
    catch (e) { return { nombre: '', logo: '' }; }
  }
  function set(data) { localStorage.setItem(LS, JSON.stringify(data)); }

  // Redimensiona una imagen a un dataURL PNG (preserva transparencia de logos)
  function resize(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        const scale = Math.min(1, MAX / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(c.toDataURL('image/png'));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la imagen')); };
      img.src = url;
    });
  }

  return { get, set, resize };
})();

/* ---------- UI ---------- */
(function negocioUI() {
  const $ = (id) => document.getElementById(id);
  const N = window.CostitoNegocio;
  const toast = (m) => (window.Costito && window.Costito.toast ? window.Costito.toast(m) : null);

  const card = $('negocioCard');
  if (!card || !N) return;
  const img = $('negLogoImg');
  const ph = $('negLogoPh');
  const nombre = $('negNombre');
  const file = $('negFile');
  const btnUpload = $('negUpload');
  const btnRemove = $('negRemove');

  function render() {
    const d = N.get();
    nombre.value = d.nombre || '';
    if (d.logo) {
      img.src = d.logo; img.style.display = 'block'; ph.style.display = 'none';
      btnRemove.style.display = 'inline-block';
    } else {
      img.removeAttribute('src'); img.style.display = 'none'; ph.style.display = 'flex';
      btnRemove.style.display = 'none';
    }
  }

  // Guardar nombre mientras escribe
  nombre.addEventListener('input', () => {
    const d = N.get(); d.nombre = nombre.value.trim(); N.set(d);
  });

  // Subir logo
  const pick = () => file.click();
  btnUpload.addEventListener('click', pick);
  $('negLogoBox').addEventListener('click', pick);
  $('negLogoBox').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });

  file.addEventListener('change', (e) => {
    const f = e.target.files[0];
    if (!f) return;
    N.resize(f)
      .then((dataUrl) => {
        const d = N.get(); d.logo = dataUrl; N.set(d);
        render();
        toast('Logo guardado · va a salir en tu PDF');
      })
      .catch(() => toast('No se pudo procesar la imagen'))
      .finally(() => { file.value = ''; });
  });

  btnRemove.addEventListener('click', () => {
    const d = N.get(); d.logo = ''; N.set(d);
    render();
    toast('Logo quitado');
  });

  render();
})();
