const express = require('express');
const cors = require('cors');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Configurar Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Error: SUPABASE_URL o SUPABASE_ANON_KEY no están definidas en el .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Middlewares
app.use(cors());
app.use(express.json());

// Servir archivos estáticos del frontend (para que el proyecto corra unido)
app.use(express.static(path.join(__dirname, '../visual')));
// Servir también la carpeta de funcionalidades de manera estática para poder acceder a app.js
app.use('/funcionalidades', express.static(path.join(__dirname, '../funcionalidades')));

// Endpoint para guardar registro
app.post('/api/registro', async (req, res) => {
  const { nombre_completo, telefono, correo } = req.body;

  // Validación básica
  if (!nombre_completo || !telefono || !correo) {
    return res.status(400).json({ error: 'Todos los campos son obligatorios.' });
  }

  try {
    const { data, error } = await supabase
      .from('registros')
      .insert([{ nombre_completo, telefono, correo }])
      .select();

    if (error) {
      throw error;
    }

    return res.status(201).json({
      success: true,
      message: '¡Registro guardado con éxito!',
      data: data
    });
  } catch (error) {
    console.error('Error al guardar en Supabase:', error.message || error);
    return res.status(500).json({
      error: 'Error interno del servidor al procesar el registro.',
      details: error.message
    });
  }
});

// ==================== ENDPOINTS DE RADAR FINANCIERO ====================

// 1. Bancos: Obtener todos
app.get('/api/banks', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('banks')
      .select('*')
      .order('name', { ascending: true });

    if (error) throw error;
    return res.json(data);
  } catch (error) {
    console.error('Error al obtener bancos:', error);
    return res.status(500).json({ error: error.message });
  }
});

// Bancos: Crear uno nuevo
app.post('/api/banks', async (req, res) => {
  const { name, logo_url } = req.body;
  if (!name) return res.status(400).json({ error: 'El nombre del banco es obligatorio.' });

  try {
    const { data, error } = await supabase
      .from('banks')
      .insert([{ name, logo_url }])
      .select();

    if (error) throw error;
    return res.status(201).json(data[0]);
  } catch (error) {
    console.error('Error al crear banco:', error);
    return res.status(500).json({ error: error.message });
  }
});

// Bancos: Eliminar
app.delete('/api/banks/:id', async (req, res) => {
  try {
    const { error } = await supabase
      .from('banks')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;
    return res.json({ success: true, message: 'Banco eliminado con éxito.' });
  } catch (error) {
    console.error('Error al eliminar banco:', error);
    return res.status(500).json({ error: error.message });
  }
});

// 2. Tasas y Productos: Obtener todos (unificados)
app.get('/api/rates', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('interest_rates')
      .select(`
        id,
        rate_type,
        rate,
        term_days,
        min_amount,
        financial_products (
          id,
          name,
          type,
          banks (
            id,
            name,
            logo_url
          )
        )
      `);

    if (error) throw error;
    return res.json(data);
  } catch (error) {
    console.error('Error al obtener tasas:', error);
    return res.status(500).json({ error: error.message });
  }
});

// Tasas y Productos: Crear nuevo producto y tasa
app.post('/api/rates', async (req, res) => {
  const { bank_id, type, name, rate_type, rate, term_days, min_amount } = req.body;

  if (!bank_id || !type || !name || !rate) {
    return res.status(400).json({ error: 'Faltan campos obligatorios para registrar la tasa.' });
  }

  try {
    // 1. Crear el producto financiero
    const { data: prodData, error: prodError } = await supabase
      .from('financial_products')
      .insert([{ bank_id, type, name }])
      .select();

    if (prodError) throw prodError;
    const productId = prodData[0].id;

    // 2. Crear la tasa de interés asociada
    const { data: rateData, error: rateError } = await supabase
      .from('interest_rates')
      .insert([{
        product_id: productId,
        rate_type,
        rate: parseFloat(rate),
        term_days: term_days ? parseInt(term_days) : null,
        min_amount: min_amount ? parseFloat(min_amount) : 0
      }])
      .select();

    if (rateError) throw rateError;

    return res.status(201).json({
      success: true,
      product: prodData[0],
      rate: rateData[0]
    });
  } catch (error) {
    console.error('Error al crear tasa:', error);
    return res.status(500).json({ error: error.message });
  }
});

// Tasas y Productos: Eliminar tasa (cascada elimina el producto)
app.delete('/api/rates/:id', async (req, res) => {
  try {
    // Para eliminar limpiamente, obtenemos primero el product_id
    const { data: rateData, error: getError } = await supabase
      .from('interest_rates')
      .select('product_id')
      .eq('id', req.params.id)
      .single();

    if (getError) throw getError;

    // Eliminamos el producto financiero (la cascada borrará la tasa)
    const { error: delError } = await supabase
      .from('financial_products')
      .delete()
      .eq('id', rateData.product_id);

    if (delError) throw delError;

    return res.json({ success: true, message: 'Tasa y producto financiero eliminados.' });
  } catch (error) {
    console.error('Error al eliminar tasa:', error);
    return res.status(500).json({ error: error.message });
  }
});

// 3. Indicadores Económicos: Obtener todos
app.get('/api/indicators', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('economic_indicators')
      .select('*')
      .order('id', { ascending: true });

    if (error) throw error;
    return res.json(data);
  } catch (error) {
    console.error('Error al obtener indicadores:', error);
    return res.status(500).json({ error: error.message });
  }
});

// Indicadores Económicos: Actualizar valor
app.put('/api/indicators/:id', async (req, res) => {
  const { value } = req.body;
  if (value === undefined) return res.status(400).json({ error: 'El valor es requerido.' });

  try {
    const { data, error } = await supabase
      .from('economic_indicators')
      .update({ value: parseFloat(value), updated_at: new Date() })
      .eq('id', req.params.id)
      .select();

    if (error) throw error;
    return res.json(data[0]);
  } catch (error) {
    console.error('Error al actualizar indicador:', error);
    return res.status(500).json({ error: error.message });
  }
});

// 4. Registros / Usuarios: Obtener todos (Solo para Admin)
app.get('/api/registros', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('registros')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return res.json(data);
  } catch (error) {
    console.error('Error al obtener usuarios:', error);
    return res.status(500).json({ error: error.message });
  }
});

// 5. Watchlists (Favoritos)
app.get('/api/watchlist/:registro_id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('watchlists')
      .select(`
        id,
        product_id,
        financial_products (
          id,
          name,
          type,
          banks (
            name,
            logo_url
          ),
          interest_rates (
            id,
            rate,
            term_days,
            min_amount
          )
        )
      `)
      .eq('registro_id', req.params.registro_id);

    if (error) throw error;
    return res.json(data);
  } catch (error) {
    console.error('Error al obtener favoritos:', error);
    return res.status(500).json({ error: error.message });
  }
});

// Guardar favorito
app.post('/api/watchlist', async (req, res) => {
  const { registro_id, product_id } = req.body;
  if (!registro_id || !product_id) {
    return res.status(400).json({ error: 'Faltan parámetros registro_id o product_id.' });
  }

  try {
    const { data, error } = await supabase
      .from('watchlists')
      .insert([{ registro_id, product_id }])
      .select();

    if (error) throw error;
    return res.status(201).json(data[0]);
  } catch (error) {
    console.error('Error al guardar favorito:', error);
    return res.status(500).json({ error: error.message });
  }
});

// Eliminar favorito
app.delete('/api/watchlist', async (req, res) => {
  const { registro_id, product_id } = req.query;
  if (!registro_id || !product_id) {
    return res.status(400).json({ error: 'Faltan parámetros de consulta registro_id y product_id.' });
  }

  try {
    const { error } = await supabase
      .from('watchlists')
      .delete()
      .eq('registro_id', registro_id)
      .eq('product_id', product_id);

    if (error) throw error;
    return res.json({ success: true, message: 'Eliminado de favoritos.' });
  } catch (error) {
    console.error('Error al eliminar favorito:', error);
    return res.status(500).json({ error: error.message });
  }
});

// 6. Alertas y Notificaciones
app.get('/api/notifications', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return res.json(data);
  } catch (error) {
    console.error('Error al obtener notificaciones:', error);
    return res.status(500).json({ error: error.message });
  }
});

// ==================== RUTAS COMODÍN Y CONFIGURACIÓN GENERAL ====================

// Ruta comodín para servir el dashboard.html o index.html según corresponda
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, '../visual/dashboard.html'));
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../visual/index.html'));
});

app.listen(PORT, () => {
  console.log(`==============================================================`);
  console.log(` Servidor de Registro corriendo en: http://localhost:${PORT}`);
  console.log(` Para ver la web, abre tu navegador en http://localhost:${PORT}`);
  console.log(`==============================================================`);
});
