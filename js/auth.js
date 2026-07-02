/* ============================================================
   COSTITO — Splash + Auth (Supabase)
   ============================================================ */

/* ---------- 1) SPLASH DE ENTRADA ---------- */
(function splash() {
  const el = document.getElementById('splash');
  if (!el) return;
  if (sessionStorage.getItem('costito_splash')) { el.remove(); return; }
  sessionStorage.setItem('costito_splash', '1');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hold = reduce ? 350 : 1250;
  setTimeout(() => {
    el.classList.add('gone');
    setTimeout(() => el.remove(), 550);
  }, hold);
})();

/* ---------- 2) CAPA AUTH (Supabase) ---------- */
window.CostitoAuth = (function () {
  const SUPABASE_URL = 'https://pedpqmrxzftddvgfwlxx.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_8boyR6fKSt7suaWyF038tw_heNNiiD1';
  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  let currentUser = null;
  let listeners = [];

  function makeUser(sbUser) {
    if (!sbUser) return null;
    const email = sbUser.email;
    const name = (sbUser.user_metadata && sbUser.user_metadata.full_name)
      ? sbUser.user_metadata.full_name
      : email.split('@')[0].replace(/[._-]+/g, ' ').trim();
    const initials = name.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase() || email[0].toUpperCase();
    return { id: sbUser.id, email, name, initials };
  }

  function emit(u) { listeners.forEach((f) => { try { f(u); } catch (e) {} }); }
  function getUser() { return currentUser; }
  function onChange(cb) { listeners.push(cb); return () => { listeners = listeners.filter((f) => f !== cb); }; }

  // Supabase emite INITIAL_SESSION al cargar — sincroniza el estado apenas resuelve
  // En este callback SOLO va trabajo SÍNCRONO. Hacer llamadas a Supabase acá adentro
  // (await sb.from..., loadProducts) deadlock-ea el cliente: signInWithPassword nunca
  // resuelve y el botón queda en "Un segundo…". El fetch del plan y la carga de productos
  // se difieren con setTimeout(0) para soltar el lock de auth. (Patrón recomendado por Supabase.)
  sb.auth.onAuthStateChange((_event, session) => {
    if (!session) {
      currentUser = null;
      emit(null);
      setTimeout(() => document.dispatchEvent(new CustomEvent('costito:authchange', { detail: null })), 0);
      return;
    }
    const base = makeUser(session.user);
    currentUser = base;     // user base inmediato → el avatar aparece en el header al toque
    emit(currentUser);
    // Diferido: el plan vive en Supabase (tabla profiles). Se trae FUERA del callback.
    setTimeout(async () => {
      try {
        const { data: perfil } = await sb.from('profiles')
          .select('plan, plan_valid_until, promo_type')
          .eq('id', session.user.id).single();
        let plan = (perfil && perfil.plan) ? perfil.plan : 'free';
        const validUntil = perfil && perfil.plan_valid_until ? new Date(perfil.plan_valid_until) : null;
        // Si el plan tiene fecha de vencimiento y ya venció, tratar como free
        if (plan === 'premium' && validUntil && validUntil < new Date()) plan = 'free';
        currentUser = {
          ...base,
          plan,
          planValidUntil: validUntil,
          promoType: (perfil && perfil.promo_type) || null,
        };
      } catch (e) {
        currentUser = { ...base, plan: 'free', planValidUntil: null, promoType: null };
      }
      emit(currentUser);
      document.dispatchEvent(new CustomEvent('costito:authchange', { detail: currentUser }));
    }, 0);
  });

  function translateError(msg) {
    if (!msg) return 'Algo salió mal, intentá de nuevo.';
    if (msg.includes('Invalid login credentials')) return 'Email o contraseña incorrectos.';
    if (msg.includes('Email not confirmed'))       return 'Confirmá tu email antes de ingresar.';
    if (msg.includes('User already registered'))   return 'Ya existe una cuenta con ese email. Intentá entrar.';
    if (msg.includes('Password should be'))        return 'La contraseña necesita al menos 6 caracteres.';
    if (msg.includes('rate limit') || msg.includes('too many')) return 'Demasiados intentos. Esperá unos minutos.';
    return msg;
  }

  function signInWithEmail(email, pass, mode) {
    email = (email || '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
      return Promise.reject(new Error('Ingresá un email válido.'));
    if (!pass || pass.length < 6)
      return Promise.reject(new Error('La contraseña necesita al menos 6 caracteres.'));

    const action = mode === 'signup'
      ? sb.auth.signUp({ email, password: pass })
      : sb.auth.signInWithPassword({ email, password: pass });

    return action.then(async ({ data, error }) => {
      if (error) throw new Error(translateError(error.message));
      // signUp sin confirmación de email: data.session es null
      if (mode === 'signup' && data.user && !data.session) {
        throw new Error('Te mandamos un email de confirmación. Revisá tu bandeja.');
      }
      // Al registrarse, intentar reclamar la promo de lanzamiento
      if (mode === 'signup' && data.session) {
        try {
          const promoRes = await fetch(SUPABASE_URL + '/functions/v1/reclamar-promo', {
            method: 'POST',
            headers: {
              'Authorization': 'Bearer ' + data.session.access_token,
              'apikey': SUPABASE_KEY,
              'Content-Type': 'application/json',
            },
            body: '{}',
          });
          if (promoRes.ok) {
            const promoData = await promoRes.json();
            if (promoData.result === 'success') {
              setTimeout(() => {
                const t = window.Costito && window.Costito.toast;
                if (t) t('🎉 ¡Entraste a la promo de lanzamiento! Tenés 30 días del plan completo gratis.');
              }, 1000);
            }
          }
        } catch (e) { /* silencioso — no bloquea el registro */ }
      }
      return makeUser(data.user);
    });
  }

  function signInWithGoogle() {
    return sb.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + window.location.pathname },
    }).then(({ error }) => {
      if (error) throw new Error(translateError(error.message));
    });
  }

  function signOut() {
    return sb.auth.signOut();
  }

  function resetPassword(email) {
    return sb.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: window.location.origin + window.location.pathname,
    }).then(({ error }) => {
      if (error) throw new Error(translateError(error.message));
    });
  }

  function loadProducts() {
    return sb.from('productos')
      .select('id, nombre, costo, categoria, codigo, tipo, recipe_data, created_at, product_prices(id, canal_nombre, margen, precio_publicar, ganancia, created_at)')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) throw new Error(error.message);
        return (data || []).map((r) => ({
          id: r.id,
          nombre: r.nombre,
          costoARS: r.costo || 0,
          categoria: r.categoria || '',
          codigo: r.codigo || '',
          tipo: r.tipo || 'reventa',
          recipeData: r.recipe_data || null,
          createdAt: r.created_at,
          precios: (r.product_prices || [])
            .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
            .map((p) => ({
              id: p.id,
              canal: p.canal_nombre,
              margen: p.margen,
              precioARS: p.precio_publicar,
              ganancia: p.ganancia,
              fecha: new Date(p.created_at).toLocaleDateString('es-AR'),
            })),
        }));
      });
  }

  function saveProduct({ nombre, costo, canalNombre, margen, categoria, codigo, tipo, recipeData }) {
    if (!currentUser) return Promise.reject(new Error('No hay sesión activa.'));
    return sb.from('productos')
      .insert({
        user_id: currentUser.id,
        nombre,
        costo: costo || 0,
        margen: margen || 0,
        canal_nombre: canalNombre || '',
        categoria: categoria || '',
        codigo: codigo || '',
        tipo: tipo || 'reventa',
        recipe_data: recipeData || null,
      })
      .select('id')
      .single()
      .then(({ data, error }) => {
        if (error) {
          if (error.message && error.message.includes('limit_reached'))
            throw new Error('limit_reached');
          throw new Error(error.message);
        }
        return data.id;
      });
  }

  function savePrecio(productId, { canal, margen, precioARS, ganancia }) {
    if (!currentUser) return Promise.reject(new Error('No hay sesión activa.'));
    return sb.from('product_prices')
      .insert({
        product_id: productId,
        user_id: currentUser.id,
        canal_nombre: canal || '',
        margen: margen || 0,
        precio_publicar: precioARS || 0,
        ganancia: ganancia || 0,
      })
      .select('id')
      .single()
      .then(({ data, error }) => {
        if (error) throw new Error(error.message);
        return data.id;
      });
  }

  function deletePrecio(id) {
    return sb.from('product_prices').delete().eq('id', id).then(({ error }) => {
      if (error) throw new Error(error.message);
    });
  }

  function deleteProduct(id) {
    return sb.from('productos').delete().eq('id', id).then(({ error }) => {
      if (error) throw new Error(error.message);
    });
  }

  function updateProduct(id, { costo, recipeData }) {
    if (!currentUser) return Promise.reject(new Error('No hay sesión activa.'));
    return sb.from('productos')
      .update({ costo: costo || 0, recipe_data: recipeData || null })
      .eq('id', id)
      .eq('user_id', currentUser.id)
      .then(({ error }) => { if (error) throw new Error(error.message); });
  }

  function loadInsumos() {
    if (!currentUser) return Promise.resolve([]);
    return sb.from('insumos')
      .select('id, nombre, cantidad_comprada, unidad, precio_total')
      .eq('user_id', currentUser.id)
      .order('created_at', { ascending: true })
      .then(({ data, error }) => {
        if (error) throw new Error(error.message);
        return (data || []).map((r) => ({
          supabaseId: r.id,
          nombre: r.nombre,
          cantidadComprada: r.cantidad_comprada,
          unidad: r.unidad,
          precioTotal: r.precio_total,
        }));
      });
  }

  function upsertInsumo({ supabaseId, nombre, cantidadComprada, unidad, precioTotal }) {
    if (!currentUser) return Promise.resolve(null);
    const row = { nombre, cantidad_comprada: cantidadComprada || 0, unidad, precio_total: precioTotal || 0 };
    if (supabaseId) {
      return sb.from('insumos').update(row).eq('id', supabaseId).eq('user_id', currentUser.id)
        .then(({ error }) => { if (error) throw new Error(error.message); return supabaseId; });
    }
    return sb.from('insumos').insert({ ...row, user_id: currentUser.id }).select('id').single()
      .then(({ data, error }) => { if (error) throw new Error(error.message); return data.id; });
  }

  function deleteInsumo(supabaseId) {
    if (!supabaseId || !currentUser) return Promise.resolve();
    return sb.from('insumos').delete().eq('id', supabaseId).eq('user_id', currentUser.id)
      .then(({ error }) => { if (error) throw new Error(error.message); });
  }

  /* ---------- CLIENTES ---------- */
  function loadClientes() {
    if (!currentUser) return Promise.resolve([]);
    return sb.from('clientes').select('id, nombre, contacto, created_at')
      .eq('user_id', currentUser.id).order('nombre', { ascending: true })
      .then(({ data, error }) => {
        if (error) throw new Error(error.message);
        return (data || []).map((r) => ({ id: r.id, nombre: r.nombre, contacto: r.contacto || '', createdAt: r.created_at }));
      });
  }
  function saveCliente({ nombre, contacto }) {
    if (!currentUser) return Promise.reject(new Error('No hay sesión activa.'));
    return sb.from('clientes').insert({ user_id: currentUser.id, nombre: nombre || '', contacto: contacto || '' })
      .select('id').single().then(({ data, error }) => { if (error) throw new Error(error.message); return data.id; });
  }
  function updateCliente(id, { nombre, contacto }) {
    if (!currentUser) return Promise.reject(new Error('No hay sesión activa.'));
    return sb.from('clientes').update({ nombre: nombre || '', contacto: contacto || '' })
      .eq('id', id).eq('user_id', currentUser.id).then(({ error }) => { if (error) throw new Error(error.message); });
  }
  function deleteCliente(id) {
    if (!currentUser) return Promise.reject(new Error('No hay sesión activa.'));
    return sb.from('clientes').delete().eq('id', id).eq('user_id', currentUser.id)
      .then(({ error }) => { if (error) throw new Error(error.message); });
  }

  /* ---------- PRESUPUESTOS ---------- */
  function loadPresupuestos() {
    if (!currentUser) return Promise.resolve([]);
    return sb.from('presupuestos')
      .select('id, cliente_id, titulo, estado, total, sena_requerida, link_publico_token, notas, created_at, aceptado_at, clientes(nombre)')
      .eq('user_id', currentUser.id).order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) throw new Error(error.message);
        return (data || []).map((r) => ({
          id: r.id, clienteId: r.cliente_id, titulo: r.titulo, estado: r.estado,
          total: r.total || 0, senaRequerida: r.sena_requerida || 0,
          token: r.link_publico_token, notas: r.notas || '',
          createdAt: r.created_at, aceptadoAt: r.aceptado_at,
          clienteNombre: r.clientes ? r.clientes.nombre : null,
        }));
      });
  }
  function savePresupuesto({ clienteId, titulo, notas, senaRequerida }) {
    if (!currentUser) return Promise.reject(new Error('No hay sesión activa.'));
    return sb.from('presupuestos').insert({
      user_id: currentUser.id, cliente_id: clienteId || null,
      titulo: titulo || 'Nuevo presupuesto', notas: notas || '',
      sena_requerida: senaRequerida || 0,
    }).select('id, link_publico_token').single()
      .then(({ data, error }) => { if (error) throw new Error(error.message); return { id: data.id, token: data.link_publico_token }; });
  }
  function updatePresupuesto(id, fields) {
    if (!currentUser) return Promise.reject(new Error('No hay sesión activa.'));
    const row = {};
    if (fields.titulo !== undefined)       row.titulo = fields.titulo;
    if (fields.clienteId !== undefined)    row.cliente_id = fields.clienteId;
    if (fields.estado !== undefined)       row.estado = fields.estado;
    if (fields.notas !== undefined)        row.notas = fields.notas;
    if (fields.total !== undefined)        row.total = fields.total;
    if (fields.senaRequerida !== undefined) row.sena_requerida = fields.senaRequerida;
    return sb.from('presupuestos').update(row).eq('id', id).eq('user_id', currentUser.id)
      .then(({ error }) => { if (error) throw new Error(error.message); });
  }
  function deletePresupuesto(id) {
    if (!currentUser) return Promise.reject(new Error('No hay sesión activa.'));
    return sb.from('presupuestos').delete().eq('id', id).eq('user_id', currentUser.id)
      .then(({ error }) => { if (error) throw new Error(error.message); });
  }

  /* ---------- PRESUPUESTO ITEMS ---------- */
  function loadPresupuestoItems(presupuestoId) {
    return sb.from('presupuesto_items')
      .select('id, descripcion, origen, origen_ref_id, cantidad, monto_unitario, created_at')
      .eq('presupuesto_id', presupuestoId).order('created_at', { ascending: true })
      .then(({ data, error }) => {
        if (error) throw new Error(error.message);
        return (data || []).map((r) => ({
          id: r.id, descripcion: r.descripcion, origen: r.origen,
          origenRefId: r.origen_ref_id, cantidad: r.cantidad || 1,
          montoUnitario: r.monto_unitario || 0, createdAt: r.created_at,
        }));
      });
  }
  function savePresupuestoItem(presupuestoId, { descripcion, origen, origenRefId, cantidad, montoUnitario }) {
    return sb.from('presupuesto_items').insert({
      presupuesto_id: presupuestoId, descripcion: descripcion || '',
      origen: origen || 'manual', origen_ref_id: origenRefId || null,
      cantidad: cantidad || 1, monto_unitario: montoUnitario || 0,
    }).select('id').single()
      .then(({ data, error }) => { if (error) throw new Error(error.message); return data.id; });
  }
  function updatePresupuestoItem(id, { descripcion, cantidad, montoUnitario }) {
    const row = {};
    if (descripcion !== undefined)    row.descripcion = descripcion;
    if (cantidad !== undefined)       row.cantidad = cantidad;
    if (montoUnitario !== undefined)  row.monto_unitario = montoUnitario;
    return sb.from('presupuesto_items').update(row).eq('id', id)
      .then(({ error }) => { if (error) throw new Error(error.message); });
  }
  function deletePresupuestoItem(id) {
    return sb.from('presupuesto_items').delete().eq('id', id)
      .then(({ error }) => { if (error) throw new Error(error.message); });
  }

  /* ---------- PÁGINA PÚBLICA ---------- */
  function getPresupuestoPublico(token) {
    return sb.from('presupuestos')
      .select('id, titulo, estado, total, sena_requerida, notas, created_at, aceptado_at, link_publico_token, clientes(nombre, contacto)')
      .eq('link_publico_token', token).single()
      .then(({ data, error }) => {
        if (error) throw new Error(error.message);
        return {
          id: data.id, titulo: data.titulo, estado: data.estado,
          total: data.total || 0, senaRequerida: data.sena_requerida || 0,
          notas: data.notas || '', token: data.link_publico_token,
          createdAt: data.created_at, aceptadoAt: data.aceptado_at,
          clienteNombre: data.clientes ? data.clientes.nombre : null,
          clienteContacto: data.clientes ? data.clientes.contacto : null,
        };
      });
  }
  function getItemsPublicos(presupuestoId) {
    return sb.from('presupuesto_items')
      .select('id, descripcion, cantidad, monto_unitario, origen')
      .eq('presupuesto_id', presupuestoId).order('created_at', { ascending: true })
      .then(({ data, error }) => {
        if (error) throw new Error(error.message);
        return (data || []).map((r) => ({ id: r.id, descripcion: r.descripcion, cantidad: r.cantidad || 1, montoUnitario: r.monto_unitario || 0, origen: r.origen }));
      });
  }
  function aceptarPresupuesto(token) {
    return sb.rpc('accept_presupuesto', { p_token: token })
      .then(({ data, error }) => {
        if (error) throw new Error(error.message);
        if (!data || !data.ok) throw new Error(data ? data.error : 'Error desconocido');
        return data;
      });
  }

  return { getUser, onChange, signInWithEmail, signInWithGoogle, signOut, resetPassword, loadProducts, saveProduct, savePrecio, deletePrecio, deleteProduct, updateProduct, loadInsumos, upsertInsumo, deleteInsumo, loadClientes, saveCliente, updateCliente, deleteCliente, loadPresupuestos, savePresupuesto, updatePresupuesto, deletePresupuesto, loadPresupuestoItems, savePresupuestoItem, updatePresupuestoItem, deletePresupuestoItem, getPresupuestoPublico, getItemsPublicos, aceptarPresupuesto };
})();

/* ---------- 3) WIRING DE LA UI ---------- */
(function authUI() {
  const Auth = window.CostitoAuth;
  const $ = (id) => document.getElementById(id);
  const toast = (m) => (window.Costito && window.Costito.toast ? window.Costito.toast(m) : null);

  const btn = $('acctBtn');
  const menu = $('acctMenu');
  const overlay = $('authOverlay');
  if (!btn || !overlay) return;

  let mode = 'login'; // 'login' | 'signup'

  function renderAccount(u) {
    if (u) {
      btn.classList.add('logged');
      $('acctAvatar').textContent = u.initials;
      btn.setAttribute('aria-label', 'Cuenta de ' + u.name);
      $('acctMenuAvatar').textContent = u.initials;
      $('acctMenuName').textContent = u.name;
      $('acctMenuEmail').textContent = u.email;
    } else {
      btn.classList.remove('logged');
      btn.setAttribute('aria-label', 'Entrar a tu cuenta');
      closeMenu();
    }
  }

  function openModal() {
    setMode('login');
    $('authError').textContent = '';
    $('authForm').reset();
    overlay.classList.add('on');
    setTimeout(() => $('authEmail').focus(), 60);
  }
  function closeModal() { overlay.classList.remove('on'); }

  function setMode(m) {
    mode = m;
    const login = m === 'login';
    $('authTitle').textContent = login ? 'Entrá a tu cuenta' : 'Creá tu cuenta';
    $('authHint').textContent = login
      ? 'Guardá tus productos y accedé desde cualquier dispositivo.'
      : 'Es gratis. Empezá a guardar tus precios en un toque.';
    $('authSubmit').textContent = login ? 'Entrar' : 'Crear cuenta';
    $('authSwitchTxt').textContent = login ? '¿No tenés cuenta?' : '¿Ya tenés cuenta?';
    $('authSwitch').textContent = login ? 'Creá una gratis' : 'Entrá';
    $('authError').textContent = '';
    $('authForgot').style.display = login ? '' : 'none';
  }

  // Toggle mostrar/ocultar contraseña
  const passEye = $('passEye');
  const passInput = $('authPass');
  if (passEye && passInput) {
    passEye.addEventListener('click', () => {
      const show = passInput.type === 'password';
      passInput.type = show ? 'text' : 'password';
      passEye.querySelector('.eye-off').style.display = show ? 'none' : '';
      passEye.querySelector('.eye-on').style.display = show ? '' : 'none';
      passEye.setAttribute('aria-label', show ? 'Ocultar contraseña' : 'Mostrar contraseña');
    });
  }

  $('authForgot').addEventListener('click', () => {
    const email = ($('authEmail').value || '').trim().toLowerCase();
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      $('authError').textContent = 'Ingresá tu email primero.';
      $('authEmail').focus();
      return;
    }
    const link = $('authForgot');
    link.style.pointerEvents = 'none';
    link.textContent = 'Enviando…';
    $('authError').textContent = '';
    Auth.resetPassword(email)
      .then(() => { closeModal(); toast('Te mandamos un email para resetear tu contraseña'); })
      .catch((err) => { $('authError').textContent = err.message; })
      .finally(() => { link.textContent = 'Olvidé mi contraseña'; link.style.pointerEvents = ''; });
  });

  function toggleMenu() { menu.classList.toggle('on'); }
  function closeMenu() { menu.classList.remove('on'); }

  btn.addEventListener('click', () => {
    if (Auth.getUser()) toggleMenu();
    else openModal();
  });

  $('authClose').addEventListener('click', closeModal);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeModal(); closeMenu(); } });

  document.addEventListener('click', (e) => {
    if (menu.classList.contains('on') && !e.target.closest('.acct-wrap')) closeMenu();
  });

  $('authSwitch').addEventListener('click', () => setMode(mode === 'login' ? 'signup' : 'login'));

  $('authForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const email = $('authEmail').value;
    const pass = $('authPass').value;
    const submit = $('authSubmit');
    $('authError').textContent = '';
    submit.disabled = true;
    const labelPrev = submit.textContent;
    submit.textContent = 'Un segundo…';

    Auth.signInWithEmail(email, pass, mode)
      .then((u) => {
        closeModal();
        toast(mode === 'signup' ? '¡Cuenta creada! Bienvenido 🟢' : '¡Hola de nuevo, ' + u.name + '!');
      })
      .catch((err) => { $('authError').textContent = err.message; })
      .finally(() => { submit.disabled = false; submit.textContent = labelPrev; });
  });

  $('authGoogle').addEventListener('click', () => {
    Auth.signInWithGoogle().catch((err) => {
      $('authError').textContent = err.message;
    });
  });

  $('acctLogout').addEventListener('click', () => {
    Auth.signOut();
    closeMenu();
    toast('Cerraste sesión. Tus productos siguen guardados en este dispositivo.');
  });

  Auth.onChange(renderAccount);
  renderAccount(Auth.getUser());
})();
