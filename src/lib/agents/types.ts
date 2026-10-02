export type Agent = {
  /** id estable, en kebab-case */
  id: string;
  /** nombre para mostrar */
  nombre: string;
  /** genero, para futura capa de voz */
  genero: "masculino" | "femenino" | "neutro";
  /** system prompt que reemplaza al BASE_PROMPT cuando el agente esta activo */
  prompt: string;
  /** modelo a usar con este agente; si se omite, se usa el modelo base */
  model?: string;
  /** frases que activan el agente (se buscan en los mensajes del usuario) */
  triggers: RegExp[];
  /** frases que devuelven el control al asistente base */
  exitTriggers: RegExp[];
  /** si false, el agente no recibe tools (dialogo puro, sin contabilidad/memoria activa) */
  useTools: boolean;
  /** si true, recibe solo la server-tool de busqueda web (para anclar hechos, no sustituir el dialogo) */
  webSearch?: boolean;
  /** categorias de memoria que puede ver (vacio = ninguna especifica) */
  categorias: string[];
  /** id de voz para TTS, futura fase */
  voiceId?: string;
};
