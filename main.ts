import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { readFileSync } from 'fs'
import { join } from 'path'
 
// 1. Crear el servidor
// Es la interfaze principal con el protocolo MCP. Maneja la comunicación entre el cliente y el servidor.
 
const server = new McpServer({
  name: 'tech-bridge',
  version: '1.0.0',
})
 
// Función para parsear el archivo context.txt y extraer los endpoints
function parseApiEndpoints() {
    try {
        const content = readFileSync(join(process.cwd(), 'context.txt'), 'utf-8');
        const sections: Record<string, Array<{metodo: string, endpoint: string, descripcion: string}>> = {};
        
        let currentSection = '';
        const lines = content.split('\n');
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmedLine = line.trim();
            
            // Detectar secciones principales
            if (trimmedLine.includes('🤖 AGENTS API')) {
                currentSection = 'gestion-agentes';
                sections[currentSection] = [];
            } else if (trimmedLine.includes('💬 CONVERSATIONS API')) {
                currentSection = 'conversaciones';
                sections[currentSection] = [];
            } else if (trimmedLine.includes('📚 SOURCES API')) {
                currentSection = 'fuentes-datos';
                sections[currentSection] = [];
            } else if (trimmedLine.includes('📊 REPORTS')) {
                currentSection = 'reportes';
                sections[currentSection] = [];
            } else if (trimmedLine.includes('⚙️ AGENT SETTINGS') || trimmedLine.includes('👤 USERS API') || trimmedLine.includes('🧾 PAGE METADATA')) {
                currentSection = 'configuracion';
                if (!sections[currentSection]) sections[currentSection] = [];
            } else if (trimmedLine.includes('🧠 MESSAGES & REACTIONS')) {
                currentSection = 'conversaciones';
                if (!sections[currentSection]) sections[currentSection] = [];
            } else if (trimmedLine.includes('📄 PAGES API')) {
                currentSection = 'fuentes-datos';
                if (!sections[currentSection]) sections[currentSection] = [];
            }
            
            // Parsear líneas de endpoints
            if (currentSection && trimmedLine.match(/^(GET|POST|PUT|DELETE)\s+\/api\/v1\//)) {
                const parts = trimmedLine.split(/\s+/);
                const metodo = parts[0];
                const endpoint = parts[1];
                
                // Buscar descripción en la línea siguiente
                let descripcion = 'Sin descripción';
                if (i + 1 < lines.length) {
                    const nextLine = lines[i + 1].trim();
                    if (nextLine && !nextLine.match(/^(GET|POST|PUT|DELETE)\s+\/api\/v1\//) && !nextLine.includes('🔐') && !nextLine.includes('📄') && !nextLine.includes('👤') && !nextLine.includes('⚙️') && !nextLine.includes('💬') && !nextLine.includes('🧠') && !nextLine.includes('📚') && !nextLine.includes('📊') && !nextLine.includes('🧾')) {
                        descripcion = nextLine;
                    }
                }
                
                if (sections[currentSection]) {
                    sections[currentSection].push({
                        metodo,
                        endpoint,
                        descripcion
                    });
                }
            }
        }
        
        return sections;
    } catch (error) {
        console.error('Error leyendo context.txt:', error);
        return {};
    }
}

server.resource(
    'api-endpoints',
    new ResourceTemplate('api://{funcionalidad}', {
        list: async () => {
            const sections = parseApiEndpoints();
            const resources = Object.keys(sections).map(funcionalidad => ({
                uri: `api://${funcionalidad}`,
                name: 'api-endpoints',
                description: `Endpoints para ${funcionalidad.replace('-', ' ')}`
            }));
            
            return { resources };
        }
    }),
    async (uri, variables) => {
        const funcionalidad = Array.isArray(variables.funcionalidad) ? variables.funcionalidad[0] : variables.funcionalidad;
        const sections = parseApiEndpoints();
        const endpoints = sections[funcionalidad] || [];
        
        const contenido = endpoints.map(ep => `${ep.metodo} ${ep.endpoint}\n   ${ep.descripcion}`).join('\n\n');
        
        return {
            contents: [
                {
                    uri: uri.toString(),
                    mimeType: 'text/plain',
                    text: `Endpoints de API para funcionalidad "${funcionalidad}":\n\n${contenido}\n\n🔐 Autenticación requerida: Bearer Token\nHeader: Authorization: Bearer <jwt_token>`
                }
            ]
        };
    }
);

server.tool(
  'determinar-contexto-de-la-reunion',
  'Determina el contexto de la reunión a partir del texto de un transcripto de una conversación y retorna qué recursos/endpoints usar',
  {
    texto: z.string().describe('Texto de un transcripto de una conversación de una reunion de un cliente con un sales representative'),
  },
  async ({ texto }) => {
    // Analizar el texto para determinar el contexto
    const textoLower = texto.toLowerCase();
    
    // Mapeo de palabras clave a funcionalidades (simplificado)
    const contextMapping = {
      'gestion-agentes': ['agente', 'chatbot', 'bot', 'crear agente', 'configurar agente', 'eliminar agente', 'clonar agente', 'replicar', 'estadísticas', 'métricas', 'proyecto'],
      'conversaciones': ['conversación', 'chat', 'mensaje', 'prompt', 'feedback', 'like', 'dislike', 'sesión', 'historial', 'completions', 'llm'],
      'fuentes-datos': ['fuente', 'datos', 'sitemap', 'archivo', 'página', 'indexar', 'reindexar', 'sincronizar', 'metadata', 'preview'],
      'reportes': ['reporte', 'analytics', 'estadísticas', 'métricas', 'tráfico', 'consultas', 'gráfico', 'análisis', 'geo', 'browser', 'referral'],
      'configuracion': ['configurar', 'ajustes', 'settings', 'persona', 'prompts', 'colores', 'perfil', 'usuario', 'metadata', 'título', 'descripción']
    };
    
    // Contar coincidencias por funcionalidad
    const scores: Record<string, number> = {};
    Object.entries(contextMapping).forEach(([funcionalidad, palabrasClave]) => {
      scores[funcionalidad] = palabrasClave.reduce((count, palabra) => {
        return count + (textoLower.includes(palabra) ? 1 : 0);
      }, 0);
    });
    
    // Determinar la funcionalidad principal
    const funcionalidadPrincipal = Object.entries(scores)
      .filter(([_, score]) => score > 0)
      .sort(([_, a], [__, b]) => (b as number) - (a as number))[0];
    
    const contexto = funcionalidadPrincipal ? funcionalidadPrincipal[0] : 'general';
    const confianza = funcionalidadPrincipal ? (funcionalidadPrincipal[1] / Math.max(...Object.values(scores))) : 0;
    
    return {
      content: [{ 
        type: "text", 
        text: `Contexto determinado: ${contexto}\nConfianza: ${(confianza * 100).toFixed(1)}%\n\nPara obtener los endpoints específicos, accede al recurso: api://${contexto}`
      }],
      isError: false,
      _meta: { 
        message: `Contexto determinado: ${contexto} (confianza: ${(confianza * 100).toFixed(1)}%)`,
        contexto: contexto,
        confianza: confianza,
        recursoRecomendado: `api://${contexto}`
      },
    };
  }
);

server.tool(
    'procesar-texto-transcripto',
    'Procesa un texto de un transcripto de una conversación y ejecuta dinámicamente los endpoints necesarios según el contexto determinado',
    {
      texto: z.string().describe('Texto de un transcripto de una conversación'),
      contextoDeterminado: z.string().optional().describe('Contexto previamente determinado (opcional)'),
    },
    async ({ texto, contextoDeterminado }) => {
        // Si no se proporciona contexto, determinarlo primero
        let contexto = contextoDeterminado;
        if (!contexto) {
            const textoLower = texto.toLowerCase();
            const contextMapping = {
                'gestion-agentes': ['agente', 'chatbot', 'bot', 'crear agente', 'configurar agente'],
                'conversaciones': ['conversación', 'chat', 'mensaje', 'prompt'],
                'fuentes-datos': ['fuente', 'datos', 'sitemap', 'archivo'],
                'reportes': ['reporte', 'analytics', 'estadísticas', 'métricas'],
                'configuracion': ['configurar', 'ajustes', 'settings', 'persona']
            };
            
            const scores: Record<string, number> = {};
            Object.entries(contextMapping).forEach(([func, palabras]) => {
                scores[func] = palabras.reduce((count, palabra) => 
                    count + (textoLower.includes(palabra) ? 1 : 0), 0);
            });
            
            contexto = Object.entries(scores)
                .filter(([_, score]) => (score as number) > 0)
                .sort(([_, a], [__, b]) => (b as number) - (a as number))[0]?.[0] || 'general';
        }
        
        // Obtener endpoints para el contexto desde el recurso
        const sections = parseApiEndpoints();
        const endpoints = sections[contexto] || [];
        
        // Simular ejecución de endpoints (en un caso real, aquí harías las llamadas HTTP)
        const ejecuciones = endpoints.map(ep => ({
            endpoint: ep.endpoint,
            metodo: ep.metodo,
            descripcion: ep.descripcion,
            estado: 'simulado',
            resultado: `Ejecutado ${ep.metodo} ${ep.endpoint} para procesar: "${texto.substring(0, 50)}..."`
        }));
        
        return {
            content: [{ 
                type: "text", 
                text: `Procesado con contexto: ${contexto}\nEndpoints ejecutados: ${ejecuciones.length}\n\nPara ver los endpoints disponibles, accede al recurso: api://${contexto}`
            }],
            isError: false,
            _meta: { 
                message: `Procesado con contexto: ${contexto} - ${ejecuciones.length} endpoints ejecutados`,
                contexto: contexto,
                endpointsEjecutados: ejecuciones.length,
                recursoUtilizado: `api://${contexto}`
            },
        };
    }
  );
  

//3. Escuchar las solicitudes del cliente
const transport = new StdioServerTransport();
server.connect(transport);