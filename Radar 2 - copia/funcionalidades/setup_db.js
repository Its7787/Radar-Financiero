const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Leer la URL de conexión del archivo .env
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("Error: DATABASE_URL no está definida en el archivo .env");
  process.exit(1);
}

// Configurar el cliente PostgreSQL
const client = new Client({
  connectionString: databaseUrl,
  ssl: {
    rejectUnauthorized: false
  }
});

async function run() {
  try {
    await client.connect();
    console.log("Conectado exitosamente a la base de datos Supabase PostgreSQL...");

    // 1. Leer y ejecutar el archivo SQL con el esquema de tablas y políticas
    const sqlFilePath = path.join(__dirname, 'database.sql');
    const sql = fs.readFileSync(sqlFilePath, 'utf8');

    console.log("Ejecutando script SQL para configurar el esquema de base de datos...");
    await client.query(sql);
    console.log("Esquema creado con éxito.");

    // 2. Limpiar datos previos antes de sembrar para evitar duplicados
    console.log("Limpiando registros antiguos para la siembra limpia...");
    // Eliminamos todo excepto registros (usuarios) por si el usuario ya se registró para probar.
    await client.query(`
      TRUNCATE 
        public.audit_logs,
        public.notifications,
        public.watchlists,
        public.risk_models,
        public.economic_indicators,
        public.interest_rates,
        public.financial_products,
        public.banks
      RESTART IDENTITY CASCADE;
    `);

    // 3. Sembrar Bancos reales de Bolivia
    console.log("Sembrando Bancos bolivianos...");
    const bankInsertRes = await client.query(`
      INSERT INTO public.banks (name, logo_url) VALUES 
      ('Banco Unión', 'https://upload.wikimedia.org/wikipedia/commons/e/ec/Logo_Banco_Uni%C3%B3n_Bolivia.png'),
      ('Banco Nacional de Bolivia', 'https://upload.wikimedia.org/wikipedia/commons/e/e4/Logo_BNB.png'),
      ('Banco Mercantil Santa Cruz', 'https://upload.wikimedia.org/wikipedia/commons/e/e0/Logo_BMSC.png'),
      ('Banco Solidario (Banco Sol)', 'https://upload.wikimedia.org/wikipedia/commons/a/a9/Logo_BancoSol.png'),
      ('Banco BCP Bolivia', 'https://upload.wikimedia.org/wikipedia/commons/f/f6/Logo_BCP.png'),
      ('Banco Ganadero', 'https://upload.wikimedia.org/wikipedia/commons/d/d4/Logo_Banco_Ganadero.png')
      RETURNING id, name;
    `);
    
    const banks = bankInsertRes.rows.reduce((acc, row) => {
      acc[row.name] = row.id;
      return acc;
    }, {});

    // 4. Sembrar Productos Financieros (DPFs, Cajas de Ahorro y Créditos)
    console.log("Sembrando Productos Financieros...");
    const products = [];
    
    // Banco Unión
    products.push({ bank_id: banks['Banco Unión'], type: 'dpf', name: 'DPF UniPlazo 360' });
    products.push({ bank_id: banks['Banco Unión'], type: 'caja_ahorro', name: 'Caja de Ahorro Rendimax' });
    products.push({ bank_id: banks['Banco Unión'], type: 'credito', name: 'Microcrédito Productivo Unión' });

    // BNB
    products.push({ bank_id: banks['Banco Nacional de Bolivia'], type: 'dpf', name: 'DPF BNB Plazo Fijo' });
    products.push({ bank_id: banks['Banco Nacional de Bolivia'], type: 'caja_ahorro', name: 'Banca Joven Ahorro BNB' });
    products.push({ bank_id: banks['Banco Nacional de Bolivia'], type: 'credito', name: 'Crédito de Consumo Automático' });

    // BMSC
    products.push({ bank_id: banks['Banco Mercantil Santa Cruz'], type: 'dpf', name: 'DPF Rentable Mercantil' });
    products.push({ bank_id: banks['Banco Mercantil Santa Cruz'], type: 'caja_ahorro', name: 'Caja de Ahorro Súper Rendidora' });
    products.push({ bank_id: banks['Banco Mercantil Santa Cruz'], type: 'credito', name: 'Crédito de Vivienda de Interés Social' });

    // Banco Sol
    products.push({ bank_id: banks['Banco Solidario (Banco Sol)'], type: 'dpf', name: 'DPF Sol Rendidor 360' });
    products.push({ bank_id: banks['Banco Solidario (Banco Sol)'], type: 'caja_ahorro', name: 'Ahorro Sol Ganancia Directa' });

    // BCP
    products.push({ bank_id: banks['Banco BCP Bolivia'], type: 'dpf', name: 'DPF BCP Plazo Plus' });
    products.push({ bank_id: banks['Banco BCP Bolivia'], type: 'caja_ahorro', name: 'Cuenta Sueldo Interactiva BCP' });
    products.push({ bank_id: banks['Banco BCP Bolivia'], type: 'credito', name: 'Crédito Vehicular BCP' });

    const prodInsertRes = [];
    for (const prod of products) {
      const res = await client.query(
        'INSERT INTO public.financial_products (bank_id, type, name) VALUES ($1, $2, $3) RETURNING id, type, name',
        [prod.bank_id, prod.type, prod.name]
      );
      prodInsertRes.push(res.rows[0]);
    }

    // 5. Sembrar Tasas de Interés
    console.log("Sembrando Tasas de Interés...");
    for (const prod of prodInsertRes) {
      let rate = 0;
      let rate_type = 'passive';
      let term_days = null;
      let min_amount = 0;

      if (prod.type === 'dpf') {
        rate_type = 'passive';
        term_days = 360;
        min_amount = 1000.00;
        if (prod.name.includes('Union') || prod.name.includes('UniPlazo')) rate = 5.50;
        else if (prod.name.includes('BNB')) rate = 5.80;
        else if (prod.name.includes('Mercantil') || prod.name.includes('Rentable')) rate = 5.25;
        else if (prod.name.includes('Sol')) rate = 6.20;
        else rate = 5.00;
      } else if (prod.type === 'caja_ahorro') {
        rate_type = 'passive';
        min_amount = 50.00;
        if (prod.name.includes('Union') || prod.name.includes('Rendimax')) rate = 2.00;
        else if (prod.name.includes('BNB')) rate = 2.50;
        else if (prod.name.includes('Mercantil')) rate = 1.50;
        else if (prod.name.includes('Sol')) rate = 3.75;
        else rate = 1.00;
      } else if (prod.type === 'credito') {
        rate_type = 'active';
        term_days = 1800; // 5 años
        min_amount = 5000.00;
        if (prod.name.includes('Productivo')) rate = 11.50;
        else if (prod.name.includes('Consumo')) rate = 14.00;
        else if (prod.name.includes('Vivienda')) {
          rate = 5.50; // Tasa regulada vivienda social
          term_days = 7200; // 20 años
          min_amount = 120000.00;
        } else if (prod.name.includes('Vehicular')) {
          rate = 9.00;
          term_days = 2555; // 7 años
          min_amount = 70000.00;
        } else rate = 12.00;
      }

      await client.query(
        'INSERT INTO public.interest_rates (product_id, rate_type, rate, term_days, min_amount) VALUES ($1, $2, $3, $4, $5)',
        [prod.id, rate_type, rate, term_days, min_amount]
      );
    }

    // 6. Sembrar Indicadores Económicos de Bolivia
    console.log("Sembrando Indicadores Económicos...");
    await client.query(`
      INSERT INTO public.economic_indicators (name, value, unit) VALUES
      ('Tipo de Cambio Oficial Venta', 6.9600, 'Bs/$'),
      ('Tipo de Cambio Oficial Compra', 6.8600, 'Bs/$'),
      ('Inflación Acumulada Anual (INE)', 3.1200, '%'),
      ('Valor de la UFV Diario', 2.4789, 'Bs/UFV'),
      ('Tasa de Referencia (TRE)', 2.8500, '%'),
      ('Tasa Básica BCB (Pasiva)', 4.0000, '%'),
      ('Crecimiento del PIB Bolivia', 2.3000, '%');
    `);

    // 7. Sembrar Modelos de Riesgo
    console.log("Sembrando Modelos de Riesgo...");
    await client.query(`
      INSERT INTO public.risk_models (name, description, formula_params) VALUES
      ('Pérdida de Poder Adquisitivo', 'Cálculo del rendimiento real restando la inflación anual proyectada del rendimiento nominal.', '{"formula": "Real = (1 + Nominal/100) / (1 + Inflacion/100) - 1"}'),
      ('Riesgo de Devaluación', 'Mide el impacto de la variación cambiaria paralela en el rendimiento real de las inversiones en bolivianos.', '{"country_risk_premium": "4.5%", "volatility_index": "B+"}');
    `);

    // 8. Sembrar Alertas / Notificaciones
    console.log("Sembrando Alertas...");
    await client.query(`
      INSERT INTO public.notifications (title, message, type) VALUES
      ('Banco Sol incrementa DPF', 'Banco Solidario (Banco Sol) sube su tasa DPF a 360 días a un 6.20% anual para montos desde 1,000 Bs.', 'rate_change'),
      ('UFV en Alza', 'El Banco Central de Bolivia reporta un nuevo valor diario de la UFV situado en 2.4789 Bs.', 'info'),
      ('Inflación Reportada', 'El Instituto Nacional de Estadística (INE) sitúa la inflación acumulada interanual en 3.12%.', 'info'),
      ('Vivienda Social Disponible', 'Banco Mercantil mantiene su tasa de interés activa para Vivienda Social regulada en 5.50% anual.', 'success');
    `);

    console.log("----------------------------------------------------------------");
    console.log("¡Base de datos y semillas configuradas con éxito para Radar Financiero!");
    console.log("----------------------------------------------------------------");
  } catch (error) {
    console.error("Error durante la inicialización de la base de datos:", error);
  } finally {
    await client.end();
  }
}

run();
