/* ============================================================
   RADAR – Lógica del formulario de registro simplificado (sin contraseña)
   Conexión a través del servidor Express API
   ============================================================ */

const API_BASE = 'http://localhost:3000/api';

// ── Referencias al DOM ───────────────────────────────────────
const form       = document.getElementById('registro-form');
const btnSubmit  = document.getElementById('btn-submit');
const btnText    = document.getElementById('btn-text');
const btnSpinner = document.getElementById('btn-spinner');
const alertEl    = document.getElementById('alert');
const alertMsg   = document.getElementById('alert-msg');
const alertIcon  = document.getElementById('alert-icon');

// ── Utilidades ───────────────────────────────────────────────

function showAlert(type, message) {
  alertEl.hidden = false;
  alertEl.className = `alert ${type}`;
  alertIcon.textContent = type === 'success' ? '✅' : '❌';
  alertMsg.textContent  = message;
  alertEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function hideAlert() {
  alertEl.hidden = true;
  alertEl.className = 'alert';
}

function setLoading(loading) {
  btnSubmit.disabled      = loading;
  btnText.textContent     = loading ? 'Procesando...' : 'Registrarme ahora';
  btnSpinner.hidden       = !loading;
}

function setFieldError(fieldId, message) {
  const field = document.getElementById(`field-${fieldId}`);
  const error = document.getElementById(`error-${fieldId}`);
  if (field) field.classList.add('has-error');
  if (error) error.textContent = message;
}

function clearFieldErrors() {
  document.querySelectorAll('.field').forEach(f => f.classList.remove('has-error'));
  document.querySelectorAll('.field-error').forEach(e => e.textContent = '');
}

// ── Validación del lado del cliente ─────────────────────────

function validateForm(nombre, telefono, correo) {
  let valid = true;

  if (!nombre.trim() || nombre.trim().length < 3) {
    setFieldError('nombre', nombre.trim() ? 'Ingresa al menos 3 caracteres.' : 'El nombre completo es requerido.');
    valid = false;
  }

  const soloDigitos = telefono.trim().replace(/\D/g, '');
  if (!telefono.trim()) {
    setFieldError('telefono', 'El teléfono es requerido.');
    valid = false;
  } else if (soloDigitos.length < 7 || soloDigitos.length > 9) {
    setFieldError('telefono', 'Ingresa entre 7 y 9 dígitos (ej: 70123456).');
    valid = false;
  }

  if (!correo.trim()) {
    setFieldError('correo', 'El correo electrónico es requerido.');
    valid = false;
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo.trim())) {
    setFieldError('correo', 'Ingresa un correo electrónico válido.');
    valid = false;
  }

  return valid;
}

// ── Envío del formulario ─────────────────────────────────────

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideAlert();
  clearFieldErrors();

  const nombre   = document.getElementById('nombre').value;
  const telefono = document.getElementById('telefono').value;
  const correo   = document.getElementById('correo').value;

  if (!validateForm(nombre, telefono, correo)) return;

  setLoading(true);

  try {
    const telefonoCompleto = '+591 ' + telefono.trim().replace(/\D/g, '');

    // Realizar llamada a la API local del backend para guardar en la base de datos Supabase
    const res = await fetch(`${API_BASE}/registros`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        nombre: nombre.trim(),
        telefono: telefonoCompleto,
        correo: correo.trim().toLowerCase()
      })
    });

    const resData = await res.json();

    if (!res.ok) {
      console.error('[RADAR] Error al guardar registro:', resData);
      showAlert('error', 'Error al guardar el registro: ' + (resData.error || 'Intente de nuevo.'));
      setLoading(false);
      return;
    }

    // Guardar datos de sesión local en localStorage
    localStorage.setItem('radar_user_email', correo.trim().toLowerCase());
    localStorage.setItem('radar_user_name', nombre.trim());
    localStorage.setItem('radar_user_phone', telefonoCompleto);

    showAlert('success', `¡Bienvenido/a, ${nombre.trim().split(' ')[0]}! Tu ingreso fue exitoso. 🎉`);
    form.reset();

    // Redirigir al Dashboard tras 1 segundo
    setTimeout(() => {
      window.location.href = 'dashboard.html';
    }, 1000);

  } catch (err) {
    console.error('[RADAR] Error inesperado:', err);
    showAlert('error', 'Ocurrió un error inesperado al conectar con el servidor.');
  } finally {
    setLoading(false);
  }
});

// ── Limpiar errores al escribir ──────────────────────────────
document.querySelectorAll('input').forEach(input => {
  input.addEventListener('input', () => {
    const field = input.closest('.field');
    const error = field?.querySelector('.field-error');
    if (field) field.classList.remove('has-error');
    if (error) error.textContent = '';
    hideAlert();
  });
});
