
const express = require('express');
const http = require('http');
const https = require('https');
const app = express();

// Usar el puerto 3000 o el que proporciona Replit
const PORT = process.env.PORT || 3000;

console.log(`🚀 Iniciando sistema keepalive mejorado...`);

// Configuración para permitir CORS (importante para algunos servicios de monitoreo)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

// Página principal con más información
app.get('/', (req, res) => {
  res.status(200).send(`
    <html>
      <head><title>Bot Tentación - Online</title></head>
      <body style="font-family: Arial, sans-serif; text-align: center; margin-top: 50px;">
        <h1>Bot Tentación está en línea</h1>
        <p>Sistema de keepalive activo</p>
        <p>Última actualización: ${new Date().toLocaleString()}</p>
      </body>
    </html>
  `);
});

// Endpoints simples para monitoreo
app.get('/ping', (req, res) => {
  res.status(200).send('OK');
});

app.get('/alive', (req, res) => {
  res.status(200).send('OK');
});

app.get('/status', (req, res) => {
  res.status(200).json({ status: 'online', timestamp: Date.now() });
});

// Cualquier otra ruta también responde OK para flexibilidad
app.get('*', (req, res) => {
  res.status(200).send('OK');
});

// Crear servidor HTTP
const server = http.createServer(app);

// Iniciar el servidor
server.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Servidor keepalive iniciado en puerto ${PORT}`);

  // Determinar la URL del repl
  const repl_slug = process.env.REPL_SLUG;
  const repl_owner = process.env.REPL_OWNER;
  const replit_domain = repl_slug && repl_owner 
    ? `${repl_slug}.${repl_owner}.repl.co` 
    : `${process.env.REPL_ID || 'workspace'}.id.repl.co`;

  console.log(`🌐 URLs de este servidor:`);
  console.log(`   - https://${replit_domain}/`);
  console.log(`   - https://${replit_domain}/ping`);
  console.log(`   - https://${replit_domain}/alive`);
  
  // Iniciar auto-ping interno y externo
  iniciarAutoPing(replit_domain);
});

// Función para mantener el servidor activo con múltiples métodos
function iniciarAutoPing(domain) {
  // 1. Auto-ping interno cada 25 segundos
  setInterval(() => {
    try {
      const options = {
        host: '0.0.0.0',
        port: PORT,
        path: '/ping',
        timeout: 5000
      };
      
      const req = http.get(options, (res) => {
        if (res.statusCode === 200) {
          // console.log(`✓ Auto-ping interno exitoso`);
        } else {
          console.log(`⚠️ Auto-ping interno: respuesta con código ${res.statusCode}`);
        }
      });

      req.on('error', (err) => {
        console.error(`❌ Error en auto-ping interno: ${err.message}`);
      });

      req.end();
    } catch (error) {
      console.error(`❌ Error general en auto-ping interno: ${error.message}`);
    }
  }, 25000);

  // 2. Auto-ping externo cada 4 minutos
  setInterval(() => {
    try {
      const url = `https://${domain}/ping`;
      console.log(`🔄 Realizando auto-ping externo a: ${url}`);
      
      const req = https.get(url, (res) => {
        if (res.statusCode === 200) {
          console.log(`✅ Auto-ping externo exitoso`);
        } else {
          console.log(`⚠️ Auto-ping externo: respuesta con código ${res.statusCode}`);
        }
      });

      req.on('error', (err) => {
        console.error(`❌ Error en auto-ping externo: ${err.message}`);
      });

      req.end();
    } catch (error) {
      console.error(`❌ Error general en auto-ping externo: ${error.message}`);
    }
  }, 240000); // 4 minutos
  
  // 3. Método último recurso: crear actividad periódicamente
  setInterval(() => {
    console.log(`🔄 Manteniendo proceso activo: ${new Date().toLocaleString()}`);
    // Realizar alguna operación intensiva breve para mantener el proceso
    let sum = 0;
    for (let i = 0; i < 10000; i++) {
      sum += i;
    }
  }, 120000); // 2 minutos
}

// Manejar errores del servidor
server.on('error', (err) => {
  console.error(`❌ Error en el servidor HTTP: ${err.message}`);
  // Intentar reiniciar en caso de error
  setTimeout(() => {
    try {
      server.close();
      server.listen(PORT, '0.0.0.0');
      console.log(`🔄 Servidor reiniciado después de un error`);
    } catch (e) {
      console.error('Error al reiniciar servidor:', e);
    }
  }, 5000);
});

// Manejar cierre del proceso
process.on('SIGINT', () => {
  server.close();
  console.log('Servidor keepalive cerrado.');
  process.exit(0);
});

// Exportar para que pueda ser usado por index.js
module.exports = app;
