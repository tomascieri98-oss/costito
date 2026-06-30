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
      .select('id, nombre, precio_publicar, ganancia, canal_nombre, margen, categoria, codigo, tipo, recipe_data, created_at')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) throw new Error(error.message);
        return (data || []).map((r) => ({
          id: r.id,
          nombre: r.nombre,
          sub: [r.canal_nombre, r.margen ? 'margen ' + r.margen + '%' : null,
                new Date(r.created_at).toLocaleDateString('es-AR')].filter(Boolean).join(' · '),
          precioARS: r.precio_publicar,
          ganancia: r.ganancia,
          categoria: r.categoria || '',
          codigo: r.codigo || '',
          tipo: r.tipo || 'reventa',
          recipeData: r.recipe_data || null,
        }));
      });
  }

  function saveProduct({ nombre, precioARS, ganancia, costo, margen, canalNombre, categoria, codigo, tipo, recipeData }) {
    if (!currentUser) return Promise.reject(new Error('No hay sesión activa.'));
    return sb.from('productos')
      .insert({
        user_id: currentUser.id,
        nombre,
        precio_publicar: precioARS,
        ganancia: ganancia || 0,
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

  function deleteProduct(id) {
    return sb.from('productos').delete().eq('id', id).then(({ error }) => {
      if (error) throw new Error(error.message);
    });
  }

  return { getUser, onChange, signInWithEmail, signInWithGoogle, signOut, resetPassword, loadProducts, saveProduct, deleteProduct };
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
