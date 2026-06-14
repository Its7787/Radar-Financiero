const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

console.log("Supabase URL:", supabaseUrl);
console.log("Supabase Anon Key length:", supabaseAnonKey ? supabaseAnonKey.length : 0);

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function runTest() {
  try {
    console.log("Intentando consultar la tabla 'registros'...");
    const { data, error } = await supabase.from('registros').select('*').limit(1);
    if (error) {
      console.error("Error en la consulta:", error);
    } else {
      console.log("Consulta exitosa. Registros obtenidos:", data);
    }
  } catch (err) {
    console.error("Excepción al conectar con Supabase:", err);
  }
}

runTest();
