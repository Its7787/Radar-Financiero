document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('registration-form');
    const submitBtn = document.getElementById('submit-btn');
    const btnText = submitBtn.querySelector('.btn-text');
    const spinner = submitBtn.querySelector('.spinner');
    const toast = document.getElementById('toast-message');
    const toastText = toast.querySelector('.toast-text');

    // Configuración de Supabase para fallback directo desde el cliente
    const supabaseUrl = 'https://aqeosbnkwscpvqsdlehh.supabase.co';
    const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFxZW9zYm5rd3NjcHZxc2RsZWhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1MzQyOTEsImV4cCI6MjA5NjExMDI5MX0.0wqfVBshpfS6lMXYbJQANpZQHLDOA5EnovxWBx_mNpc';
    let supabaseClient = null;

    if (window.supabase) {
        supabaseClient = window.supabase.createClient(supabaseUrl, supabaseAnonKey);
    }

    // Función para limpiar y validar número telefónico de Bolivia (+591)
    function validateBoliviaPhone(val) {
        // Eliminar caracteres que no sean dígitos o el signo +
        const cleaned = val.replace(/[^\d+]/g, '');
        
        // Formatos válidos:
        // 1. +591 seguido de 8 dígitos (ej: +59171234567)
        if (/^\+591[2-7]\d{7}$/.test(cleaned)) {
            return { isValid: true, formatted: '+591 ' + cleaned.slice(4) };
        }
        // 2. 591 seguido de 8 dígitos (ej: 59171234567)
        if (/^591[2-7]\d{7}$/.test(cleaned)) {
            return { isValid: true, formatted: '+591 ' + cleaned.slice(3) };
        }
        // 3. Solo 8 dígitos (ej: 71234567) -> Le agregamos automáticamente +591
        if (/^[2-7]\d{7}$/.test(cleaned)) {
            return { isValid: true, formatted: '+591 ' + cleaned };
        }
        return { isValid: false, formatted: val };
    }

    // Elementos de entrada para validación en tiempo real
    const inputs = {
        nombre: {
            el: document.getElementById('nombre_completo'),
            group: document.getElementById('nombre_completo').closest('.input-group'),
            validate: (val) => val.trim().length >= 3
        },
        telefono: {
            el: document.getElementById('telefono'),
            group: document.getElementById('telefono').closest('.input-group'),
            validate: (val) => {
                const res = validateBoliviaPhone(val);
                if (res.isValid) {
                    inputs.telefono.el.value = res.formatted; // Guardar valor auto-formateado
                    return true;
                }
                return false;
            }
        },
        correo: {
            el: document.getElementById('correo'),
            group: document.getElementById('correo').closest('.input-group'),
            validate: (val) => {
                const re = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
                return re.test(String(val).toLowerCase());
            }
        }
    };

    // Asegurar que el prefijo +591 siempre esté al hacer foco si está vacío
    inputs.telefono.el.addEventListener('focus', () => {
        if (!inputs.telefono.el.value.trim() || inputs.telefono.el.value.trim() === '+591') {
            inputs.telefono.el.value = '+591 ';
        }
    });

    // Validar un campo específico y actualizar su UI
    function validateInput(field) {
        const value = field.el.value;
        const isValid = field.validate(value);
        
        if (isValid) {
            field.group.classList.remove('invalid');
        } else {
            field.group.classList.add('invalid');
        }
        return isValid;
    }

    // Agregar validación en tiempo real al escribir o salir del input
    Object.keys(inputs).forEach(key => {
        const field = inputs[key];
        field.el.addEventListener('input', () => {
            if (field.group.classList.contains('invalid')) {
                validateInput(field);
            }
        });
        field.el.addEventListener('blur', () => {
            validateInput(field);
        });
    });

    // Función para mostrar notificaciones flotantes (toast)
    function showToast(message, type = 'success') {
        toastText.textContent = message;
        toast.className = `toast ${type}`;
        
        // Animación suave de entrada
        toast.style.display = 'flex';
        
        // Ocultar automáticamente después de 5 segundos
        setTimeout(() => {
            toast.className = 'toast hidden';
        }, 5000);
    }

    // Determinar la URL del backend
    const getApiUrl = () => {
        if (window.location.protocol === 'file:') {
            return 'http://localhost:3000/api/registro';
        }
        return '/api/registro';
    };

    // Manejar el envío del formulario
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        // Validar todos los campos antes de enviar
        let isFormValid = true;
        Object.keys(inputs).forEach(key => {
            const isValid = validateInput(inputs[key]);
            if (!isValid) isFormValid = false;
        });

        if (!isFormValid) {
            showToast('Por favor, corrige los errores en el formulario.', 'error');
            return;
        }

        // Estado de cargando
        submitBtn.disabled = true;
        btnText.textContent = 'Enviando...';
        spinner.classList.remove('hidden');

        // Obtener el valor limpio del teléfono (sin espacios en el envío a BD si es necesario,
        // o con el espacio para lectura humana: "+591 71234567")
        const payload = {
            nombre_completo: inputs.nombre.el.value.trim(),
            telefono: inputs.telefono.el.value.trim(),
            correo: inputs.correo.el.value.trim()
        };

        try {
            let success = false;
            let resultMessage = '¡Registro completado con éxito!';

            try {
                // Intentar primero a través del backend local en Node.js
                const response = await fetch(getApiUrl(), {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(payload)
                });

                const result = await response.json();

                if (response.ok) {
                    success = true;
                    resultMessage = result.message || resultMessage;
                } else {
                    throw new Error(result.error || result.details || 'Error del servidor.');
                }
            } catch (backendError) {
                console.warn('El backend local no respondió. Intentando guardado directo en Supabase...', backendError);

                // Fallback directo a Supabase
                if (supabaseClient) {
                    const { data, error } = await supabaseClient
                        .from('registros')
                        .insert([payload])
                        .select();

                    if (error) {
                        throw new Error('Error de conexión a la base de datos: ' + error.message);
                    }

                    success = true;
                    resultMessage = '¡Registro exitoso guardado directamente en Supabase!';
                } else {
                    throw new Error('No se pudo conectar con el servidor y no hay cliente de base de datos disponible.');
                }
            }

            if (success) {
                showToast(resultMessage, 'success');
                
                // Guardar datos en localStorage para autorizar la entrada al dashboard
                localStorage.setItem('userRegistered', 'true');
                localStorage.setItem('userName', payload.nombre_completo);
                localStorage.setItem('userEmail', payload.correo);
                localStorage.setItem('userPhone', payload.telefono);
                localStorage.setItem('userRole', 'user'); // Rol por defecto. Para probar admin, se puede alternar en el dashboard.

                // Opcional: registrar id de usuario
                const userObj = (window.location.protocol === 'file:') ? null : (payload.id || '1');
                localStorage.setItem('userId', userObj || '1');

                form.reset();
                inputs.telefono.el.value = "+591 ";
                
                Object.keys(inputs).forEach(key => {
                    inputs[key].group.classList.remove('invalid');
                });

                // Redireccionar al Dashboard de Radar Financiero tras 1.5 segundos
                setTimeout(() => {
                    if (window.location.protocol === 'file:') {
                        window.location.href = 'dashboard.html';
                    } else {
                        window.location.href = '/dashboard';
                    }
                }, 1500);
            }

        } catch (error) {
            console.error('Error de envío:', error);
            showToast(error.message, 'error');
        } finally {
            // Restaurar estado del botón
            submitBtn.disabled = false;
            btnText.textContent = 'Enviar Registro';
            spinner.classList.add('hidden');
        }
    });
});
