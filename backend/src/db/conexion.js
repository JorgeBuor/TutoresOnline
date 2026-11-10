const { Pool, types } = require('pg');

// Los identificadores bigint llegan como texto por defecto; aquí se convierten a número
// (los ids de la plataforma nunca superan el máximo seguro de JavaScript).
types.setTypeParser(20, (valor) => Number.parseInt(valor, 10));

/**
 * Acceso a PostgreSQL (Supabase). Expone una interfaz mínima, { consultar, transaccion },
 * para que los repositorios no dependan directamente de la librería "pg".
 */
function crearConexion({ databaseUrl, dbSsl }) {
  if (!databaseUrl) throw new Error('Falta la variable de entorno DATABASE_URL');

  const pool = new Pool({
    connectionString: databaseUrl,
    max: 3, // en Netlify cada función abre pocas conexiones; Supabase usa su pooler
    ssl: dbSsl ? { rejectUnauthorized: false } : false,
  });
  // Si Supabase cierra una conexión que estaba en reposo, se descarta sin tumbar la API;
  // la siguiente consulta abre una nueva.
  pool.on('error', (error) => console.error('Conexión a la base cerrada:', error.message));

  const ejecutor = (cliente) => ({
    async consultar(sql, parametros = []) {
      const resultado = await cliente.query(sql, parametros);
      return resultado.rows;
    },
    async uno(sql, parametros = []) {
      const resultado = await cliente.query(sql, parametros);
      return resultado.rows[0] || null;
    },
  });

  return {
    ...ejecutor(pool),
    async transaccion(trabajo) {
      const cliente = await pool.connect();
      try {
        await cliente.query('begin');
        const resultado = await trabajo(ejecutor(cliente));
        await cliente.query('commit');
        return resultado;
      } catch (error) {
        await cliente.query('rollback');
        throw error;
      } finally {
        cliente.release();
      }
    },
    cerrar: () => pool.end(),
  };
}

module.exports = { crearConexion };
