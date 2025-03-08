require('dotenv').config(); // Cargar variables de entorno
require('events').EventEmitter.defaultMaxListeners = 50; // Aumentar límite de oyentes
console.log("Token obtenido:", process.env.TOKEN);
const fs = require('fs'); // 📌 Agregar fs para manejar archivos
const schedule = require('node-schedule'); // 📌 Agregar node-schedule para programación de mensajes
const { Client, GatewayIntentBits, PermissionsBitField, EmbedBuilder, Collection, REST, Routes, SlashCommandBuilder } = require('discord.js');
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildInvites,
        GatewayIntentBits.GuildMessageReactions,
    ]  
});

// Colección para almacenar comandos slash
client.commands = new Collection();

// Variables globales
const serverConfig = new Map(); // Almacenará configuración por servidor
const invites = new Map(); // Guardará las invitaciones antes y después de que alguien entre
let nivelesXP = {}; // Sistema de niveles
let inviteTracker = new Map(); // Cargará datos previos de invitaciones
const inviteChannel = new Map(); // Guardará el canal donde se registran las invitaciones
let cumpleaños = {}; // Base de datos de cumpleaños
let configCumpleaños = { mensaje: "🎉 ¡Feliz Cumpleaños {usuario}! 🎂", imagen: "", canal: null };
let buzonConfig = new Map(); // Configuración del sistema de buzón

// Función para obtener configuración del servidor o crear una por defecto
function getServerConfig(guildId) {
    if (!serverConfig.has(guildId)) {
        serverConfig.set(guildId, {
            canalLogs: null,
            canalBienvenida: null,
            canalDespedida: null,
            canalNiveles: null,
            canalInvitaciones: null,
            canalBuzon: null,     // Canal donde se envían los mensajes del buzón
            canalBuzonEntrada: null  // Canal donde se reciben mensajes para el buzón
        });
    }
    return serverConfig.get(guildId);
}

// Función para actualizar y guardar configuración del servidor
function updateServerConfig(guildId, key, value) {
    const config = getServerConfig(guildId);
    config[key] = value;
    
    // También actualizar la variable global correspondiente
    if (key === 'canalLogs') canalLogs = value;
    else if (key === 'canalBienvenida') canalBienvenida = value;
    else if (key === 'canalDespedida') canalDespedida = value;
    else if (key === 'canalNiveles') canalNiveles = value;
    else if (key === 'canalInvitaciones') canalInvitaciones = value;
    else if (key === 'canalBuzon') {
        const buzonInfo = buzonConfig.get(guildId) || { activo: false, canalEntrada: null };
        buzonInfo.destino = value;
        buzonConfig.set(guildId, buzonInfo);
    }
    else if (key === 'canalBuzonEntrada') {
        const buzonInfo = buzonConfig.get(guildId) || { activo: false, destino: null };
        buzonInfo.canalEntrada = value;
        buzonInfo.activo = (value !== null && buzonInfo.destino !== null);
        buzonConfig.set(guildId, buzonInfo);
    }
    
    // Guardar la configuración actualizada
    guardarConfigServidores();
    console.log(`✅ Configuración actualizada: ${key} = ${value} para servidor ${guildId}`);
}

// Variables para acceso global a configuraciones
let canalLogs = null;
let canalBienvenida = null;
let canalDespedida = null;
let canalNiveles = null;
let canalInvitaciones = null;

// Cargar datos guardados
function cargarDatos() {
    // Cargar configuración de servidores
    if (fs.existsSync('serverConfig.json')) {
        try {
            const configData = JSON.parse(fs.readFileSync('serverConfig.json', 'utf8'));
            console.log(`🔍 Cargando configuración de servidores desde archivo`);
            
            // Convertir el objeto a Map
            for (const [guildId, config] of Object.entries(configData)) {
                serverConfig.set(guildId, config);
                
                // Configurar el buzón si están configurados ambos canales
                if (config.canalBuzon && config.canalBuzonEntrada) {
                    buzonConfig.set(guildId, {
                        activo: true,
                        destino: config.canalBuzon,
                        canalEntrada: config.canalBuzonEntrada
                    });
                    console.log(`📫 Buzón configurado para servidor ${guildId}:`);
                    console.log(`   - Canal de entrada: ${config.canalBuzonEntrada}`);
                    console.log(`   - Canal de destino: ${config.canalBuzon}`);
                    console.log(`   - Estado: Activo`);
                } else if (config.canalBuzon || config.canalBuzonEntrada) {
                    // Si solo hay un canal configurado, también guardarlo pero como inactivo
                    buzonConfig.set(guildId, {
                        activo: false,
                        destino: config.canalBuzon || null,
                        canalEntrada: config.canalBuzonEntrada || null
                    });
                    console.log(`📫 Buzón parcialmente configurado para servidor ${guildId}:`);
                    console.log(`   - Canal de entrada: ${config.canalBuzonEntrada || 'No configurado'}`);
                    console.log(`   - Canal de destino: ${config.canalBuzon || 'No configurado'}`);
                    console.log(`   - Estado: Inactivo (faltan canales)`);
                }
                
                // Si hay un servidor principal, cargar su configuración a las variables globales
                // Esto asegura que los canales estén configurados al reiniciar
                if (client.guilds.cache.has(guildId)) {
                    console.log(`🔄 Cargando configuración para servidor: ${guildId}`);
                    if (config.canalLogs) canalLogs = config.canalLogs;
                    if (config.canalBienvenida) canalBienvenida = config.canalBienvenida;
                    if (config.canalDespedida) canalDespedida = config.canalDespedida;
                    if (config.canalNiveles) canalNiveles = config.canalNiveles;
                    if (config.canalInvitaciones) canalInvitaciones = config.canalInvitaciones;
                }
            }
            console.log('⚙️ Configuración de servidores cargada');
            console.log(`📋 Canales configurados - Logs: ${canalLogs}, Bienvenida: ${canalBienvenida}, Despedida: ${canalDespedida}, Niveles: ${canalNiveles}, Invitaciones: ${canalInvitaciones}`);
        } catch (error) {
            console.error('❌ Error al cargar configuración de servidores:', error);
        }
    } else {
        fs.writeFileSync('serverConfig.json', JSON.stringify({}), 'utf8');
    }
    
    // Cargar mensajes personalizados
    cargarMensajesPersonalizados();

    // Cargar datos de invitaciones
    if (fs.existsSync('invitaciones.json')) {
        try {
            const invitacionesData = JSON.parse(fs.readFileSync('invitaciones.json', 'utf8'));
            
            // Cargar datos del rastreador de invitaciones
            if (invitacionesData.inviteTracker) {
                inviteTracker = new Map(Object.entries(invitacionesData.inviteTracker));
            } else {
                inviteTracker = new Map();
            }
            
            console.log('📊 Datos de invitaciones cargados');
        } catch (error) {
            console.error('❌ Error al cargar invitaciones:', error);
            inviteTracker = new Map();
        }
    } else {
        fs.writeFileSync('invitaciones.json', JSON.stringify({
            inviteTracker: {}
        }), 'utf8');
    }

    // Cargar cumpleaños
    if (fs.existsSync('cumpleaños.json')) {
        try {
            cumpleaños = JSON.parse(fs.readFileSync('cumpleaños.json', 'utf8'));
            console.log('🎂 Datos de cumpleaños cargados');
        } catch (error) {
            console.error('❌ Error al cargar cumpleaños:', error);
            cumpleaños = {};
        }
    }

    // Cargar configuración de cumpleaños
    if (fs.existsSync('configCumpleaños.json')) {
        try {
            configCumpleaños = JSON.parse(fs.readFileSync('configCumpleaños.json', 'utf8'));
            console.log('⚙️ Configuración de cumpleaños cargada');
        } catch (error) {
            console.error('❌ Error al cargar configuración de cumpleaños:', error);
        }
    }
    
    // Cargar niveles XP
    if (fs.existsSync('niveles.json')) {
        try {
            nivelesXP = JSON.parse(fs.readFileSync('niveles.json', 'utf8'));
            console.log('🌟 Datos de niveles XP cargados');
        } catch (error) {
            console.error('❌ Error al cargar niveles XP:', error);
            nivelesXP = {};
        }
    } else {
        fs.writeFileSync('niveles.json', JSON.stringify({}), 'utf8');
    }
}

// Guardar configuración de servidores
function guardarConfigServidores() {
    const dataToSave = Object.fromEntries(serverConfig);
    fs.writeFileSync('serverConfig.json', JSON.stringify(dataToSave, null, 2), 'utf8');
    console.log('💾 Configuración de servidores guardada');
}

// Guardar datos de invitaciones
function guardarInvitaciones() {
    const dataToSave = {
        inviteTracker: Object.fromEntries(inviteTracker)
    };
    fs.writeFileSync('invitaciones.json', JSON.stringify(dataToSave, null, 2), 'utf8');
    console.log('💾 Datos de invitaciones guardados');
}

// Guardar datos de niveles XP
function guardarNiveles() {
    fs.writeFileSync('niveles.json', JSON.stringify(nivelesXP, null, 2), 'utf8');
    console.log('💾 Datos de niveles XP guardados');
}

// Crear estructura para mensajes personalizables
const mensajesPersonalizados = {
    bienvenida: new Map(),
    despedida: new Map()
};

// Definir mensajes por defecto
const mensajesDefault = {
    bienvenida: {
        titulo: "🎉 ¡Bienvenido, {username}!",
        descripcion: "👋 {mencion} ¡Bienvenido a Ƭeทtคcเ๑ึท!\n\nEstamos emocionados de tenerte en nuestro servidor.\nSi necesitas ayuda o tienes alguna pregunta, no dudes en preguntar.\n¡Diviértete con la Tentación! 😈",
        color: "#FF0000",
        imagen: "https://cdn.discordapp.com/attachments/1219069470652371034/1339947857918169160/tentacion.jpg"
    },
    despedida: {
        titulo: "💔 {username} nos ha dejado :c",
        descripcion: "😢 {username} fue un placer haberte tenido en nuestro equipo Tentación. ¡Esperamos verte de nuevo! 😭❤",
        color: "#FF0000",
        imagen: "https://cdn.nekotina.com/guilds/1327403077480874046/66cf344f-2fb0-4a44-a841-2f79cab712d7.png"
    }
};

// Cargar mensajes personalizados
function cargarMensajesPersonalizados() {
    if (fs.existsSync('mensajesPersonalizados.json')) {
        try {
            const datos = JSON.parse(fs.readFileSync('mensajesPersonalizados.json', 'utf8'));
            
            // Convertir los objetos en Maps
            if (datos.bienvenida) {
                mensajesPersonalizados.bienvenida = new Map(Object.entries(datos.bienvenida));
            }
            
            if (datos.despedida) {
                mensajesPersonalizados.despedida = new Map(Object.entries(datos.despedida));
            }
            
            console.log('📝 Mensajes personalizados cargados correctamente');
        } catch (error) {
            console.error('❌ Error al cargar mensajes personalizados:', error);
        }
    } else {
        guardarMensajesPersonalizados();
        console.log('📝 Archivo de mensajes personalizados creado por primera vez');
    }
}

// Guardar mensajes personalizados
function guardarMensajesPersonalizados() {
    const datosAGuardar = {
        bienvenida: Object.fromEntries(mensajesPersonalizados.bienvenida),
        despedida: Object.fromEntries(mensajesPersonalizados.despedida)
    };
    
    fs.writeFileSync('mensajesPersonalizados.json', JSON.stringify(datosAGuardar, null, 2), 'utf8');
    console.log('💾 Mensajes personalizados guardados correctamente');
}

// 👋 **Función para enviar bienvenida**
async function enviarBienvenida(member) {
    if (!canalBienvenida) return;
    const canal = member.guild.channels.cache.get(canalBienvenida);
    if (!canal) return console.log('⚠ Canal de bienvenida no encontrado.');

    // Obtener el mensaje personalizado para este servidor o usar el predeterminado
    const mensajeServidor = mensajesPersonalizados.bienvenida.get(member.guild.id) || mensajesDefault.bienvenida;
    
    // Reemplazar variables en el mensaje
    const titulo = mensajeServidor.titulo
        .replace(/{username}/g, member.user.username)
        .replace(/{servername}/g, member.guild.name);
        
    const descripcion = mensajeServidor.descripcion
        .replace(/{username}/g, member.user.username)
        .replace(/{mencion}/g, `${member}`) // Garantizar que el usuario sea mencionado
        .replace(/{servername}/g, member.guild.name);

    const embed = new EmbedBuilder()
        .setColor(mensajeServidor.color || '#FF0000')
        .setTitle(titulo)
        .setDescription(descripcion)
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
        .setImage(mensajeServidor.imagen || 'https://cdn.discordapp.com/attachments/1219069470652371034/1339947857918169160/tentacion.jpg');

    canal.send({ embeds: [embed] }).catch(console.error);
}

// 🚪 **Función para enviar despedida**
async function enviarDespedida(member) {
    if (!canalDespedida) return;
    const canal = member.guild.channels.cache.get(canalDespedida);
    if (!canal) return console.log('⚠ Canal de despedida no encontrado.');

    // Obtener el mensaje personalizado para este servidor o usar el predeterminado
    const mensajeServidor = mensajesPersonalizados.despedida.get(member.guild.id) || mensajesDefault.despedida;
    
    // Reemplazar variables en el mensaje
    const titulo = mensajeServidor.titulo
        .replace(/{username}/g, member.user.username)
        .replace(/{servername}/g, member.guild.name);
        
    const descripcion = mensajeServidor.descripcion
        .replace(/{username}/g, member.user.username)
        .replace(/{mencion}/g, `${member.user.username}`) // Aquí no podemos mencionar porque ya se fue
        .replace(/{servername}/g, member.guild.name);

    const embed = new EmbedBuilder()
        .setColor(mensajeServidor.color || '#FF0000')
        .setTitle(titulo)
        .setDescription(descripcion)
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
        .setImage(mensajeServidor.imagen || 'https://cdn.nekotina.com/guilds/1327403077480874046/66cf344f-2fb0-4a44-a841-2f79cab712d7.png');

    canal.send({ embeds: [embed] }).catch(console.error);
}

// Verificar cumpleaños
async function verificarCumpleaños() {
    const hoy = new Date();
    const diaMes = `${String(hoy.getDate()).padStart(2, '0')}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
    console.log(`🔍 Verificando cumpleaños para la fecha: ${diaMes}`);

    // Verificar si hay cumpleaños para hoy
    let hayFelicitaciones = false;
    let celebraciones = [];
    
    for (const [userID, fecha] of Object.entries(cumpleaños)) {
        if (fecha === diaMes) {
            hayFelicitaciones = true;
            console.log(`🎉 ¡Encontrado cumpleaños para el usuario ${userID}!`);
            celebraciones.push(userID);
            
            try {
                // Buscar el usuario en todos los servidores donde está el bot
                let userFound = false;
                let canalSeleccionado = null;
                let memberEncontrado = null;
                
                // Si hay un canal configurado, intentar usarlo primero
                if (configCumpleaños.canal) {
                    canalSeleccionado = client.channels.cache.get(configCumpleaños.canal);
                    if (canalSeleccionado) {
                        userFound = true;
                        console.log(`✅ Usando canal configurado: ${canalSeleccionado.name}`);
                    } else {
                        console.log(`⚠️ Canal configurado ${configCumpleaños.canal} no encontrado, buscando alternativa...`);
                    }
                }
                
                // Si no hay canal configurado o no se encontró, buscar un canal apropiado
                if (!canalSeleccionado) {
                    for (const [guildId, guild] of client.guilds.cache) {
                        try {
                            // Intentar buscar al miembro en el servidor - primero en cache
                            let member = guild.members.cache.get(userID);
                            
                            // Si no está en cache, intentar fetchearlo
                            if (!member) {
                                try {
                                    member = await guild.members.fetch(userID).catch(() => null);
                                } catch (fetchError) {
                                    console.log(`⚠️ No se pudo obtener miembro ${userID} en servidor ${guild.name}: ${fetchError.message}`);
                                }
                            }
                            
                            if (member) {
                                console.log(`✅ Usuario ${userID} encontrado en servidor ${guild.name}`);
                                userFound = true;
                                memberEncontrado = member;
                                
                                // Buscar un canal apropiado (primero bienvenida, luego general, o cualquier canal de texto)
                                const config = getServerConfig(guildId);
                                if (config.canalBienvenida) {
                                    canalSeleccionado = guild.channels.cache.get(config.canalBienvenida);
                                    if (canalSeleccionado) break;
                                }
                                
                                // Buscar canales que puedan ser "general" o similares
                                const posiblesCanales = guild.channels.cache.filter(
                                    c => c.type === 0 && // 0 es GUILD_TEXT
                                    (c.name.includes('general') || c.name.includes('chat') || c.name.includes('bienvenida'))
                                );
                                
                                if (posiblesCanales.size > 0) {
                                    canalSeleccionado = posiblesCanales.first();
                                    break;
                                }
                                
                                // Como último recurso, usar cualquier canal de texto
                                const canalesTexto = guild.channels.cache.filter(c => c.type === 0);
                                if (canalesTexto.size > 0) {
                                    canalSeleccionado = canalesTexto.first();
                                    break;
                                }
                            }
                        } catch (err) {
                            console.error(`❌ Error al procesar servidor ${guildId} para cumpleaños: ${err.message}`);
                        }
                    }
                }
                
                // Si no se encontró el usuario en ningún servidor, buscar un canal en cualquier servidor
                if (!userFound || !canalSeleccionado) {
                    console.log(`⚠️ Usuario ${userID} no encontrado en ningún servidor o no se encontró canal apropiado`);
                    const primerServidor = client.guilds.cache.first();
                    if (primerServidor) {
                        const canalesTexto = primerServidor.channels.cache.filter(
                            c => c.type === 0 // 0 es GUILD_TEXT
                        );
                        canalSeleccionado = canalesTexto.first();
                        if (canalSeleccionado) {
                            console.log(`✅ Usando canal de respaldo: ${canalSeleccionado.name}`);
                        }
                    }
                }
                
                // Guardar el canal seleccionado en la configuración si es diferente
                if (canalSeleccionado && (!configCumpleaños.canal || configCumpleaños.canal !== canalSeleccionado.id)) {
                    configCumpleaños.canal = canalSeleccionado.id;
                    fs.writeFileSync('configCumpleaños.json', JSON.stringify(configCumpleaños, null, 2));
                    console.log(`✅ Canal de cumpleaños actualizado a ${canalSeleccionado.name}`);
                }
                
                // Enviar el mensaje de felicitación si se encontró un canal
                if (canalSeleccionado) {
                    try {
                        // Obtener el nombre de usuario para personalizar más el mensaje
                        const nombreUsuario = memberEncontrado ? memberEncontrado.user.username : `<@${userID}>`;
                        
                        // Preparar el mensaje, reemplazando variables personalizadas
                        let mensajePersonalizado = configCumpleaños.mensaje
                            .replace('{usuario}', `<@${userID}>`)
                            .replace('{username}', nombreUsuario);
                            
                        // Crear un embed más atractivo y personalizado
                        const embed = new EmbedBuilder()
                            .setColor('#FFD700')
                            .setTitle(`🎂 ¡Feliz Cumpleaños ${nombreUsuario}! 🎉`)
                            .setDescription(mensajePersonalizado)
                            .setImage(configCumpleaños.imagen || 'https://cdn.nekotina.com/guilds/1327403077480874046/36a071e9-320c-4216-a7a1-a61e0786f793.jpg?quality=lossless')
                            .setThumbnail(memberEncontrado ? memberEncontrado.user.displayAvatarURL({ dynamic: true }) : null)
                            .setFooter({ text: 'Esperamos que tengas un día increíble 🎈' })
                            .setTimestamp();
                            
                        await canalSeleccionado.send({ 
                            embeds: [embed],
                            content: `¡Hoy es el cumpleaños de <@${userID}>! 🎂🎉 ¡Felicidades!`,
                            allowedMentions: { users: [userID] }
                        });
                        
                        console.log(`✅ Mensaje de cumpleaños enviado para el usuario ${userID}`);
                    } catch (sendError) {
                        console.error(`❌ Error al enviar mensaje de cumpleaños: ${sendError.message}`);
                    }
                } else {
                    console.log(`❌ No se pudo encontrar ningún canal para enviar el mensaje de cumpleaños`);
                }
            } catch (error) {
                console.error(`❌ Error al procesar cumpleaños para ${userID}:`, error);
            }
        }
    }
    
    if (!hayFelicitaciones) {
        console.log(`📅 No hay cumpleaños para celebrar hoy (${diaMes})`);
    } else {
        console.log(`🎉 Celebrando ${celebraciones.length} cumpleaños hoy: ${celebraciones.join(', ')}`);
    }

    return {
        hayFelicitaciones,
        celebraciones
    };
}

// Programar verificación de cumpleaños diaria
function programarVerificacionCumpleaños() {
    // Ejecutar cada día a las 09:00 AM
    const jobDiario = schedule.scheduleJob('0 9 * * *', () => {
        console.log('⏰ Ejecutando verificación programada de cumpleaños (09:00 AM)');
        verificarCumpleaños();
    });
    
    // También programar un respaldo a las 12:00 PM por si falló la verificación matutina
    const jobRespaldo = schedule.scheduleJob('0 12 * * *', () => {
        console.log('⏰ Ejecutando verificación de respaldo de cumpleaños (12:00 PM)');
        verificarCumpleaños();
    });
    
    console.log('🎂 Programada la verificación diaria de cumpleaños a las 09:00 AM y 12:00 PM');

    // También ejecutar inmediatamente para comprobar si hay cumpleaños hoy
    setTimeout(() => {
        console.log('🔄 Ejecutando verificación de cumpleaños inicial...');
        verificarCumpleaños();
    }, 15000); // Esperar 15 segundos después de iniciar para que el bot esté listo
    
    // Programar una verificación adicional cada 6 horas por seguridad
    setInterval(() => {
        console.log('🔄 Ejecutando verificación periódica de cumpleaños...');
        verificarCumpleaños();
    }, 6 * 60 * 60 * 1000); // Cada 6 horas
}

// Crear un conjunto para llevar un registro de los usuarios que ya han sido invitados
let usuariosYaInvitados = new Set();

// Cargar usuarios ya invitados al iniciar
function cargarUsuariosYaInvitados() {
    if (fs.existsSync('usuariosInvitados.json')) {
        try {
            const usuariosData = JSON.parse(fs.readFileSync('usuariosInvitados.json', 'utf8'));
            usuariosYaInvitados = new Set(usuariosData);
            console.log('📋 Datos de usuarios ya invitados cargados');
        } catch (error) {
            console.error('❌ Error al cargar usuarios ya invitados:', error);
            usuariosYaInvitados = new Set();
        }
    } else {
        fs.writeFileSync('usuariosInvitados.json', JSON.stringify([]), 'utf8');
    }
}

// Guardar usuarios ya invitados
function guardarUsuariosYaInvitados() {
    const dataToSave = Array.from(usuariosYaInvitados);
    fs.writeFileSync('usuariosInvitados.json', JSON.stringify(dataToSave, null, 2), 'utf8');
    console.log('💾 Datos de usuarios ya invitados guardados');
}

    // **Evento: Bienvenida automática**
client.on('guildMemberAdd', async (member) => {
    console.log(`🎉 Nuevo miembro: ${member.user.tag}`);

    // Enviar mensaje de bienvenida
    enviarBienvenida(member);

    // Verificar invitación usada
    const guild = member.guild;
    const newInvites = await guild.invites.fetch().catch(() => null);
    if (!newInvites) return;

    const oldInvites = invites.get(guild.id);
    let inviter = null;
    let inviteCode = null;

    // Comparar invitaciones para saber quién invitó al nuevo miembro
    newInvites.forEach((invite) => {
        if (oldInvites?.has(invite.code) && invite.uses > oldInvites.get(invite.code)) {
            inviter = invite.inviter;
            inviteCode = invite.code;
        }
    });

    invites.set(guild.id, new Map(newInvites.map(invite => [invite.code, invite.uses])));

    if (inviter) {
        // Verificar si el usuario ya había sido invitado antes
        const esUsuarioNuevo = !usuariosYaInvitados.has(member.user.id);

        // Conseguir el canal de notificación de invitaciones
        let canalNotificacion = null;
        if (canalInvitaciones) {
            canalNotificacion = guild.channels.cache.get(canalInvitaciones);
        }

        // Si es la primera vez que se une desde que se reseteó el contador
        if (esUsuarioNuevo) {
            // Registrar la invitación
            const prevCount = inviteTracker.get(inviter.id) || 0;
            inviteTracker.set(inviter.id, prevCount + 1);

            // Agregar al usuario a la lista de ya invitados
            usuariosYaInvitados.add(member.user.id);

            // Guardar los datos
            guardarInvitaciones();
            guardarUsuariosYaInvitados();

            // Crear un embed más detallado y atractivo
            const embed = new EmbedBuilder()
                .setTitle('🎉 ¡Nuevo Miembro Invitado!')
                .setColor('#FF0000')
                .setDescription(`**${member.user.tag}** acaba de unirse al servidor gracias a **${inviter.tag}**`)
                .addFields(
                    { name: '👤 Nuevo miembro', value: `<@${member.user.id}>`, inline: true },
                    { name: '🎟️ Invitador', value: `<@${inviter.id}>`, inline: true },
                    { name: '🔢 Invitaciones totales', value: `${prevCount + 1}`, inline: true }
                )
                .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
                .setImage('https://cdn.discordapp.com/attachments/1219069470652371034/1347398183839596574/linea-imagen-animada-0390.gif?ex=67cbadd8&is=67ca5c58&hm=e8dfa1ee53f2447ba90bd5dd9bc25e58cbfd6a64bfd916533c9f65e67fcb762b&')
                .setFooter({ text: `Invitación usada: ${inviteCode} • Tentación`, iconURL: guild.iconURL({ dynamic: true }) })
                .setTimestamp();

            // Enviar la notificación al canal configurado
            if (canalNotificacion) {
                canalNotificacion.send({ embeds: [embed] }).catch(console.error);
            }
        } else {
            // Notificar que el usuario ya había sido invitado antes
            const embed = new EmbedBuilder()
                .setTitle('🔄 Usuario Ha Regresado')
                .setColor('#FFA500')
                .setDescription(`**${member.user.tag}** ha regresado al servidor usando una invitación de **${inviter.tag}**`)
                .addFields(
                    { name: '👤 Usuario', value: `<@${member.user.id}>`, inline: true },
                    { name: '🎟️ Invitador', value: `<@${inviter.id}>`, inline: true },
                    { name: '📝 Nota', value: 'Esta invitación no suma al contador ya que el usuario ya había sido invitado antes', inline: false }
                )
                .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
                .setFooter({ text: `Invitación usada: ${inviteCode} • Tentación`, iconURL: guild.iconURL({ dynamic: true }) })
                .setTimestamp();

            // Enviar la notificación al canal configurado
            if (canalNotificacion) {
                canalNotificacion.send({ embeds: [embed] }).catch(console.error);
            }
        }
    } else {
        // Si no se puede determinar quién lo invitó
        let canalNotificacion = null;
        if (canalInvitaciones) {
            canalNotificacion = guild.channels.cache.get(canalInvitaciones);
            if (canalNotificacion) {
                const embed = new EmbedBuilder()
                    .setTitle('👋 Nuevo Miembro')
                    .setColor('#FF0000')
                    .setDescription(`**${member.user.tag}** se ha unido al servidor, pero no se pudo determinar quién lo invitó.`)
                    .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
                    .setFooter({ text: 'Sistema de invitaciones • Tentación', iconURL: guild.iconURL({ dynamic: true }) })
                    .setTimestamp();

                canalNotificacion.send({ embeds: [embed] }).catch(console.error);
            }
        }
    }
});

// **Evento: Despedida automática**
client.on('guildMemberRemove', async (member) => {
    console.log(`💔 Miembro salió: ${member.user.tag}`);
    enviarDespedida(member);
});

// 🔹 **Evento: Mensaje eliminado**
client.on('messageDelete', async (message) => {
    if (!canalLogs || message.author?.bot) return;
    const canal = message.guild.channels.cache.get(canalLogs);
    if (!canal) return;
    
    // Manejar mensajes que podrían no tener contenido
    let contenido = '*Mensaje sin contenido*';
    if (message.content) {
        contenido = message.content.length > 1000 
            ? message.content.substring(0, 997) + '...' 
            : message.content;
    }
    
    // Verificar si hay archivos adjuntos
    const attachments = message.attachments.size > 0 
        ? `\n📎 **Archivos adjuntos:** ${message.attachments.size} archivo(s)` 
        : '';

    const embed = new EmbedBuilder()
        .setColor('#FF0000')
        .setTitle('🗑 Mensaje Eliminado')
        .setDescription(`📌 **Mensaje de:** ${message.author?.tag || 'Usuario desconocido'}\n📍 **Canal:** ${message.channel}\n💬 **Contenido:**\n${contenido}${attachments}`)
        .setTimestamp();

    // Añadir miniatura si el mensaje tenía una imagen adjunta
    const firstAttachment = message.attachments.first();
    if (firstAttachment && firstAttachment.contentType?.startsWith('image/')) {
        embed.setThumbnail(firstAttachment.proxyURL);
    }

    canal.send({ embeds: [embed] }).catch(console.error);
});

// 🔹 **Evento: Mensaje editado**
client.on('messageUpdate', async (oldMessage, newMessage) => {
    if (!canalLogs || oldMessage.author?.bot || oldMessage.content === newMessage.content) return;
    const canal = oldMessage.guild.channels.cache.get(canalLogs);
    if (!canal) return;

    // Acortar mensajes largos
    const oldContent = oldMessage.content?.length > 500 
        ? oldMessage.content.substring(0, 497) + '...' 
        : oldMessage.content || '*Mensaje sin contenido*';
        
    const newContent = newMessage.content?.length > 500 
        ? newMessage.content.substring(0, 497) + '...' 
        : newMessage.content || '*Mensaje sin contenido*';

    const embed = new EmbedBuilder()
        .setColor('#FFA500')
        .setTitle('✏️ Mensaje Editado')
        .setDescription(`📌 **Mensaje de:** ${oldMessage.author?.tag || 'Usuario desconocido'}\n📍 **Canal:** ${oldMessage.channel}\n✏️ **Antes:** ${oldContent}\n✏️ **Después:** ${newContent}`)
        .setTimestamp();

    canal.send({ embeds: [embed] }).catch(console.error);
});

// 🔹 **Evento: Cambio de Avatar**
client.on('userUpdate', async (oldUser, newUser) => {
    if (!oldUser || !newUser || oldUser.avatar === newUser.avatar) return;
    
    // Buscar todos los servidores donde está el usuario y el bot
    client.guilds.cache.forEach(async (guild) => {
        if (!canalLogs) return;
        
        // Verificar si el usuario está en este servidor
        const member = guild.members.cache.get(newUser.id);
        if (!member) return;
        
        const canal = guild.channels.cache.get(canalLogs);
        if (!canal) return;

        const embed = new EmbedBuilder()
            .setColor('#9B59B6')
            .setTitle('🖼️ Cambio de Avatar')
            .setDescription(`**${newUser.tag}** ha cambiado su avatar.`)
            .setFields(
                { name: 'Usuario', value: `<@${newUser.id}>`, inline: true }
            )
            .setThumbnail(newUser.displayAvatarURL({ dynamic: true, size: 512 }))
            .setImage(oldUser.displayAvatarURL({ dynamic: true, size: 512 }))
            .setFooter({ text: 'Avatar anterior (abajo) | Avatar nuevo (miniatura)' })
            .setTimestamp();

        canal.send({ embeds: [embed] }).catch(console.error);
    });
});

// 🔹 **Evento: Cambio de Apodo**
client.on('guildMemberUpdate', async (oldMember, newMember) => {
    if (!canalLogs) return;
    const canal = newMember.guild.channels.cache.get(canalLogs);
    if (!canal) return;

    // Verificar cambio de apodo
    if (oldMember.nickname !== newMember.nickname) {
        const embed = new EmbedBuilder()
            .setColor('#3498DB')
            .setTitle('📝 Cambio de Apodo')
            .setDescription(`**${newMember.user.tag}** ha cambiado su apodo.`)
            .setFields(
                { name: 'Usuario', value: `<@${newMember.user.id}>`, inline: true },
                { name: 'Apodo anterior', value: oldMember.nickname || 'Ninguno', inline: true },
                { name: 'Apodo nuevo', value: newMember.nickname || 'Ninguno', inline: true }
            )
            .setThumbnail(newMember.user.displayAvatarURL({ dynamic: true }))
            .setTimestamp();

        canal.send({ embeds: [embed] }).catch(console.error);
    }

    // Verificar cambio de roles
    const rolesAgregados = newMember.roles.cache.filter(role => !oldMember.roles.cache.has(role.id));
    const rolesEliminados = oldMember.roles.cache.filter(role => !newMember.roles.cache.has(role.id));

    if (rolesAgregados.size > 0 || rolesEliminados.size > 0) {
        let descripcion = `**${newMember.user.tag}** ha tenido cambios en sus roles.`;
        
        const embed = new EmbedBuilder()
            .setColor('#2ECC71')
            .setTitle('👑 Cambio de Roles')
            .setDescription(descripcion)
            .setThumbnail(newMember.user.displayAvatarURL({ dynamic: true }))
            .setTimestamp();

        if (rolesAgregados.size > 0) {
            embed.addFields({ 
                name: '➕ Roles agregados', 
                value: rolesAgregados.map(role => `<@&${role.id}>`).join(', '), 
                inline: false 
            });
        }

        if (rolesEliminados.size > 0) {
            embed.addFields({ 
                name: '➖ Roles eliminados', 
                value: rolesEliminados.map(role => `<@&${role.id}>`).join(', '), 
                inline: false 
            });
        }

        canal.send({ embeds: [embed] }).catch(console.error);
    }
});

// 🔹 **Evento: Creación de Hilos**
client.on('threadCreate', async (thread) => {
    if (!canalLogs) return;
    const canal = thread.guild.channels.cache.get(canalLogs);
    if (!canal) return;

    // Obtener el creador del hilo (si está disponible)
    let creador = 'Desconocido';
    const fetchedLogs = await thread.guild.fetchAuditLogs({
        limit: 1,
        type: 110 // ThreadCreate
    }).catch(() => null);

    if (fetchedLogs && fetchedLogs.entries.first()) {
        const entry = fetchedLogs.entries.first();
        creador = `<@${entry.executor.id}>`;
    }

    const embed = new EmbedBuilder()
        .setColor('#F1C40F')
        .setTitle('🧵 Nuevo Hilo Creado')
        .setDescription(`Se ha creado un nuevo hilo en el canal <#${thread.parentId}>`)
        .setFields(
            { name: 'Nombre del hilo', value: thread.name, inline: true },
            { name: 'Creado por', value: creador, inline: true },
            { name: 'Enlace', value: `[Ir al hilo](https://discord.com/channels/${thread.guild.id}/${thread.id})`, inline: true }
        )
        .setTimestamp();

    canal.send({ embeds: [embed] }).catch(console.error);
});

// 🔹 **Evento: Eliminación de Hilos**
client.on('threadDelete', async (thread) => {
    if (!canalLogs) return;
    const canal = thread.guild.channels.cache.get(canalLogs);
    if (!canal) return;

    const embed = new EmbedBuilder()
        .setColor('#E74C3C')
        .setTitle('🧵 Hilo Eliminado')
        .setDescription(`Se ha eliminado un hilo del canal <#${thread.parentId}>`)
        .setFields(
            { name: 'Nombre del hilo', value: thread.name, inline: true }
        )
        .setTimestamp();

    canal.send({ embeds: [embed] }).catch(console.error);
});

// 🔹 **Evento: Creación de Canales**
client.on('channelCreate', async (channel) => {
    if (!canalLogs || !channel.guild) return;
    const canal = channel.guild.channels.cache.get(canalLogs);
    if (!canal) return;

    // Obtener el creador del canal
    let creador = 'Desconocido';
    const fetchedLogs = await channel.guild.fetchAuditLogs({
        limit: 1,
        type: 10 // CHANNEL_CREATE
    }).catch(() => null);

    if (fetchedLogs && fetchedLogs.entries.first()) {
        const entry = fetchedLogs.entries.first();
        creador = `<@${entry.executor.id}>`;
    }

    // Obtener el tipo de canal en español
    let tipoCanal = 'Desconocido';
    switch (channel.type) {
        case 0: tipoCanal = 'Texto'; break;
        case 2: tipoCanal = 'Voz'; break;
        case 4: tipoCanal = 'Categoría'; break;
        case 5: tipoCanal = 'Anuncios'; break;
        case 13: tipoCanal = 'Escenario'; break;
        case 15: tipoCanal = 'Foro'; break;
        default: tipoCanal = 'Otro';
    }

    const embed = new EmbedBuilder()
        .setColor('#27AE60')
        .setTitle('📢 Nuevo Canal Creado')
        .setDescription(`Se ha creado un nuevo canal en el servidor.`)
        .setFields(
            { name: 'Nombre', value: channel.name, inline: true },
            { name: 'Tipo', value: tipoCanal, inline: true },
            { name: 'Creado por', value: creador, inline: true },
            { name: 'ID', value: channel.id, inline: false }
        )
        .setTimestamp();

    canal.send({ embeds: [embed] }).catch(console.error);
});

// 🔹 **Evento: Eliminación de Canales**
client.on('channelDelete', async (channel) => {
    if (!canalLogs || !channel.guild) return;
    const canal = channel.guild.channels.cache.get(canalLogs);
    if (!canal) return;

    // Obtener quien eliminó el canal
    let eliminador = 'Desconocido';
    const fetchedLogs = await channel.guild.fetchAuditLogs({
        limit: 1,
        type: 12 // CHANNEL_DELETE
    }).catch(() => null);

    if (fetchedLogs && fetchedLogs.entries.first()) {
        const entry = fetchedLogs.entries.first();
        eliminador = `<@${entry.executor.id}>`;
    }

    // Obtener el tipo de canal en español
    let tipoCanal = 'Desconocido';
    switch (channel.type) {
        case 0: tipoCanal = 'Texto'; break;
        case 2: tipoCanal = 'Voz'; break;
        case 4: tipoCanal = 'Categoría'; break;
        case 5: tipoCanal = 'Anuncios'; break;
        case 13: tipoCanal = 'Escenario'; break;
        case 15: tipoCanal = 'Foro'; break;
        default: tipoCanal = 'Otro';
    }

    const embed = new EmbedBuilder()
        .setColor('#C0392B')
        .setTitle('🗑️ Canal Eliminado')
        .setDescription(`Se ha eliminado un canal del servidor.`)
        .setFields(
            { name: 'Nombre', value: channel.name, inline: true },
            { name: 'Tipo', value: tipoCanal, inline: true },
            { name: 'Eliminado por', value: eliminador, inline: true },
            { name: 'ID', value: channel.id, inline: false }
        )
        .setTimestamp();

    canal.send({ embeds: [embed] }).catch(console.error);
});

// 🔹 **Evento: Actualización del Servidor**
client.on('guildUpdate', async (oldGuild, newGuild) => {
    if (!canalLogs) return;
    const canal = newGuild.channels.cache.get(canalLogs);
    if (!canal) return;

    const embed = new EmbedBuilder()
        .setColor('#3498DB')
        .setTitle('🔄 Servidor Actualizado')
        .setTimestamp();

    let cambios = false;

    // Verificar cambios en el nombre
    if (oldGuild.name !== newGuild.name) {
        embed.addFields({ 
            name: '📝 Nombre del servidor', 
            value: `**Antes:** ${oldGuild.name}\n**Después:** ${newGuild.name}`, 
            inline: false 
        });
        cambios = true;
    }

    // Verificar cambios en el icono
    if (oldGuild.icon !== newGuild.icon) {
        embed.addFields({ 
            name: '🖼️ Icono del servidor', 
            value: 'El icono del servidor ha sido actualizado', 
            inline: false 
        });
        
        // Mostrar el nuevo icono
        if (newGuild.icon) {
            embed.setThumbnail(newGuild.iconURL({ dynamic: true, size: 512 }));
        }
        
        cambios = true;
    }

    // Verificar cambios en el banner
    if (oldGuild.banner !== newGuild.banner) {
        embed.addFields({ 
            name: '🏙️ Banner del servidor', 
            value: 'El banner del servidor ha sido actualizado', 
            inline: false 
        });
        
        // Mostrar el nuevo banner
        if (newGuild.banner) {
            embed.setImage(newGuild.bannerURL({ dynamic: true, size: 512 }));
        }
        
        cambios = true;
    }

    // Solo enviar si hubo cambios
    if (cambios) {
        canal.send({ embeds: [embed] }).catch(console.error);
    }
});


// Función para manejar mensajes del buzón
async function procesarMensajeBuzon(message) {
    // Verificar si el mensaje está en un canal de buzón
    const guildId = message.guild.id;
    console.log(`📫 Verificando mensaje en canal ${message.channel.id} del servidor ${guildId}`);
    
    const buzonInfo = buzonConfig.get(guildId);
    
    if (!buzonInfo) {
        console.log(`📫 No hay configuración de buzón para el servidor ${guildId}`);
        return false;
    }
    
    if (!buzonInfo.activo) {
        console.log(`📫 Buzón desactivado para el servidor ${guildId} (activo: ${buzonInfo.activo})`);
        console.log(`📫 Entrada: ${buzonInfo.canalEntrada}, Destino: ${buzonInfo.destino}`);
        return false;
    }
    
    // Verificar si el mensaje está en el canal de entrada del buzón
    console.log(`📫 Comparando canal ${message.channel.id} con canal de entrada ${buzonInfo.canalEntrada}`);
    
    if (message.channel.id === buzonInfo.canalEntrada) {
        console.log(`📫 Mensaje detectado en canal de entrada del buzón`);
        try {
            // Obtener el canal de destino del buzón
            const canalDestino = message.guild.channels.cache.get(buzonInfo.destino);
            if (!canalDestino) {
                console.error(`❌ Canal de buzón destino no encontrado: ${buzonInfo.destino}`);
                return false;
            }
            
            console.log(`📫 Canal destino encontrado: ${canalDestino.name} (${buzonInfo.destino})`);
            
            // Capturar detalles del mensaje
            const autor = message.author;
            const contenido = message.content;
            const hora = new Date();
            const archivos = [];
            
            // Guardar los archivos adjuntos
            message.attachments.forEach(attachment => {
                archivos.push({
                    url: attachment.url,
                    proxyURL: attachment.proxyURL, // URL proxy de Discord que puede ser más confiable
                    name: attachment.name,
                    contentType: attachment.contentType, // Para verificar si es imagen
                    width: attachment.width,
                    height: attachment.height
                });
                console.log(`📫 Archivo detectado: ${attachment.name} (${attachment.url})`);
                console.log(`📫 Tipo de contenido: ${attachment.contentType}, Dimensiones: ${attachment.width}x${attachment.height}`);
            });
            
            // Crear embed con la información
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('📫 Nuevo Mensaje en el Buzón')
                .setDescription(contenido || '*No hay contenido de texto*')
                .addFields(
                    { name: '📝 Autor', value: `${autor.tag} (${autor})`, inline: true },
                    { name: '⏰ Hora', value: `<t:${Math.floor(hora.getTime() / 1000)}:F>`, inline: true }
                )
                .setFooter({ text: 'Sistema de Buzón • Tentación', iconURL: message.guild.iconURL({ dynamic: true }) })
                .setTimestamp();
                
            // Añadir el avatar del autor
            embed.setThumbnail(autor.displayAvatarURL({ dynamic: true, format: 'png' }));
            
            // No incluir imágenes en el embed, todas se enviarán como archivos adjuntos
            // Si hay archivos, incluirlos como enlaces en el embed solo si NO son imágenes
            if (archivos.length > 0) {
                // Filtrar archivos que no son imágenes
                const archivosNoImagenes = archivos.filter(archivo => 
                    !archivo.contentType || !archivo.contentType.startsWith('image/')
                );
                
                // Si hay archivos que no son imágenes, agregarlos como links en el campo
                if (archivosNoImagenes.length > 0) {
                    let campoArchivos = '';
                    for (const archivo of archivosNoImagenes) {
                        campoArchivos += `[${archivo.name || `Archivo`}](${archivo.url})\n`;
                    }
                    if (campoArchivos) {
                        embed.addFields({ name: '📎 Archivos adjuntos (no imágenes)', value: campoArchivos, inline: false });
                    }
                }
                
                // Contar imágenes para mencionarlas en el embed
                const imagenesCount = archivos.filter(file => 
                    file.contentType && file.contentType.startsWith('image/')
                ).length;
                
                if (imagenesCount > 0) {
                    embed.addFields({ name: '🖼️ Imágenes', value: `${imagenesCount} imagen(es) adjunta(s)`, inline: false });
                }
            }
            
            // Opciones de mensaje
            const messageOptions = { embeds: [embed] };
            
            // Adjuntar TODAS las imágenes directamente como archivos
            const imageAttachments = archivos.filter(file => 
                file.contentType && file.contentType.startsWith('image/')
            );
            
            if (imageAttachments.length > 0) {
                console.log(`📫 Adjuntando imágenes directamente: ${imageAttachments.length} imágenes`);
                messageOptions.files = imageAttachments.map(file => file.url);
            }
            
            // Enviar mensaje al canal destino
            console.log(`📫 Enviando mensaje al canal destino: ${canalDestino.name}`);
            await canalDestino.send(messageOptions);
            console.log(`📫 Mensaje enviado al canal destino correctamente`);
            
            // Borrar el mensaje original
            console.log(`📫 Intentando borrar mensaje original`);
            try {
                // Verificar si el bot tiene permisos para borrar mensajes
                const permissions = message.channel.permissionsFor(message.client.user);
                if (!permissions || !permissions.has('ManageMessages')) {
                    console.error(`❌ No tengo permisos para borrar mensajes en el canal ${message.channel.name}`);
                    return true; // Devolvemos true porque el mensaje se envió correctamente al destino
                }
                
                await message.delete();
                console.log(`📫 Mensaje original borrado correctamente`);
            } catch (deleteError) {
                console.error(`❌ Error al borrar mensaje de buzón: ${deleteError.message}`);
                // No retornamos false aquí, porque el mensaje se envió correctamente al destino
            }
            
            return true;
        } catch (error) {
            console.error('❌ Error al procesar mensaje de buzón:', error);
            return false;
        }
    } else {
        console.log(`📫 El mensaje no está en el canal de entrada del buzón`);
    }
    
    return false;
}

// 📌 **Evento: Mensajes**
client.on('messageCreate', async (message) => {
    if (message.author.bot) return; // Ignorar mensajes de bots
    
    // Imprimir información básica del mensaje para depuración
    console.log(`📩 Mensaje recibido de ${message.author.tag} en canal ${message.channel.name} (${message.channel.id})`);
    
    // Verificar si el servidor tiene configuración de buzón
    const guildId = message.guild?.id;
    if (guildId) {
        const config = buzonConfig.get(guildId);
        if (config) {
            console.log(`📫 Configuración de buzón encontrada para el servidor ${guildId}`);
            console.log(`📫 Estado: ${config.activo ? 'Activo' : 'Inactivo'}`);
            console.log(`📫 Canal entrada: ${config.canalEntrada}, Canal destino: ${config.destino}`);
        }
    }
    
    // Procesar mensaje para el buzón
    try {
        const procesado = await procesarMensajeBuzon(message);
        console.log(`📫 Resultado de procesarMensajeBuzon: ${procesado ? 'Procesado' : 'No procesado'}`);
        if (procesado) return; // Si fue procesado como mensaje de buzón, no continuar
    } catch (error) {
        console.error('❌ Error en procesamiento de buzón:', error);
    }

    // 🎭 Sistema de Niveles y XP
    if (!nivelesXP[message.author.id]) {
        nivelesXP[message.author.id] = { xp: 0, nivel: 1 };
    }
    nivelesXP[message.author.id].xp += 10;
    if (nivelesXP[message.author.id].xp >= nivelesXP[message.author.id].nivel * 100) {
        nivelesXP[message.author.id].xp = 0;
        nivelesXP[message.author.id].nivel++;
        
        // Crear un embed personalizado para el nivel
        const nivelEmbed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('🎉 ¡SUBIDA DE NIVEL! 🎉')
            .setDescription(`¡Felicidades ${message.author}! Has alcanzado el nivel **${nivelesXP[message.author.id].nivel}**`)
            .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
            .addFields(
                { name: '👤 Usuario', value: message.author.tag, inline: true },
                { name: '🔮 Nivel actual', value: nivelesXP[message.author.id].nivel.toString(), inline: true },
                { name: '✨ XP', value: '0/' + (nivelesXP[message.author.id].nivel * 100), inline: true }
            )
            .setFooter({ text: 'Sistema de niveles • Tentación', iconURL: message.guild.iconURL({ dynamic: true }) })
            .setTimestamp();
        
        // Enviar notificación al canal configurado o al canal del mensaje
        if (canalNiveles) {
            const canal = message.guild.channels.cache.get(canalNiveles);
            if (canal) {
                canal.send({ embeds: [nivelEmbed] });
            } else {
                message.channel.send({ embeds: [nivelEmbed] });
            }
        } else {
            message.channel.send({ embeds: [nivelEmbed] });
        }
    }
    
    // Guardar los niveles XP cada vez que un usuario gana experiencia
    // Solo guardamos ocasionalmente para no sobrecargar el sistema
    if (Math.random() < 0.1) { // 10% de probabilidad de guardar en cada mensaje
        guardarNiveles();
    }

    // 📌 **Comando para establecer canal de logs, bienvenida y despedida** (Solo administradores)
    if (message.content.startsWith('¡setlogs')) {
        // Verificar permisos de administrador
        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return message.reply('❌ No tienes permiso para configurar el canal de logs.');
        }
        const canalMencionado = message.mentions.channels.first();
        if (!canalMencionado) return message.reply('⚠ Menciona un canal válido: `¡setlogs #canal`');
        
        // Actualizar la configuración usando la nueva función
        updateServerConfig(message.guild.id, 'canalLogs', canalMencionado.id);
        
        message.reply(`✅ Canal de logs establecido en ${canalMencionado}.`);
    }
    else if (message.content.startsWith('¡setbienvenida')) {
        // Verificar permisos de administrador
        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return message.reply('❌ No tienes permiso para configurar el canal de bienvenida.');
        }
        const canalMencionado = message.mentions.channels.first();
        if (!canalMencionado) return message.reply('⚠ Menciona un canal válido: `¡setbienvenida #canal`');
        
        // Actualizar la configuración usando la nueva función
        updateServerConfig(message.guild.id, 'canalBienvenida', canalMencionado.id);
        
        message.reply(`✅ Canal de bienvenida establecido en ${canalMencionado}.`);
    }
    else if (message.content.startsWith('¡setdespedida')) {
        // Verificar permisos de administrador
        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return message.reply('❌ No tienes permiso para configurar el canal de despedida.');
        }
        const canalMencionado = message.mentions.channels.first();
        if (!canalMencionado) return message.reply('⚠ Menciona un canal válido: `¡setdespedida #canal`');
        
        // Actualizar la configuración usando la nueva función
        updateServerConfig(message.guild.id, 'canalDespedida', canalMencionado.id);
        
        message.reply(`✅ Canal de despedida establecido en ${canalMencionado}.`);
    }
    // 🎨 Comandos para personalizar mensajes de bienvenida y despedida
    else if (message.content.startsWith('¡setmensajebienvenida')) {
        // Verificar permisos de administrador
        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return message.reply('❌ No tienes permiso para configurar el mensaje de bienvenida.');
        }
        
        const args = message.content.split('|').map(arg => arg.trim());
        if (args.length < 3) {
            return message.reply('⚠ Formato incorrecto. Usa: `¡setmensajebienvenida | Título | Descripción | [Color Hex] | [URL Imagen]`\n\n**Variables disponibles:**\n`{username}` - Nombre del usuario\n`{mencion}` - Mención al usuario (obligatorio)\n`{servername}` - Nombre del servidor');
        }
        
        const titulo = args[1];
        const descripcion = args[2];
        const color = args[3] || '#FF0000';
        const imagen = args[4] || mensajesDefault.bienvenida.imagen;
        
        // Verificar que {mencion} o @ esté en la descripción
        if (!descripcion.includes('{mencion}') && !descripcion.includes('@')) {
            return message.reply('⚠ El mensaje de bienvenida debe incluir la variable `{mencion}` para mencionar al usuario que se une.');
        }
        
        // Guardar mensaje personalizado
        mensajesPersonalizados.bienvenida.set(message.guild.id, {
            titulo,
            descripcion,
            color,
            imagen
        });
        
        guardarMensajesPersonalizados();
        
        // Mostrar vista previa
        const embedPreview = new EmbedBuilder()
            .setColor(color)
            .setTitle(titulo.replace(/{username}/g, message.author.username).replace(/{servername}/g, message.guild.name))
            .setDescription(descripcion
                .replace(/{username}/g, message.author.username)
                .replace(/{mencion}/g, `${message.author}`)
                .replace(/{servername}/g, message.guild.name))
            .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
            .setImage(imagen);
            
        message.reply({
            content: '✅ Mensaje de bienvenida personalizado guardado. Así se verá:',
            embeds: [embedPreview]
        });
    }
    else if (message.content.startsWith('¡setmensajedespedida')) {
        // Verificar permisos de administrador
        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return message.reply('❌ No tienes permiso para configurar el mensaje de despedida.');
        }
        
        const args = message.content.split('|').map(arg => arg.trim());
        if (args.length < 3) {
            return message.reply('⚠ Formato incorrecto. Usa: `¡setmensajedespedida | Título | Descripción | [Color Hex] | [URL Imagen]`\n\n**Variables disponibles:**\n`{username}` - Nombre del usuario que se va (obligatorio)\n`{servername}` - Nombre del servidor');
        }
        
        const titulo = args[1];
        const descripcion = args[2];
        const color = args[3] || '#FF0000';
        const imagen = args[4] || mensajesDefault.despedida.imagen;
        
        // Verificar que {username} esté en la descripción o título
        if (!descripcion.includes('{username}') && !titulo.includes('{username}')) {
            return message.reply('⚠ El mensaje de despedida debe incluir la variable `{username}` para mencionar al usuario que se va, ya sea en el título o la descripción.');
        }
        
        // Guardar mensaje personalizado
        mensajesPersonalizados.despedida.set(message.guild.id, {
            titulo,
            descripcion,
            color,
            imagen
        });
        
        guardarMensajesPersonalizados();
        
        // Mostrar vista previa
        const embedPreview = new EmbedBuilder()
            .setColor(color)
            .setTitle(titulo.replace(/{username}/g, message.author.username).replace(/{servername}/g, message.guild.name))
            .setDescription(descripcion
                .replace(/{username}/g, message.author.username)
                .replace(/{servername}/g, message.guild.name))
            .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
            .setImage(imagen);
            
        message.reply({
            content: '✅ Mensaje de despedida personalizado guardado. Así se verá:',
            embeds: [embedPreview]
        });
    }
    else if (message.content.startsWith('¡vermensajebienvenida')) {
        // Verificar si existe un mensaje personalizado para este servidor
        const mensajePersonalizado = mensajesPersonalizados.bienvenida.get(message.guild.id);
        
        if (!mensajePersonalizado) {
            // Mostrar mensaje por defecto
            const embedDefault = new EmbedBuilder()
                .setColor(mensajesDefault.bienvenida.color)
                .setTitle(mensajesDefault.bienvenida.titulo.replace(/{username}/g, message.author.username))
                .setDescription(mensajesDefault.bienvenida.descripcion
                    .replace(/{username}/g, message.author.username)
                    .replace(/{mencion}/g, `${message.author}`)
                    .replace(/{servername}/g, message.guild.name))
                .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
                .setImage(mensajesDefault.bienvenida.imagen)
                .setFooter({ text: 'Este es el mensaje de bienvenida por defecto. Usa ¡setmensajebienvenida para personalizarlo.' });
                
            message.reply({
                embeds: [embedDefault]
            });
        } else {
            // Mostrar mensaje personalizado
            const embed = new EmbedBuilder()
                .setColor(mensajePersonalizado.color)
                .setTitle(mensajePersonalizado.titulo
                    .replace(/{username}/g, message.author.username)
                    .replace(/{servername}/g, message.guild.name))
                .setDescription(mensajePersonalizado.descripcion
                    .replace(/{username}/g, message.author.username)
                    .replace(/{mencion}/g, `${message.author}`)
                    .replace(/{servername}/g, message.guild.name))
                .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
                .setImage(mensajePersonalizado.imagen)
                .setFooter({ text: 'Este es el mensaje de bienvenida personalizado de este servidor.' });
                
            message.reply({
                embeds: [embed]
            });
        }
    }
    else if (message.content.startsWith('¡vermensajedespedida')) {
        // Verificar si existe un mensaje personalizado para este servidor
        const mensajePersonalizado = mensajesPersonalizados.despedida.get(message.guild.id);
        
        if (!mensajePersonalizado) {
            // Mostrar mensaje por defecto
            const embedDefault = new EmbedBuilder()
                .setColor(mensajesDefault.despedida.color)
                .setTitle(mensajesDefault.despedida.titulo.replace(/{username}/g, message.author.username))
                .setDescription(mensajesDefault.despedida.descripcion
                    .replace(/{username}/g, message.author.username)
                    .replace(/{servername}/g, message.guild.name))
                .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
                .setImage(mensajesDefault.despedida.imagen)
                .setFooter({ text: 'Este es el mensaje de despedida por defecto. Usa ¡setmensajedespedida para personalizarlo.' });
                
            message.reply({
                embeds: [embedDefault]
            });
        } else {
            // Mostrar mensaje personalizado
            const embed = new EmbedBuilder()
                .setColor(mensajePersonalizado.color)
                .setTitle(mensajePersonalizado.titulo
                    .replace(/{username}/g, message.author.username)
                    .replace(/{servername}/g, message.guild.name))
                .setDescription(mensajePersonalizado.descripcion
                    .replace(/{username}/g, message.author.username)
                    .replace(/{servername}/g, message.guild.name))
                .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
                .setImage(mensajePersonalizado.imagen)
                .setFooter({ text: 'Este es el mensaje de despedida personalizado de este servidor.' });
                
            message.reply({
                embeds: [embed]
            });
        }
    }
    else if (message.content.startsWith('¡resetmensajebienvenida')) {
        // Verificar permisos de administrador
        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return message.reply('❌ No tienes permiso para resetear el mensaje de bienvenida.');
        }
        
        // Eliminar mensaje personalizado
        mensajesPersonalizados.bienvenida.delete(message.guild.id);
        guardarMensajesPersonalizados();
        
        message.reply('✅ Mensaje de bienvenida restablecido al predeterminado.');
    }
    else if (message.content.startsWith('¡resetmensajedespedida')) {
        // Verificar permisos de administrador
        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return message.reply('❌ No tienes permiso para resetear el mensaje de despedida.');
        }
        
        // Eliminar mensaje personalizado
        mensajesPersonalizados.despedida.delete(message.guild.id);
        guardarMensajesPersonalizados();
        
        message.reply('✅ Mensaje de despedida restablecido al predeterminado.');
    }
    else if (message.content.startsWith('¡setniveles')) {
        // Verificar permisos de administrador
        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return message.reply('❌ No tienes permiso para configurar el canal de niveles.');
        }
        const canalMencionado = message.mentions.channels.first();
        if (!canalMencionado) return message.reply('⚠ Menciona un canal válido: `¡setniveles #canal`');
        
        // Actualizar la configuración usando la nueva función
        updateServerConfig(message.guild.id, 'canalNiveles', canalMencionado.id);
        
        message.reply(`✅ Canal de notificaciones de nivel establecido en ${canalMencionado}.`);
    }
    else if (message.content.startsWith('¡testbienvenida')) {
        // Verificar permisos de administrador
        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return message.reply('❌ No tienes permiso para probar los mensajes de bienvenida.');
        }
        if (!canalBienvenida) return message.reply('⚠ No hay un canal de bienvenida configurado. Usa `¡setbienvenida #canal` primero.');
        enviarBienvenida(message.member);
    }
    else if (message.content.startsWith('¡testdespedida')) {
        // Verificar permisos de administrador
        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return message.reply('❌ No tienes permiso para probar los mensajes de despedida.');
        }
        if (!canalDespedida) return message.reply('⚠ No hay un canal de despedida configurado. Usa `¡setdespedida #canal` primero.');
        enviarDespedida(message.member);
    }

    // 📌 **Comando para mostrar información del usuario**
    else if (message.content.startsWith('¡userinfo')) {
        const user = message.mentions.users.first() || message.author;
        const member = message.guild.members.cache.get(user.id);
        const embed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle(`📋 Información de ${user.username}`)
            .setThumbnail(user.displayAvatarURL({ dynamic: true }))
            .addFields(
                { name: 'ID', value: user.id, inline: true },
                { name: 'Roles', value: member.roles.cache.map(role => role.name).join(', '), inline: false },
                { name: 'Fecha de ingreso', value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:D>`, inline: false }
            );
        message.channel.send({ embeds: [embed] });
    }

    // 📌 **Comando para mostrar información del servidor**
    else if (message.content.startsWith('¡serverinfo')) {
        const embed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle(`🌍 Información del servidor: ${message.guild.name}`)
            .setThumbnail(message.guild.iconURL({ dynamic: true }))
            .addFields(
                { name: 'ID', value: message.guild.id, inline: true },
                { name: 'Miembros', value: message.guild.memberCount.toString(), inline: true },
                { name: 'Creado el', value: `<t:${Math.floor(message.guild.createdTimestamp / 1000)}:D>`, inline: false }
            );
        message.channel.send({ embeds: [embed] });
    }

    // 📌 **Comando para mostrar avatar**
    else if (message.content.startsWith('¡avatar')) {
        const user = message.mentions.users.first() || message.author;
        const embed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle(`🖼 Avatar de ${user.username}`)
            .setImage(user.displayAvatarURL({ dynamic: true, size: 512 }));
        message.channel.send({ embeds: [embed] });
    }
    
    // 🔗 **Comando para generar enlace de invitación del bot**
    else if (message.content.startsWith('¡invitarbot')) {
        // Verificar si el usuario es admin o el propietario del bot
        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator) && 
            message.author.id !== process.env.OWNER_ID) {
            return message.reply('❌ Necesitas permisos de administrador para usar este comando.');
        }
            
        const inviteLinkDetallado = `https://discord.com/api/oauth2/authorize?client_id=${client.user.id}&permissions=1099511627775&scope=bot%20applications.commands`;
        const inviteLinkBasico = `https://discord.com/oauth2/authorize?client_id=${client.user.id}&permissions=1074121728&scope=bot%20applications.commands`;
        
        const embed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('🔗 Invita a Tentación Bot a tu servidor')
            .setDescription('Puedes invitar a Tentación Bot a tu servidor usando los siguientes enlaces:')
            .addFields(
                { name: '🛡️ Con todos los permisos (recomendado)', value: `[Click aquí para invitar](${inviteLinkDetallado})`, inline: false },
                { name: '🔒 Con permisos básicos', value: `[Click aquí para invitar](${inviteLinkBasico})`, inline: false }
            )
            .setFooter({ text: 'Tentación Bot • Sistema de invitación', iconURL: client.user.displayAvatarURL() })
            .setThumbnail(client.user.displayAvatarURL({ dynamic: true }))
            .setTimestamp();
            
        message.channel.send({ embeds: [embed] });
    }

    // 📌 **Comando para mostrar latencia (ping)**
    else if (message.content.startsWith('¡ping')) {
        message.reply(`🏓 Pong! Latencia: ${client.ws.ping}ms`);
    }
    
    // 📌 **Comando para mostrar información detallada de latencia**
    else if (message.content.startsWith('¡autoping')) {
        const embed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('🔌 Información de Latencia')
            .addFields(
                { name: '📡 Latencia de API', value: `${client.ws.ping}ms`, inline: true },
                { name: '⏱️ Uptime', value: `${Math.floor(client.uptime / 86400000)}d ${Math.floor((client.uptime % 86400000) / 3600000)}h ${Math.floor((client.uptime % 3600000) / 60000)}m`, inline: true }
            )
            .setFooter({ text: `Tentación Bot • ${new Date().toLocaleString()}` });
            
        message.channel.send({ embeds: [embed] });
    }

    // 📌 **Comando para encuestas** (Solo moderadores o administradores)
    else if (message.content.startsWith('¡encuesta')) {
        // Verificar permisos (moderador o administrador)
        if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
            return message.reply('❌ No tienes permiso para crear encuestas. Necesitas permisos de moderador.');
        }
        
        const args = message.content.split('"').filter(arg => arg.trim() !== '');
        if (args.length < 3) return message.reply('⚠ Uso correcto: `¡encuesta "Pregunta" "Opción1" "Opción2" ...`');

        const pregunta = args[0].replace('¡encuesta ', '').trim();
        const opciones = args.slice(1);

        if (opciones.length > 10) return message.reply('⚠ Máximo 10 opciones.');

        const emojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
        let descripcion = '';
        opciones.forEach((opcion, index) => {
            descripcion += `${emojis[index]} ${opcion}\n`;
        });

        const embed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle(`📊 Encuesta: ${pregunta}`)
            .setDescription(descripcion)
            .setFooter({ text: `Encuesta creada por ${message.author.tag}` });

        const encuesta = await message.channel.send({ embeds: [embed] });
        for (let i = 0; i < opciones.length; i++) {
            await encuesta.react(emojis[i]);
        }
    }

    // 🧹 Comando para borrar mensajes (clear)
    else if (message.content.startsWith('¡clear')) {
        // Verificar permisos del usuario
        if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
            return message.reply('❌ No tienes permiso para borrar mensajes.');
        }
        
        // Verificar permisos del bot
        if (!message.guild.members.me.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
            return message.reply('❌ No tengo permiso para borrar mensajes. Pide al administrador que me otorgue el permiso "Gestionar Mensajes".');
        }

        const args = message.content.split(' ');
        const cantidad = parseInt(args[1]);

        if (isNaN(cantidad) || cantidad < 1 || cantidad > 100) {
            return message.reply('⚠ Debes especificar un número entre 1 y 100.');
        }

        // Intentar borrar mensajes con mejor manejo de errores
        try {
            message.channel.bulkDelete(cantidad, true)
                .then(messages => {
                    // Verificar cuántos mensajes se borraron realmente
                    if (messages.size === 0) {
                        message.reply('⚠ No se pudo borrar ningún mensaje. Posiblemente son demasiado antiguos (más de 14 días).')
                            .then(msg => setTimeout(() => msg.delete().catch(() => {}), 5000))
                            .catch(console.error);
                    } else if (messages.size < cantidad) {
                        message.reply(`⚠ Solo se pudieron borrar ${messages.size} mensajes. Los demás posiblemente son demasiado antiguos (más de 14 días).`)
                            .then(msg => setTimeout(() => msg.delete().catch(() => {}), 5000))
                            .catch(console.error);
                    } else {
                        message.channel.send(`✅ Se eliminaron ${messages.size} mensajes.`)
                            .then(msg => setTimeout(() => msg.delete().catch(() => {}), 5000))
                            .catch(console.error);
                    }
                })
                .catch(error => {
                    console.error('Error al borrar mensajes:', error);
                    
                    if (error.code === 50034) {
                        message.reply('❌ No se pudieron borrar los mensajes porque son demasiado antiguos (más de 14 días).')
                            .catch(console.error);
                    } else if (error.code === 50013) {
                        message.reply('❌ No tengo los permisos necesarios para borrar mensajes en este canal.')
                            .catch(console.error);
                    } else {
                        message.reply(`❌ Ocurrió un error al borrar los mensajes: ${error.message}`)
                            .catch(console.error);
                    }
                });
        } catch (error) {
            console.error('Error crítico al borrar mensajes:', error);
            message.reply('❌ Ocurrió un error inesperado al intentar borrar mensajes.')
                .catch(console.error);
        }
    }

    // 🚪 Comando para expulsar (kick)
    else if (message.content.startsWith('¡kick')) {
        if (!message.member.permissions.has(PermissionsBitField.Flags.KickMembers)) {
            return message.reply('❌ No tienes permiso para expulsar usuarios.');
        }
        if (!message.guild.members.me.permissions.has(PermissionsBitField.Flags.KickMembers)) {
            return message.reply('❌ No tengo permiso para expulsar usuarios.');
        }

        const miembro = message.mentions.members.first();
        if (!miembro) return message.reply('⚠ Debes mencionar a un usuario.');
        if (!miembro.kickable) return message.reply('❌ No puedo expulsar a ese usuario.');

        await miembro.kick();
        message.channel.send(`✅ ${miembro.user.tag} ha sido expulsado.`);
    }

    // 🔨 Comando para banear (ban)
    else if (message.content.startsWith('¡ban')) {
        if (!message.member.permissions.has(PermissionsBitField.Flags.BanMembers)) {
            return message.reply('❌ No tienes permiso para banear usuarios.');
        }
        if (!message.guild.members.me.permissions.has(PermissionsBitField.Flags.BanMembers)) {
            return message.reply('❌ No tengo permiso para banear usuarios.');
        }

        const miembro = message.mentions.members.first();
        if (!miembro) return message.reply('⚠ Debes mencionar a un usuario.');
        if (!miembro.bannable) return message.reply('❌ No puedo banear a ese usuario.');

        await miembro.ban();
        message.channel.send(`✅ ${miembro.user.tag} ha sido baneado.`);
    }

    // 🔇 Comando para mutear (mute)
    else if (message.content.startsWith('¡mute')) {
        if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
            return message.reply('❌ No tienes permiso para mutear usuarios.');
        }

        if (!message.guild.members.cache.get(client.user.id).permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
            return message.reply('❌ No tengo permiso para mutear usuarios.');
        }

        const args = message.content.split(' ');
        const miembro = message.mentions.members.first();
        const tiempo = args[2] ? parseInt(args[2].replace(/\D/g, '')) : null; // Extrae el número
        const unidad = args[2] ? args[2].replace(/\d/g, '') : ''; // Extrae la unidad

        if (!miembro) return message.reply('⚠ Debes mencionar a un usuario.');
        if (isNaN(tiempo)) return message.reply('⚠ Debes especificar un tiempo válido. Ejemplo: `¡mute @usuario 10m`');
        if (miembro.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return message.reply('❌ No puedes mutear a un administrador.');
        }

        let tiempoMS = 0;
        if (unidad.includes('s')) tiempoMS = tiempo * 1000; // Segundos
        if (unidad.includes('m')) tiempoMS = tiempo * 60 * 1000; // Minutos
        if (unidad.includes('h')) tiempoMS = tiempo * 60 * 60 * 1000; // Horas

        try {
            await miembro.timeout(tiempoMS || 10 * 60 * 1000); // 10 minutos por defecto
            message.channel.send(`✅ ${miembro.user.tag} ha sido muteado por ${tiempo ? tiempo + unidad : '10m'}.`);
        } catch (error) {
            console.error(error);
            message.reply('❌ Hubo un error al intentar mutear a ese usuario.');
        }
    }

    // 🔊 Comando para desmutear (unmute)
    else if (message.content.startsWith('¡unmute')) {
        if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
            return message.reply('❌ No tienes permiso para desmutear usuarios.');
        }
        if (!message.guild.members.me.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
            return message.reply('❌ No tengo permiso para desmutear usuarios.');
        }

        const miembro = message.mentions.members.first();
        if (!miembro) return message.reply('⚠ Debes mencionar a un usuario.');
        if (!miembro.communicationDisabledUntil) return message.reply('⚠ Ese usuario no está muteado.');

        await miembro.timeout(null);
        message.channel.send(`✅ ${miembro.user.tag} ha sido desmuteado.`);
    }

    // Comando para enviar mensajes como el bot
    else if (message.content.startsWith('¡decir')) {
        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return message.reply('❌ No tienes permisos para usar este comando.');
        }

        // Obtener el texto original completo
        const textoCompleto = message.content.substring('¡decir'.length).trim();
        
        // Buscar la mención del canal
        const canalMencion = /<#\d+>/;
        const match = textoCompleto.match(canalMencion);
        
        if (!match) {
            return message.reply('⚠ Debes mencionar un canal para enviar el mensaje. Ejemplo: `¡decir #canal Mensaje a enviar`');
        }
        
        // Obtener el ID del canal mencionado
        const canalID = match[0].replace(/<#|>/g, '');
        const canalMencionado = message.guild.channels.cache.get(canalID);
        
        if (!canalMencionado) {
            return message.reply('⚠ No se encontró el canal mencionado.');
        }
        
        // Obtener el mensaje a enviar (quitando la mención del canal)
        const mensajeAEnviar = textoCompleto.replace(match[0], '').trim();
        const imagenAdjunta = message.attachments.first()?.url; // Obtener la URL de la imagen adjunta

        if (!mensajeAEnviar && !imagenAdjunta) {
            return message.reply('⚠ Debes escribir un mensaje o adjuntar una imagen para enviar.');
        }

        // Crear el contenido del mensaje
        const contenido = { content: mensajeAEnviar };
        if (imagenAdjunta) {
            contenido.files = [imagenAdjunta]; // Adjuntar la imagen si hay una
        }

        // Enviar el mensaje al canal especificado
        canalMencionado.send(contenido)
            .then(() => message.reply(`✅ Mensaje enviado a ${canalMencionado.name}.`))
            .catch(() => message.reply('❌ No pude enviar el mensaje, verifica mis permisos.'));
    }

    // Comando para ver cuántas personas ha invitado un usuario
    else if (message.content.startsWith('¡invitaciones')) {
        const user = message.mentions.users.first() || message.author;
        const count = inviteTracker.get(user.id) || 0;

        const embed = new EmbedBuilder()
            .setTitle('📊 Estadísticas de Invitaciones')
            .setColor('#FF0000')
            .setDescription(`**${user.tag}** ha invitado a **${count}** personas.`)
            .setThumbnail(user.displayAvatarURL({ dynamic: true }))
            .setFooter({ text: 'Sistema de Invitaciones' });

        message.channel.send({ embeds: [embed] });
    }

    // Comando para ver el TOP de usuarios con más invitaciones
    else if (message.content.startsWith('¡topinvitaciones')) {
        if (inviteTracker.size === 0) {
            return message.channel.send('📉 Nadie ha invitado a nadie aún.');
        }

        // Ordenar el ranking
        const topInvites = [...inviteTracker.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10); // Mostrar el top 10

        const embed = new EmbedBuilder()
            .setTitle('🏆 Top Invitaciones')
            .setColor('#FF0000')
            .setDescription(
                topInvites.map((entry, index) => `**${index + 1}.** <@${entry[0]}> → **${entry[1]}** invitaciones.`).join('\n')
            )
            .setFooter({ text: 'Sistema de invitaciones' });

        message.channel.send({ embeds: [embed] });
    }

    // Comando para configurar el canal de registro de invitaciones
    else if (message.content.startsWith('¡setinvitaciones')) {
        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return message.reply('❌ No tienes permiso para configurar el canal de invitaciones.');
        }

        const canalMencionado = message.mentions.channels.first();
        if (!canalMencionado) return message.reply('⚠ Menciona un canal válido: `¡setinvitaciones #canal`');
        
        // Actualizar la configuración usando la nueva función
        updateServerConfig(message.guild.id, 'canalInvitaciones', canalMencionado.id);
        guardarInvitaciones();
        
        const embed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('✅ Canal de Invitaciones Configurado')
            .setDescription(`El canal ${canalMencionado} ha sido configurado para recibir notificaciones de invitaciones.`)
            .addFields({ 
                name: '🛠️ Funcionalidad', 
                value: 'En este canal se notificará cuando nuevos miembros se unan al servidor mediante invitaciones.' 
            })
            .setFooter({ text: 'Sistema de invitaciones • Tentación', iconURL: message.guild.iconURL({ dynamic: true }) })
            .setTimestamp();
            
        message.channel.send({ embeds: [embed] });
    }
    
    // Comando para ver la configuración actual de invitaciones (Solo administradores)
    else if (message.content.startsWith('¡infosetinvitaciones')) {
        // Verificar permisos de administrador
        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return message.reply('❌ No tienes permiso para ver la configuración de invitaciones.');
        }
        
        let statusMsg = '';
        if (canalInvitaciones) {
            const canal = message.guild.channels.cache.get(canalInvitaciones);
            statusMsg = canal 
                ? `✅ Canal configurado: ${canal}`
                : '⚠️ Canal configurado pero no encontrado en el servidor.';
        } else {
            statusMsg = '❌ No hay un canal configurado. Usa `¡setinvitaciones #canal` para configurarlo.';
        }
        
        const embed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('ℹ️ Configuración de Invitaciones')
            .setDescription('Estado de la configuración del sistema de invitaciones:')
            .addFields({ 
                name: 'Canal de notificaciones', 
                value: statusMsg
            })
            .setFooter({ text: 'Sistema de invitaciones • Tentación', iconURL: message.guild.iconURL({ dynamic: true }) })
            .setTimestamp();
            
        message.channel.send({ embeds: [embed] });
    }

    // Comando para resetear el contador de invitaciones
    else if (message.content.startsWith('¡resetinvitaciones')) {
        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return message.reply('❌ No tienes permiso para resetear las invitaciones.');
        }

        inviteTracker.clear();
        usuariosYaInvitados.clear(); // Limpiar la lista de usuarios ya invitados
        guardarInvitaciones(); // Guardar el estado vacío
        guardarUsuariosYaInvitados(); // Guardar lista de usuarios vacía

        const embed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('🔄 Invitaciones Reseteadas')
            .setDescription('Se han reseteado todas las invitaciones y la lista de usuarios ya invitados.')
            .setFooter({ text: 'Sistema de invitaciones' });

        message.channel.send({ embeds: [embed] });
    }

    // Comando para crear embeds personalizados (solo admins)
    else if (message.content.startsWith('¡embed')) {
        // Verificar si el usuario es administrador
        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return message.reply('❌ No tienes permisos para usar este comando. Solo los administradores pueden crear embeds.');
        }
        
        const args = message.content.split('|').map(arg => arg.trim());
        if (args.length < 3) {
            return message.reply('⚠ Uso: `¡embed | Título | Descripción | [URL de Imagen] | [#Canal] | [Color Hexadecimal] | [Texto normal] | [URL de Thumbnail]`');
        }

        const [ , titulo, descripcion, imagen, canalMencion, colorHex = '#FF0000', textoNormal = '', thumbnailURL = '' ] = args;
        
        // Validar el color hexadecimal si se proporciona
        const colorRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
        const color = colorHex && colorRegex.test(colorHex) ? colorHex : '#FF0000';

        const embed = new EmbedBuilder()
            .setColor(color)
            .setTitle(titulo)
            .setDescription(descripcion)
            .setFooter({ text: 'Creado por la administración • Tentación', iconURL: message.guild.iconURL({ dynamic: true }) })
            .setTimestamp();

        // Agregar imagen grande si se proporciona
        if (imagen && imagen.startsWith('http')) {
            embed.setImage(imagen);
        }
        
        // Agregar thumbnail (imagen pequeña) si se proporciona
        if (thumbnailURL && thumbnailURL.startsWith('http')) {
            embed.setThumbnail(thumbnailURL);
        }

        // Buscar el canal mencionado
        let canal;
        if (canalMencion) {
            const match = canalMencion.match(/^<#(\d+)>$/);
            if (match) {
                canal = message.client.channels.cache.get(match[1]);
            }
        }

        // Preparar el mensaje con el texto normal (si existe) y el embed
        const messageOptions = {
            content: textoNormal || null,
            embeds: [embed]
        };

        // Mostrar vista previa al usuario
        const previewEmbed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('📝 Vista previa del embed')
            .setDescription('Así es como se verá tu embed:')
            .setFields(
                { name: '📋 Información', value: 
                    `**Canal destino:** ${canal ? canal.toString() : 'Canal actual'}\n` +
                    `**Color:** ${color}\n` +
                    `**Imagen principal:** ${imagen ? '✅ Incluida' : '❌ No incluida'}\n` +
                    `**Thumbnail:** ${thumbnailURL ? '✅ Incluido' : '❌ No incluido'}\n` +
                    `**Texto normal:** ${textoNormal ? '✅ Incluido' : '❌ No incluido'}` 
                }
            );

        // Enviar vista previa
        message.channel.send({ 
            content: '⚠️ **Vista previa** - El embed final no incluirá este mensaje.',
            embeds: [previewEmbed] 
        }).then(() => {
            // Enviar la vista previa del mensaje real
            message.channel.send(messageOptions).then(() => {
                const confirmEmbed = new EmbedBuilder()
                    .setColor('#00FF00')
                    .setTitle('✅ Confirmación')
                    .setDescription('¿Quieres enviar este embed?')
                    .setFields(
                        { name: '👍 Confirmar', value: 'Reacciona con ✅ para enviar el embed.' },
                        { name: '👎 Cancelar', value: 'Reacciona con ❌ para cancelar.' }
                    );
                
                message.channel.send({ embeds: [confirmEmbed] }).then(confirmMsg => {
                    // Añadir reacciones
                    confirmMsg.react('✅').then(() => confirmMsg.react('❌'));
                    
                    // Filtro para reacciones
                    const filter = (reaction, user) => {
                        return ['✅', '❌'].includes(reaction.emoji.name) && user.id === message.author.id;
                    };
                    
                    // Esperar reacción
                    confirmMsg.awaitReactions({ filter, max: 1, time: 60000, errors: ['time'] })
                        .then(collected => {
                            const reaction = collected.first();
                            
                            if (reaction.emoji.name === '✅') {
                                // Borrar mensajes de confirmación
                                confirmMsg.delete().catch(() => {});
                                
                                // Enviar el embed al canal especificado o al canal actual
                                if (canal) {
                                    canal.send(messageOptions)
                                        .then(() => message.reply(`✅ Tu embed ha sido enviado al canal ${canal.toString()}`))
                                        .catch(error => message.reply(`❌ No pude enviar el embed: ${error.message}`));
                                } else {
                                    message.channel.send(messageOptions)
                                        .then(() => message.reply('✅ Tu embed ha sido enviado a este canal.'))
                                        .catch(error => message.reply(`❌ No pude enviar el embed: ${error.message}`));
                                }
                            } else {
                                confirmMsg.delete().catch(() => {});
                                message.reply('❌ Envío de embed cancelado.');
                            }
                        })
                        .catch(() => {
                            confirmMsg.delete().catch(() => {});
                            message.reply('⏳ Tiempo de espera agotado. El embed no ha sido enviado.');
                        });
                });
            });
        });
    }

    // Interacción: Abrazar
    else if (message.content.startsWith('¡abrazar')) {
        const usuario = message.mentions.users.first();
        if (!usuario) return message.reply('⚠ Debes mencionar a un usuario para abrazarlo.');

        const gifs = [
            'https://cdn.discordapp.com/attachments/1340275934770630729/1340276070846304306/86C65074-65D9-4ECD-8FE1-5D2A290B4FD7.gif?ex=67b1c4dc&is=67b0735c&hm=da378c912646f2097d1162aaf132e772b263ff11efa0ac958c2e9f7bacc146cd&',
            'https://cdn.discordapp.com/attachments/1340275934770630729/1340276881458593853/3F5041F4-DA6D-4061-85B4-DBF703041748.gif?ex=67b1c59d&is=67b0741d&hm=cee10fec16bbcef0a8bfbeb7acf449b26d613a33c140711a5ba3fa0fae3d7c9b&',
            'https://cdn.discordapp.com/attachments/1340275934770630729/1340276023538880575/52D4CDAF-7040-4536-9F1E-0B56216076C7.gif?ex=67b1c4d1&is=67b07351&hm=2b467234228c89224589d0bf5661b6f450f67ea0b15ac18df85dd7f4cc766b0c&',
            'https://cdn.discordapp.com/attachments/1340275934770630729/1340276008397574194/9747AAD4-2EA4-49FB-AF09-33BF3BE494C9.gif?ex=67b1c4cd&is=67b0734d&hm=0f77749bd775162db3a89896a74d3b9a1230c3c9141a6f78c0d1e5c6222952ad&',
            'https://cdn.discordapp.com/attachments/1340275934770630729/1340275984263544903/IMG_2263.gif?ex=67b1c4c7&is=67b07347&hm=7eb799978c1350df356f6664bc4ebaf6cc6f956a3055b98662b6d171520fbc67&',
            'https://cdn.discordapp.com/attachments/1340275934770630729/1340275976155955310/IMG_2264.gif?ex=67b1c4c5&is=67b07345&hm=80e60b2457416f576677cbf0b129106de1310687666b05467ccf77c3178ac4d7&',
            'https://cdn.discordapp.com/attachments/1340275934770630729/1340276043638112321/BBB8AC34-9D3C-4C44-8D58-6A914BB81DFE.gif?ex=67b1c4d5&is=67b07355&hm=e0a0708d0e2a52305752086078a943eff90c9aed0b4ac80564d264174f9b23be&',
            'https://cdn.discordapp.com/attachments/1340275934770630729/1340276876190679080/7DFFB740-6ECA-45AD-BBAE-29D7A9A7EE9B.gif?ex=67b1c59c&is=67b0741c&hm=1e3165b09b533c642d19d392842f2dcae72173439edf483a84c2deb35e2e9dde&',
            'https://cdn.discordapp.com/attachments/1340275934770630729/1340276869068750908/43672187-2BC0-410D-8893-8D7069C9268B.gif?ex=67b1c59a&is=67b0741a&hm=df2c69cf5b381d9965f6c32126c1d35d92b75d3c6a5cedd9e2b2e4bd903a5dae&',
        ];
        const randomGif = gifs[Math.floor(Math.random() * gifs.length)];

        const embed = new EmbedBuilder()
            .setColor('#FF0000')
            .setDescription(`${message.author.username} abraza a ${usuario.username} con mucho cariño.`)
            .setImage(randomGif);

        message.channel.send({ embeds: [embed] });
    }

    // Interacción: Besar
    else if (message.content.startsWith('¡besar')) {
        const usuario = message.mentions.users.first();
        if (!usuario) return message.reply('⚠ Debes mencionar a un usuario para besarlo.');

        const gifs = [
            'https://cdn.discordapp.com/attachments/1340275934770630729/1340284890104463381/71A2D8EA-1F6F-498C-B4C8-9BC581BBB462.gif',
            'https://cdn.discordapp.com/attachments/1340275934770630729/1340284901542465557/5F86E041-6917-4BFB-BEFA-E71F7897BDBC.gif',
            'https://cdn.discordapp.com/attachments/1340275934770630729/1340284671610589255/89624C62-FA7E-4CB8-89C6-EB6F0C5F6DE9.gif',
            'https://cdn.discordapp.com/attachments/1340275934770630729/1340284653491195946/01BDFBD5-6240-4F9F-A428-36E53C9681C0.gif',
            'https://cdn.discordapp.com/attachments/1340275934770630729/1340284644909776907/7976ADA1-3A0D-4243-B17A-04281A5BB51C.gif',
            'https://cdn.discordapp.com/attachments/1340275934770630729/1340284639113379921/CFC3BBA5-62BD-45AB-AF10-C0E43EC6A253.gif',
            'https://cdn.discordapp.com/attachments/1340275934770630729/1340284632767270964/7C75DF1A-8E25-46FC-BFC9-A65DEE9D6B4A.gif'
        ];
        const randomGif = gifs[Math.floor(Math.random() * gifs.length)];

        const embed = new EmbedBuilder()
            .setColor('#FF0000')
            .setDescription(`${message.author.username} besa a ${usuario.username} con dulzura.`)
            .setImage(randomGif);

        message.channel.send({ embeds: [embed] });
    }

    // Interacción: Golpear
    else if (message.content.startsWith('¡golpear')) {
        const usuario = message.mentions.users.first();
        if (!usuario) return message.reply('⚠ Debes mencionar a un usuario para golpearlo.');

        const gifs = [
            'https://cdn.discordapp.com/attachments/1219069470652371034/1347399032808669294/3FC2EDC5-8ECD-4E9A-AAF5-994E941F4382.gif?ex=67cbaea2&is=67ca5d22&hm=82e6a8e63e932062cdd316826849cf517c81eaf4e25839901a789033d7fbda82&',
            'https://cdn.discordapp.com/attachments/1219069470652371034/1347399033324441721/6038AFD6-DC8C-4234-AB42-79CB791E0B5D.gif?ex=67cbaea3&is=67ca5d23&hm=f1a858c9c04915f1bfa53870c1a28089c62d9babfd0b48a4cbb3824ad5308348&',
            'https://cdn.discordapp.com/attachments/1219069470652371034/1347399033735348307/CD4AC280-891D-4C34-AFCB-6402B804764A.gif?ex=67cbaea3&is=67ca5d23&hm=79f7880f74420127abaca6dcf629784b41905e0efdb3ca359dc131cc9adcd0ba&',
            'https://cdn.discordapp.com/attachments/1219069470652371034/1347399034213761116/64AD7A4F-CC6C-4284-8BB2-8A5A76B851F4.gif?ex=67cbaea3&is=67ca5d23&hm=8793beec4a1a9fdf949d9f30f2a21687cfc2b98d7f5bf42d6301d03f3e1a0b31&',
            'https://cdn.discordapp.com/attachments/1219069470652371034/1347399034213761116/64AD7A4F-CC6C-4284-8BB2-8A5A76B851F4.gif?ex=67cbaea3&is=67ca5d23&hm=8793beec4a1a9fdf949d9f30f2a21687cfc2b98d7f5bf42d6301d03f3e1a0b31&',
            'https://cdn.discordapp.com/attachments/1219069470652371034/1347399035128119369/3E4629F6-9A31-492E-8CB4-6DE7C78F783B.gif?ex=67cbaea3&is=67ca5d23&hm=623ccbd287adb28779337d3cc93181d56a00b1566b1b869af68e0dd14327e998&',
            'https://cdn.discordapp.com/attachments/1219069470652371034/1347399035534966944/72B1D9DE-EB82-4F2A-A5F1-EEB158A855EA.gif?ex=67cbaea3&is=67ca5d23&hm=0e990c0775d940d859d5f040e7ef91d3dfd58f0669b0736b6e0eba87595135d8&',
            'https://cdn.discordapp.com/attachments/1219069470652371034/1347399196306837585/5F64D97E-9668-4716-8976-62FB087293AC.gif?ex=67cbaec9&is=67ca5d49&hm=e60d8a2c7544899c1da53d56c506aa2fc39bbced4c137eb3746918ac33bcafb9&',
        ];
        const randomGif = gifs[Math.floor(Math.random() * gifs.length)];

        const embed = new EmbedBuilder()
            .setColor('#FF0000')
            .setDescription(`${message.author.username} golpea a ${usuario.username} con fuerza.`)
            .setImage(randomGif);

        message.channel.send({ embeds: [embed] });
    }

    // Interacción: Patear
    else if (message.content.startsWith('¡patear')) {
        const usuario = message.mentions.users.first();
        if (!usuario) return message.reply('⚠ Debes mencionar a un usuario para patearlo.');

        const gifs = [
            'https://media.giphy.com/media/vFKqnCdLPNOKc/giphy.gif',
            'https://media.giphy.com/media/l3q2JXofw3YwI/giphy.gif',
            'https://media.giphy.com/media/xT4uQyoDoPZEC4oEYk/giphy.gif',
        ];
        const randomGif = gifs[Math.floor(Math.random() * gifs.length)];

        const embed = new EmbedBuilder()
            .setColor('#FF0000')
            .setDescription(`${message.author.username} patea a ${usuario.username}. ¡Vaya patada!`)
            .setImage(randomGif);

        message.channel.send({ embeds: [embed] });
    }

    // Interacción: Acariciar
    else if (message.content.startsWith('¡acariciar')) {
        const usuario = message.mentions.users.first();
        if (!usuario) return message.reply('⚠ Debes mencionar a un usuario para acariciarlo.');

        const gifs = [
            'https://media.giphy.com/media/3o7btV1B8Oxh5h9TOY/giphy.gif',
            'https://media.giphy.com/media/PM0X5LTIqCKY4/giphy.gif',
            'https://media.giphy.com/media/3o7btUmmL4Xk3tg3hS/giphy.gif',
        ];
        const randomGif = gifs[Math.floor(Math.random() * gifs.length)];

        const embed = new EmbedBuilder()
            .setColor('#FF0000')
            .setDescription(`${message.author.username} acaricia a ${usuario.username} con ternura.`)
            .setImage(randomGif);

        message.channel.send({ embeds: [embed] });
    }

    // Interacción: Morder
    else if (message.content.startsWith('¡morder')) {
        const usuario = message.mentions.users.first();
        if (!usuario) return message.reply('⚠ Debes mencionar a un usuario para morderlo.');

        const gifs = [
            'https://media.giphy.com/media/xTiTnOHh8qYNS5V6T6/giphy.gif',
            'https://media.giphy.com/media/X1eM0vbp0aDi0/giphy.gif',
            'https://media.giphy.com/media/5e6ytKzoyNYhC/giphy.gif',
        ];
        const randomGif = gifs[Math.floor(Math.random() * gifs.length)];

        const embed = new EmbedBuilder()
            .setColor('#FF0000')
            .setDescription(`${message.author.username} muerde a ${usuario.username}. ¡Auch!`)
            .setImage(randomGif);

        message.channel.send({ embeds: [embed] });
    }

    // Interacción: Dar la mano
    else if (message.content.startsWith('¡dar la mano')) {
        const usuario = message.mentions.users.first();
        if (!usuario) return message.reply('⚠ Debes mencionar a un usuario para darle la mano.');

        const gifs = [
            'https://media.giphy.com/media/3o7aCUbEMs0Tjsiyos/giphy.gif',
            'https://media.giphy.com/media/l1J9KmfXh6XZLe3lw/giphy.gif',
            'https://media.giphy.com/media/hfhRPxG9vZzC/giphy.gif',
        ];
        const randomGif = gifs[Math.floor(Math.random() * gifs.length)];

        const embed = new EmbedBuilder()
            .setColor('#FF0000')
            .setDescription(`${message.author.username} le da la mano a ${usuario.username}. ¡Qué lindxs!`)
            .setImage(randomGif);

        message.channel.send({ embeds: [embed] });
    }
    
    // Comando para crear sorteos
    else if (message.content.startsWith('¡sorteo')) {
        // Verificar permisos
        if (!message.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            return message.reply('❌ No tienes permisos para crear sorteos.');
        }
        
        const args = message.content.split(' ');
        if (args.length < 4) {
            return message.reply('⚠ Uso correcto: `¡sorteo [premio] [ganadores] [duración en minutos] [canal?] [imagen?] [thumbnail?]`\nEjemplo: `¡sorteo "Nitro" 1 60 #sorteos https://imagen.jpg`');
        }
        
        // Extraer argumentos
        let currentArg = 1;
        let premio = args[currentArg++];
        
        // Verificar si el premio está entre comillas
        if (premio.startsWith('"')) {
            premio = premio.substring(1);
            while (!args[currentArg].endsWith('"') && currentArg < args.length) {
                premio += " " + args[currentArg++];
            }
            
            // Incluir la última parte y quitar las comillas
            if (currentArg < args.length) {
                premio += " " + args[currentArg++].slice(0, -1);
            }
        }
        
        // Obtener resto de parámetros
        if (currentArg >= args.length) {
            return message.reply('⚠ Faltan argumentos. Uso correcto: `¡sorteo [premio] [ganadores] [duración en minutos] [canal?] [imagen?] [thumbnail?]`');
        }
        
        const ganadores = parseInt(args[currentArg++]);
        if (isNaN(ganadores) || ganadores < 1 || ganadores > 10) {
            return message.reply('⚠ El número de ganadores debe ser entre 1 y 10.');
        }
        
        if (currentArg >= args.length) {
            return message.reply('⚠ Faltan argumentos. Uso correcto: `¡sorteo [premio] [ganadores] [duración en minutos] [canal?] [imagen?] [thumbnail?]`');
        }
        
        const duracion = parseInt(args[currentArg++]);
        if (isNaN(duracion) || duracion < 1) {
            return message.reply('⚠ La duración debe ser un número positivo de minutos.');
        }
        
        // Parámetros opcionales
        let canalDestino = message.channel;
        let imagen = null;
        let thumbnailImg = null;
        
        // Verificar si hay un canal mencionado
        if (currentArg < args.length && args[currentArg].startsWith('<#') && args[currentArg].endsWith('>')) {
            const canalId = args[currentArg++].replace('<#', '').replace('>', '');
            const canalMencionado = message.guild.channels.cache.get(canalId);
            if (canalMencionado) {
                canalDestino = canalMencionado;
            }
        }
        
        // Verificar si hay una imagen
        if (currentArg < args.length && args[currentArg].startsWith('http')) {
            imagen = args[currentArg++];
        }
        
        // Verificar si hay un thumbnail
        if (currentArg < args.length && args[currentArg].startsWith('http')) {
            thumbnailImg = args[currentArg++];
        }
        
        // Calcular tiempo de finalización
        const finalizaEn = Date.now() + (duracion * 60 * 1000);
        
        // Crear embed de sorteo
        const embed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('🎉 NUEVO SORTEO 🎉')
            .setDescription(`**Premio:** ${premio}\n\n**Ganadores:** ${ganadores}\n\n**Finaliza:** <t:${Math.floor(finalizaEn/1000)}:R>\n\n**Organizado por:** ${message.author}\n\n**Para participar:** Haz clic en el botón "🎉 Participar" abajo`)
            .setFooter({ text: 'Sorteo • Tentación', iconURL: message.guild.iconURL({ dynamic: true }) })
            .setTimestamp();
        
        // Agregar imagen grande (principal) si se proporciona
        if (imagen && imagen.startsWith('http')) {
            embed.setImage(imagen);
        }
        
        // Agregar imagen pequeña (thumbnail) si se proporciona
        if (thumbnailImg && thumbnailImg.startsWith('http')) {
            embed.setThumbnail(thumbnailImg);
        }
        
        // Crear botón para participar
        const row = {
            type: 1, // ActionRow
            components: [
                {
                    type: 2, // Button
                    style: 1, // Primary (blue)
                    custom_id: `sorteo_participar_${Date.now()}`,
                    emoji: { name: '🎉' },
                    label: 'Participar'
                }
            ]
        };
        
        message.reply(`✅ ¡Creando sorteo en ${canalDestino}!`);
        
        // Enviar mensaje con el embed y el botón
        canalDestino.send({ embeds: [embed], components: [row] }).then(mensaje => {
            // Guardar datos del sorteo
            const sorteoData = {
                messageId: mensaje.id,
                channelId: canalDestino.id,
                guildId: message.guild.id,
                premio: premio,
                ganadores: ganadores,
                finalizaEn: finalizaEn,
                creadorId: message.author.id,
                finalizado: false,
                participantes: [], // Ahora guardamos un array de participantes
                buttonId: row.components[0].custom_id // Guardamos el ID del botón
            };
            
            // Leer datos existentes
            let sorteos = [];
            try {
                sorteos = JSON.parse(fs.readFileSync('sorteos.json', 'utf8'));
            } catch (error) {
                console.error('Error al leer sorteos.json:', error);
                sorteos = [];
            }
            
            // Agregar nuevo sorteo y guardar
            sorteos.push(sorteoData);
            fs.writeFileSync('sorteos.json', JSON.stringify(sorteos, null, 2));
            
            // Programar finalización del sorteo
            setTimeout(() => finalizarSorteo(sorteoData), duracion * 60 * 1000);
            
            message.channel.send(`✅ ¡Sorteo creado en ${canalDestino}!`);
        }).catch(error => {
            console.error('Error al crear sorteo:', error);
            message.reply('❌ Ha ocurrido un error al crear el sorteo.');
        });
    }

    // Registrar cumpleaños
    else if (message.content.startsWith('¡cumpleaños')) {
        const args = message.content.split(' ');
        
        // Verificar si el usuario solo quiere ver su cumpleaños actual
        if (args.length === 1 || args[1] === 'ver') {
            const fechaActual = cumpleaños[message.author.id];
            if (fechaActual) {
                // Convertir de formato DD-MM a una fecha legible
                const [dia, mes] = fechaActual.split('-');
                const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
                const fechaLegible = `${dia} de ${meses[parseInt(mes) - 1]}`;
                
                const embed = new EmbedBuilder()
                    .setColor('#FFD700')
                    .setTitle('🎂 Tu Cumpleaños')
                    .setDescription(`Tu cumpleaños está registrado para el **${fechaLegible}**`)
                    .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
                    .setFooter({ text: 'Usa ¡cumpleaños DD-MM para actualizarlo si necesitas cambiarlo' });
                    
                return message.reply({ embeds: [embed] });
            } else {
                return message.reply('⚠ No tienes un cumpleaños registrado. Usa `¡cumpleaños DD-MM` para registrarlo (Ejemplo: `¡cumpleaños 25-12` para el 25 de diciembre)');
            }
        }
        
        // Registrar o actualizar el cumpleaños
        if (args.length < 2) return message.reply('⚠ Uso correcto: `¡cumpleaños DD-MM` (Ejemplo: `¡cumpleaños 25-12` para el 25 de diciembre)');

        const fecha = args[1];
        if (!/^\d{2}-\d{2}$/.test(fecha)) return message.reply('⚠ Usa el formato `DD-MM` (Ejemplo: `25-12`)');

        // Validar que la fecha sea válida
        const [dia, mes] = fecha.split('-').map(Number);
        if (mes < 1 || mes > 12) return message.reply('⚠ El mes debe estar entre 01 y 12');
        
        // Verificar días válidos según el mes
        const diasPorMes = [0, 31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]; // Febrero con 29 para años bisiestos
        if (dia < 1 || dia > diasPorMes[mes]) return message.reply(`⚠ El mes ${mes} tiene máximo ${diasPorMes[mes]} días`);

        // Guardar en la base de datos
        const actualizando = cumpleaños[message.author.id] ? true : false;
        cumpleaños[message.author.id] = fecha;
        fs.writeFileSync('cumpleaños.json', JSON.stringify(cumpleaños, null, 2));

        // Convertir a formato legible
        const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
        const fechaLegible = `${dia} de ${meses[mes - 1]}`;

        // Crear un embed atractivo para confirmar
        const embed = new EmbedBuilder()
            .setColor('#FFD700')
            .setTitle(actualizando ? '🎂 Cumpleaños Actualizado' : '🎂 Cumpleaños Registrado')
            .setDescription(`${actualizando ? 'Tu cumpleaños ha sido actualizado' : 'Tu cumpleaños ha sido registrado'} para el **${fechaLegible}**`)
            .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
            .setFooter({ text: 'En tu día especial recibirás una felicitación automática' });
            
        message.reply({ embeds: [embed] });
    }

    // Configurar mensaje de cumpleaños
    else if (message.content.startsWith('¡configCumpleaños')) {
        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) 
            return message.reply('❌ No tienes permiso para configurar los cumpleaños.');

        // Verificar si solo quiere ver la configuración actual
        if (message.content.trim() === '¡configCumpleaños ver') {
            const embed = new EmbedBuilder()
                .setColor('#FFD700')
                .setTitle('🎂 Configuración Actual de Cumpleaños')
                .addFields(
                    { name: '📝 Mensaje', value: configCumpleaños.mensaje || 'No configurado', inline: false },
                    { name: '📺 Canal configurado', value: configCumpleaños.canal ? `<#${configCumpleaños.canal}>` : 'No configurado', inline: true }
                )
                .setFooter({ text: 'Puedes modificar esta configuración con ¡configCumpleaños | Mensaje | URL Imagen | #Canal' });

            if (configCumpleaños.imagen) {
                embed.setImage(configCumpleaños.imagen);
            }

            return message.channel.send({ embeds: [embed] });
        }

        const args = message.content.split('|').map(arg => arg.trim());
        if (args.length < 2) {
            return message.reply('⚠ Uso correcto: `¡configCumpleaños | Mensaje | URL Imagen | #Canal`\n\nPuedes usar `{usuario}` en el mensaje para mencionar a la persona cumpleañera.\nPara ver la configuración actual usa `¡configCumpleaños ver`');
        }

        // Extraer los argumentos
        const [ , mensaje, imagen = configCumpleaños.imagen, canalMencion = null ] = args;

        // Actualizar mensaje si se proporcionó
        if (mensaje) {
            configCumpleaños.mensaje = mensaje;
        }

        // Actualizar imagen si se proporcionó
        if (imagen) {
            configCumpleaños.imagen = imagen;
        }

        // Obtener ID del canal
        if (canalMencion) {
            const match = canalMencion.match(/^<#(\d+)>$/);
            if (match) {
                configCumpleaños.canal = match[1];
            } else {
                // Si no hay formato de mención, usar el canal actual
                configCumpleaños.canal = message.channel.id;
            }
        } else if (!configCumpleaños.canal) {
            // Si no se especifica canal y no hay uno configurado, usar el canal actual
            configCumpleaños.canal = message.channel.id;
        }

        fs.writeFileSync('configCumpleaños.json', JSON.stringify(configCumpleaños, null, 2));

        // Mostrar la configuración actualizada
        const embed = new EmbedBuilder()
            .setColor('#FFD700')
            .setTitle('⚙️ Configuración de Cumpleaños Actualizada')
            .setDescription('✅ La configuración de cumpleaños ha sido actualizada correctamente.')
            .addFields(
                { name: '📺 Canal configurado', value: `<#${configCumpleaños.canal}>`, inline: true },
                { name: '📝 Vista previa', value: configCumpleaños.mensaje.replace('{usuario}', message.author.toString()), inline: false }
            )
            .setFooter({ text: 'Los mensajes de cumpleaños se enviarán automáticamente a las 9:00 AM' });

        if (configCumpleaños.imagen) {
            embed.setImage(configCumpleaños.imagen);
        }

        message.channel.send({ embeds: [embed] });

        // Mostrar un mensaje de prueba
        const prueba = new EmbedBuilder()
            .setColor('#FFD700')
            .setTitle('🎂 Vista Previa (Ejemplo)')
            .setDescription(configCumpleaños.mensaje.replace('{usuario}', message.author.toString()))
            .setImage(configCumpleaños.imagen || 'https://cdn.nekotina.com/guilds/1327403077480874046/36a071e9-320c-4216-a7a1-a61e0786f793.jpg?quality=lossless')
            .setFooter({ text: 'Esta es una vista previa de cómo se verá el mensaje de cumpleaños' });

        message.channel.send({ embeds: [prueba] });
    }


    // 🎲 Juegos: Dados
    else if (message.content.startsWith('¡dados')) {
        const dado = Math.floor(Math.random() * 6) + 1;
        message.channel.send(`🎲 Has lanzado un dado y salió: **${dado}**`);
    }

    // 🎯 Juegos: Adivina el número
    else if (message.content.startsWith('¡adivina')) {
        const numero = Math.floor(Math.random() * 10) + 1;
        message.channel.send(`🔢 Estoy pensando en un número del 1 al 10. ¡Adivina cuál es! Responde con '¡adivina [número]'`);

        const filtro = respuesta => respuesta.author.id === message.author.id && !isNaN(respuesta.content.split(' ')[1]);
        message.channel.awaitMessages({ filter: filtro, max: 1, time: 15000, errors: ['time'] })
            .then(collected => {
                const respuesta = parseInt(collected.first().content.split(' ')[1]);
                if (respuesta === numero) {
                    message.channel.send(`🎉 ¡Correcto! El número era **${numero}**.`);
                } else {
                    message.channel.send(`❌ Incorrecto, el número era **${numero}**.`);
                }
            })
            .catch(() => message.channel.send('⏳ Se acabó el tiempo. ¡Inténtalo de nuevo!'));
    }

    // 🃏 Juegos: Sacar una carta aleatoria
    else if (message.content.startsWith('¡cartas')) {
        const palos = ['♠️', '♥️', '♦️', '♣️'];
        const valores = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
        const carta = `${valores[Math.floor(Math.random() * valores.length)]}${palos[Math.floor(Math.random() * palos.length)]}`;
        message.channel.send(`🃏 Has sacado la carta: **${carta}**`);
    }

    // 🎮 Juegos: Piedra, papel o tijeras
    else if (message.content.startsWith('¡piedra')) {
        const opciones = ['piedra', 'papel', 'tijeras'];
        const eleccionBot = opciones[Math.floor(Math.random() * opciones.length)];
        const eleccionUsuario = message.content.split(' ')[1];

        if (!opciones.includes(eleccionUsuario)) {
            return message.reply('⚠ Usa: `¡piedra papel tijeras [elección]`');
        }

        let resultado = '¡Empate!';
        if ((eleccionUsuario === 'piedra' && eleccionBot === 'tijeras') ||
            (eleccionUsuario === 'papel' && eleccionBot === 'piedra') ||
            (eleccionUsuario === 'tijeras' && eleccionBot === 'papel')) {
            resultado = '🎉 ¡Ganaste!';
        } else if (eleccionUsuario !== eleccionBot) {
            resultado = '❌ ¡Perdiste!';
        }
        message.channel.send(`🤖 Yo elegí **${eleccionBot}**. ${resultado}`);
    }

    // 🎱 Juegos: Bola 8 mágica
    else if (message.content.startsWith('¡8ball')) {
        const respuestas = [
            'Sí', 'No', 'Tal vez', 'Definitivamente', 'No cuentes con ello', 'Pregunta de nuevo más tarde'
        ];
        const respuesta = respuestas[Math.floor(Math.random() * respuestas.length)];
        message.channel.send(`🎱 ${respuesta}`);
    }

    // Comando para verificar cumpleaños manualmente
    else if (message.content.startsWith('¡verificarcumpleaños')) {
        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return message.reply('❌ No tienes permiso para ejecutar verificaciones manuales.');
        }

        message.channel.send('🔍 Ejecutando verificación de cumpleaños manual...');
        verificarCumpleaños();
        message.channel.send('✅ Verificación completada.');
    }

    // Comando para listar todos los cumpleaños registrados
    else if (message.content.startsWith('¡listarcumpleaños')) {
        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return message.reply('❌ No tienes permiso para listar todos los cumpleaños.');
        }

        if (Object.keys(cumpleaños).length === 0) {
            return message.reply('⚠️ No hay cumpleaños registrados en el sistema.');
        }

        // Ordenar cumpleaños por mes y día
        const cumpleañosOrdenados = Object.entries(cumpleaños).sort((a, b) => {
            const [mesA, diaA] = a[1].split('-').reverse();
            const [mesB, diaB] = b[1].split('-').reverse();
            
            if (mesA !== mesB) return parseInt(mesA) - parseInt(mesB);
            return parseInt(diaA) - parseInt(diaB);
        });

        // Crear mapa de meses para organizar mejor
        const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
        const cumpleañosPorMes = {};
        
        for (const [userID, fecha] of cumpleañosOrdenados) {
            const [dia, mes] = fecha.split('-').map(Number);
            const mesNombre = meses[mes - 1];
            
            if (!cumpleañosPorMes[mesNombre]) {
                cumpleañosPorMes[mesNombre] = [];
            }
            
            cumpleañosPorMes[mesNombre].push({ userID, dia });
        }

        // Crear descripción organizada por meses
        let descripcion = '';
        for (const mes of meses) {
            if (cumpleañosPorMes[mes] && cumpleañosPorMes[mes].length > 0) {
                descripcion += `\n**${mes}**\n`;
                
                // Ordenar por día dentro del mes
                cumpleañosPorMes[mes].sort((a, b) => a.dia - b.dia);
                
                for (const { userID, dia } of cumpleañosPorMes[mes]) {
                    descripcion += `Día ${dia}: <@${userID}>\n`;
                }
            }
        }

        // Verificar si la descripción es demasiado larga para un solo embed
        if (descripcion.length > 4000) {
            // Dividir en múltiples embeds si es necesario
            const partesDescripcion = [];
            let descripcionActual = '';
            const lineas = descripcion.split('\n');
            
            for (const linea of lineas) {
                if (descripcionActual.length + linea.length + 1 > 4000) {
                    partesDescripcion.push(descripcionActual);
                    descripcionActual = linea;
                } else {
                    descripcionActual += linea + '\n';
                }
            }
            
            if (descripcionActual.length > 0) {
                partesDescripcion.push(descripcionActual);
            }
            
            // Enviar múltiples embeds
            for (let i = 0; i < partesDescripcion.length; i++) {
                const embed = new EmbedBuilder()
                    .setColor('#FFD700')
                    .setTitle(`🎂 Cumpleaños Registrados (Parte ${i + 1}/${partesDescripcion.length})`)
                    .setDescription(partesDescripcion[i])
                    .setFooter({ text: `Total: ${Object.keys(cumpleaños).length} cumpleaños registrados` });
                    
                message.channel.send({ embeds: [embed] });
            }
        } else {
            // Solo un embed si cabe todo
            const embed = new EmbedBuilder()
                .setColor('#FFD700')
                .setTitle('🎂 Cumpleaños Registrados')
                .setDescription(descripcion)
                .setFooter({ text: `Total: ${Object.keys(cumpleaños).length} cumpleaños registrados` });

            message.channel.send({ embeds: [embed] });
        }
    }

    // Comando para ver nivel actual
    else if (message.content.startsWith('¡nivel')) {
        const user = message.mentions.users.first() || message.author;
        if (!nivelesXP[user.id]) {
            nivelesXP[user.id] = { xp: 0, nivel: 1 };
        }
        
        // Calcular porcentaje de progreso hacia el siguiente nivel
        const xpNecesario = nivelesXP[user.id].nivel * 100;
        const porcentaje = Math.floor((nivelesXP[user.id].xp / xpNecesario) * 100);
        
        // Crear barra de progreso
        const longitud = 10;
        const barraLlena = Math.round((porcentaje / 100) * longitud);
        let barra = '';
        for (let i = 0; i < longitud; i++) {
            if (i < barraLlena) {
                barra += '🟥'; // Parte llena de la barra (roja)
            } else {
                barra += '⬜'; // Parte vacía de la barra
            }
        }
        
        const nivelEmbed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle(`📊 Estadísticas de Nivel`)
            .setDescription(`Información de nivel para ${user}`)
            .setThumbnail(user.displayAvatarURL({ dynamic: true }))
            .addFields(
                { name: '👤 Usuario', value: user.tag, inline: true },
                { name: '🔮 Nivel actual', value: nivelesXP[user.id].nivel.toString(), inline: true },
                { name: '✨ XP', value: `${nivelesXP[user.id].xp}/${xpNecesario}`, inline: true },
                { name: '📈 Progreso', value: `${barra} ${porcentaje}%`, inline: false }
            )
            .setFooter({ text: 'Sistema de niveles • Tentación', iconURL: message.guild.iconURL({ dynamic: true }) })
            .setTimestamp();
            
        message.channel.send({ embeds: [nivelEmbed] });
    }

    // Comando ship para emparejar usuarios
    else if (message.content.startsWith('¡ship')) {
        const usuarios = message.mentions.users;
        
        // Verificar que se hayan mencionado exactamente 2 usuarios
        if (usuarios.size !== 2) {
            return message.reply('⚠ Debes mencionar a exactamente 2 usuarios para hacer ship: `¡ship @usuario1 @usuario2`');
        }
        
        // Obtener los usuarios mencionados
        const [usuario1, usuario2] = usuarios.values();
        
        // Generar un porcentaje de compatibilidad aleatorio
        const porcentaje = Math.floor(Math.random() * 101); // 0-100%
        
        // Determinar el color del embed basado en el porcentaje
        let color;
        let emoji;
        let descripcion;
        
        if (porcentaje < 30) {
            color = '#FF0000'; // Rojo
            emoji = '💔';
            descripcion = 'Hmm... no parece haber mucha química aquí.';
        } else if (porcentaje < 60) {
            color = '#FFA500'; // Naranja
            emoji = '❤️‍🔥';
            descripcion = '¡Hay potencial! Podrían intentarlo.';
        } else if (porcentaje < 80) {
            color = '#FFFF00'; // Amarillo
            emoji = '💞';
            descripcion = '¡Una buena pareja! Hay buena compatibilidad.';
        } else {
            color = '#FF00FF'; // Rosa
            emoji = '💘';
            descripcion = '¡Una pareja perfecta! ¡El amor está en el aire!';
        }
        
        // Crear un nombre de ship combinando los nombres de los usuarios
        const nombre1 = usuario1.username.slice(0, Math.ceil(usuario1.username.length / 2));
        const nombre2 = usuario2.username.slice(Math.floor(usuario2.username.length / 2));
        const shipName = nombre1 + nombre2;
        
        // Crear barra de compatibilidad
        const longitud = 10;
        const barraLlena = Math.round((porcentaje / 100) * longitud);
        let barra = '';
        for (let i = 0; i < longitud; i++) {
            if (i < barraLlena) {
                barra += '❤️'; // Corazones para la parte llena
            } else {
                barra += '🖤'; // Corazones negros para la parte vacía
            }
        }
        
        // Crear el embed
        const shipEmbed = new EmbedBuilder()
            .setColor(color)
            .setTitle(`${emoji} ¡SHIP! ${emoji}`)
            .setDescription(`¡Ship entre ${usuario1} y ${usuario2}!`)
            .addFields(
                { name: '💕 Nombre de la pareja', value: `**${shipName}**`, inline: false },
                { name: '💘 Compatibilidad', value: `${barra} ${porcentaje}%`, inline: false },
                { name: '💌 Veredicto', value: descripcion, inline: false }
            )
            .setImage('https://cdn.discordapp.com/attachments/1219069470652371034/1347049088436142123/pucca-and-garu_on_Tumblr.gif?ex=67cb1179&is=67c9bff9&hm=6a3a775d9ffc6cbdc6276dc05063bd2f7246b57269fc49e1c1d565dd6d79fb55&')
            .setFooter({ text: 'Sistema de Ship • Tentación', iconURL: message.guild.iconURL({ dynamic: true }) })
            .setTimestamp();
            
        message.channel.send({ embeds: [shipEmbed] });
    }

    // 📌 Comando de ayuda
    // Configurar canal de entrada del buzón
    else if (message.content.startsWith('¡setbuzonentrada')) {
        // Verificar permisos de administrador
        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return message.reply('❌ No tienes permiso para configurar el buzón.');
        }
        
        const canalMencionado = message.mentions.channels.first();
        if (!canalMencionado) return message.reply('⚠ Menciona un canal válido: `¡setbuzonentrada #canal`');
        
        // Verificar que el bot tenga permisos para leer y borrar mensajes en el canal de entrada
        const permisos = canalMencionado.permissionsFor(message.guild.members.me);
        if (!permisos || !permisos.has('ViewChannel') || !permisos.has('ManageMessages')) {
            return message.reply(`❌ No tengo los permisos necesarios en ${canalMencionado}. Necesito permisos para "Ver Canal" y "Gestionar Mensajes". Por favor configura estos permisos y vuelve a intentarlo.`);
        }
        
        // Actualizar la configuración usando la función
        updateServerConfig(message.guild.id, 'canalBuzonEntrada', canalMencionado.id);
        
        const buzonInfo = buzonConfig.get(message.guild.id);
        console.log(`📫 Configuración actualizada: ${JSON.stringify(buzonInfo)}`);
        
        if (buzonInfo && buzonInfo.destino) {
            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('✅ Buzón Configurado Correctamente')
                .setDescription(`El canal de entrada del buzón ha sido configurado en ${canalMencionado}.`)
                .addFields(
                    { name: '📥 Canal de entrada', value: `${canalMencionado}`, inline: true },
                    { name: '📤 Canal de destino', value: `<#${buzonInfo.destino}>`, inline: true },
                    { name: '⚙️ Estado', value: 'Activo', inline: true },
                    { name: '📝 Funcionamiento', value: 'Los mensajes enviados al canal de entrada serán automáticamente enviados al canal de destino y luego borrados.', inline: false },
                    { name: '🔍 Permisos', value: 'El bot necesita permisos de "Ver Canal" y "Gestionar Mensajes" en el canal de entrada.', inline: false }
                )
                .setFooter({ text: 'Sistema de Buzón • Tentación', iconURL: message.guild.iconURL({ dynamic: true }) });
                
            message.reply({ embeds: [embed] });
        } else {
            const embed = new EmbedBuilder()
                .setColor('#FFAA00')
                .setTitle('⚠️ Configuración Parcial del Buzón')
                .setDescription(`El canal de entrada del buzón ha sido configurado en ${canalMencionado}.`)
                .addFields(
                    { name: '⚙️ Siguiente paso', value: 'Ahora configura el canal de destino con `¡setbuzondestino #canal`', inline: false },
                    { name: '📋 Estado actual', value: 'Inactivo (falta configurar canal de destino)', inline: false }
                )
                .setFooter({ text: 'Sistema de Buzón • Tentación', iconURL: message.guild.iconURL({ dynamic: true }) });
                
            message.reply({ embeds: [embed] });
        }
    }
    // Configurar canal de destino del buzón
    else if (message.content.startsWith('¡setbuzondestino')) {
        // Verificar permisos de administrador
        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return message.reply('❌ No tienes permiso para configurar el buzón.');
        }
        
        const canalMencionado = message.mentions.channels.first();
        if (!canalMencionado) return message.reply('⚠ Menciona un canal válido: `¡setbuzondestino #canal`');
        
        // Verificar que el bot tenga permisos para enviar mensajes en el canal de destino
        const permisos = canalMencionado.permissionsFor(message.guild.members.me);
        if (!permisos || !permisos.has('ViewChannel') || !permisos.has('SendMessages') || !permisos.has('EmbedLinks')) {
            return message.reply(`❌ No tengo los permisos necesarios en ${canalMencionado}. Necesito permisos para "Ver Canal", "Enviar Mensajes" y "Insertar Enlaces". Por favor configura estos permisos y vuelve a intentarlo.`);
        }
        
        // Actualizar la configuración usando la función
        updateServerConfig(message.guild.id, 'canalBuzon', canalMencionado.id);
        
        const buzonInfo = buzonConfig.get(message.guild.id);
        console.log(`📫 Configuración actualizada: ${JSON.stringify(buzonInfo)}`);
        
        if (buzonInfo && buzonInfo.canalEntrada) {
            const canalEntrada = message.guild.channels.cache.get(buzonInfo.canalEntrada);
            
            // Verificar si el bot tiene permisos en el canal de entrada
            let permisosEntrada = true;
            
            if (canalEntrada) {
                const permisosEnCanalEntrada = canalEntrada.permissionsFor(message.guild.members.me);
                if (!permisosEnCanalEntrada || !permisosEnCanalEntrada.has('ViewChannel') || !permisosEnCanalEntrada.has('ManageMessages')) {
                    permisosEntrada = false;
                }
            }
            
            const embed = new EmbedBuilder()
                .setColor(permisosEntrada ? '#00FF00' : '#FFAA00')
                .setTitle(permisosEntrada ? '✅ Buzón Configurado Correctamente' : '⚠️ Buzón Configurado con Advertencias')
                .setDescription(`El canal de destino del buzón ha sido configurado en ${canalMencionado}.`)
                .addFields(
                    { name: '📥 Canal de entrada', value: canalEntrada ? `${canalEntrada}` : `<#${buzonInfo.canalEntrada}>`, inline: true },
                    { name: '📤 Canal de destino', value: `${canalMencionado}`, inline: true },
                    { name: '⚙️ Estado', value: permisosEntrada ? 'Activo' : 'Configurado con problemas de permisos', inline: true },
                    { name: '📝 Funcionamiento', value: 'Los mensajes enviados al canal de entrada serán automáticamente enviados al canal de destino y luego borrados.', inline: false }
                )
                .setFooter({ text: 'Sistema de Buzón • Tentación', iconURL: message.guild.iconURL({ dynamic: true }) });
                
            if (!permisosEntrada) {
                embed.addFields({ 
                    name: '❌ Problema detectado', 
                    value: `No tengo permisos para "Ver Canal" o "Gestionar Mensajes" en ${canalEntrada}. Por favor, revisa los permisos.`, 
                    inline: false 
                });
            }
            
            message.reply({ embeds: [embed] });
            
        } else {
            const embed = new EmbedBuilder()
                .setColor('#FFAA00')
                .setTitle('⚠️ Configuración Parcial del Buzón')
                .setDescription(`El canal de destino del buzón ha sido configurado en ${canalMencionado}.`)
                .addFields(
                    { name: '⚙️ Siguiente paso', value: 'Ahora configura el canal de entrada con `¡setbuzonentrada #canal`', inline: false },
                    { name: '📋 Estado actual', value: 'Inactivo (falta configurar canal de entrada)', inline: false }
                )
                .setFooter({ text: 'Sistema de Buzón • Tentación', iconURL: message.guild.iconURL({ dynamic: true }) });
                
            message.reply({ embeds: [embed] });
        }
    }
    // Mostrar configuración actual del buzón
    else if (message.content.startsWith('¡infobuzon')) {
        // Verificar permisos de administrador
        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return message.reply('❌ No tienes permiso para ver la configuración del buzón.');
        }
        
        const buzonInfo = buzonConfig.get(message.guild.id);
        
        if (!buzonInfo || (!buzonInfo.destino && !buzonInfo.canalEntrada)) {
            return message.reply('⚠ No hay configuración de buzón para este servidor. Usa `¡setbuzonentrada #canal` y `¡setbuzondestino #canal` para configurarlo.');
        }
        
        const canalEntrada = buzonInfo.canalEntrada ? message.guild.channels.cache.get(buzonInfo.canalEntrada) : null;
        const canalDestino = buzonInfo.destino ? message.guild.channels.cache.get(buzonInfo.destino) : null;
        
        // Verificar permisos en ambos canales
        let permisosEntrada = 'No verificado';
        let permisosDestino = 'No verificado';
        
        if (canalEntrada) {
            const perms = canalEntrada.permissionsFor(message.guild.members.me);
            if (perms && perms.has('ViewChannel') && perms.has('ManageMessages')) {
                permisosEntrada = '✅ Correctos';
            } else {
                permisosEntrada = '❌ Faltan permisos (Ver Canal, Gestionar Mensajes)';
            }
        }
        
        if (canalDestino) {
            const perms = canalDestino.permissionsFor(message.guild.members.me);
            if (perms && perms.has('ViewChannel') && perms.has('SendMessages') && perms.has('EmbedLinks')) {
                permisosDestino = '✅ Correctos';
            } else {
                permisosDestino = '❌ Faltan permisos (Ver Canal, Enviar Mensajes, Insertar Enlaces)';
            }
        }
        
        const embed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('📫 Configuración del Buzón')
            .setDescription('Información sobre la configuración actual del buzón en este servidor')
            .addFields(
                { name: '📥 Canal de entrada', value: canalEntrada ? `${canalEntrada}` : 'No configurado', inline: true },
                { name: '📤 Canal de destino', value: canalDestino ? `${canalDestino}` : 'No configurado', inline: true },
                { name: '📊 Estado', value: buzonInfo.activo ? '✅ Activo' : '❌ Inactivo (faltan canales)', inline: true },
                { name: '🔒 Permisos en canal de entrada', value: permisosEntrada, inline: true },
                { name: '🔒 Permisos en canal de destino', value: permisosDestino, inline: true },
                { name: '💡 ¿Cómo funciona?', value: 'Los mensajes enviados al canal de entrada serán enviados automáticamente al canal de destino y luego borrados del canal original.', inline: false },
                { name: '🔄 Recargar configuración', value: 'Si el buzón no funciona correctamente, puedes usar `¡refreshbuzon` para recargar la configuración.', inline: false }
            )
            .setFooter({ text: 'Sistema de Buzón • Tentación', iconURL: message.guild.iconURL({ dynamic: true }) })
            .setTimestamp();
            
        message.channel.send({ embeds: [embed] });
    }
    // Comando para refrescar la configuración del buzón
    else if (message.content.startsWith('¡refreshbuzon')) {
        // Verificar permisos de administrador
        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return message.reply('❌ No tienes permiso para refrescar la configuración del buzón.');
        }
        
        try {
            // Obtener la configuración actual del servidor
            const config = getServerConfig(message.guild.id);
            
            // Verificar si hay configuración de buzón
            if (!config.canalBuzon && !config.canalBuzonEntrada) {
                return message.reply('⚠ No hay configuración de buzón para este servidor. Usa `¡setbuzonentrada #canal` y `¡setbuzondestino #canal` para configurarlo.');
            }
            
            // Recargar la configuración del buzón
            if (config.canalBuzon && config.canalBuzonEntrada) {
                buzonConfig.set(message.guild.id, {
                    activo: true,
                    destino: config.canalBuzon,
                    canalEntrada: config.canalBuzonEntrada
                });
                
                console.log(`📫 Buzón recargado para servidor ${message.guild.id}:`);
                console.log(`   - Canal de entrada: ${config.canalBuzonEntrada}`);
                console.log(`   - Canal de destino: ${config.canalBuzon}`);
                console.log(`   - Estado: Activo`);
                
                const canalEntrada = message.guild.channels.cache.get(config.canalBuzonEntrada);
                const canalDestino = message.guild.channels.cache.get(config.canalBuzon);
                
                const embed = new EmbedBuilder()
                    .setColor('#00FF00')
                    .setTitle('🔄 Configuración del Buzón Recargada')
                    .setDescription('La configuración del buzón ha sido recargada correctamente.')
                    .addFields(
                        { name: '📥 Canal de entrada', value: canalEntrada ? `${canalEntrada}` : `<#${config.canalBuzonEntrada}>`, inline: true },
                        { name: '📤 Canal de destino', value: canalDestino ? `${canalDestino}` : `<#${config.canalBuzon}>`, inline: true },
                        { name: '📊 Estado', value: '✅ Activo', inline: true },
                        { name: '📝 Prueba', value: 'Envía un mensaje al canal de entrada para probar si el buzón funciona correctamente.', inline: false }
                    )
                    .setFooter({ text: 'Sistema de Buzón • Tentación', iconURL: message.guild.iconURL({ dynamic: true }) })
                    .setTimestamp();
                
                return message.reply({ embeds: [embed] });
            } else {
                // Configuración parcial
                buzonConfig.set(message.guild.id, {
                    activo: false,
                    destino: config.canalBuzon || null,
                    canalEntrada: config.canalBuzonEntrada || null
                });
                
                const embed = new EmbedBuilder()
                    .setColor('#FFAA00')
                    .setTitle('⚠️ Configuración Parcial del Buzón')
                    .setDescription('La configuración del buzón ha sido recargada, pero está incompleta.')
                    .addFields(
                        { name: '📥 Canal de entrada', value: config.canalBuzonEntrada ? `<#${config.canalBuzonEntrada}>` : 'No configurado', inline: true },
                        { name: '📤 Canal de destino', value: config.canalBuzon ? `<#${config.canalBuzon}>` : 'No configurado', inline: true },
                        { name: '📊 Estado', value: '❌ Inactivo (configuración incompleta)', inline: true },
                        { name: '⚙️ Siguiente paso', value: config.canalBuzonEntrada ? 'Configura el canal de destino con `¡setbuzondestino #canal`' : 'Configura el canal de entrada con `¡setbuzonentrada #canal`', inline: false }
                    )
                    .setFooter({ text: 'Sistema de Buzón • Tentación', iconURL: message.guild.iconURL({ dynamic: true }) })
                    .setTimestamp();
                
                return message.reply({ embeds: [embed] });
            }
        } catch (error) {
            console.error('❌ Error al refrescar configuración del buzón:', error);
            return message.reply('❌ Ocurrió un error al refrescar la configuración del buzón. Por favor, inténtalo de nuevo.');
        }
    }
    else if (message.content.startsWith('¡help')) {
        const isAdmin = message.member.permissions.has(PermissionsBitField.Flags.Administrator);
        
        // Separar los comandos en categorías: admin y todos
        const embedAdmin = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('⚙️ Comandos de Administrador')
            .setDescription('Estos comandos solo están disponibles para administradores y moderadores.')
            .addFields(
                { name: '⚙️ **Configuración**', value: 
                    '`¡setlogs #canal` - Configura el canal de logs.\n' +
                    '`/setlogs canal:` - Configura el canal de logs (slash).\n\n' +
                    
                    '`¡setbienvenida #canal` - Configura el canal de bienvenida.\n' +
                    '`/setbienvenida canal:` - Configura el canal de bienvenida (slash).\n\n' +
                    
                    '`¡setdespedida #canal` - Configura el canal de despedida.\n' +
                    '`/setdespedida canal:` - Configura el canal de despedida (slash).\n\n' +
                    
                    '`¡setniveles #canal` - Configura el canal de notificaciones de nivel.\n' +
                    '`/setniveles canal:` - Configura el canal de notificaciones de nivel (slash).\n\n' +
                    
                    '`¡setinvitaciones #canal` - Configura el canal para notificaciones de invitaciones.\n' +
                    '`/setinvitaciones canal:` - Configura el canal para notificaciones de invitaciones (slash).\n\n' +
                    
                    '`¡infosetinvitaciones` - Muestra la configuración actual de invitaciones.\n' +
                    '`¡resetinvitaciones` - Resetea el contador de invitaciones.', 
                inline: false },
                
                { name: '📫 **Sistema de Buzón**', value: 
                    '`¡setbuzonentrada #canal` - Configura el canal donde se recibirán mensajes para el buzón (serán borrados).\n\n' +
                    '`¡setbuzondestino #canal` - Configura el canal donde se enviarán los mensajes del buzón.\n\n' +
                    '`¡infobuzon` - Muestra la configuración actual del buzón.',
                inline: false },
                
                { name: '🔨 **Moderación**', value: 
                    '`¡clear [n]` - Borra mensajes.\n' +
                    '`/clear cantidad:` - Borra mensajes (slash).\n\n' +
                    
                    '`¡kick @usuario` - Expulsa a un usuario.\n' +
                    '`/kick usuario: @usuario razon:` - Expulsa a un usuario (slash).\n\n' +
                    
                    '`¡ban @usuario` - Banea a un usuario.\n' +
                    '`/ban usuario: @usuario razon:` - Banea a un usuario (slash).\n\n' +
                    
                    '`¡mute @usuario [tiempo]` - Mutea un usuario.\n' +
                    '`/mute usuario: @usuario tiempo:` - Mutea un usuario (slash).\n\n' +
                    
                    '`¡unmute @usuario` - Desmutea a un usuario.\n' +
                    '`/unmute usuario: @usuario` - Desmutea a un usuario (slash).',
                inline: false },
                
                { name: '📢 **Mensajes y Anuncios**', value: 
                    '`¡decir #canal mensaje` - Envía un mensaje a un canal.\n\n' +
                    
                    '`¡embed | Título | Descripción | [URL de Imagen] | [#Canal] | [Color Hex] | [Texto normal]` - Crea un embed personalizado.\n' +
                    '`/embed titulo: desc: imagen: canal: color: texto:` - Crea un embed (slash).\n\n' +
                    
                    '`¡encuesta "Pregunta" "Opción1" "Opción2"` - Crea una encuesta.\n' +
                    '`¡invitarbot` - Genera un enlace para invitar al bot a otros servidores.\n' +
                    '`/invitarbot` - Genera un enlace para invitar al bot (slash).', 
                inline: false },
                
                { name: '🎂 **Gestión de Cumpleaños**', value: 
                    '`¡cumpleaños DD-MM` - Registra tu propio cumpleaños (formato día-mes).\n' +
                    '`¡configCumpleaños | Mensaje | Imagen | #Canal` - Configura los mensajes de cumpleaños.\n' +
                    '`¡configCumpleaños ver` - Muestra la configuración actual de cumpleaños.\n' +
                    '`¡verificarcumpleaños` - Ejecuta manualmente la verificación de cumpleaños para hoy.\n' +
                    '`¡listarcumpleaños` - Muestra la lista completa de cumpleaños registrados.', 
                inline: false },
                
                { name: '🧪 **Pruebas**', value: 
                    '`¡testbienvenida` - Prueba el mensaje de bienvenida.\n' +
                    '`¡testdespedida` - Prueba el mensaje de despedida.', 
                inline: false },
                
                { name: '📝 **Personalización de Mensajes**', value: 
                    '`¡setmensajebienvenida | Título | Descripción | [Color Hex] | [Imagen URL]` - Personaliza el mensaje de bienvenida.\n' +
                    '`/setmensajebienvenida titulo: desc: color: imagen:` - Personaliza el mensaje de bienvenida (slash).\n\n' +
                    
                    '`¡setmensajedespedida | Título | Descripción | [Color Hex] | [Imagen URL]` - Personaliza el mensaje de despedida.\n' +
                    '`/setmensajedespedida titulo: desc: color: imagen:` - Personaliza el mensaje de despedida (slash).\n\n' +
                    
                    '`¡vermensajebienvenida` - Ver el mensaje de bienvenida actual.\n' +
                    '`/vermensajesbienvenida` - Ver el mensaje de bienvenida actual (slash).\n\n' +
                    
                    '`¡vermensajedespedida` - Ver el mensaje de despedida actual.\n' +
                    '`/vermensajesdespedida` - Ver el mensaje de despedida actual (slash).\n\n' +
                    
                    '`¡resetmensajebienvenida` - Restablecer mensaje de bienvenida al predeterminado.\n' +
                    '`¡resetmensajedespedida` - Restablecer mensaje de despedida al predeterminado.', 
                inline: false }
            )
            .setThumbnail(client.user.displayAvatarURL({ dynamic: true }))
            .setFooter({ text: 'Para ver los comandos para todos los usuarios usa ¡help todos' });

        const embedTodos = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('🌟 Comandos para Todos')
            .setDescription('Estos comandos están disponibles para todos los usuarios del servidor.')
            .addFields(
                { name: '🎉 **Interacciones**', value: 
                    '`¡abrazar @usuario` - Abrazas a alguien.\n' +
                    '`/abrazar usuario: @usuario` - Abrazas a alguien (slash).\n\n' +
                    
                    '`¡besar @usuario` - Besas a alguien.\n' +
                    '`/besar usuario: @usuario` - Besas a alguien (slash).\n\n' +
                    
                    '`¡golpear @usuario` - Golpeas a alguien.\n' +
                    '`/golpear usuario: @usuario` - Golpeas a alguien (slash).\n\n' +
                    
                    '`¡patear @usuario` - Pateas a alguien.\n' +
                    '`¡acariciar @usuario` - Acaricias a alguien.\n' +
                    '`¡morder @usuario` - Muerdes a alguien.\n' +
                    '`¡dar la mano @usuario` - Das la mano a alguien.',
                inline: false },
                
                { name: '🔍 **Información**', value: 
                    '`¡userinfo @usuario` - Muestra información de un usuario.\n' +
                    '`/userinfo usuario: @usuario` - Información de usuario (slash).\n\n' +
                    
                    '`¡serverinfo` - Muestra información del servidor.\n' +
                    '`/serverinfo` - Información del servidor (slash).\n\n' +
                    
                    '`¡nivel [@usuario]` - Muestra el nivel y XP de un usuario.\n' +
                    '`/nivel usuario: @usuario` - Muestra nivel y XP (slash).\n\n' +
                    
                    '`¡ping` - Muestra la latencia del bot.\n' +
                    '`/ping` - Muestra la latencia del bot (slash).\n\n' +
                    
                    '`¡avatar @usuario` - Muestra el avatar de un usuario.\n' +
                    '`¡autoping` - Muestra información detallada de la latencia.',
                inline: false },
                
                { name: '🎭 **Diversión**', value: 
                    '`¡dados` - Lanza un dado.\n' +
                    '`/dados` - Lanza un dado (slash).\n\n' +
                    
                    '`¡8ball pregunta` - Pregunta algo a la bola mágica.\n' +
                    '`/8ball pregunta:` - Pregunta a la bola mágica (slash).\n\n' +
                    
                    '`¡ship @usuario1 @usuario2` - Calcula la compatibilidad entre dos usuarios.\n' +
                    '`/ship usuario1: @usuario1 usuario2: @usuario2` - Calcula compatibilidad (slash).\n\n' +
                    
                    '`¡adivina [número]` - Adivina un número del 1 al 10.\n' +
                    '`¡cartas` - Saca una carta aleatoria.\n' +
                    '`¡piedra papel tijeras [elección]` - Juega piedra, papel o tijeras.',
                inline: false },
                
                { name: '🎂 **Cumpleaños**', value: 
                    '`¡cumpleaños DD-MM` - Registra tu cumpleaños.\n' +
                    '`/cumpleanos fecha: DD-MM` - Registra tu cumpleaños (slash).',
                inline: false },
                
                { name: '🎟 **Sistema de Invitaciones**', value: 
                    '`¡invitaciones @usuario` - Muestra cuántas personas ha invitado un usuario.\n' +
                    '`/invitaciones usuario: @usuario` - Muestra invitaciones (slash).\n\n' +
                    
                    '`¡topinvitaciones` - Muestra el ranking de invitaciones.\n' +
                    '`/topinvitaciones` - Muestra ranking de invitaciones (slash).',
                inline: false }
            )
            .setThumbnail(client.user.displayAvatarURL({ dynamic: true }))
            .setFooter({ text: 'Para ver los comandos de administrador usa ¡help admin' });

        // Menú principal de ayuda
        const embedPrincipal = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('📜 Sistema de Ayuda de Tentación')
            .setDescription('Bienvenido al sistema de ayuda. Puedes usar comandos tanto con el prefijo `¡` como con `/`.\n\nLos comandos slash (/) son más fáciles de usar y tienen autocompletado. Simplemente escribe `/` y selecciona un comando de la lista.')
            .addFields(
                { name: '⚙️ **Comandos de Administrador**', value: 'Usa `¡help admin` para ver los comandos de administrador.', inline: false },
                { name: '🌟 **Comandos para Todos**', value: 'Usa `¡help todos` para ver los comandos disponibles para todos.', inline: false },
                { name: '🔍 **Comandos de búsqueda**', value: 'Usa `¡help [comando]` para obtener información detallada sobre un comando específico.', inline: false },
                { name: '💡 **Usando comandos slash**', value: 'Los comandos slash (/) te permiten usar el bot de forma más fácil e intuitiva. Escribe `/` y verás una lista de todos los comandos disponibles con sus opciones.', inline: false }
            )
            .setImage('https://cdn.discordapp.com/attachments/1219069470652371034/1347049160267923487/descarga.gif?ex=67ca68ca&is=67c9174a&hm=777dc9218cbfe8c25d933441f5bdebd54f7d481bf2d58ab63172c489129d0972&')
            .setFooter({ text: isAdmin ? 'Tienes acceso a todos los comandos como administrador.' : 'Algunos comandos requieren permisos de administrador.' });

        // Verificar si el usuario está buscando ayuda específica
        const args = message.content.split(' ');
        
        if (args.length > 1) {
            const helpType = args[1].toLowerCase();
            
            if (helpType === 'admin' || helpType === 'administrador') {
                if (!isAdmin) {
                    message.channel.send('❌ No tienes permisos para ver los comandos de administrador.');
                    return;
                }
                message.channel.send({ embeds: [embedAdmin] });
            } 
            else if (helpType === 'todos' || helpType === 'all' || helpType === 'user') {
                message.channel.send({ embeds: [embedTodos] });
            }
            else if (helpType === 'slash' || helpType === 'comandos-slash' || helpType === '/') {
                // Crear un embed específico para comandos slash
                const slashEmbed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('🔍 Guía de Comandos Slash')
                    .setDescription('Los comandos slash (/) son la forma más fácil de usar el bot. Solo escribe `/` y Discord te mostrará una lista de todos los comandos disponibles con autocompletado.')
                    .addFields(
                        { name: '💡 **¿Cómo usar comandos slash?**', value: 
                            '1. Escribe `/` en el chat\n' +
                            '2. Busca el comando que deseas usar\n' +
                            '3. Selecciónalo y completa los parámetros necesarios\n' +
                            '4. Presiona Enter para enviar el comando', 
                        inline: false },
                        { name: '✨ **Ventajas de los comandos slash**', value: 
                            '• Interfaz intuitiva con autocompletado\n' +
                            '• No necesitas recordar el prefijo del bot\n' +
                            '• Discord te muestra qué parámetros son necesarios\n' +
                            '• Reduce errores de escritura', 
                        inline: false },
                        { name: '👀 **Ejemplo**', value: 
                            'En lugar de escribir:\n' +
                            '`¡nivel @usuario`\n\n' +
                            'Simplemente escribe `/` y selecciona "nivel", luego selecciona el usuario opcionalmente.', 
                        inline: false }
                    )
                    .setImage('https://cdn.discordapp.com/attachments/1219069470652371034/1347313953882202162/slash-commands.gif?ex=67b64ae5&is=67a3d5e5&hm=8ef04506f2e20e1c01c7dc9f8b669e0faeb8e20e19dfffd51ffce24c45aa60af&')
                    .setFooter({ text: 'Usa ¡help todos o ¡help admin para ver la lista completa de comandos' });
                
                message.channel.send({ embeds: [slashEmbed] });
            }
            else {
                // Buscar información sobre un comando específico
                const comando = helpType.startsWith('¡') ? helpType : `¡${helpType}`;
                const helpEmbed = getHelpForCommand(comando, isAdmin);
                
                if (helpEmbed) {
                    message.channel.send({ embeds: [helpEmbed] });
                } else {
                    message.channel.send(`❌ No se encontró ayuda para el comando "${comando}". Usa \`¡help\` para ver la lista de comandos disponibles.`);
                }
            }
        } else {
            // Mostrar el menú principal si no hay argumentos
            message.channel.send({ embeds: [embedPrincipal] });
        }
    }
    
    // Función para obtener ayuda sobre un comando específico
    function getHelpForCommand(comando, isAdmin) {
        const comandoNombre = comando.slice(1).toLowerCase(); // Quitar el "¡" del inicio
        
        // Definir la información de los comandos
        const comandosInfo = {
            // Comandos de administrador
            'setlogs': {
                title: '¡setlogs',
                description: 'Configura el canal donde se enviarán los logs del servidor.',
                usage: '¡setlogs #canal\n/setlogs canal: #canal',
                examples: ['¡setlogs #logs', '¡setlogs #registro-actividad'],
                permisos: 'Administrador',
                category: 'admin'
            },
            'setbienvenida': {
                title: '¡setbienvenida',
                description: 'Configura el canal donde se enviarán los mensajes de bienvenida.',
                usage: '¡setbienvenida #canal\n/setbienvenida canal: #canal',
                examples: ['¡setbienvenida #bienvenidas', '¡setbienvenida #lobby'],
                permisos: 'Administrador',
                category: 'admin'
            },
            'setdespedida': {
                title: '¡setdespedida',
                description: 'Configura el canal donde se enviarán los mensajes de despedida.',
                usage: '¡setdespedida #canal\n/setdespedida canal: #canal',
                examples: ['¡setdespedida #despedidas', '¡setdespedida #adiós'],
                permisos: 'Administrador',
                category: 'admin'
            },
            'setniveles': {
                title: '¡setniveles',
                description: 'Configura el canal donde se enviarán las notificaciones de nivel.',
                usage: '¡setniveles #canal\n/setniveles canal: #canal',
                examples: ['¡setniveles #niveles', '¡setniveles #logros'],
                permisos: 'Administrador',
                category: 'admin'
            },
            'setinvitaciones': {
                title: '¡setinvitaciones',
                description: 'Configura el canal donde se registrarán las invitaciones nuevas.',
                usage: '¡setinvitaciones #canal\n/setinvitaciones canal: #canal',
                examples: ['¡setinvitaciones #invitaciones', '¡setinvitaciones #nuevos-miembros'],
                permisos: 'Administrador',
                category: 'admin'
            },
            'infosetinvitaciones': {
                title: '¡infosetinvitaciones',
                description: 'Muestra la configuración actual del sistema de invitaciones.',
                usage: '¡infosetinvitaciones',
                examples: ['¡infosetinvitaciones'],
                permisos: 'Administrador',
                category: 'admin'
            },
            'resetinvitaciones': {
                title: '¡resetinvitaciones',
                description: 'Reinicia el contador de invitaciones de todos los usuarios.',
                usage: '¡resetinvitaciones',
                examples: ['¡resetinvitaciones'],
                permisos: 'Administrador',
                category: 'admin'
            },
            'embed': {
                title: '¡embed',
                description: 'Crea un mensaje embed personalizado, con opción de texto normal.',
                usage: '¡embed | Título | Descripción | [URL de Imagen] | [#Canal] | [Color Hex] | [Texto normal]\n\n/embed titulo: desc: imagen: canal: color: texto:',
                examples: ['¡embed | Anuncio | ¡Nuevo evento! | https://imagen.jpg | #anuncios | #FF0000 | ¡Importante!'],
                permisos: 'Administrador',
                category: 'admin'
            },
            'setmensajebienvenida': {
                title: '¡setmensajebienvenida',
                description: 'Personaliza el mensaje de bienvenida para nuevos miembros.',
                usage: '¡setmensajebienvenida | Título | Descripción | [Color Hex] | [URL Imagen]\n/setmensajebienvenida titulo: desc: color: imagen:',
                examples: ['¡setmensajebienvenida | ¡Bienvenido, {username}! | Hola {mencion}, ¡bienvenido al servidor! | #FF0000'],
                permisos: 'Administrador',
                category: 'admin'
            },
            'setmensajedespedida': {
                title: '¡setmensajedespedida',
                description: 'Personaliza el mensaje de despedida cuando un miembro deja el servidor.',
                usage: '¡setmensajedespedida | Título | Descripción | [Color Hex] | [URL Imagen]\n/setmensajedespedida titulo: desc: color: imagen:',
                examples: ['¡setmensajedespedida | Adiós, {username} | {username} ha dejado el servidor. ¡Esperamos verte pronto! | #FF0000'],
                permisos: 'Administrador',
                category: 'admin'
            },
            'configcumpleaños': {
                title: '¡configCumpleaños',
                description: 'Configura el sistema de cumpleaños del servidor.',
                usage: '¡configCumpleaños | Mensaje | [URL Imagen] | [#Canal]',
                examples: ['¡configCumpleaños | ¡Feliz cumpleaños {usuario}! | https://imagen.jpg | #cumpleaños'],
                permisos: 'Administrador',
                category: 'admin'
            },
            'verificarcumpleaños': {
                title: '¡verificarcumpleaños',
                description: 'Ejecuta manualmente la verificación de cumpleaños para el día actual.',
                usage: '¡verificarcumpleaños',
                examples: ['¡verificarcumpleaños'],
                permisos: 'Administrador',
                category: 'admin'
            },
            'listarcumpleaños': {
                title: '¡listarcumpleaños',
                description: 'Muestra una lista de todos los cumpleaños registrados en el servidor.',
                usage: '¡listarcumpleaños',
                examples: ['¡listarcumpleaños'],
                permisos: 'Administrador',
                category: 'admin'
            },
            'clear': {
                title: '¡clear',
                description: 'Borra mensajes del canal actual.',
                usage: '¡clear [número]\n/clear cantidad: [número]',
                examples: ['¡clear 10', '¡clear 50'],
                permisos: 'Gestionar Mensajes',
                category: 'admin'
            },
            'kick': {
                title: '¡kick',
                description: 'Expulsa a un usuario del servidor.',
                usage: '¡kick @usuario\n/kick usuario: @usuario razon: [razón]',
                examples: ['¡kick @Usuario', '¡kick @Usuario Spam'],
                permisos: 'Expulsar Miembros',
                category: 'admin'
            },
            'ban': {
                title: '¡ban',
                description: 'Banea a un usuario del servidor.',
                usage: '¡ban @usuario\n/ban usuario: @usuario razon: [razón]',
                examples: ['¡ban @Usuario', '¡ban @Usuario Comportamiento inapropiado'],
                permisos: 'Banear Miembros',
                category: 'admin'
            },
            'mute': {
                title: '¡mute',
                description: 'Silencia temporalmente a un usuario en el servidor.',
                usage: '¡mute @usuario [tiempo]\n/mute usuario: @usuario tiempo: [tiempo]',
                examples: ['¡mute @Usuario 10m', '¡mute @Usuario 1h'],
                permisos: 'Moderar Miembros',
                category: 'admin'
            },
            'unmute': {
                title: '¡unmute',
                description: 'Quita el silencio a un usuario previamente silenciado.',
                usage: '¡unmute @usuario\n/unmute usuario: @usuario',
                examples: ['¡unmute @Usuario'],
                permisos: 'Moderar Miembros',
                category: 'admin'
            },
            'encuesta': {
                title: '¡encuesta',
                description: 'Crea una encuesta con opciones para que los usuarios voten.',
                usage: '¡encuesta "Pregunta" "Opción1" "Opción2" ...',
                examples: ['¡encuesta "¿Color favorito?" "Rojo" "Azul" "Verde"'],
                permisos: 'Gestionar Mensajes',
                category: 'admin'
            },
            'decir': {
                title: '¡decir',
                description: 'Envía un mensaje a través del bot a un canal específico.',
                usage: '¡decir #canal [mensaje]',
                examples: ['¡decir #anuncios ¡Hola a todos!', '¡decir #general Este es un mensaje importante'],
                permisos: 'Administrador',
                category: 'admin'
            },
            'testbienvenida': {
                title: '¡testbienvenida',
                description: 'Prueba cómo se ve el mensaje de bienvenida actual.',
                usage: '¡testbienvenida',
                examples: ['¡testbienvenida'],
                permisos: 'Administrador',
                category: 'admin'
            },
            'testdespedida': {
                title: '¡testdespedida',
                description: 'Prueba cómo se ve el mensaje de despedida actual.',
                usage: '¡testdespedida',
                examples: ['¡testdespedida'],
                permisos: 'Administrador',
                category: 'admin'
            },
            'invitarbot': {
                title: '¡invitarbot',
                description: 'Genera enlaces para invitar al bot a otros servidores.',
                usage: '¡invitarbot\n/invitarbot',
                examples: ['¡invitarbot'],
                permisos: 'Administrador',
                category: 'admin'
            },
            // Comandos para todos
            'nivel': {
                title: '¡nivel',
                description: 'Muestra tu nivel actual y experiencia en el servidor.',
                usage: '¡nivel [@usuario]\n/nivel usuario: @usuario',
                examples: ['¡nivel', '¡nivel @Usuario'],
                permisos: 'Ninguno',
                category: 'todos'
            },
            'ship': {
                title: '¡ship',
                description: 'Calcula la compatibilidad amorosa entre dos usuarios.',
                usage: '¡ship @usuario1 @usuario2\n/ship usuario1: @usuario1 usuario2: @usuario2',
                examples: ['¡ship @Usuario1 @Usuario2'],
                permisos: 'Ninguno',
                category: 'todos'
            },
            'abrazar': {
                title: '¡abrazar',
                description: 'Abraza a otro usuario con un lindo gif.',
                usage: '¡abrazar @usuario\n/abrazar usuario: @usuario',
                examples: ['¡abrazar @Usuario'],
                permisos: 'Ninguno',
                category: 'todos'
            },
            'besar': {
                title: '¡besar',
                description: 'Besa a otro usuario con un lindo gif.',
                usage: '¡besar @usuario\n/besar usuario: @usuario',
                examples: ['¡besar @Usuario'],
                permisos: 'Ninguno',
                category: 'todos'
            },
            'golpear': {
                title: '¡golpear',
                description: 'Golpea a otro usuario.',
                usage: '¡golpear @usuario\n/golpear usuario: @usuario',
                examples: ['¡golpear @Usuario'],
                permisos: 'Ninguno',
                category: 'todos'
            },
            'patear': {
                title: '¡patear',
                description: 'Patea a otro usuario.',
                usage: '¡patear @usuario',
                examples: ['¡patear @Usuario'],
                permisos: 'Ninguno',
                category: 'todos'
            },
            'acariciar': {
                title: '¡acariciar',
                description: 'Acaricia a otro usuario.',
                usage: '¡acariciar @usuario',
                examples: ['¡acariciar @Usuario'],
                permisos: 'Ninguno',
                category: 'todos'
            },
            'morder': {
                title: '¡morder',
                description: 'Muerde a otro usuario.',
                usage: '¡morder @usuario',
                examples: ['¡morder @Usuario'],
                permisos: 'Ninguno',
                category: 'todos'
            },
            'darlamano': {
                title: '¡dar la mano',
                description: 'Da la mano a otro usuario.',
                usage: '¡dar la mano @usuario',
                examples: ['¡dar la mano @Usuario'],
                permisos: 'Ninguno',
                category: 'todos'
            },
            'userinfo': {
                title: '¡userinfo',
                description: 'Muestra información detallada sobre un usuario.',
                usage: '¡userinfo [@usuario]\n/userinfo usuario: [@usuario]',
                examples: ['¡userinfo', '¡userinfo @Usuario'],
                permisos: 'Ninguno',
                category: 'todos'
            },
            'serverinfo': {
                title: '¡serverinfo',
                description: 'Muestra información detallada sobre el servidor actual.',
                usage: '¡serverinfo\n/serverinfo',
                examples: ['¡serverinfo'],
                permisos: 'Ninguno',
                category: 'todos'
            },
            'avatar': {
                title: '¡avatar',
                description: 'Muestra el avatar de un usuario en tamaño completo.',
                usage: '¡avatar [@usuario]',
                examples: ['¡avatar', '¡avatar @Usuario'],
                permisos: 'Ninguno',
                category: 'todos'
            },
            'ping': {
                title: '¡ping',
                description: 'Muestra la latencia actual del bot.',
                usage: '¡ping\n/ping',
                examples: ['¡ping'],
                permisos: 'Ninguno',
                category: 'todos'
            },
            'autoping': {
                title: '¡autoping',
                description: 'Muestra información detallada sobre la latencia y el uptime del bot.',
                usage: '¡autoping',
                examples: ['¡autoping'],
                permisos: 'Ninguno',
                category: 'todos'
            },
            'dados': {
                title: '¡dados',
                description: 'Lanza un dado de 6 caras y muestra el resultado.',
                usage: '¡dados\n/dados',
                examples: ['¡dados'],
                permisos: 'Ninguno',
                category: 'todos'
            },
            '8ball': {
                title: '¡8ball',
                description: 'Haz una pregunta a la bola mágica 8ball y recibe una respuesta.',
                usage: '¡8ball [pregunta]\n/8ball pregunta: [pregunta]',
                examples: ['¡8ball ¿Tendré suerte hoy?'],
                permisos: 'Ninguno',
                category: 'todos'
            },
            'adivina': {
                title: '¡adivina',
                description: 'Juego de adivinar un número entre 1 y 10.',
                usage: '¡adivina [número]',
                examples: ['¡adivina 7'],
                permisos: 'Ninguno',
                category: 'todos'
            },
            'cartas': {
                title: '¡cartas',
                description: 'Saca una carta aleatoria de una baraja.',
                usage: '¡cartas',
                examples: ['¡cartas'],
                permisos: 'Ninguno',
                category: 'todos'
            },
            'piedra': {
                title: '¡piedra',
                description: 'Juega a piedra, papel o tijeras contra el bot.',
                usage: '¡piedra papel tijeras [elección]',
                examples: ['¡piedra papel tijeras piedra', '¡piedra papel tijeras papel', '¡piedra papel tijeras tijeras'],
                permisos: 'Ninguno',
                category: 'todos'
            },
            'invitaciones': {
                title: '¡invitaciones',
                description: 'Muestra cuántas personas ha invitado un usuario al servidor.',
                usage: '¡invitaciones [@usuario]\n/invitaciones usuario: [@usuario]',
                examples: ['¡invitaciones', '¡invitaciones @Usuario'],
                permisos: 'Ninguno',
                category: 'todos'
            },
            'topinvitaciones': {
                title: '¡topinvitaciones',
                description: 'Muestra un ranking de los usuarios con más invitaciones.',
                usage: '¡topinvitaciones\n/topinvitaciones',
                examples: ['¡topinvitaciones'],
                permisos: 'Ninguno',
                category: 'todos'
            },
            'cumpleaños': {
                title: '¡cumpleaños',
                description: 'Registra tu fecha de cumpleaños para recibir felicitaciones automáticas.',
                usage: '¡cumpleaños DD-MM\n/cumpleanos fecha: DD-MM',
                examples: ['¡cumpleaños 25-12', '¡cumpleaños 01-05'],
                permisos: 'Ninguno',
                category: 'todos'
            }
        };
        
        // Buscar el comando

// Función para manejar clics en botones de sorteo
async function handleSorteoButtonClick(interaction) {
    try {
        const { user, message } = interaction;
        
        console.log(`🎮 Usuario ${user.tag} (${user.id}) ha interactuado con el botón de sorteo en mensaje ${message.id}`);
        console.log(`🔍 ID del botón: ${interaction.customId}`);
        
        // Buscar este sorteo en nuestra base de datos
        let sorteos = [];
        try {
            sorteos = JSON.parse(fs.readFileSync('sorteos.json', 'utf8'));
        } catch (error) {
            console.error('Error al leer sorteos.json:', error);
            await interaction.reply({ content: '❌ Ha ocurrido un error al procesar tu participación.', ephemeral: true });
            return;
        }
        
        // Encontrar el sorteo correspondiente a este mensaje
        const sorteo = sorteos.find(s => s.messageId === message.id || s.buttonId === interaction.customId);
        
        if (!sorteo) {
            console.log(`⚠️ No se encontró el sorteo para el mensaje ${message.id} (botón: ${interaction.customId})`);
            // Verificar todos los sorteos en el sistema para depuración
            console.log(`📋 Sorteos disponibles: ${JSON.stringify(sorteos.map(s => ({id: s.messageId, boton: s.buttonId})))}`);
            await interaction.reply({ content: '❌ Este sorteo no está registrado en el sistema.', ephemeral: true });
            return;
        }
        
        // Verificar si el sorteo ya ha finalizado
        if (sorteo.finalizado) {
            console.log(`⚠️ El sorteo ${message.id} ya ha finalizado`);
            await interaction.reply({ content: '❌ Este sorteo ya ha finalizado.', ephemeral: true });
            return;
        }
        
        // Asegurarnos de que existe el array de participantes
        if (!sorteo.participantes) {
            sorteo.participantes = [];
        }
        
        if (sorteo.participantes.includes(user.id)) {
            // El usuario ya está participando, ofrecerle la opción de salir
            const row = {
                type: 1,
                components: [
                    {
                        type: 2,
                        style: 4, // Danger (red)
                        custom_id: `sorteo_salir_${sorteo.messageId}`,
                        label: 'Salir del sorteo',
                        emoji: { name: '❌' }
                    }
                ]
            };
            
            await interaction.reply({ 
                content: '✅ Ya estás participando en este sorteo. ¿Deseas retirarte?', 
                components: [row],
                ephemeral: true 
            });
            return;
        }
        
        // Agregar usuario a la lista de participantes
        sorteo.participantes.push(user.id);
        console.log(`✅ Usuario ${user.tag} agregado a la lista de participantes del sorteo ${message.id}`);
        
        // Actualizar el contador en el embed original si es necesario
        if (message.embeds && message.embeds.length > 0) {
            const embed = message.embeds[0];
            
            // Actualizar el embed con el número actualizado de participantes
            let descripcionActualizada = embed.description;
            
            // Si ya existe la línea de participantes, actualizarla
            if (descripcionActualizada.includes("**Participantes actuales:**")) {
                descripcionActualizada = descripcionActualizada.replace(
                    /\*\*Participantes actuales:\*\* \d+/,
                    `**Participantes actuales:** ${sorteo.participantes.length}`
                );
            } else {
                // Si no existe, añadirla al final
                descripcionActualizada += `\n\n**Participantes actuales:** ${sorteo.participantes.length}`;
            }
            
            // Crear nuevo embed 
            const newEmbed = EmbedBuilder.from(embed).setDescription(descripcionActualizada);
            
            // Actualizar el mensaje con el nuevo embed
            try {
                await message.edit({ embeds: [newEmbed] });
                console.log(`✅ Mensaje de sorteo ${message.id} actualizado con ${sorteo.participantes.length} participantes`);
            } catch (editError) {
                console.error(`Error al editar mensaje de sorteo: ${editError.message}`);
            }
        }
        
        // Guardar actualización en el archivo
        try {
            fs.writeFileSync('sorteos.json', JSON.stringify(sorteos, null, 2));
            console.log(`✅ Archivo sorteos.json actualizado correctamente`);
        } catch (saveError) {
            console.error(`Error al guardar sorteos.json: ${saveError.message}`);
        }
        
        // Notificar al usuario
        await interaction.reply({ content: '✅ ¡Has entrado en el sorteo correctamente! Buena suerte.', ephemeral: true });
    } catch (error) {
        console.error(`❌ Error al manejar botón de sorteo: ${error.message}`);
        // Intentar responder solo si la interacción aún no ha sido respondida
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: '❌ Ha ocurrido un error al procesar tu participación.', ephemeral: true })
                .catch(err => console.error(`No se pudo responder a la interacción: ${err.message}`));
        }
    }
}

// Manejador para salir de un sorteo
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton() || !interaction.customId.startsWith('sorteo_salir_')) {
        return;
    }
    
    try {
        const sorteoId = interaction.customId.replace('sorteo_salir_', '');
        
        // Cargar sorteos
        let sorteos = [];
        try {
            sorteos = JSON.parse(fs.readFileSync('sorteos.json', 'utf8'));
        } catch (error) {
            console.error('Error al leer sorteos.json:', error);
            return interaction.reply({ content: '❌ Ha ocurrido un error al procesar tu solicitud.', ephemeral: true });
        }
        
        // Encontrar el sorteo
        const sorteoIndex = sorteos.findIndex(s => s.messageId === sorteoId);
        
        if (sorteoIndex === -1) {
            return interaction.reply({ content: '❌ No se encontró el sorteo.', ephemeral: true });
        }
        
        // Eliminar al usuario de la lista de participantes
        const sorteo = sorteos[sorteoIndex];
        const userIndex = sorteo.participantes.indexOf(interaction.user.id);
        
        if (userIndex === -1) {
            return interaction.reply({ content: '❌ No estabas participando en este sorteo.', ephemeral: true });
        }
        
        sorteo.participantes.splice(userIndex, 1);
        
        // Actualizar el mensaje del sorteo
        const message = await interaction.channel.messages.fetch(sorteoId).catch(() => null);
        if (message) {
            const embed = message.embeds[0];
            if (embed) {
                const newEmbed = EmbedBuilder.from(embed)
                    .setDescription(embed.description.split('\n\n**Participantes actuales:**')[0] + 
                                   `\n\n**Participantes actuales:** ${sorteo.participantes.length}`);
                
                message.edit({ embeds: [newEmbed] }).catch(console.error);
            }
        }
        
        // Guardar cambios
        fs.writeFileSync('sorteos.json', JSON.stringify(sorteos, null, 2));
        
        // Confirmar al usuario
        return interaction.reply({ content: '✅ Has salido del sorteo correctamente.', ephemeral: true });
    } catch (error) {
        console.error('Error al salir del sorteo:', error);
        return interaction.reply({ content: '❌ Ha ocurrido un error al procesar tu solicitud.', ephemeral: true });
    }
});

        const info = comandosInfo[comandoNombre];
        
        if (!info) return null;
        
        // Verificar permisos
        if (info.category === 'admin' && !isAdmin) return null;
        
        // Crear embed
        const embed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle(`📚 Ayuda: ${info.title}`)
            .setDescription(info.description)
            .addFields(
                { name: '📝 **Uso**', value: `\`${info.usage}\``, inline: false },
                { name: '🔍 **Ejemplos**', value: info.examples.map(ex => `\`${ex}\``).join('\n'), inline: false },
                { name: '🔒 **Permisos requeridos**', value: info.permisos, inline: false }
            )
            .setFooter({ text: 'Sistema de ayuda • Tentación' });
            
        return embed;
    }
});

// 🔍 **Definir y registrar los comandos Slash**
async function registrarComandosSlash() {
    const comandos = [
        // Comando de sorteo
        new SlashCommandBuilder()
            .setName('sorteo')
            .setDescription('Crea un sorteo con una recompensa')
            .addStringOption(option => option
                .setName('premio')
                .setDescription('¿Qué premio sortearás?')
                .setRequired(true))
            .addIntegerOption(option => option
                .setName('ganadores')
                .setDescription('Número de ganadores')
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(10))
            .addIntegerOption(option => option
                .setName('duracion')
                .setDescription('Duración del sorteo en minutos')
                .setRequired(true)
                .setMinValue(1))
            .addChannelOption(option => option
                .setName('canal')
                .setDescription('Canal donde se enviará el sorteo (opcional)')
                .setRequired(false))
            .addStringOption(option => option
                .setName('imagen')
                .setDescription('URL de imagen grande para el sorteo (opcional)')
                .setRequired(false))
            .addStringOption(option => option
                .setName('thumbnail')
                .setDescription('URL de imagen pequeña/thumbnail para el sorteo (opcional)')
                .setRequired(false)),
        // Comando para configurar mensajes de bienvenida y despedida
        new SlashCommandBuilder()
            .setName('setmensajebienvenida')
            .setDescription('Configura el mensaje de bienvenida personalizado')
            .addStringOption(option => option
                .setName('titulo')
                .setDescription('Título del mensaje (puedes usar {username}, {servername})')
                .setRequired(true))
            .addStringOption(option => option
                .setName('descripcion')
                .setDescription('Descripción del mensaje (debes incluir {mencion})')
                .setRequired(true))
            .addStringOption(option => option
                .setName('color')
                .setDescription('Color del embed en formato hexadecimal (ej: #FF0000)')
                .setRequired(false))
            .addStringOption(option => option
                .setName('imagen')
                .setDescription('URL de la imagen para el embed')
                .setRequired(false)),
                
        new SlashCommandBuilder()
            .setName('setmensajedespedida')
            .setDescription('Configura el mensaje de despedida personalizado')
            .addStringOption(option => option
                .setName('titulo')
                .setDescription('Título del mensaje (debes incluir {username} aquí o en la descripción)')
                .setRequired(true))
            .addStringOption(option => option
                .setName('descripcion')
                .setDescription('Descripción del mensaje (debes incluir {username} aquí o en el título)')
                .setRequired(true))
            .addStringOption(option => option
                .setName('color')
                .setDescription('Color del embed en formato hexadecimal (ej: #FF0000)')
                .setRequired(false))
            .addStringOption(option => option
                .setName('imagen')
                .setDescription('URL de la imagen para el embed')
                .setRequired(false)),
                
        new SlashCommandBuilder()
            .setName('vermensajesbienvenida')
            .setDescription('Muestra el mensaje de bienvenida actual'),
            
        new SlashCommandBuilder()
            .setName('vermensajesdespedida')
            .setDescription('Muestra el mensaje de despedida actual'),
            
        new SlashCommandBuilder()
            .setName('resetmensajebienvenida')
            .setDescription('Restablece el mensaje de bienvenida al predeterminado'),
            
        new SlashCommandBuilder()
            .setName('resetmensajedespedida')
            .setDescription('Restablece el mensaje de despedida al predeterminado'),
        
        // Comandos de información
        new SlashCommandBuilder()
            .setName('userinfo')
            .setDescription('Muestra información de un usuario')
            .addUserOption(option => option
                .setName('usuario')
                .setDescription('Usuario del que quieres ver información')
                .setRequired(false)),
        
        new SlashCommandBuilder()
            .setName('serverinfo')
            .setDescription('Muestra información del servidor'),
        
        new SlashCommandBuilder()
            .setName('ping')
            .setDescription('Muestra la latencia del bot'),
            
        new SlashCommandBuilder()
            .setName('nivel')
            .setDescription('Muestra el nivel de un usuario')
            .addUserOption(option => option
                .setName('usuario')
                .setDescription('Usuario del que quieres ver el nivel')
                .setRequired(false)),
            
        // Comandos de interacción
        new SlashCommandBuilder()
            .setName('abrazar')
            .setDescription('Abraza a un usuario')
            .addUserOption(option => option
                .setName('usuario')
                .setDescription('Usuario al que quieres abrazar')
                .setRequired(true)),
                
        new SlashCommandBuilder()
            .setName('besar')
            .setDescription('Besa a un usuario')
            .addUserOption(option => option
                .setName('usuario')
                .setDescription('Usuario al que quieres besar')
                .setRequired(true)),
                
        new SlashCommandBuilder()
            .setName('golpear')
            .setDescription('Golpea a un usuario')
            .addUserOption(option => option
                .setName('usuario')
                .setDescription('Usuario al que quieres golpear')
                .setRequired(true)),
                
        new SlashCommandBuilder()
            .setName('patear')
            .setDescription('Patea a un usuario')
            .addUserOption(option => option
                .setName('usuario')
                .setDescription('Usuario al que quieres patear')
                .setRequired(true)),
                
        new SlashCommandBuilder()
            .setName('acariciar')
            .setDescription('Acaricia a un usuario')
            .addUserOption(option => option
                .setName('usuario')
                .setDescription('Usuario al que quieres acariciar')
                .setRequired(true)),
                
        new SlashCommandBuilder()
            .setName('morder')
            .setDescription('Muerde a un usuario')
            .addUserOption(option => option
                .setName('usuario')
                .setDescription('Usuario al que quieres morder')
                .setRequired(true)),
                
        new SlashCommandBuilder()
            .setName('darlamano')
            .setDescription('Da la mano a un usuario')
            .addUserOption(option => option
                .setName('usuario')
                .setDescription('Usuario al que quieres dar la mano')
                .setRequired(true)),
                
        new SlashCommandBuilder()
            .setName('ship')
            .setDescription('Calcula la compatibilidad entre dos usuarios')
            .addUserOption(option => option
                .setName('usuario1')
                .setDescription('Primer usuario')
                .setRequired(true))
            .addUserOption(option => option
                .setName('usuario2')
                .setDescription('Segundo usuario')
                .setRequired(true)),
                
        new SlashCommandBuilder()
            .setName('avatar')
            .setDescription('Muestra el avatar de un usuario')
            .addUserOption(option => option
                .setName('usuario')
                .setDescription('Usuario del que quieres ver el avatar')
                .setRequired(false)),
        
        // Comandos de moderación
        new SlashCommandBuilder()
            .setName('clear')
            .setDescription('Borra mensajes del canal')
            .addIntegerOption(option => option
                .setName('cantidad')
                .setDescription('Cantidad de mensajes a borrar (1-100)')
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(100)),
                
        new SlashCommandBuilder()
            .setName('kick')
            .setDescription('Expulsa a un usuario del servidor')
            .addUserOption(option => option
                .setName('usuario')
                .setDescription('Usuario al que quieres expulsar')
                .setRequired(true))
            .addStringOption(option => option
                .setName('razon')
                .setDescription('Razón de la expulsión')
                .setRequired(false)),
                
        new SlashCommandBuilder()
            .setName('ban')
            .setDescription('Banea a un usuario del servidor')
            .addUserOption(option => option
                .setName('usuario')
                .setDescription('Usuario al que quieres banear')
                .setRequired(true))
            .addStringOption(option => option
                .setName('razon')
                .setDescription('Razón del baneo')
                .setRequired(false)),
                
        new SlashCommandBuilder()
            .setName('mute')
            .setDescription('Silencia a un usuario temporalmente')
            .addUserOption(option => option
                .setName('usuario')
                .setDescription('Usuario al que quieres silenciar')
                .setRequired(true))
            .addStringOption(option => option
                .setName('tiempo')
                .setDescription('Tiempo de silenciamiento (ej: 10m, 1h)')
                .setRequired(true)),
                
        new SlashCommandBuilder()
            .setName('unmute')
            .setDescription('Quita el silencio a un usuario')
            .addUserOption(option => option
                .setName('usuario')
                .setDescription('Usuario al que quieres quitar el silencio')
                .setRequired(true)),
                
        // Comandos de diversión
        new SlashCommandBuilder()
            .setName('dados')
            .setDescription('Lanza un dado de 6 caras'),
            
        new SlashCommandBuilder()
            .setName('8ball')
            .setDescription('Pregunta a la bola mágica')
            .addStringOption(option => option
                .setName('pregunta')
                .setDescription('La pregunta que quieres hacer')
                .setRequired(true)),
                
        new SlashCommandBuilder()
            .setName('adivina')
            .setDescription('Juego para adivinar un número del 1 al 10')
            .addIntegerOption(option => option
                .setName('numero')
                .setDescription('Tu adivinanza (1-10)')
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(10)),
                
        new SlashCommandBuilder()
            .setName('cartas')
            .setDescription('Saca una carta aleatoria de la baraja'),
                
        new SlashCommandBuilder()
            .setName('piedrapapeltijeras')
            .setDescription('Juega a piedra, papel o tijeras')
            .addStringOption(option => option
                .setName('eleccion')
                .setDescription('Tu elección')
                .setRequired(true)
                .addChoices(
                    { name: 'Piedra', value: 'piedra' },
                    { name: 'Papel', value: 'papel' },
                    { name: 'Tijeras', value: 'tijeras' }
                )),
        
        // Comandos de cumpleaños
        new SlashCommandBuilder()
            .setName('cumpleanos')
            .setDescription('Registra o consulta tu cumpleaños')
            .addStringOption(option => option
                .setName('accion')
                .setDescription('¿Qué acción quieres realizar?')
                .setRequired(false)
                .addChoices(
                    { name: 'Ver mi cumpleaños', value: 'ver' },
                    { name: 'Registrar/actualizar mi cumpleaños', value: 'registrar' }
                ))
            .addStringOption(option => option
                .setName('fecha')
                .setDescription('Tu fecha de cumpleaños (formato: DD-MM, ejemplo: 25-12)')
                .setRequired(false)),
                
        new SlashCommandBuilder()
            .setName('verificarcumpleanos')
            .setDescription('Verifica si hay cumpleaños hoy (admin)'),
                
        new SlashCommandBuilder()
            .setName('listarcumpleanos')
            .setDescription('Muestra la lista de cumpleaños registrados (admin)'),
                
        new SlashCommandBuilder()
            .setName('configcumpleanos')
            .setDescription('Configura el sistema de cumpleaños (admin)')
            .addStringOption(option => option
                .setName('mensaje')
                .setDescription('Mensaje de felicitación (usa {usuario} para mencionar)')
                .setRequired(false))
            .addStringOption(option => option
                .setName('imagen')
                .setDescription('URL de la imagen para el mensaje')
                .setRequired(false))
            .addChannelOption(option => option
                .setName('canal')
                .setDescription('Canal donde se enviarán las felicitaciones')
                .setRequired(false)),
                
        // Comandos de invitaciones (para todos)
        new SlashCommandBuilder()
            .setName('invitaciones')
            .setDescription('Muestra las invitaciones de un usuario')
            .addUserOption(option => option
                .setName('usuario')
                .setDescription('Usuario del que quieres ver las invitaciones')
                .setRequired(false)),
                
        new SlashCommandBuilder()
            .setName('topinvitaciones')
            .setDescription('Muestra el ranking de invitaciones'),
                
        new SlashCommandBuilder()
            .setName('resetinvitaciones')
            .setDescription('Resetea el contador de invitaciones (admin)'),
                
        new SlashCommandBuilder()
            .setName('infosetinvitaciones')
            .setDescription('Muestra la configuración actual de invitaciones (admin)'),
            
        // Comandos de configuración (solo admin)
        new SlashCommandBuilder()
            .setName('setlogs')
            .setDescription('Configura el canal de logs (Solo admin)')
            .addChannelOption(option => option
                .setName('canal')
                .setDescription('Canal donde se enviarán los logs')
                .setRequired(true)),
                
        new SlashCommandBuilder()
            .setName('setbienvenida')
            .setDescription('Configura el canal de bienvenida')
            .addChannelOption(option => option
                .setName('canal')
                .setDescription('Canal donde se enviarán los mensajes de bienvenida')
                .setRequired(true)),
                
        new SlashCommandBuilder()
            .setName('setdespedida')
            .setDescription('Configura el canal de despedida')
            .addChannelOption(option => option
                .setName('canal')
                .setDescription('Canal donde se enviarán los mensajes de despedida')
                .setRequired(true)),
                
        new SlashCommandBuilder()
            .setName('setbuzonentrada')
            .setDescription('Configura el canal de entrada del buzón')
            .addChannelOption(option => option
                .setName('canal')
                .setDescription('Canal donde se recibirán los mensajes (serán borrados)')
                .setRequired(true)),
                
        new SlashCommandBuilder()
            .setName('setbuzondestino')
            .setDescription('Configura el canal de destino del buzón')
            .addChannelOption(option => option
                .setName('canal')
                .setDescription('Canal donde se enviarán los mensajes procesados')
                .setRequired(true)),
                
        new SlashCommandBuilder()
            .setName('infobuzon')
            .setDescription('Muestra la configuración actual del buzón'),
                
        new SlashCommandBuilder()
            .setName('setniveles')
            .setDescription('Configura el canal de notificaciones de nivel')
            .addChannelOption(option => option
                .setName('canal')
                .setDescription('Canal donde se enviarán las notificaciones de nivel')
                .setRequired(true)),
                
        new SlashCommandBuilder()
            .setName('setinvitaciones')
            .setDescription('Configura el canal de notificaciones de invitaciones')
            .addChannelOption(option => option
                .setName('canal')
                .setDescription('Canal donde se enviarán las notificaciones de invitaciones')
                .setRequired(true)),
                
        new SlashCommandBuilder()
            .setName('embed')
            .setDescription('Crea un embed personalizado')
            .addStringOption(option => option
                .setName('titulo')
                .setDescription('Título del embed')
                .setRequired(true))
            .addStringOption(option => option
                .setName('descripcion')
                .setDescription('Descripción del embed')
                .setRequired(true))
            .addStringOption(option => option
                .setName('imagen')
                .setDescription('URL de la imagen principal (opcional)')
                .setRequired(false))
            .addChannelOption(option => option
                .setName('canal')
                .setDescription('Canal donde enviar el embed (opcional)')
                .setRequired(false))
            .addStringOption(option => option
                .setName('color')
                .setDescription('Color en formato hexadecimal (ej: #FF0000)')
                .setRequired(false))
            .addStringOption(option => option
                .setName('texto')
                .setDescription('Texto normal que aparecerá encima del embed (opcional)')
                .setRequired(false))
            .addStringOption(option => option
                .setName('thumbnail')
                .setDescription('URL de la imagen pequeña/thumbnail (opcional)')
                .setRequired(false)),
                
        new SlashCommandBuilder()
            .setName('encuesta')
            .setDescription('Crea una encuesta con opciones')
            .addStringOption(option => option
                .setName('pregunta')
                .setDescription('La pregunta de la encuesta')
                .setRequired(true))
            .addStringOption(option => option
                .setName('opcion1')
                .setDescription('Primera opción')
                .setRequired(true))
            .addStringOption(option => option
                .setName('opcion2')
                .setDescription('Segunda opción')
                .setRequired(true))
            .addStringOption(option => option
                .setName('opcion3')
                .setDescription('Tercera opción')
                .setRequired(false))
            .addStringOption(option => option
                .setName('opcion4')
                .setDescription('Cuarta opción')
                .setRequired(false))
            .addStringOption(option => option
                .setName('opcion5')
                .setDescription('Quinta opción')
                .setRequired(false)),
                
        new SlashCommandBuilder()
            .setName('invitarbot')
            .setDescription('Genera un enlace para invitar al bot a otros servidores'),
                
        new SlashCommandBuilder()
            .setName('decir')
            .setDescription('Envía un mensaje a través del bot')
            .addChannelOption(option => option
                .setName('canal')
                .setDescription('Canal donde enviar el mensaje')
                .setRequired(true))
            .addStringOption(option => option
                .setName('mensaje')
                .setDescription('Mensaje a enviar')
                .setRequired(true)),
                
        new SlashCommandBuilder()
            .setName('testbienvenida')
            .setDescription('Prueba el mensaje de bienvenida actual (admin)'),
                
        new SlashCommandBuilder()
            .setName('testdespedida')
            .setDescription('Prueba el mensaje de despedida actual (admin)'),
                
        new SlashCommandBuilder()
            .setName('help')
            .setDescription('Muestra la ayuda del bot')
            .addStringOption(option => option
                .setName('comando')
                .setDescription('Comando específico sobre el que quieres información')
                .setRequired(false))
            .addStringOption(option => option
                .setName('categoria')
                .setDescription('Categoría de comandos que quieres ver')
                .setRequired(false)
                .addChoices(
                    { name: 'Comandos de Administrador', value: 'admin' },
                    { name: 'Comandos para Todos', value: 'todos' },
                    { name: 'Comandos de Slash', value: 'slash' }
                )),
    ];

    try {
        console.log('🔄 Iniciando registro de comandos de barra...');
        const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

        // Registrar comandos globalmente (disponibles en todos los servidores donde está el bot)
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: comandos.map(comando => comando.toJSON()) }
        );

        console.log('✅ Comandos de barra registrados correctamente');
    } catch (error) {
        console.error('❌ Error al registrar comandos de barra:', error);
    }
}

// Función para obtener información de ayuda para comandos slash
function getSlashCommandHelp(comandoNombre, isAdmin) {
    // Definir la información de los comandos
    const comandosInfo = {
        // Comandos de administrador
        'setlogs': {
            title: '/setlogs',
            description: 'Configura el canal donde se enviarán los logs del servidor.',
            usage: '/setlogs canal: #canal',
            examples: ['Selecciona el canal #logs como canal de logs'],
            permisos: 'Administrador',
            category: 'admin'
        },
        'setbienvenida': {
            title: '/setbienvenida',
            description: 'Configura el canal donde se enviarán los mensajes de bienvenida.',
            usage: '/setbienvenida canal: #canal',
            examples: ['Selecciona el canal #bienvenidas como canal de bienvenida'],
            permisos: 'Administrador',
            category: 'admin'
        },
        'setdespedida': {
            title: '/setdespedida',
            description: 'Configura el canal donde se enviarán los mensajes de despedida.',
            usage: '/setdespedida canal: #canal',
            examples: ['Selecciona el canal #despedidas como canal de despedida'],
            permisos: 'Administrador',
            category: 'admin'
        },
        'setniveles': {
            title: '/setniveles',
            description: 'Configura el canal donde se enviarán las notificaciones de nivel.',
            usage: '/setniveles canal: #canal',
            examples: ['Selecciona el canal #niveles como canal de notificaciones de nivel'],
            permisos: 'Administrador',
            category: 'admin'
        },
        'setinvitaciones': {
            title: '/setinvitaciones',
            description: 'Configura el canal donde se registrarán las invitaciones nuevas.',
            usage: '/setinvitaciones canal: #canal',
            examples: ['Selecciona el canal #invitaciones como canal de notificaciones de invitaciones'],
            permisos: 'Administrador',
            category: 'admin'
        },
        'infosetinvitaciones': {
            title: '/infosetinvitaciones',
            description: 'Muestra la configuración actual del sistema de invitaciones.',
            usage: '/infosetinvitaciones',
            examples: ['Muestra la configuración actual de invitaciones'],
            permisos: 'Administrador',
            category: 'admin'
        },
        'resetinvitaciones': {
            title: '/resetinvitaciones',
            description: 'Reinicia el contador de invitaciones de todos los usuarios.',
            usage: '/resetinvitaciones',
            examples: ['Reinicia el contador de invitaciones'],
            permisos: 'Administrador',
            category: 'admin'
        },
        'embed': {
            title: '/embed',
            description: 'Crea un mensaje embed personalizado, con opción de texto normal.',
            usage: '/embed titulo: [título] descripcion: [descripción] imagen: [URL] canal: [#canal] color: [color hex] texto: [texto] thumbnail: [URL]',
            examples: ['Crea un embed con título "Anuncio" y descripción "¡Nuevo evento!"'],
            permisos: 'Administrador',
            category: 'admin'
        },
        'setmensajebienvenida': {
            title: '/setmensajebienvenida',
            description: 'Personaliza el mensaje de bienvenida para nuevos miembros.',
            usage: '/setmensajebienvenida titulo: [título] descripcion: [descripción] color: [color hex] imagen: [URL]',
            examples: ['Configura un mensaje de bienvenida personalizado con la variable {mencion}'],
            permisos: 'Administrador',
            category: 'admin'
        },
        'setmensajedespedida': {
            title: '/setmensajedespedida',
            description: 'Personaliza el mensaje de despedida cuando un miembro deja el servidor.',
            usage: '/setmensajedespedida titulo: [título] descripcion: [descripción] color: [color hex] imagen: [URL]',
            examples: ['Configura un mensaje de despedida con la variable {username}'],
            permisos: 'Administrador',
            category: 'admin'
        },
        'configcumpleanos': {
            title: '/configcumpleanos',
            description: 'Configura el sistema de cumpleaños del servidor.',
            usage: '/configcumpleanos mensaje: [mensaje] imagen: [URL] canal: [#canal]',
            examples: ['Configura un mensaje personalizado con la variable {usuario}'],
            permisos: 'Administrador',
            category: 'admin'
        },
        'verificarcumpleanos': {
            title: '/verificarcumpleanos',
            description: 'Ejecuta manualmente la verificación de cumpleaños para el día actual.',
            usage: '/verificarcumpleanos',
            examples: ['Ejecuta la verificación de cumpleaños manualmente'],
            permisos: 'Administrador',
            category: 'admin'
        },
        'listarcumpleanos': {
            title: '/listarcumpleanos',
            description: 'Muestra una lista de todos los cumpleaños registrados en el servidor.',
            usage: '/listarcumpleanos',
            examples: ['Muestra la lista de cumpleaños registrados'],
            permisos: 'Administrador',
            category: 'admin'
        },
        'clear': {
            title: '/clear',
            description: 'Borra mensajes del canal actual.',
            usage: '/clear cantidad: [número]',
            examples: ['Borra 10 mensajes del canal actual'],
            permisos: 'Gestionar Mensajes',
            category: 'admin'
        },
        'kick': {
            title: '/kick',
            description: 'Expulsa a un usuario del servidor.',
            usage: '/kick usuario: @usuario razon: [razón]',
            examples: ['Expulsa a un usuario por spam'],
            permisos: 'Expulsar Miembros',
            category: 'admin'
        },
        'ban': {
            title: '/ban',
            description: 'Banea a un usuario del servidor.',
            usage: '/ban usuario: @usuario razon: [razón]',
            examples: ['Banea a un usuario por comportamiento inapropiado'],
            permisos: 'Banear Miembros',
            category: 'admin'
        },
        'mute': {
            title: '/mute',
            description: 'Silencia temporalmente a un usuario en el servidor.',
            usage: '/mute usuario: @usuario tiempo: [tiempo]',
            examples: ['Silencia a un usuario durante 10 minutos'],
            permisos: 'Moderar Miembros',
            category: 'admin'
        },
        'unmute': {
            title: '/unmute',
            description: 'Quita el silencio a un usuario previamente silenciado.',
            usage: '/unmute usuario: @usuario',
            examples: ['Quita el silencio a un usuario'],
            permisos: 'Moderar Miembros',
            category: 'admin'
        },
        'encuesta': {
            title: '/encuesta',
            description: 'Crea una encuesta con opciones para que los usuarios voten.',
            usage: '/encuesta pregunta: [pregunta] opcion1: [opción1] opcion2: [opción2] ...',
            examples: ['Crea una encuesta sobre el color favorito'],
            permisos: 'Gestionar Mensajes',
            category: 'admin'
        },
        'decir': {
            title: '/decir',
            description: 'Envía un mensaje a través del bot a un canal específico.',
            usage: '/decir canal: #canal mensaje: [mensaje]',
            examples: ['Envía un mensaje importante a través del bot'],
            permisos: 'Administrador',
            category: 'admin'
        },
        'testbienvenida': {
            title: '/testbienvenida',
            description: 'Prueba cómo se ve el mensaje de bienvenida actual.',
            usage: '/testbienvenida',
            examples: ['Prueba el mensaje de bienvenida'],
            permisos: 'Administrador',
            category: 'admin'
        },
        'testdespedida': {
            title: '/testdespedida',
            description: 'Prueba cómo se ve el mensaje de despedida actual.',
            usage: '/testdespedida',
            examples: ['Prueba el mensaje de despedida'],
            permisos: 'Administrador',
            category: 'admin'
        },
        'invitarbot': {
            title: '/invitarbot',
            description: 'Genera enlaces para invitar al bot a otros servidores.',
            usage: '/invitarbot',
            examples: ['Genera enlaces de invitación para el bot'],
            permisos: 'Administrador',
            category: 'admin'
        },
        // Comandos para todos
        'nivel': {
            title: '/nivel',
            description: 'Muestra tu nivel actual y experiencia en el servidor.',
            usage: '/nivel usuario: @usuario',
            examples: ['Muestra tu nivel actual', 'Muestra el nivel de otro usuario'],
            permisos: 'Ninguno',
            category: 'todos'
        },
        'ship': {
            title: '/ship',
            description: 'Calcula la compatibilidad amorosa entre dos usuarios.',
            usage: '/ship usuario1: @usuario1 usuario2: @usuario2',
            examples: ['Calcula la compatibilidad entre dos usuarios'],
            permisos: 'Ninguno',
            category: 'todos'
        },
        'abrazar': {
            title: '/abrazar',
            description: 'Abraza a otro usuario con un lindo gif.',
            usage: '/abrazar usuario: @usuario',
            examples: ['Abraza a un amigo'],
            permisos: 'Ninguno',
            category: 'todos'
        },
        'besar': {
            title: '/besar',
            description: 'Besa a otro usuario con un lindo gif.',
            usage: '/besar usuario: @usuario',
            examples: ['Besa a un amigo'],
            permisos: 'Ninguno',
            category: 'todos'
        },
        'golpear': {
            title: '/golpear',
            description: 'Golpea a otro usuario.',
            usage: '/golpear usuario: @usuario',
            examples: ['Golpea a un amigo'],
            permisos: 'Ninguno',
            category: 'todos'
        },
        'patear': {
            title: '/patear',
            description: 'Patea a otro usuario.',
            usage: '/patear usuario: @usuario',
            examples: ['Patea a un amigo'],
            permisos: 'Ninguno',
            category: 'todos'
        },
        'acariciar': {
            title: '/acariciar',
            description: 'Acaricia a otro usuario.',
            usage: '/acariciar usuario: @usuario',
            examples: ['Acaricia a un amigo'],
            permisos: 'Ninguno',
            category: 'todos'
        },
        'morder': {
            title: '/morder',
            description: 'Muerde a otro usuario.',
            usage: '/morder usuario: @usuario',
            examples: ['Muerde a un amigo'],
            permisos: 'Ninguno',
            category: 'todos'
        },
        'darlamano': {
            title: '/darlamano',
            description: 'Da la mano a otro usuario.',
            usage: '/darlamano usuario: @usuario',
            examples: ['Da la mano a un amigo'],
            permisos: 'Ninguno',
            category: 'todos'
        },
        'userinfo': {
            title: '/userinfo',
            description: 'Muestra información detallada sobre un usuario.',
            usage: '/userinfo usuario: @usuario',
            examples: ['Muestra tu información', 'Muestra información de otro usuario'],
            permisos: 'Ninguno',
            category: 'todos'
        },
        'serverinfo': {
            title: '/serverinfo',
            description: 'Muestra información detallada sobre el servidor actual.',
            usage: '/serverinfo',
            examples: ['Muestra información del servidor'],
            permisos: 'Ninguno',
            category: 'todos'
        },
        'avatar': {
            title: '/avatar',
            description: 'Muestra el avatar de un usuario en tamaño completo.',
            usage: '/avatar usuario: @usuario',
            examples: ['Muestra tu avatar', 'Muestra el avatar de otro usuario'],
            permisos: 'Ninguno',
            category: 'todos'
        },
        'ping': {
            title: '/ping',
            description: 'Muestra la latencia actual del bot.',
            usage: '/ping',
            examples: ['Muestra la latencia actual'],
            permisos: 'Ninguno',
            category: 'todos'
        },
        'autoping': {
            title: '/autoping',
            description: 'Muestra información detallada sobre la latencia y el uptime del bot.',
            usage: '/autoping',
            examples: ['Muestra información detallada de latencia'],
            permisos: 'Ninguno',
            category: 'todos'
        },
        'dados': {
            title: '/dados',
            description: 'Lanza un dado de 6 caras y muestra el resultado.',
            usage: '/dados',
            examples: ['Lanza un dado'],
            permisos: 'Ninguno',
            category: 'todos'
        },
        '8ball': {
            title: '/8ball',
            description: 'Haz una pregunta a la bola mágica 8ball y recibe una respuesta.',
            usage: '/8ball pregunta: [pregunta]',
            examples: ['Pregunta si tendrás suerte hoy'],
            permisos: 'Ninguno',
            category: 'todos'
        },
        'adivina': {
            title: '/adivina',
            description: 'Juego de adivinar un número entre 1 y 10.',
            usage: '/adivina numero: [número]',
            examples: ['Adivina un número entre 1 y 10'],
            permisos: 'Ninguno',
            category: 'todos'
        },
        'cartas': {
            title: '/cartas',
            description: 'Saca una carta aleatoria de una baraja.',
            usage: '/cartas',
            examples: ['Saca una carta aleatoria'],
            permisos: 'Ninguno',
            category: 'todos'
        },
        'piedrapapeltijeras': {
            title: '/piedrapapeltijeras',
            description: 'Juega a piedra, papel o tijeras contra el bot.',
            usage: '/piedrapapeltijeras eleccion: [piedra|papel|tijeras]',
            examples: ['Juega piedra, papel o tijeras'],
            permisos: 'Ninguno',
            category: 'todos'
        },
        'invitaciones': {
            title: '/invitaciones',
            description: 'Muestra cuántas personas ha invitado un usuario al servidor.',
            usage: '/invitaciones usuario: @usuario',
            examples: ['Muestra tus invitaciones', 'Muestra las invitaciones de otro usuario'],
            permisos: 'Ninguno',
            category: 'todos'
        },
        'topinvitaciones': {
            title: '/topinvitaciones',
            description: 'Muestra un ranking de los usuarios con más invitaciones.',
            usage: '/topinvitaciones',
            examples: ['Muestra el ranking de invitaciones'],
            permisos: 'Ninguno',
            category: 'todos'
        },
        'cumpleanos': {
            title: '/cumpleanos',
            description: 'Registra tu fecha de cumpleaños para recibir felicitaciones automáticas.',
            usage: '/cumpleanos accion: [ver|registrar] fecha: [DD-MM]',
            examples: ['Registra tu cumpleaños como 25-12', 'Ver tu cumpleaños registrado'],
            permisos: 'Ninguno',
            category: 'todos'
        },
        'help': {
            title: '/help',
            description: 'Muestra la ayuda del bot con información sobre comandos disponibles.',
            usage: '/help comando: [nombre-comando] categoria: [admin|todos|slash]',
            examples: ['Muestra ayuda general', 'Muestra ayuda sobre un comando específico', 'Muestra comandos para administradores'],
            permisos: 'Ninguno',
            category: 'todos'
        }
    };

    // Buscar el comando
    const info = comandosInfo[comandoNombre];
    
    if (!info) return null;
    
    // Verificar permisos
    if (info.category === 'admin' && !isAdmin) return null;
    
    // Crear embed
    const embed = new EmbedBuilder()
        .setColor('#FF0000')
        .setTitle(`📚 Ayuda: ${info.title}`)
        .setDescription(info.description)
        .addFields(
            { name: '📝 **Uso**', value: `\`${info.usage}\``, inline: false },
            { name: '🔍 **Ejemplos**', value: info.examples.map(ex => `• ${ex}`).join('\n'), inline: false },
            { name: '🔒 **Permisos requeridos**', value: info.permisos, inline: false }
        )
        .setFooter({ text: 'Sistema de ayuda • Tentación' });
        
    return embed;
}

// 🎮 **Manejar las interacciones de comandos Slash y botones**
client.on('interactionCreate', async (interaction) => {
    // Manejar interacciones de botón
    if (interaction.isButton()) {
        console.log(`🎮 Interacción de botón recibida: ${interaction.customId}`);
        
        try {
            // Verificar si es un botón de sorteo (mejorado para detectar cualquier botón de sorteo)
            if (interaction.customId.includes('sorteo_participar_')) {
                await handleSorteoButtonClick(interaction);
                return;
            }
            
            // Aquí puedes manejar otros tipos de botones en el futuro
            return;
        } catch (error) {
            console.error(`❌ Error general al manejar interacción de botón: ${error.message}`);
            // Intentar responder si aún no se ha respondido
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ 
                    content: '❌ Ha ocurrido un error al procesar esta interacción.', 
                    ephemeral: true 
                }).catch(console.error);
            }
            return;
        }
    }
    
    // Continuar con el manejo de comandos slash
    if (!interaction.isCommand()) return;

    const { commandName, options, user, guild, channel, member } = interaction;

    // Responder según el comando
    try {
        // Comando de sorteo
        if (commandName === 'sorteo') {
            console.log('Comando slash de sorteo ejecutado');
            // Verificar permisos
            if (!member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
                return interaction.reply({ content: '❌ No tienes permisos para crear sorteos.', ephemeral: true });
            }
            
            const premio = options.getString('premio');
            const ganadores = options.getInteger('ganadores');
            const duracion = options.getInteger('duracion');
            const imagen = options.getString('imagen');
            const thumbnailImg = options.getString('thumbnail');
            const canalDestino = options.getChannel('canal') || channel;
            
            // Calcular tiempo de finalización
            const finalizaEn = Date.now() + (duracion * 60 * 1000);
            
            // Crear embed de sorteo
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('🎉 NUEVO SORTEO 🎉')
                .setDescription(`**Premio:** ${premio}\n\n**Ganadores:** ${ganadores}\n\n**Finaliza:** <t:${Math.floor(finalizaEn/1000)}:R>\n\n**Organizado por:** ${interaction.user}\n\n**Para participar:** Haz clic en el botón "🎉 Participar" abajo`)
                .setFooter({ text: 'Sorteo • Tentación', iconURL: guild.iconURL({ dynamic: true }) })
                .setTimestamp();
            
            // Agregar imagen grande (principal) si se proporciona
            if (imagen && imagen.startsWith('http')) {
                embed.setImage(imagen);
            }
            
            // Agregar imagen pequeña (thumbnail) si se proporciona
            if (thumbnailImg && thumbnailImg.startsWith('http')) {
                embed.setThumbnail(thumbnailImg);
            }
            
            // Crear botón para participar con ID único
            const buttonId = `sorteo_participar_${Date.now()}`;
            console.log(`🔵 Creando botón de sorteo con ID: ${buttonId}`);
            
            const row = {
                type: 1, // ActionRow
                components: [
                    {
                        type: 2, // Button
                        style: 1, // Primary (blue)
                        custom_id: buttonId,
                        emoji: { name: '🎉' },
                        label: 'Participar'
                    }
                ]
            };
            
            await interaction.reply({ content: `✅ ¡Creando sorteo en ${canalDestino}!`, ephemeral: true });
            
            try {
                // Enviar mensaje con el embed y el botón
                const mensaje = await canalDestino.send({ embeds: [embed], components: [row] });
                
                // Guardar datos del sorteo
                const sorteoData = {
                    messageId: mensaje.id,
                    channelId: canalDestino.id,
                    guildId: guild.id,
                    premio: premio,
                    ganadores: ganadores,
                    finalizaEn: finalizaEn,
                    creadorId: user.id,
                    finalizado: false,
                    participantes: [], // Ahora guardamos un array de participantes
                    buttonId: row.components[0].custom_id // Guardamos el ID del botón
                };
                
                // Leer datos existentes
                let sorteos = [];
                try {
                    sorteos = JSON.parse(fs.readFileSync('sorteos.json', 'utf8'));
                } catch (error) {
                    console.error('Error al leer sorteos.json:', error);
                    sorteos = [];
                }
                
                // Agregar nuevo sorteo y guardar
                sorteos.push(sorteoData);
                fs.writeFileSync('sorteos.json', JSON.stringify(sorteos, null, 2));
                
                // Programar finalización del sorteo
                setTimeout(() => finalizarSorteo(sorteoData), duracion * 60 * 1000);
                
                await interaction.editReply(`✅ ¡Sorteo creado en ${canalDestino}!`);
            } catch (error) {
                console.error('Error al crear sorteo:', error);
                await interaction.editReply({ content: `❌ Ha ocurrido un error al crear el sorteo: ${error.message}`, ephemeral: true });
            }
        }
        if (commandName === 'ping') {
            await interaction.reply(`🏓 Pong! Latencia: ${client.ws.ping}ms`);
        }
        
        // Comando userinfo
        else if (commandName === 'userinfo') {
            const targetUser = options.getUser('usuario') || user;
            const targetMember = guild.members.cache.get(targetUser.id);
            
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle(`📋 Información de ${targetUser.username}`)
                .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
                .addFields(
                    { name: 'ID', value: targetUser.id, inline: true },
                    { name: 'Roles', value: targetMember.roles.cache.map(role => role.name).join(', '), inline: false },
                    { name: 'Fecha de ingreso', value: `<t:${Math.floor(targetMember.joinedTimestamp / 1000)}:D>`, inline: false }
                );
                
            await interaction.reply({ embeds: [embed] });
        }
        
        // Comando serverinfo
        else if (commandName === 'serverinfo') {
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle(`🌍 Información del servidor: ${guild.name}`)
                .setThumbnail(guild.iconURL({ dynamic: true }))
                .addFields(
                    { name: 'ID', value: guild.id, inline: true },
                    { name: 'Miembros', value: guild.memberCount.toString(), inline: true },
                    { name: 'Creado el', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:D>`, inline: false }
                );
                
            await interaction.reply({ embeds: [embed] });
        }
        
        // Comando nivel
        else if (commandName === 'nivel') {
            const targetUser = options.getUser('usuario') || user;
            
            if (!nivelesXP[targetUser.id]) {
                nivelesXP[targetUser.id] = { xp: 0, nivel: 1 };
            }
            
            // Calcular porcentaje de progreso hacia el siguiente nivel
            const xpNecesario = nivelesXP[targetUser.id].nivel * 100;
            const porcentaje = Math.floor((nivelesXP[targetUser.id].xp / xpNecesario) * 100);
            
            // Crear barra de progreso
            const longitud = 10;
            const barraLlena = Math.round((porcentaje / 100) * longitud);
            let barra = '';
            for (let i = 0; i < longitud; i++) {
                if (i < barraLlena) {
                    barra += '🟥'; // Parte llena de la barra (roja)
                } else {
                    barra += '⬜'; // Parte vacía de la barra
                }
            }
            
            const nivelEmbed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle(`📊 Estadísticas de Nivel`)
                .setDescription(`Información de nivel para ${targetUser}`)
                .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
                .addFields(
                    { name: '👤 Usuario', value: targetUser.tag, inline: true },
                    { name: '🔮 Nivel actual', value: nivelesXP[targetUser.id].nivel.toString(), inline: true },
                    { name: '✨ XP', value: `${nivelesXP[targetUser.id].xp}/${xpNecesario}`, inline: true },
                    { name: '📈 Progreso', value: `${barra} ${porcentaje}%`, inline: false }
                )
                .setFooter({ text: 'Sistema de niveles • Tentación', iconURL: guild.iconURL({ dynamic: true }) })
                .setTimestamp();
                
            await interaction.reply({ embeds: [nivelEmbed] });
        }
        
        // Comandos de interacción
        else if (commandName === 'abrazar') {
            const targetUser = options.getUser('usuario');
            
            const gifs = [
                'https://cdn.discordapp.com/attachments/1340275934770630729/1340276070846304306/86C65074-65D9-4ECD-8FE1-5D2A290B4FD7.gif?ex=67b1c4dc&is=67b0735c&hm=da378c912646f2097d1162aaf132e772b263ff11efa0ac958c2e9f7bacc146cd&',
                'https://cdn.discordapp.com/attachments/1340275934770630729/1340276881458593853/3F5041F4-DA6D-4061-85B4-DBF703041748.gif?ex=67b1c59d&is=67b0741d&hm=cee10fec16bbcef0a8bfbeb7acf449b26d613a33c140711a5ba3fa0fae3d7c9b&',
                'https://cdn.discordapp.com/attachments/1340275934770630729/1340276023538880575/52D4CDAF-7040-4536-9F1E-0B56216076C7.gif?ex=67b1c4d1&is=67b07351&hm=2b467234228c89224589d0bf5661b6f450f67ea0b15ac18df85dd7f4cc766b0c&',
                'https://cdn.discordapp.com/attachments/1340275934770630729/1340276008397574194/9747AAD4-2EA4-49FB-AF09-33BF3BE494C9.gif?ex=67b1c4cd&is=67b0734d&hm=0f77749bd775162db3a89896a74d3b9a1230c3c9141a6f78c0d1e5c6222952ad&',
                'https://cdn.discordapp.com/attachments/1340275934770630729/1340275984263544903/IMG_2263.gif?ex=67b1c4c7&is=67b07347&hm=7eb799978c1350df356f6664bc4ebaf6cc6f956a3055b98662b6d171520fbc67&',
                'https://cdn.discordapp.com/attachments/1340275934770630729/1340275976155955310/IMG_2264.gif?ex=67b1c4c5&is=67b07345&hm=80e60b2457416f576677cbf0b129106de1310687666b05467ccf77c3178ac4d7&',
                'https://cdn.discordapp.com/attachments/1340275934770630729/1340276043638112321/BBB8AC34-9D3C-4C44-8D58-6A914BB81DFE.gif?ex=67b1c4d5&is=67b07355&hm=e0a0708d0e2a52305752086078a943eff90c9aed0b4ac80564d264174f9b23be&',
                'https://cdn.discordapp.com/attachments/1340275934770630729/1340276876190679080/7DFFB740-6ECA-45AD-BBAE-29D7A9A7EE9B.gif?ex=67b1c59c&is=67b0741c&hm=1e3165b09b533c642d19d392842f2dcae72173439edf483a84c2deb35e2e9dde&',
                'https://cdn.discordapp.com/attachments/1340275934770630729/1340276869068750908/43672187-2BC0-410D-8893-8D7069C9268B.gif?ex=67b1c59a&is=67b0741a&hm=df2c69cf5b381d9965f6c32126c1d35d92b75d3c6a5cedd9e2b2e4bd903a5dae&',
            ];
            const randomGif = gifs[Math.floor(Math.random() * gifs.length)];

            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setDescription(`${user.username} abraza a ${targetUser.username} con mucho cariño.`)
                .setImage(randomGif);

            await interaction.reply({ embeds: [embed] });
        }
        
        else if (commandName === 'besar') {
            const targetUser = options.getUser('usuario');
            
            const gifs = [
                'https://cdn.discordapp.com/attachments/1340275934770630729/1340284890104463381/71A2D8EA-1F6F-498C-B4C8-9BC581BBB462.gif',
                'https://cdn.discordapp.com/attachments/1340275934770630729/1340284901542465557/5F86E041-6917-4BFB-BEFA-E71F7897BDBC.gif',
                'https://cdn.discordapp.com/attachments/1340275934770630729/1340284671610589255/89624C62-FA7E-4CB8-89C6-EB6F0C5F6DE9.gif',
                'https://cdn.discordapp.com/attachments/1340275934770630729/1340284653491195946/01BDFBD5-6240-4F9F-A428-36E53C9681C0.gif',
                'https://cdn.discordapp.com/attachments/1340275934770630729/1340284644909776907/7976ADA1-3A0D-4243-B17A-04281A5BB51C.gif',
                'https://cdn.discordapp.com/attachments/1340275934770630729/1340284639113379921/CFC3BBA5-62BD-45AB-AF10-C0E43EC6A253.gif',
                'https://cdn.discordapp.com/attachments/1340275934770630729/1340284632767270964/7C75DF1A-8E25-46FC-BFC9-A65DEE9D6B4A.gif'
            ];
            const randomGif = gifs[Math.floor(Math.random() * gifs.length)];

            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setDescription(`${user.username} besa a ${targetUser.username} con dulzura.`)
                .setImage(randomGif);

            await interaction.reply({ embeds: [embed] });
        }
        
        else if (commandName === 'golpear') {
            const targetUser = options.getUser('usuario');
            
            const gifs = [
                'https://cdn.discordapp.com/attachments/1340275934770630729/1340298159275905044/image.jpg?ex=67b3d3ae&is=67b2822e&hm=8fb81c906068e9ab7bc30a66f2d6d1f16a90a4e4e3d516103aa3b20f81c496b6&',
                'https://cdn.discordapp.com/attachments/1340275934770630729/1340298159498465350/image.jpg?ex=67b3d3ae&is=67b2822e&hm=c7917d40f11f516829411c6dbe28f2d186e48fdeebe557fb6f5c47a7ed38e01e&',
                'https://cdn.discordapp.com/attachments/1340275934770630729/1340298159838199808/image.jpg?ex=67b3d3ae&is=67b2822e&hm=1aaaccd5f1b20387dedb9be07cc8b7e6931a264c5a341b811277563e2b11fd22&',
                'https://cdn.discordapp.com/attachments/1340275934770630729/1340298160056045638/image.jpg?ex=67b3d3ae&is=67b2822e&hm=4ddc54bfc7750bc312cb8518a4fa5d272949e7e4df8ab7891ae44ab7e19d6d33&',
                'https://cdn.discordapp.com/attachments/1340275934770630729/1340298160312160256/image.jpg?ex=67b3d3ae&is=67b2822e&hm=2684e17a9ebcae8b58375f1d134a84c7634f1d589c030810e34ce9e40c4b9576&',
                'https://cdn.discordapp.com/attachments/1340275934770630729/1340298160312160256/image.jpg?ex=67b3d3ae&is=67b2822e&hm=2684e17a9ebcae8b58375f1d134a84c7634f1d589c030810e34ce9e40c4b9576&',
                'https://cdn.discordapp.com/attachments/1340275934770630729/1340298160794243163/image.jpg?ex=67b3d3af&is=67b2822f&hm=94df6fc5e2884537ba7ea76980be0df2fc5622be90fcac1f32ea5461304f252f&',
                'https://cdn.discordapp.com/attachments/1340275934770630729/1340298160794243163/image.jpg?ex=67b3d3af&is=67b2822f&hm=94df6fc5e2884537ba7ea76980be0df2fc5622be90fcac1f32ea5461304f252f&',
            ];
            const randomGif = gifs[Math.floor(Math.random() * gifs.length)];

            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setDescription(`${user.username} golpea a ${targetUser.username} con fuerza.`)
                .setImage(randomGif);

            await interaction.reply({ embeds: [embed] });
        }
        
        // Comando ship
        else if (commandName === 'ship') {
            const usuario1 = options.getUser('usuario1');
            const usuario2 = options.getUser('usuario2');
            
            // Generar un porcentaje de compatibilidad aleatorio
            const porcentaje = Math.floor(Math.random() * 101); // 0-100%
            
            // Determinar el color del embed basado en el porcentaje
            let color;
            let emoji;
            let descripcion;
            
            if (porcentaje < 30) {
                color = '#FF0000'; // Rojo
                emoji = '💔';
                descripcion = 'Hmm... no parece haber mucha química aquí.';
            } else if (porcentaje < 60) {
                color = '#FFA500'; // Naranja
                emoji = '❤️‍🔥';
                descripcion = '¡Hay potencial! Podrían intentarlo.';
            } else if (porcentaje < 80) {
                color = '#FFFF00'; // Amarillo
                emoji = '💞';
                descripcion = '¡Una buena pareja! Hay buena compatibilidad.';
            } else {
                color = '#FF00FF'; // Rosa
                emoji = '💘';
                descripcion = '¡Una pareja perfecta! ¡El amor está en el aire!';
            }
            
            // Crear un nombre de ship combinando los nombres de los usuarios
            const nombre1 = usuario1.username.slice(0, Math.ceil(usuario1.username.length / 2));
            const nombre2 = usuario2.username.slice(Math.floor(usuario2.username.length / 2));
            const shipName = nombre1 + nombre2;
            
            // Crear barra de compatibilidad
            const longitud = 10;
            const barraLlena = Math.round((porcentaje / 100) * longitud);
            let barra = '';
            for (let i = 0; i < longitud; i++) {
                if (i < barraLlena) {
                    barra += '❤️'; // Corazones para la parte llena
                } else {
                    barra += '🖤'; // Corazones negros para la parte vacía
                }
            }
            
            // Crear el embed
            const shipEmbed = new EmbedBuilder()
                .setColor(color)
                .setTitle(`${emoji} ¡SHIP! ${emoji}`)
                .setDescription(`¡Ship entre ${usuario1} y ${usuario2}!`)
                .addFields(
                    { name: '💕 Nombre de la pareja', value: `**${shipName}**`, inline: false },
                    { name: '💘 Compatibilidad', value: `${barra} ${porcentaje}%`, inline: false },
                    { name: '💌 Veredicto', value: descripcion, inline: false }
                )
                .setImage('https://cdn.nekotina.com/guilds/1327403077480874046/36a071e9-320c-4216-a7a1-a61e0786f793.jpg?quality=lossless')
                .setFooter({ text: 'Sistema de Ship • Tentación', iconURL: guild.iconURL({ dynamic: true }) })
                .setTimestamp();
                
            await interaction.reply({ embeds: [shipEmbed] });
        }
        
        // Comando clear (borrar mensajes)
        else if (commandName === 'clear') {
            if (!member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
                return interaction.reply({ content: '❌ No tienes permiso para borrar mensajes.', ephemeral: true });
            }
            
            // Verificar permisos del bot
            if (!guild.members.me.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
                return interaction.reply({ 
                    content: '❌ No tengo permiso para borrar mensajes. Pide al administrador que me otorgue el permiso "Gestionar Mensajes".', 
                    ephemeral: true 
                });
            }
            
            const cantidad = options.getInteger('cantidad');
            
            await interaction.deferReply({ ephemeral: true });
            
            try {
                const messages = await channel.bulkDelete(cantidad, true).catch(error => {
                    console.error('Error al borrar mensajes:', error);
                    
                    // Analizar el código de error específico
                    if (error.code === 50034) {
                        interaction.editReply({ 
                            content: '❌ No se pudieron borrar los mensajes porque son demasiado antiguos (más de 14 días).', 
                            ephemeral: true 
                        });
                    } else if (error.code === 50013) {
                        interaction.editReply({ 
                            content: '❌ No tengo los permisos necesarios para borrar mensajes en este canal.', 
                            ephemeral: true 
                        });
                    } else {
                        interaction.editReply({ 
                            content: `❌ Ocurrió un error al borrar los mensajes: ${error.message}`, 
                            ephemeral: true 
                        });
                    }
                    return null;
                });
                
                if (!messages) {
                    return; // Ya se envió un mensaje de error en el catch
                }
                
                // Verificar cuántos mensajes se borraron realmente
                if (messages.size === 0) {
                    return interaction.editReply({ 
                        content: '⚠ No se pudo borrar ningún mensaje. Posiblemente son demasiado antiguos (más de 14 días).', 
                        ephemeral: true 
                    });
                } else if (messages.size < cantidad) {
                    return interaction.editReply({ 
                        content: `⚠ Solo se pudieron borrar ${messages.size} mensajes. Los demás posiblemente son demasiado antiguos (más de 14 días).`, 
                        ephemeral: true 
                    });
                }
                
                return interaction.editReply({ 
                    content: `✅ Se eliminaron ${messages.size} mensajes.`, 
                    ephemeral: true 
                });
            } catch (error) {
                console.error('Error crítico al borrar mensajes:', error);
                return interaction.editReply({ 
                    content: '❌ Ocurrió un error inesperado al intentar borrar mensajes.', 
                    ephemeral: true 
                });
            }
        }
        
        // Comando kick (expulsar)
        else if (commandName === 'kick') {
            if (!member.permissions.has(PermissionsBitField.Flags.KickMembers)) {
                return interaction.reply({ content: '❌ No tienes permiso para expulsar usuarios.', ephemeral: true });
            }
            
            const targetUser = options.getUser('usuario');
            const targetMember = guild.members.cache.get(targetUser.id);
            const razon = options.getString('razon') || 'No se proporcionó una razón';
            
            if (!targetMember) {
                return interaction.reply({ content: '❌ No se encontró al usuario en el servidor.', ephemeral: true });
            }
            
            if (!targetMember.kickable) {
                return interaction.reply({ content: '❌ No puedo expulsar a este usuario. Puede que tenga un rol más alto que el mío.', ephemeral: true });
            }
            
            await targetMember.kick(razon);
            
            return interaction.reply({ content: `✅ ${targetUser.tag} ha sido expulsado. Razón: ${razon}` });
        }
        
        // Comando ban (banear)
        else if (commandName === 'ban') {
            if (!member.permissions.has(PermissionsBitField.Flags.BanMembers)) {
                return interaction.reply({ content: '❌ No tienes permiso para banear usuarios.', ephemeral: true });
            }
            
            const targetUser = options.getUser('usuario');
            const targetMember = guild.members.cache.get(targetUser.id);
            const razon = options.getString('razon') || 'No se proporcionó una razón';
            
            if (targetMember && !targetMember.bannable) {
                return interaction.reply({ content: '❌ No puedo banear a este usuario. Puede que tenga un rol más alto que el mío.', ephemeral: true });
            }
            
            await guild.members.ban(targetUser, { reason: razon });
            
            return interaction.reply({ content: `✅ ${targetUser.tag} ha sido baneado. Razón: ${razon}` });
        }
        
        // Comando mute (silenciar)
        else if (commandName === 'mute') {
            if (!member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
                return interaction.reply({ content: '❌ No tienes permiso para silenciar usuarios.', ephemeral: true });
            }
            
            const targetUser = options.getUser('usuario');
            const targetMember = guild.members.cache.get(targetUser.id);
            const tiempo = options.getString('tiempo');
            
            if (!targetMember) {
                return interaction.reply({ content: '❌ No se encontró al usuario en el servidor.', ephemeral: true });
            }
            
            if (targetMember.permissions.has(PermissionsBitField.Flags.Administrator)) {
                return interaction.reply({ content: '❌ No puedes silenciar a un administrador.', ephemeral: true });
            }
            
            // Procesamiento del tiempo
            const tiempoNum = parseInt(tiempo.replace(/\D/g, ''));
            const unidad = tiempo.replace(/\d/g, '');
            
            if (isNaN(tiempoNum)) {
                return interaction.reply({ content: '❌ Tiempo inválido. Usa formato como "10m", "1h", etc.', ephemeral: true });
            }
            
            let tiempoMS = 0;
            if (unidad.includes('s')) tiempoMS = tiempoNum * 1000; // Segundos
            if (unidad.includes('m')) tiempoMS = tiempoNum * 60 * 1000; // Minutos
            if (unidad.includes('h')) tiempoMS = tiempoNum * 60 * 60 * 1000; // Horas
            if (unidad.includes('d')) tiempoMS = tiempoNum * 24 * 60 * 60 * 1000; // Días
            
            // Usar 10 minutos por defecto si no se especifica unidad
            if (tiempoMS === 0) tiempoMS = tiempoNum * 60 * 1000;
            
            try {
                await targetMember.timeout(tiempoMS, 'Silenciado por comando');
                return interaction.reply({ content: `✅ ${targetUser.tag} ha sido silenciado por ${tiempo}.` });
            } catch (error) {
                console.error(error);
                return interaction.reply({ content: '❌ Hubo un error al silenciar al usuario.', ephemeral: true });
            }
        }
        
        // Comando unmute (quitar silencio)
        else if (commandName === 'unmute') {
            if (!member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
                return interaction.reply({ content: '❌ No tienes permiso para quitar el silencio a usuarios.', ephemeral: true });
            }
            
            const targetUser = options.getUser('usuario');
            const targetMember = guild.members.cache.get(targetUser.id);
            
            if (!targetMember) {
                return interaction.reply({ content: '❌ No se encontró al usuario en el servidor.', ephemeral: true });
            }
            
            if (!targetMember.communicationDisabledUntil) {
                return interaction.reply({ content: '⚠ Este usuario no está silenciado.', ephemeral: true });
            }
            
            try {
                await targetMember.timeout(null);
                return interaction.reply({ content: `✅ Se ha quitado el silencio a ${targetUser.tag}.` });
            } catch (error) {
                console.error(error);
                return interaction.reply({ content: '❌ Hubo un error al quitar el silencio al usuario.', ephemeral: true });
            }
        }
        
        // Comando dados
        else if (commandName === 'dados') {
            const dado = Math.floor(Math.random() * 6) + 1;
            await interaction.reply(`🎲 Has lanzado un dado y salió: **${dado}**`);
        }
        
        // Comando 8ball
        else if (commandName === '8ball') {
            const pregunta = options.getString('pregunta');
            const respuestas = [
                'Sí', 'No', 'Tal vez', 'Definitivamente', 'No cuentes con ello', 'Pregunta de nuevo más tarde',
                'Sin duda', 'Mis fuentes dicen que no', 'Las perspectivas no son buenas', 'Es cierto',
                'No puedo predecirlo ahora', 'Muy dudoso', 'Las señales apuntan a que sí', 'Concéntrate y pregunta de nuevo'
            ];
            const respuesta = respuestas[Math.floor(Math.random() * respuestas.length)];
            
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('🎱 La bola mágica ha hablado')
                .addFields(
                    { name: '📝 Pregunta', value: pregunta, inline: false },
                    { name: '🔮 Respuesta', value: respuesta, inline: false }
                )
                .setFooter({ text: `Preguntado por ${user.tag}`, iconURL: user.displayAvatarURL({ dynamic: true }) });
                
            await interaction.reply({ embeds: [embed] });
        }
        
        // Comando cumpleaños
        else if (commandName === 'cumpleanos') {
            const accion = options.getString('accion') || 'ver';
            
            // Si la acción es "ver", mostrar el cumpleaños actual
            if (accion === 'ver') {
                const fechaActual = cumpleaños[user.id];
                if (fechaActual) {
                    // Convertir de formato DD-MM a una fecha legible
                    const [dia, mes] = fechaActual.split('-');
                    const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
                    const fechaLegible = `${dia} de ${meses[parseInt(mes) - 1]}`;
                    
                    const embed = new EmbedBuilder()
                        .setColor('#FFD700')
                        .setTitle('🎂 Tu Cumpleaños')
                        .setDescription(`Tu cumpleaños está registrado para el **${fechaLegible}**`)
                        .setThumbnail(user.displayAvatarURL({ dynamic: true }))
                        .setFooter({ text: 'Usa /cumpleanos accion:registrar fecha:DD-MM para actualizarlo' });
                        
                    return interaction.reply({ embeds: [embed] });
                } else {
                    return interaction.reply({ 
                        content: '⚠ No tienes un cumpleaños registrado. Usa `/cumpleanos accion:registrar fecha:DD-MM` para registrarlo',
                        ephemeral: true 
                    });
                }
            }
            
            // Si la acción es "registrar", procesar el registro
            const fecha = options.getString('fecha');
            
            if (!fecha) {
                return interaction.reply({ 
                    content: '⚠ Debes proporcionar una fecha en formato DD-MM (Ejemplo: 25-12)', 
                    ephemeral: true 
                });
            }
            
            if (!/^\d{2}-\d{2}$/.test(fecha)) {
                return interaction.reply({ 
                    content: '⚠ El formato debe ser DD-MM (Ejemplo: 25-12)', 
                    ephemeral: true 
                });
            }
            
            const [dia, mes] = fecha.split('-').map(Number);
            
            // Validar fecha
            if (mes < 1 || mes > 12) {
                return interaction.reply({ 
                    content: '⚠ El mes debe estar entre 01 y 12', 
                    ephemeral: true 
                });
            }
            
            // Verificar días válidos según el mes
            const diasPorMes = [0, 31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]; // Febrero con 29 para años bisiestos
            if (dia < 1 || dia > diasPorMes[mes]) {
                return interaction.reply({ 
                    content: `⚠ El mes ${mes} tiene máximo ${diasPorMes[mes]} días`, 
                    ephemeral: true 
                });
            }
            
            // Guardar en la base de datos
            const actualizando = cumpleaños[user.id] ? true : false;
            cumpleaños[user.id] = fecha;
            fs.writeFileSync('cumpleaños.json', JSON.stringify(cumpleaños, null, 2));
            
            // Convertir a formato legible
            const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
            const fechaLegible = `${dia} de ${meses[mes - 1]}`;
            
            // Crear un embed atractivo para confirmar
            const embed = new EmbedBuilder()
                .setColor('#FFD700')
                .setTitle(actualizando ? '🎂 Cumpleaños Actualizado' : '🎂 Cumpleaños Registrado')
                .setDescription(`${actualizando ? 'Tu cumpleaños ha sido actualizado' : 'Tu cumpleaños ha sido registrado'} para el **${fechaLegible}**`)
                .setThumbnail(user.displayAvatarURL({ dynamic: true }))
                .setFooter({ text: 'En tu día especial recibirás una felicitación automática' });
                
            return interaction.reply({ embeds: [embed] });
        }
        
        // Comando invitaciones
        else if (commandName === 'invitaciones') {
            const targetUser = options.getUser('usuario') || user;
            const count = inviteTracker.get(targetUser.id) || 0;

            const embed = new EmbedBuilder()
                .setTitle('📊 Estadísticas de Invitaciones')
                .setColor('#FF0000')
                .setDescription(`**${targetUser.tag}** ha invitado a **${count}** personas.`)
                .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
                .setFooter({ text: 'Sistema de Invitaciones' });

            await interaction.reply({ embeds: [embed] });
        }
        
        // Comando topinvitaciones
        else if (commandName === 'topinvitaciones') {
            if (inviteTracker.size === 0) {
                return interaction.reply('📉 Nadie ha invitado a nadie aún.');
            }

            // Ordenar el ranking
            const topInvites = [...inviteTracker.entries()]
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10); // Mostrar el top 10

            const embed = new EmbedBuilder()
                .setTitle('🏆 Top Invitaciones')
                .setColor('#FF0000')
                .setDescription(
                    topInvites.map((entry, index) => `**${index + 1}.** <@${entry[0]}> → **${entry[1]}** invitaciones.`).join('\n')
                )
                .setFooter({ text: 'Sistema de invitaciones' });

            await interaction.reply({ embeds: [embed] });
        }
        
        // Comandos de configuración (admin)
        else if (commandName === 'setlogs') {
            if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
                return interaction.reply({ content: '❌ No tienes permiso para configurar el canal de logs.', ephemeral: true });
            }
            
            const canal = options.getChannel('canal');
            updateServerConfig(guild.id, 'canalLogs', canal.id);
            
            return interaction.reply(`✅ Canal de logs establecido en ${canal}.`);
        }
        
        else if (commandName === 'setbienvenida') {
            if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
                return interaction.reply({ content: '❌ No tienes permiso para configurar el canal de bienvenida.', ephemeral: true });
            }
            
            const canal = options.getChannel('canal');
            updateServerConfig(guild.id, 'canalBienvenida', canal.id);
            
            return interaction.reply(`✅ Canal de bienvenida establecido en ${canal}.`);
        }
        
        else if (commandName === 'setdespedida') {
            if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
                return interaction.reply({ content: '❌ No tienes permiso para configurar el canal de despedida.', ephemeral: true });
            }
            
            const canal = options.getChannel('canal');
            updateServerConfig(guild.id, 'canalDespedida', canal.id);
            
            return interaction.reply(`✅ Canal de despedida establecido en ${canal}.`);
        }
        
        else if (commandName === 'setbuzonentrada') {
            if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
                return interaction.reply({ content: '❌ No tienes permiso para configurar el buzón.', ephemeral: true });
            }
            
            const canal = options.getChannel('canal');
            updateServerConfig(guild.id, 'canalBuzonEntrada', canal.id);
            
            const buzonInfo = buzonConfig.get(guild.id);
            if (buzonInfo && buzonInfo.destino) {
                return interaction.reply(`✅ Canal de entrada de buzón establecido en ${canal}. Los mensajes enviados a este canal serán enviados automáticamente al canal de destino y luego eliminados.`);
            } else {
                return interaction.reply(`✅ Canal de entrada de buzón establecido en ${canal}. Ahora configura el canal de destino con \`/setbuzondestino\`.`);
            }
        }
        
        else if (commandName === 'setbuzondestino') {
            if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
                return interaction.reply({ content: '❌ No tienes permiso para configurar el buzón.', ephemeral: true });
            }
            
            const canal = options.getChannel('canal');
            updateServerConfig(guild.id, 'canalBuzon', canal.id);
            
            const buzonInfo = buzonConfig.get(guild.id);
            if (buzonInfo && buzonInfo.canalEntrada) {
                const canalEntrada = guild.channels.cache.get(buzonInfo.canalEntrada);
                return interaction.reply(`✅ Canal de destino de buzón establecido en ${canal}. Los mensajes enviados a ${canalEntrada} serán enviados aquí y luego eliminados.`);
            } else {
                return interaction.reply(`✅ Canal de destino de buzón establecido en ${canal}. Ahora configura el canal de entrada con \`/setbuzonentrada\`.`);
            }
        }
        
        else if (commandName === 'infobuzon') {
            if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
                return interaction.reply({ content: '❌ No tienes permiso para ver la configuración del buzón.', ephemeral: true });
            }
            
            const buzonInfo = buzonConfig.get(guild.id);
            
            if (!buzonInfo || (!buzonInfo.destino && !buzonInfo.canalEntrada)) {
                return interaction.reply({ content: '⚠ No hay configuración de buzón para este servidor. Usa `/setbuzonentrada` y `/setbuzondestino` para configurarlo.', ephemeral: true });
            }
            
            const canalEntrada = buzonInfo.canalEntrada ? guild.channels.cache.get(buzonInfo.canalEntrada) : null;
            const canalDestino = buzonInfo.destino ? guild.channels.cache.get(buzonInfo.destino) : null;
            
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('📫 Configuración del Buzón')
                .setDescription('Información sobre la configuración actual del buzón en este servidor')
                .addFields(
                    { name: '📥 Canal de entrada', value: canalEntrada ? `${canalEntrada}` : 'No configurado', inline: true },
                    { name: '📤 Canal de destino', value: canalDestino ? `${canalDestino}` : 'No configurado', inline: true },
                    { name: '📊 Estado', value: buzonInfo.activo ? '✅ Activo' : '❌ Inactivo (faltan canales)', inline: true },
                    { name: '💡 ¿Cómo funciona?', value: 'Los mensajes enviados al canal de entrada serán enviados automáticamente al canal de destino y luego borrados del canal original.', inline: false }
                )
                .setFooter({ text: 'Sistema de Buzón • Tentación', iconURL: guild.iconURL({ dynamic: true }) })
                .setTimestamp();
                
            return interaction.reply({ embeds: [embed] });
        }
        
        else if (commandName === 'setniveles') {
            if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
                return interaction.reply({ content: '❌ No tienes permiso para configurar el canal de niveles.', ephemeral: true });
            }
            
            const canal = options.getChannel('canal');
            updateServerConfig(guild.id, 'canalNiveles', canal.id);
            
            return interaction.reply(`✅ Canal de notificaciones de nivel establecido en ${canal}.`);
        }
        
        else if (commandName === 'setinvitaciones') {
            if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
                return interaction.reply({ content: '❌ No tienes permiso para configurar el canal de invitaciones.', ephemeral: true });
            }
            
            const canal = options.getChannel('canal');
            updateServerConfig(guild.id, 'canalInvitaciones', canal.id);
            guardarInvitaciones();
            
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('✅ Canal de Invitaciones Configurado')
                .setDescription(`El canal ${canal} ha sido configurado para recibir notificaciones de invitaciones.`)
                .addFields({ 
                    name: '🛠️ Funcionalidad', 
                    value: 'En este canal se notificará cuando nuevos miembros se unan al servidor mediante invitaciones.' 
                })
                .setFooter({ text: 'Sistema de invitaciones • Tentación', iconURL: guild.iconURL({ dynamic: true }) })
                .setTimestamp();
                
            return interaction.reply({ embeds: [embed] });
        }
        
        // Comando embed
        else if (commandName === 'embed') {
            if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
                return interaction.reply({ content: '❌ No tienes permiso para crear embeds.', ephemeral: true });
            }
            
            const titulo = options.getString('titulo');
            const descripcion = options.getString('descripcion');
            const imagen = options.getString('imagen');
            const canal = options.getChannel('canal');
            const colorHex = options.getString('color') || '#FF0000';
            const textoNormal = options.getString('texto') || '';
            const thumbnailURL = options.getString('thumbnail') || '';
            
            // Validar el color hexadecimal
            const colorRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
            const color = colorHex && colorRegex.test(colorHex) ? colorHex : '#FF0000';
            
            const embed = new EmbedBuilder()
                .setColor(color)
                .setTitle(titulo)
                .setDescription(descripcion)
                .setFooter({ text: 'Creado por la administración • Tentación', iconURL: guild.iconURL({ dynamic: true }) })
                .setTimestamp();
                
            // Agregar imagen principal si se proporciona
            if (imagen && imagen.startsWith('http')) {
                embed.setImage(imagen);
            }
            
            // Agregar thumbnail (imagen pequeña) si se proporciona
            if (thumbnailURL && thumbnailURL.startsWith('http')) {
                embed.setThumbnail(thumbnailURL);
            }
            
            // Preparar el mensaje con el texto normal (si existe) y el embed
            const messageOptions = {
                content: textoNormal || null,
                embeds: [embed]
            };
            
            // Verificar los permisos en el canal destino
            const canalDestino = canal || channel;
            const permisos = canalDestino.permissionsFor(guild.members.me);
            if (!permisos || !permisos.has('SendMessages') || !permisos.has('EmbedLinks')) {
                return interaction.reply({ 
                    content: `❌ No tengo permisos para enviar mensajes con embeds en ${canalDestino}. Necesito los permisos "Enviar Mensajes" y "Insertar Enlaces".`,
                    ephemeral: true
                });
            }
            
            // Mostrar una vista previa al usuario
            await interaction.reply({ 
                content: '📝 **Vista previa del embed**:', 
                ephemeral: true 
            });
            
            // Enviar vista previa con botones de confirmación
            const previewEmbed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('📋 Información del embed')
                .setDescription('Así se verá tu embed:')
                .addFields(
                    { name: '📍 Canal destino', value: canal ? `${canal.toString()}` : 'Canal actual', inline: true },
                    { name: '🎨 Color', value: color, inline: true },
                    { name: '📝 Texto normal', value: textoNormal ? '✅ Incluido' : '❌ No incluido', inline: true },
                    { name: '🖼️ Imagen principal', value: imagen ? '✅ Incluida' : '❌ No incluida', inline: true },
                    { name: '🖼️ Thumbnail', value: thumbnailURL ? '✅ Incluido' : '❌ No incluido', inline: true }
                );
                
            // Enviar vista previa
            await interaction.followUp({
                content: textoNormal || null,
                embeds: [embed, previewEmbed],
                ephemeral: true,
                components: [
                    {
                        type: 1, // ActionRow
                        components: [
                            {
                                type: 2, // Button
                                style: 3, // Success (green)
                                label: '✅ Enviar',
                                custom_id: 'send_embed'
                            },
                            {
                                type: 2, // Button
                                style: 4, // Danger (red)
                                label: '❌ Cancelar',
                                custom_id: 'cancel_embed'
                            }
                        ]
                    }
                ]
            });
            
            // Configurar colector de botones
            const filter = i => 
                (i.customId === 'send_embed' || i.customId === 'cancel_embed') && 
                i.user.id === interaction.user.id;
                
            // Esperar interacción por 60 segundos
            try {
                const buttonInteraction = await interaction.channel.awaitMessageComponent({ 
                    filter, 
                    time: 60000 
                });
                
                if (buttonInteraction.customId === 'send_embed') {
                    try {
                        if (canal) {
                            await canal.send(messageOptions);
                            await buttonInteraction.update({ 
                                content: `✅ Embed enviado al canal ${canal}.`, 
                                embeds: [], 
                                components: [] 
                            });
                        } else {
                            await channel.send(messageOptions);
                            await buttonInteraction.update({ 
                                content: '✅ Embed enviado a este canal.', 
                                embeds: [], 
                                components: [] 
                            });
                        }
                    } catch (error) {
                        console.error('Error al enviar embed:', error);
                        await buttonInteraction.update({ 
                            content: `❌ No pude enviar el embed. Error: ${error.message}`, 
                            embeds: [], 
                            components: [] 
                        });
                    }
                } else {
                    await buttonInteraction.update({ 
                        content: '❌ Envío de embed cancelado.', 
                        embeds: [], 
                        components: [] 
                    });
                }
            } catch (error) {
                console.error('Error en colector de botones:', error);
                // Tiempo de espera agotado
                try {
                    await interaction.editReply({ 
                        content: '⏳ Tiempo de espera agotado. El embed no ha sido enviado.', 
                        embeds: [], 
                        components: [] 
                    });
                } catch (e) {
                    console.error('Error al editar respuesta:', e);
                }
            }
        }
        
        // Comando invitarbot
        else if (commandName === 'invitarbot') {
            // Comprobar si el usuario tiene permisos de administrador
            if (!member.permissions.has(PermissionsBitField.Flags.Administrator) && 
                user.id !== process.env.OWNER_ID) {
                return interaction.reply({ 
                    content: '❌ Necesitas permisos de administrador para usar este comando.', 
                    ephemeral: true 
                });
            }
            
            const inviteLinkDetallado = `https://discord.com/api/oauth2/authorize?client_id=${client.user.id}&permissions=1099511627775&scope=bot%20applications.commands`;
            const inviteLinkBasico = `https://discord.com/oauth2/authorize?client_id=${client.user.id}&permissions=1074121728&scope=bot%20applications.commands`;
            
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('🔗 Invita a Tentación Bot a tu servidor')
                .setDescription('Puedes invitar a Tentación Bot a tu servidor usando los siguientes enlaces:')
                .addFields(
                    { name: '🛡️ Con todos los permisos (recomendado)', value: `[Click aquí para invitar](${inviteLinkDetallado})`, inline: false },
                    { name: '🔒 Con permisos básicos', value: `[Click aquí para invitar](${inviteLinkBasico})`, inline: false }
                )
                .setFooter({ text: 'Tentación Bot • Sistema de invitación', iconURL: client.user.displayAvatarURL() })
                .setThumbnail(client.user.displayAvatarURL({ dynamic: true }))
                .setTimestamp();
                
            await interaction.reply({ embeds: [embed] });
        }
        
        // Configurar mensaje de bienvenida
        else if (commandName === 'setmensajebienvenida') {
            // Verificar permisos de administrador
            if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
                return interaction.reply({ content: '❌ No tienes permiso para configurar el mensaje de bienvenida.', ephemeral: true });
            }
            
            const titulo = options.getString('titulo');
            const descripcion = options.getString('descripcion');
            const color = options.getString('color') || '#FF0000';
            const imagen = options.getString('imagen') || mensajesDefault.bienvenida.imagen;
            
            // Verificar que {mencion} esté en la descripción
            if (!descripcion.includes('{mencion}')) {
                return interaction.reply({ 
                    content: '⚠ El mensaje de bienvenida debe incluir la variable `{mencion}` para mencionar al usuario que se une.',
                    ephemeral: true
                });
            }
            
            // Guardar mensaje personalizado
            mensajesPersonalizados.bienvenida.set(guild.id, {
                titulo,
                descripcion,
                color,
                imagen
            });
            
            guardarMensajesPersonalizados();
            
            // Mostrar vista previa
            const embedPreview = new EmbedBuilder()
                .setColor(color)
                .setTitle(titulo.replace(/{username}/g, user.username).replace(/{servername}/g, guild.name))
                .setDescription(descripcion
                    .replace(/{username}/g, user.username)
                    .replace(/{mencion}/g, `${user}`)
                    .replace(/{servername}/g, guild.name))
                .setThumbnail(user.displayAvatarURL({ dynamic: true }))
                .setImage(imagen);
                
            await interaction.reply({
                content: '✅ Mensaje de bienvenida personalizado guardado. Así se verá:',
                embeds: [embedPreview]
            });
        }
        
        // Configurar mensaje de despedida
        else if (commandName === 'setmensajedespedida') {
            // Verificar permisos de administrador
            if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
                return interaction.reply({ content: '❌ No tienes permiso para configurar el mensaje de despedida.', ephemeral: true });
            }
            
            const titulo = options.getString('titulo');
            const descripcion = options.getString('descripcion');
            const color = options.getString('color') || '#FF0000';
            const imagen = options.getString('imagen') || mensajesDefault.despedida.imagen;
            
            // Verificar que {username} esté en la descripción o título
            if (!descripcion.includes('{username}') && !titulo.includes('{username}')) {
                return interaction.reply({ 
                    content: '⚠ El mensaje de despedida debe incluir la variable `{username}` para mencionar al usuario que se va, ya sea en el título o la descripción.',
                    ephemeral: true
                });
            }
            
            // Guardar mensaje personalizado
            mensajesPersonalizados.despedida.set(guild.id, {
                titulo,
                descripcion,
                color,
                imagen
            });
            
            guardarMensajesPersonalizados();
            
            // Mostrar vista previa
            const embedPreview = new EmbedBuilder()
                .setColor(color)
                .setTitle(titulo.replace(/{username}/g, user.username).replace(/{servername}/g, guild.name))
                .setDescription(descripcion
                    .replace(/{username}/g, user.username)
                    .replace(/{servername}/g, guild.name))
                .setThumbnail(user.displayAvatarURL({ dynamic: true }))
                .setImage(imagen);
                
            await interaction.reply({
                content: '✅ Mensaje de despedida personalizado guardado. Así se verá:',
                embeds: [embedPreview]
            });
        }
        
        // Ver mensaje de bienvenida actual
        else if (commandName === 'vermensajesbienvenida') {
            // Verificar si existe un mensaje personalizado para este servidor
            const mensajePersonalizado = mensajesPersonalizados.bienvenida.get(guild.id);
            
            if (!mensajePersonalizado) {
                // Mostrar mensaje por defecto
                const embedDefault = new EmbedBuilder()
                    .setColor(mensajesDefault.bienvenida.color)
                    .setTitle(mensajesDefault.bienvenida.titulo.replace(/{username}/g, user.username))
                    .setDescription(mensajesDefault.bienvenida.descripcion
                        .replace(/{username}/g, user.username)
                        .replace(/{mencion}/g, `${user}`)
                        .replace(/{servername}/g, guild.name))
                    .setThumbnail(user.displayAvatarURL({ dynamic: true }))
                    .setImage(mensajesDefault.bienvenida.imagen)
                    .setFooter({ text: 'Este es el mensaje de bienvenida por defecto. Usa /setmensajebienvenida para personalizarlo.' });
                    
                await interaction.reply({
                    embeds: [embedDefault]
                });
            } else {
                // Mostrar mensaje personalizado
                const embed = new EmbedBuilder()
                    .setColor(mensajePersonalizado.color)
                    .setTitle(mensajePersonalizado.titulo
                        .replace(/{username}/g, user.username)
                        .replace(/{servername}/g, guild.name))
                    .setDescription(mensajePersonalizado.descripcion
                        .replace(/{username}/g, user.username)
                        .replace(/{mencion}/g, `${user}`)
                        .replace(/{servername}/g, guild.name))
                    .setThumbnail(user.displayAvatarURL({ dynamic: true }))
                    .setImage(mensajePersonalizado.imagen)
                    .setFooter({ text: 'Este es el mensaje de bienvenida personalizado de este servidor.' });
                    
                await interaction.reply({
                    embeds: [embed]
                });
            }
        }
        
        // Ver mensaje de despedida actual
        else if (commandName === 'vermensajesdespedida') {
            // Verificar si existe un mensaje personalizado para este servidor
            const mensajePersonalizado = mensajesPersonalizados.despedida.get(guild.id);
            
            if (!mensajePersonalizado) {
                // Mostrar mensaje por defecto
                const embedDefault = new EmbedBuilder()
                    .setColor(mensajesDefault.despedida.color)
                    .setTitle(mensajesDefault.despedida.titulo.replace(/{username}/g, user.username))
                    .setDescription(mensajesDefault.despedida.descripcion
                        .replace(/{username}/g, user.username)
                        .replace(/{servername}/g, guild.name))
                    .setThumbnail(user.displayAvatarURL({ dynamic: true }))
                    .setImage(mensajesDefault.despedida.imagen)
                    .setFooter({ text: 'Este es el mensaje de despedida por defecto. Usa /setmensajedespedida para personalizarlo.' });
                    
                await interaction.reply({
                    embeds: [embedDefault]
                });
            } else {
                // Mostrar mensaje personalizado
                const embed = new EmbedBuilder()
                    .setColor(mensajePersonalizado.color)
                    .setTitle(mensajePersonalizado.titulo
                        .replace(/{username}/g, user.username)
                        .replace(/{servername}/g, guild.name))
                    .setDescription(mensajePersonalizado.descripcion
                        .replace(/{username}/g, user.username)
                        .replace(/{servername}/g, guild.name))
                    .setThumbnail(user.displayAvatarURL({ dynamic: true }))
                    .setImage(mensajePersonalizado.imagen)
                    .setFooter({ text: 'Este es el mensaje de despedida personalizado de este servidor.' });
                    
                await interaction.reply({
                    embeds: [embed]
                });
            }
        }
        
        // Restablecer mensaje de bienvenida
        else if (commandName === 'resetmensajebienvenida') {
            // Verificar permisos de administrador
            if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
                return interaction.reply({ content: '❌ No tienes permiso para resetear el mensaje de bienvenida.', ephemeral: true });
            }
            
            // Eliminar mensaje personalizado
            mensajesPersonalizados.bienvenida.delete(guild.id);
            guardarMensajesPersonalizados();
            
            await interaction.reply('✅ Mensaje de bienvenida restablecido al predeterminado.');
        }
        
        // Restablecer mensaje de despedida
        else if (commandName === 'resetmensajedespedida') {
            // Verificar permisos de administrador
            if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
                return interaction.reply({ content: '❌ No tienes permiso para resetear el mensaje de despedida.', ephemeral: true });
            }
            
            // Eliminar mensaje personalizado
            mensajesPersonalizados.despedida.delete(guild.id);
            guardarMensajesPersonalizados();
            
            await interaction.reply('✅ Mensaje de despedida restablecido al predeterminado.');
        }
        
        // Comando de ayuda
        else if (commandName === 'help') {
            try {
                await interaction.deferReply(); // Usar deferReply para asegurar que tenemos tiempo de generar los embeds
                
                const isAdmin = member.permissions.has(PermissionsBitField.Flags.Administrator);
                const comando = options.getString('comando');
                const categoria = options.getString('categoria');
                
                // Crear embeds más pequeños para evitar sobrepasar límites
                // Embeds para comandos de administrador (dividido en partes)
                const embedAdminPart1 = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('⚙️ Comandos de Administrador (Parte 1)')
                    .setDescription('Comandos de configuración del servidor')
                    .addFields(
                        { name: '⚙️ **Configuración Básica**', value: 
                            '`/setlogs canal:` - Configura el canal de logs\n' +
                            '`/setbienvenida canal:` - Configura el canal de bienvenida\n' +
                            '`/setdespedida canal:` - Configura el canal de despedida\n' +
                            '`/setniveles canal:` - Configura el canal de notificaciones de nivel\n' +
                            '`/setinvitaciones canal:` - Configura el canal para invitaciones', 
                        inline: false },
                        
                        { name: '📫 **Sistema de Buzón**', value: 
                            '`/setbuzonentrada canal:` - Configura el canal de entrada\n' +
                            '`/setbuzondestino canal:` - Configura el canal de destino\n' +
                            '`/infobuzon` - Muestra la configuración del buzón',
                        inline: false }
                    )
                    .setThumbnail(client.user.displayAvatarURL({ dynamic: true }))
                    .setFooter({ text: 'Usa /help categoria: todos para ver los comandos para todos' });

                const embedAdminPart2 = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('⚙️ Comandos de Administrador (Parte 2)')
                    .setDescription('Comandos de moderación')
                    .addFields(
                        { name: '🔨 **Moderación**', value: 
                            '`/clear cantidad:` - Borra mensajes\n' +
                            '`/kick usuario:` - Expulsa a un usuario\n' +
                            '`/ban usuario:` - Banea a un usuario\n' +
                            '`/mute usuario: tiempo:` - Silencia a un usuario\n' +
                            '`/unmute usuario:` - Quita el silencio a un usuario',
                        inline: false },
                        
                        { name: '📢 **Mensajes y Anuncios**', value: 
                            '`/decir canal: mensaje:` - Envía un mensaje a un canal\n' +
                            '`/embed` - Crea un embed personalizado\n' +
                            '`/encuesta` - Crea una encuesta\n' +
                            '`/invitarbot` - Genera un enlace para invitar al bot', 
                        inline: false }
                    )
                    .setFooter({ text: 'Página 2/3 - Usa /help categoria: todos para ver los comandos para todos' });

                const embedAdminPart3 = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('⚙️ Comandos de Administrador (Parte 3)')
                    .setDescription('Comandos de personalización y cumpleaños')
                    .addFields(
                        { name: '🎂 **Cumpleaños**', value: 
                            '`/configcumpleanos` - Configura mensajes de cumpleaños\n' +
                            '`/verificarcumpleanos` - Verifica cumpleaños manualmente\n' +
                            '`/listarcumpleanos` - Muestra todos los cumpleaños', 
                        inline: false },
                        
                        { name: '📝 **Personalización**', value: 
                            '`/setmensajebienvenida` - Personaliza mensaje de bienvenida\n' +
                            '`/setmensajedespedida` - Personaliza mensaje de despedida\n' +
                            '`/vermensajesbienvenida` - Ver mensaje de bienvenida\n' +
                            '`/vermensajesdespedida` - Ver mensaje de despedida\n' +
                            '`/resetmensajebienvenida` - Restablecer mensaje de bienvenida\n' +
                            '`/resetmensajedespedida` - Restablecer mensaje de despedida',
                        inline: false }
                    )
                    .setFooter({ text: 'Página 3/3 - Usa /help categoria: todos para ver los comandos para todos' });

                // Embed para comandos para todos los usuarios
                const embedTodos = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('🌟 Comandos para Todos')
                    .setDescription('Estos comandos están disponibles para todos los usuarios')
                    .addFields(
                        { name: '🎉 **Interacciones**', value: 
                            '`/abrazar usuario:` - Abraza a alguien\n' +
                            '`/besar usuario:` - Besa a alguien\n' +
                            '`/golpear usuario:` - Golpea a alguien\n' +
                            '`/patear usuario:` - Patea a alguien\n' +
                            '`/acariciar usuario:` - Acaricia a alguien\n' +
                            '`/morder usuario:` - Muerde a alguien\n' +
                            '`/darlamano usuario:` - Da la mano a alguien',
                        inline: false },
                        
                        { name: '🔍 **Información**', value: 
                            '`/userinfo usuario:` - Información de usuario\n' +
                            '`/serverinfo` - Información del servidor\n' +
                            '`/nivel usuario:` - Muestra nivel y XP\n' +
                            '`/ping` - Muestra la latencia\n' +
                            '`/avatar usuario:` - Muestra el avatar',
                        inline: false },
                        
                        { name: '🎭 **Diversión y Utilidades**', value: 
                            '`/dados` - Lanza un dado\n' +
                            '`/8ball pregunta:` - Pregunta a la bola mágica\n' +
                            '`/ship usuario1: usuario2:` - Calcula compatibilidad\n' +
                            '`/cumpleanos fecha:` - Registra tu cumpleaños\n' +
                            '`/invitaciones usuario:` - Muestra invitaciones\n' +
                            '`/topinvitaciones` - Ranking de invitaciones',
                        inline: false }
                    )
                    .setThumbnail(client.user.displayAvatarURL({ dynamic: true }))
                    .setFooter({ text: 'Usa /help categoria: admin para ver los comandos de administrador' });

                // Menú principal de ayuda (más compacto)
                const embedPrincipal = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('📜 Sistema de Ayuda de Tentación')
                    .setDescription('Bienvenido al sistema de ayuda. Puedes usar comandos tanto con el prefijo `¡` como con `/`.\n\nLos comandos slash (/) son más fáciles de usar.')
                    .addFields(
                        { name: '⚙️ **Comandos de Administrador**', value: 'Usa `/help categoria: admin` para ver los comandos de administrador.', inline: false },
                        { name: '🌟 **Comandos para Todos**', value: 'Usa `/help categoria: todos` para ver los comandos disponibles para todos.', inline: false },
                        { name: '🔍 **Comandos específicos**', value: 'Usa `/help comando: [nombre-comando]` para obtener información sobre un comando.', inline: false },
                        { name: '💡 **Usando comandos slash**', value: 'Usa `/help categoria: slash` para ver una guía sobre comandos slash.', inline: false }
                    )
                    .setImage('https://cdn.discordapp.com/attachments/1219069470652371034/1347049160267923487/descarga.gif?ex=67ca68ca&is=67c9174a&hm=777dc9218cbfe8c25d933441f5bdebd54f7d481bf2d58ab63172c489129d0972&')
                    .setFooter({ text: isAdmin ? 'Tienes acceso a todos los comandos como administrador.' : 'Algunos comandos requieren permisos de administrador.' });

                // Crear un embed específico para comandos slash (simplificado)
                const slashEmbed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('🔍 Guía de Comandos Slash')
                    .setDescription('Los comandos slash (/) son la forma más fácil de usar el bot. Escribe `/` y verás la lista de comandos disponibles.')
                    .addFields(
                        { name: '💡 **¿Cómo usar comandos slash?**', value: 
                            '1. Escribe `/` en el chat\n' +
                            '2. Busca el comando que deseas usar\n' +
                            '3. Selecciónalo y completa los parámetros\n' +
                            '4. Presiona Enter para enviar', 
                        inline: false },
                        { name: '✨ **Ventajas**', value: 
                            '• Interfaz intuitiva con autocompletado\n' +
                            '• No necesitas recordar el prefijo del bot\n' +
                            '• Discord te muestra qué parámetros son necesarios', 
                        inline: false }
                    )
                    .setFooter({ text: 'Usa /help categoria: todos o admin para ver la lista completa de comandos' });

                // Manejar la solicitud según los parámetros
                if (categoria) {
                    if (categoria === 'admin' || categoria === 'administrador') {
                        // Verificar permisos para comandos de administrador
                        if (!isAdmin) {
                            return await interaction.editReply({ content: '❌ No tienes permisos para ver los comandos de administrador.', ephemeral: true });
                        }
                        
                        // Enviar todos los embeds de admin
                        return await interaction.editReply({ embeds: [embedAdminPart1, embedAdminPart2, embedAdminPart3] });
                    } 
                    else if (categoria === 'todos' || categoria === 'all' || categoria === 'user') {
                        return await interaction.editReply({ embeds: [embedTodos] });
                    }
                    else if (categoria === 'slash' || categoria === 'comandos-slash' || categoria === '/') {
                        return await interaction.editReply({ embeds: [slashEmbed] });
                    }
                    else {
                        return await interaction.editReply({ content: `❌ Categoría "${categoria}" no reconocida. Use "admin", "todos" o "slash".`, ephemeral: true });
                    }
                }
                
                // Si se especificó un comando
                if (comando) {
                    // Verificar si el comando existe en nuestra base de datos
                    try {
                        const comandoInfo = getSlashCommandHelp(comando, isAdmin);
                        
                        if (comandoInfo) {
                            return await interaction.editReply({ embeds: [comandoInfo] });
                        } else {
                            return await interaction.editReply({ 
                                content: `❌ No se encontró ayuda para el comando "/${comando}". Usa \`/help\` para ver la lista de comandos disponibles.`, 
                                ephemeral: true 
                            });
                        }
                    } catch (error) {
                        console.error('Error al mostrar ayuda de comando específico:', error);
                        return await interaction.editReply({ 
                            content: `❌ Ocurrió un error al buscar ayuda para el comando "/${comando}".`, 
                            ephemeral: true 
                        });
                    }
                }
                
                // Si no hay comando ni categoría, mostrar el menú principal
                return await interaction.editReply({ embeds: [embedPrincipal] });
                
            } catch (error) {
                console.error('Error en comando /help:', error);
                
                // Si ya hemos respondido, editar la respuesta
                if (interaction.deferred || interaction.replied) {
                    return await interaction.editReply({ 
                        content: '❌ Ocurrió un error al ejecutar el comando /help. Por favor, inténtalo de nuevo.',
                        ephemeral: true 
                    }).catch(e => console.error('Error al editar respuesta:', e));
                } 
                // Si no hemos respondido, intentar responder ahora
                else {
                    return await interaction.reply({ 
                        content: '❌ Ocurrió un error al ejecutar el comando /help. Por favor, inténtalo de nuevo.',
                        ephemeral: true 
                    }).catch(e => console.error('Error al responder:', e));
                }
            }
        }
        
    } catch (error) {
        console.error('Error al manejar comando slash:', error);
        if (interaction.replied || interaction.deferred) {
            await interaction.editReply({ content: '❌ Hubo un error al ejecutar el comando.', ephemeral: true }).catch(() => {});
        } else {
            await interaction.reply({ content: '❌ Hubo un error al ejecutar el comando.', ephemeral: true }).catch(() => {});
        }
    }
});

// Importar y configurar sistema de keepalive
console.log('📡 Iniciando sistema de keepalive...');

// Iniciar el keepalive de manera sencilla
try {
  require('./keepalive');
  console.log('✅ Sistema de keepalive iniciado correctamente');
} catch (error) {
  console.error('❌ Error al iniciar sistema keepalive:', error.message);
  // Intentar nuevamente en caso de error
  setTimeout(() => {
    try {
      require('./keepalive');
      console.log('✅ Sistema de keepalive iniciado en segundo intento');
    } catch (e) {
      console.error('❌ Error persistente en keepalive:', e.message);
    }
  }, 5000);
}

// 🔑 **Iniciar el bot**
client.once('ready', async () => {
    console.log(`✅ Bot conectado como ${client.user.tag}`);
    console.log(`🔥 El bot está ONLINE y listo para usar!`);
    
    // Cargar sorteos pendientes
    cargarSorteosPendientes();
    
    // Configurar estado del bot visible
    client.user.setPresence({
        activities: [{ 
            name: 'TENTACION', // Texto que se mostrará después de "Escuchando a"
            type: 2 // 2 es el tipo para "Escuchando"
        }],
        status: 'TENTACION' // online, idle, dnd, invisible
    });
    console.log('✅ Estado del bot configurado como "Escuchando TENTACION"');
    
    // Generar enlace de invitación para el bot con permisos necesarios
    const permisos = [
        "VIEW_CHANNEL", "SEND_MESSAGES", "EMBED_LINKS", "ATTACH_FILES", 
        "READ_MESSAGE_HISTORY", "USE_EXTERNAL_EMOJIS", "MANAGE_MESSAGES",
        "KICK_MEMBERS", "BAN_MEMBERS", "MODERATE_MEMBERS", "MANAGE_CHANNELS",
        "ADD_REACTIONS", "READ_MESSAGE_HISTORY", "MANAGE_ROLES"
    ];
    
    // Enlace con permisos específicos detallados (más fácil de aprobar)
    const inviteLinkDetallado = `https://discord.com/api/oauth2/authorize?client_id=${client.user.id}&permissions=1099511627775&scope=bot%20applications.commands`;
    
    // Enlace con permisos de administrador (puede ser rechazado en algunos servidores)
    const inviteLinkAdmin = `https://discord.com/oauth2/authorize?client_id=${client.user.id}&permissions=8&scope=bot%20applications.commands`;
    
    console.log(`🔗 Enlace para invitar al bot (recomendado): ${inviteLinkDetallado}`);
    console.log(`🔗 Enlace alternativo (con permisos de admin): ${inviteLinkAdmin}`);
    console.log('👆 Usa cualquiera de estos enlaces para invitar el bot a otros servidores');
    console.log('⚠️ Si tienes problemas, verifica que no tengas restricciones de servidor o región');
    
    // Registrar comandos después de que el bot esté listo
    await registrarComandosSlash();
    
    // Cargar datos guardados
    cargarDatos();
    cargarUsuariosYaInvitados();
    
    // Cargar invitaciones iniciales de todos los servidores
    client.guilds.cache.forEach(async (guild) => {
        try {
            const guildInvites = await guild.invites.fetch();
            invites.set(guild.id, new Map(guildInvites.map((invite) => [invite.code, invite.uses])));
            console.log(`📊 Invitaciones cargadas para el servidor: ${guild.name}`);
        } catch (error) {
            console.error(`❌ Error al cargar invitaciones del servidor ${guild.name}:`, error);
        }
    });
    
    // Programar verificación de cumpleaños
    programarVerificacionCumpleaños();
});

// Función para finalizar un sorteo
async function finalizarSorteo(sorteoData) {
    // Verificar si el sorteo ya fue finalizado
    if (sorteoData.finalizado) return;
    
    try {
        // Leer datos actuales
        let sorteos = [];
        try {
            sorteos = JSON.parse(fs.readFileSync('sorteos.json', 'utf8'));
        } catch (error) {
            console.error('Error al leer sorteos.json:', error);
            return;
        }
        
        // Actualizar estado del sorteo
        const index = sorteos.findIndex(s => s.messageId === sorteoData.messageId);
        if (index !== -1) {
            sorteos[index].finalizado = true;
            // Asegurarse de que tenemos la lista de participantes actualizada
            sorteoData.participantes = sorteos[index].participantes || [];
            fs.writeFileSync('sorteos.json', JSON.stringify(sorteos, null, 2));
        }
        
        // Obtener canal y mensaje
        const guild = client.guilds.cache.get(sorteoData.guildId);
        if (!guild) return console.log(`No se encontró el servidor ${sorteoData.guildId}`);
        
        const channel = guild.channels.cache.get(sorteoData.channelId);
        if (!channel) return console.log(`No se encontró el canal ${sorteoData.channelId}`);
        
        const message = await channel.messages.fetch(sorteoData.messageId)
            .catch(() => null);
        if (!message) return console.log(`No se encontró el mensaje ${sorteoData.messageId}`);
        
        // Verificar si hay participantes
        if (!sorteoData.participantes || sorteoData.participantes.length === 0) {
            // No hay participantes
            const embedNoGanadores = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('🎉 SORTEO FINALIZADO 🎉')
                .setDescription(`**Premio:** ${sorteoData.premio}\n\n**Ganadores:** Nadie participó\n\n**Organizado por:** <@${sorteoData.creadorId}>`)
                .setFooter({ text: 'Sorteo • Tentación', iconURL: guild.iconURL({ dynamic: true }) })
                .setTimestamp();
                
            // Desactivar el botón
            const rowDesactivada = {
                type: 1,
                components: [
                    {
                        type: 2,
                        style: 2, // Secondary (gray)
                        custom_id: sorteoData.buttonId || "sorteo_finalizado",
                        emoji: { name: '🎉' },
                        label: 'Sorteo finalizado',
                        disabled: true
                    }
                ]
            };
            
            await message.edit({ embeds: [embedNoGanadores], components: [rowDesactivada] });
            return await channel.send('❌ **Sorteo finalizado**: Nadie participó');
        }
        
        // Seleccionar ganadores
        const ganadores = [];
        const participantesArray = [...sorteoData.participantes];
        
        // Ajustar número de ganadores si hay menos participantes
        const numGanadores = Math.min(sorteoData.ganadores, participantesArray.length);
        
        for (let i = 0; i < numGanadores; i++) {
            if (participantesArray.length === 0) break;
            const indice = Math.floor(Math.random() * participantesArray.length);
            ganadores.push(participantesArray[indice]);
            participantesArray.splice(indice, 1); // Evitar elegir al mismo ganador
        }
        
        // Actualizar embed
        const embedGanadores = new EmbedBuilder()
            .setColor('#FFD700')
            .setTitle('🎉 SORTEO FINALIZADO 🎉')
            .setDescription(`**Premio:** ${sorteoData.premio}\n\n**Ganadores:** ${ganadores.map(id => `<@${id}>`).join(', ')}\n\n**Organizado por:** <@${sorteoData.creadorId}>\n\n**Total participantes:** ${sorteoData.participantes.length}`)
            .setFooter({ text: 'Sorteo • Tentación', iconURL: guild.iconURL({ dynamic: true }) })
            .setTimestamp();
        
        // Si el sorteo original tenía una imagen o thumbnail, mantenerlas
        if (message.embeds[0]?.image) {
            embedGanadores.setImage(message.embeds[0].image.url);
        }
        
        if (message.embeds[0]?.thumbnail) {
            embedGanadores.setThumbnail(message.embeds[0].thumbnail.url);
        }
        
        // Desactivar el botón
        const rowDesactivada = {
            type: 1,
            components: [
                {
                    type: 2,
                    style: 2, // Secondary (gray)
                    custom_id: sorteoData.buttonId || "sorteo_finalizado",
                    emoji: { name: '🎉' },
                    label: 'Sorteo finalizado',
                    disabled: true
                }
            ]
        };
            
        await message.edit({ embeds: [embedGanadores], components: [rowDesactivada] });
        
        // Anunciar ganadores
        await channel.send({
            content: `🎊 **¡Felicidades a los ganadores del sorteo!** 🎊\n${ganadores.map(id => `<@${id}>`).join(', ')}\n\n**Premio:** ${sorteoData.premio}`,
            allowedMentions: { users: ganadores }
        });
        
    } catch (error) {
        console.error('Error al finalizar sorteo:', error);
    }
}

// Cargar y programar sorteos no finalizados al iniciar
function cargarSorteosPendientes() {
    try {
        const sorteos = JSON.parse(fs.readFileSync('sorteos.json', 'utf8'));
        const ahora = Date.now();
        
        for (const sorteo of sorteos) {
            if (!sorteo.finalizado) {
                const tiempoRestante = sorteo.finalizaEn - ahora;
                
                if (tiempoRestante <= 0) {
                    // Finalizar inmediatamente si ya pasó la fecha
                    console.log(`Finalizando sorteo vencido: ${sorteo.premio}`);
                    finalizarSorteo(sorteo);
                } else {
                    // Programar finalización
                    console.log(`Programando finalización de sorteo: ${sorteo.premio} en ${Math.floor(tiempoRestante/60000)} minutos`);
                    setTimeout(() => finalizarSorteo(sorteo), tiempoRestante);
                }
            }
        }
    } catch (error) {
        console.error('Error al cargar sorteos pendientes:', error);
    }
}

// Función para conectar a Discord
const loginWithRetry = () => {
  console.log('🔄 Intentando conectar a Discord...');
  
  client.login(process.env.TOKEN).catch(error => {
    console.error('❌ Error al conectar a Discord:', error);
    console.log('⏱️ Intentando reconectar en 10 segundos...');
    setTimeout(loginWithRetry, 10000); // Reintento después de 10 segundos
  });
};

// Manejar desconexiones inesperadas
client.on('disconnect', (event) => {
  console.error(`🔌 Discord se ha desconectado con código ${event.code}. Razón: ${event.reason}`);
  console.log('⏱️ Intentando reconectar en 10 segundos...');
  setTimeout(loginWithRetry, 10000);
});

// Manejar reconexiones
client.on('reconnecting', () => {
  console.log('🔄 Reconectando a Discord...');
});

// Cuando el bot se vuelva a conectar después de una desconexión
client.on('resumed', () => {
  console.log('✅ Conexión restablecida');
});

// Manejar errores de WebSocket
client.on('error', (error) => {
  console.error('🔌 Error en la conexión WebSocket:', error);
  console.log('⏱️ Intentando reconectar en 15 segundos...');
  setTimeout(loginWithRetry, 15000);
});

// Iniciar la conexión
loginWithRetry();
