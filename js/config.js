// ═══════════════════════════════════════
//  CONFIGURACIÓN
// ═══════════════════════════════════════

function guardarConfig() {
  if (esModoNegocio()) {
    config.nombreTienda = document.getElementById('configNombreTienda').value;
    config.moneda = document.getElementById('configMoneda').value;
    config.umbralStock = parseInt(document.getElementById('configUmbral').value) || 5;
  }
  config.diasAviso = parseInt(document.getElementById('configDiasAviso').value) || 15;
  guardarEnStorage();
  toast('Configuración guardada');
}

function renderConfig() {
  if (esModoNegocio()) {
    document.getElementById('configNombreTienda').value = config.nombreTienda;
    document.getElementById('configMoneda').value = config.moneda;
    document.getElementById('configUmbral').value = config.umbralStock;
  }
  document.getElementById('configDiasAviso').value = config.diasAviso;
  renderCategorias();
  if (esModoHogar()) {
    renderUbicaciones();
  }
  
  // Inicializar UI de autenticación
  actualizarUIAuth();
}

function renderCategorias() {
  const lista = document.getElementById('listaCategorias');
  if (lista) {
    lista.innerHTML = config.categorias.map(c => `
      <div class="cat-tag">
        ${escHtml(c)}
        <button class="cat-eliminar" onclick="eliminarCategoria('${escHtml(c)}')" title="Eliminar">×</button>
      </div>
    `).join('');
  }
  // ❌ ELIMINADO: ya no se actualiza ningún select de eliminar
}

function agregarCategoria() {
  const inp = document.getElementById('nuevaCatInput');
  const val = inp.value.trim();
  if (!val) return;
  if (config.categorias.includes(val)) { toast('Esa categoría ya existe', 'aviso'); return; }
  config.categorias.push(val);
  inp.value = '';
  guardarEnStorage();
  renderCategorias();
  toast(`Categoría "${val}" agregada`);
}

function eliminarCategoria(cat) {
  // Verificar si hay productos usando esta categoría
  const productosConCat = productos.filter(p => p.categoria === cat);
  if (productosConCat.length > 0) {
    toast(`No puedes eliminar "${cat}" porque ${productosConCat.length} producto(s) la usan. Primero reasigna o elimina esos productos.`, 'error');
    return;
  }
  config.categorias = config.categorias.filter(c => c !== cat);
  guardarEnStorage();
  renderCategorias();
  toast(`Categoría "${cat}" eliminada`);
}

// ❌ ELIMINADA: función eliminarCategoriaSeleccionada()

function renderUbicaciones() {
  const lista = document.getElementById('listaUbicaciones');
  if (lista) {
    lista.innerHTML = (config.ubicaciones || []).map(u => `
      <div class="cat-tag">
        ${escHtml(u)}
        <button class="cat-eliminar" onclick="eliminarUbicacion('${escHtml(u)}')" title="Eliminar">×</button>
      </div>
    `).join('');
  }
}

function agregarUbicacion() {
  const inp = document.getElementById('nuevaUbicInput');
  const val = inp.value.trim();
  if (!val) return;
  if (!config.ubicaciones) config.ubicaciones = [];
  if (config.ubicaciones.includes(val)) { toast('Esa ubicación ya existe', 'aviso'); return; }
  config.ubicaciones.push(val);
  inp.value = '';
  guardarEnStorage();
  renderUbicaciones();
  toast(`Ubicación "${val}" agregada`);
}

function eliminarUbicacion(ubic) {
  config.ubicaciones = config.ubicaciones.filter(u => u !== ubic);
  guardarEnStorage();
  renderUbicaciones();
}

function cambiarModoAplicacion() {
  mostrarSelectorModo();
}

// ═══════════════════════════════════════
//  AUTENTICACIÓN FIREBASE
// ═══════════════════════════════════════

function mostrarModalLogin() {
  document.getElementById('modalLogin').style.display = 'flex';
  cambiarTabLogin('login');
}

function cerrarModalLogin(event) {
  if (event && event.target !== event.currentTarget) return;
  document.getElementById('modalLogin').style.display = 'none';
}

function cambiarTabLogin(tab) {
  const tabLogin = document.getElementById('tabLogin');
  const tabRegistro = document.getElementById('tabRegistro');
  const formLogin = document.getElementById('formLogin');
  const formRegistro = document.getElementById('formRegistro');
  
  if (tab === 'login') {
    tabLogin.classList.add('activo');
    tabRegistro.classList.remove('activo');
    formLogin.style.display = 'block';
    formRegistro.style.display = 'none';
  } else {
    tabLogin.classList.remove('activo');
    tabRegistro.classList.add('activo');
    formLogin.style.display = 'none';
    formRegistro.style.display = 'block';
  }
}

function handleLogin(event) {
  event.preventDefault();
  const email = document.getElementById('loginEmail').value;
  const password = document.getElementById('loginPassword').value;
  
  if (typeof iniciarSesionConCorreo === 'function') {
    iniciarSesionConCorreo(email, password)
      .then(() => {
        cerrarModalLogin();
        document.getElementById('loginEmail').value = '';
        document.getElementById('loginPassword').value = '';
        mostrarPagina('dashboard');
      })
      .catch(() => {});
  } else {
    toast('Firebase no está configurado', 'error');
  }
}

function handleRegistro(event) {
  event.preventDefault();
  const email = document.getElementById('regEmail').value;
  const password = document.getElementById('regPassword').value;
  const passwordConfirm = document.getElementById('regPasswordConfirm').value;
  
  if (password !== passwordConfirm) {
    toast('Las contraseñas no coinciden', 'error');
    return;
  }
  
  if (typeof registrarConCorreo === 'function') {
    registrarConCorreo(email, password)
      .then(() => {
        cerrarModalLogin();
        document.getElementById('regEmail').value = '';
        document.getElementById('regPassword').value = '';
        document.getElementById('regPasswordConfirm').value = '';
        mostrarPagina('dashboard');
      })
      .catch(() => {});
  } else {
    toast('Firebase no está configurado', 'error');
  }
}

function mostrarRecuperarPassword(event) {
  event.preventDefault();
  const email = prompt('Ingresa tu correo electrónico para restablecer la contraseña:');
  if (email && email.includes('@')) {
    if (typeof recuperarContrasena === 'function') {
      recuperarContrasena(email);
    } else {
      toast('Firebase no está configurado', 'error');
    }
  } else if (email) {
    toast('Correo inválido', 'error');
  }
}

// Actualizar UI de autenticación
function actualizarUIAuth() {
  const authButtons = document.getElementById('authButtons');
  const logoutButton = document.getElementById('logoutButton');
  const estadoCuenta = document.getElementById('estadoCuenta');
  
  if (typeof uidActual !== 'undefined' && uidActual) {
    if (authButtons) authButtons.style.display = 'none';
    if (logoutButton) logoutButton.style.display = 'flex';
    if (estadoCuenta) estadoCuenta.textContent = '✅ Conectado como ' + (usuarioActual?.email || 'usuario');
  } else {
    if (authButtons) authButtons.style.display = 'flex';
    if (logoutButton) logoutButton.style.display = 'none';
    if (estadoCuenta) estadoCuenta.textContent = 'No has iniciado sesión (modo local)';
  }
}