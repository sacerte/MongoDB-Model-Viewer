const http = require('http');
const path = require('path');
const fs = require('fs');

const MCP_PORT = 8100;
const MCP_HOST = '127.0.0.1';
const MODELS_DIR = '/home/Yaser/Documents/MongoDBProject/models';

const JSONRPC_VERSION = '2.0';

const serverState = {
  startedAt: new Date().toISOString(),
  window: null,
  requestHandlers: {},
  pendingRequests: new Map(),
  sessionId: null
};

function log(...args) {
  console.log('[mcp-server]', ...args);
}

function setWindow(windowRef) {
  serverState.window = windowRef;
}

function setRequestHandlers(handlers) {
  serverState.requestHandlers = { ...serverState.requestHandlers, ...handlers };
}

function sendToRenderer(channel, payload) {
  const win = serverState.window;
  if (!win || win.isDestroyed()) {
    return { ok: false, error: 'No hay ventana de la app disponible' };
  }
  win.webContents.send(channel, payload);
  return { ok: true };
}

function handleRendererResponse(channel, payload) {
  log(`Respuesta del renderer para ${channel}: ok=${payload?.ok}`);
  const resolver = serverState.pendingRequests.get(channel);
  if (!resolver) {
    log(`Respuesta del renderer sin petición pendiente: ${channel}`);
    return;
  }
  serverState.pendingRequests.delete(channel);
  clearTimeout(resolver.timer);
  if (payload?.ok) {
    resolver.resolve(payload.result);
  } else {
    resolver.reject(new Error(payload?.error || 'Error del renderer'));
  }
}

function requestFromRenderer(channel, payload, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const win = serverState.window;
    if (!win || win.isDestroyed()) {
      reject(new Error('No hay ventana de la app disponible'));
      return;
    }
    if (serverState.pendingRequests.has(channel)) {
      reject(new Error(`Ya hay una petición pendiente para ${channel}`));
      return;
    }
    const timer = setTimeout(() => {
      serverState.pendingRequests.delete(channel);
      reject(new Error(`Timeout esperando respuesta del renderer para ${channel}`));
    }, timeoutMs);
    serverState.pendingRequests.set(channel, { resolve, reject, timer });
    log(`Enviando ${channel} al renderer (ventana viva: ${!win.isDestroyed()})`);
    win.webContents.send(channel, payload || {});
  });
}

function jsonRpcResult(id, result) {
  return { jsonrpc: JSONRPC_VERSION, id, result };
}

function jsonRpcError(id, code, message, data) {
  return { jsonrpc: JSONRPC_VERSION, id, error: { code, message, data } };
}

const ERR_PARSE = -32700;
const ERR_INVALID_REQUEST = -32600;
const ERR_METHOD_NOT_FOUND = -32601;
const ERR_INVALID_PARAMS = -32602;
const ERR_INTERNAL = -32603;

const TOOLS = [
  {
    name: 'list_projects',
    description:
      'Lista los proyectos de MongoDBModeler: pestañas abiertas en la app y proyectos guardados localmente. Devuelve id, nombre, versión, número de modelos y si tiene cambios sin guardar.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'get_project',
    description:
      'Devuelve el proyecto activo de MongoDBModeler (el de la pestaña activa): modelos, relaciones, hojas de diagrama, versión y metadatos. Opcionalmente un projectId para otro proyecto abierto.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'ID del proyecto. Si se omite, se devuelve el proyecto de la pestaña activa.' }
      },
      additionalProperties: false
    }
  },
  {
    name: 'open_mdm',
    description:
      'Abre un archivo .mdm en MongoDBModeler como nueva pestaña del proyecto activo. Equivalente a abrir el archivo desde la app.',
    inputSchema: {
      type: 'object',
      properties: {
        filePath: { type: 'string', description: 'Ruta absoluta del archivo .mdm a abrir.' }
      },
      required: ['filePath'],
      additionalProperties: false
    }
  },
  {
    name: 'save_mdm',
    description:
      'Guarda el proyecto activo (o el projectId indicado) como archivo .mdm en /home/Yaser/Documents/MongoDBProject/models/. El archivo se llama {nombre_proyecto}.mdm.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'ID del proyecto a guardar. Si se omite, se guarda el de la pestaña activa.' }
      },
      additionalProperties: false
    }
  },
  {
    name: 'app_status',
    description: 'Estado de MongoDBModeler: versión, plataforma, número de pestañas abiertas, si el renderer responde.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'export_diagram_pdf',
    description:
      'Exporta una hoja de diagrama de MongoDBModeler como PDF (igual que el botón Exportar PDF de la app). El nombre del archivo es el nombre del proyecto para la hoja Main Diagram, y {proyecto}_{hoja} para el resto (ej. {proyecto}_Fotos). Devuelve { ok, base64, fileName } con el PDF en base64.',
    inputSchema: {
      type: 'object',
      properties: {
        sheetName: { type: 'string', description: 'Nombre de la hoja de diagrama a exportar (ej. "Main Diagram", "Fotos"). Si se omite, se exporta la hoja activa.' }
      },
      additionalProperties: false
    }
  },
  {
    name: 'export_diagram_image',
    description:
      'Exporta una hoja de diagrama de MongoDBModeler como imagen PNG (igual que el botón Exportar imagen de la app). El nombre del archivo sigue la misma regla que el PDF. Devuelve { ok, base64, fileName } con el PNG en base64.',
    inputSchema: {
      type: 'object',
      properties: {
        sheetName: { type: 'string', description: 'Nombre de la hoja de diagrama a exportar (ej. "Main Diagram", "Fotos"). Si se omite, se exporta la hoja activa.' }
      },
      additionalProperties: false
    }
  },
  {
    name: 'export_dictionary_xlsx',
    description:
      'Genera el Excel del diccionario de datos (Data Dictionary) del proyecto activo: una hoja por colección. Devuelve { ok, base64, fileName } con el XLSX en base64.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'export_collection_schemas',
    description:
      'Exporta el jsonSchema (validación) y los índices de las colecciones del proyecto activo. Devuelve por cada colección { collection, validation, indexes:[{name,type,definition}] }. Con collections se filtra por nombres; sin él, devuelve todas.',
    inputSchema: {
      type: 'object',
      properties: {
        collections: {
          type: 'array',
          items: { type: 'string' },
          description: 'Nombres de colección a exportar (opcional; si se omite, todas).'
        }
      },
      additionalProperties: false
    }
  }
];

function getToolDefinitions() {
  return TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema }));
}

async function callRendererTool(name, args) {
  const handlers = serverState.requestHandlers;
  if (typeof handlers[name] === 'function') {
    return await handlers[name](args || {});
  }
  throw new Error(`El renderer no registra el handler para la herramienta ${name}`);
}

async function dispatchToolCall(name, args) {
  switch (name) {
    case 'open_mdm': {      const filePath = args?.filePath;
      if (!filePath || typeof filePath !== 'string') {
        throw new Error('Falta filePath (ruta absoluta del .mdm)');
      }
      if (!/\.mdm$/i.test(filePath)) {
        throw new Error('El archivo debe tener extensión .mdm');
      }
      if (!fs.existsSync(filePath)) {
        throw new Error(`El archivo no existe: ${filePath}`);
      }
      const result = sendToRenderer('app:open-file', filePath);
      if (!result.ok) {
        throw new Error(result.error);
      }
      return {
        ok: true,
        filePath,
        message: 'Archivo enviado a la app. Debería abrirse como nueva pestaña en MongoDBModeler.'
      };
    }
    case 'app_status': {
      const win = serverState.window;
      return {
        ok: true,
        app: 'MongoDBModeler',
        version: (() => {
          try {
            const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf-8'));
            return pkg.version || null;
          } catch (_) {
            return null;
          }
        })(),
        platform: process.platform,
        hasWindow: Boolean(win && !win.isDestroyed()),
        startedAt: serverState.startedAt,
        modelsDir: MODELS_DIR,
        mcpPort: MCP_PORT
      };
    }
    case 'export_diagram_pdf':
      return requestFromRenderer('mcp:export-diagram-pdf-request', { format: 'pdf', ...(args || {}) }, 120000);
    case 'export_diagram_image':
      return requestFromRenderer('mcp:export-diagram-pdf-request', { format: 'png', ...(args || {}) }, 120000);
    default:
      return requestFromRenderer(`mcp:${name.replace(/_/g, '-')}-request`, args || {}, 120000);
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 10 * 1024 * 1024) {
        reject(new Error('Body demasiado grande'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function sendJson(res, status, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': '*',
    ...extraHeaders
  });
  res.end(body);
}

async function handleJsonRpc(req, res) {
  let raw;
  try {
    raw = await readBody(req);
  } catch (error) {
    sendJson(res, 413, jsonRpcError(null, ERR_INTERNAL, error?.message || 'Error leyendo el body'));
    return;
  }

  let message;
  try {
    message = JSON.parse(raw || '{}');
  } catch (_) {
    sendJson(res, 400, jsonRpcError(null, ERR_PARSE, 'Invalid JSON'));
    return;
  }

  const messages = Array.isArray(message) ? message : [message];
  const responses = [];

  for (const msg of messages) {
    if (!msg || msg.jsonrpc !== JSONRPC_VERSION || typeof msg.method !== 'string') {
      responses.push(jsonRpcError(msg?.id ?? null, ERR_INVALID_REQUEST, 'Invalid Request'));
      continue;
    }

    const { id, method, params } = msg;

    try {
      if (method === 'initialize') {
        const protocolVersion = params?.protocolVersion || '2024-11-05';
        serverState.sessionId = `mcp-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        responses.push(
          jsonRpcResult(id, {
            protocolVersion,
            capabilities: { tools: {} },
            serverInfo: { name: 'mongodbmodeler', title: 'MongoDBModeler MCP', version: '1.0.0' }
          })
        );
        continue;
      }

      if (method === 'notifications/initialized' || method.startsWith('notifications/')) {
        // Notificaciones: sin respuesta
        continue;
      }

      if (method === 'tools/list') {
        responses.push(jsonRpcResult(id, { tools: getToolDefinitions() }));
        continue;
      }

      if (method === 'tools/call') {
        const name = params?.name;
        const toolArgs = params?.arguments || {};
        if (!name || typeof name !== 'string') {
          responses.push(jsonRpcError(id, ERR_INVALID_PARAMS, 'tools/call requiere params.name'));
          continue;
        }
        try {
          const result = await dispatchToolCall(name, toolArgs);
          responses.push(jsonRpcResult(id, { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }));
        } catch (error) {
          responses.push(
            jsonRpcResult(id, {
              content: [{ type: 'text', text: `Error: ${error?.message || String(error)}` }],
              isError: true
            })
          );
        }
        continue;
      }

      responses.push(jsonRpcError(id, ERR_METHOD_NOT_FOUND, `Método no soportado: ${method}`));
    } catch (error) {
      responses.push(jsonRpcError(id, ERR_INTERNAL, error?.message || 'Error interno'));
    }
  }

  if (responses.length === 0) {
    res.writeHead(202, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'mcp-session-id': serverState.sessionId || 'mongodbmodeler-session'
    });
    res.end('{}');
    return;
  }

  sendJson(res, 200, Array.isArray(message) ? responses : responses[0], {
    'mcp-session-id': serverState.sessionId || 'mongodbmodeler-session'
  });
}

function startMcpServer(windowRef) {
  if (windowRef) {
    setWindow(windowRef);
  }

  const server = http.createServer((req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, GET, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version',
        'Access-Control-Expose-Headers': 'Mcp-Session-Id'
      });
      res.end();
      return;
    }
    if (req.method === 'GET') {
      // Streamable HTTP: GET sin SSE solicitado -> 405 con Allow
      if ((req.headers.accept || '').includes('text/event-stream')) {
        res.writeHead(405, { Allow: 'POST' });
        res.end();
      } else {
        sendJson(res, 405, jsonRpcError(null, ERR_INVALID_REQUEST, 'Solo se acepta POST'));
      }
      return;
    }
    if (req.method === 'DELETE') {
      // Streamable HTTP: cierre de sesión
      res.writeHead(204, { 'Access-Control-Allow-Origin': '*' });
      res.end();
      return;
    }
    if (req.method !== 'POST') {
      sendJson(res, 405, jsonRpcError(null, ERR_INVALID_REQUEST, 'Solo se acepta POST'));
      return;
    }
    handleJsonRpc(req, res).catch((error) => {
      log('Error no controlado:', error);
      sendJson(res, 500, jsonRpcError(null, ERR_INTERNAL, 'Error interno del servidor MCP'));
    });
  });

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      log(`Puerto ${MCP_PORT} ocupado. MCP deshabilitado en esta instancia.`);
      return;
    }
    log('Error del servidor:', error);
  });

  server.listen(MCP_PORT, MCP_HOST, () => {
    log(`Servidor MCP escuchando en http://${MCP_HOST}:${MCP_PORT}`);
  });

  return server;
}

module.exports = {
  MCP_PORT,
  MCP_HOST,
  MODELS_DIR,
  startMcpServer,
  setWindow,
  setRequestHandlers,
  sendToRenderer,
  handleRendererResponse,
  requestFromRenderer
};
