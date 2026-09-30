import type { Mensaje } from "@/lib/socrates";
import type { Agent } from "./types";
import { socratesFilosofo } from "./socrates-filosofo";

export type { Agent } from "./types";

/** Registro de agentes. Anadir aqui cada nuevo agente (Lucia, coach, etc.). */
export const AGENTS: Agent[] = [socratesFilosofo];

function matches(patterns: RegExp[], text: string): boolean {
  return patterns.some((re) => re.test(text));
}

/**
 * Determina el agente activo leyendo el historial de mas reciente a mas antiguo.
 * Sticky: si un mensaje activa un agente, sigue activo hasta que un mensaje
 * posterior lo desactive (exitTrigger) o active otro agente.
 * Devuelve null si el asistente base debe responder.
 */
export function detectActiveAgent(messages: Mensaje[]): Agent | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "user") continue;
    const text = m.content;

    // Salida explicita: gana si es lo mas reciente relevante.
    for (const agent of AGENTS) {
      if (matches(agent.exitTriggers, text)) return null;
    }
    // Activacion.
    for (const agent of AGENTS) {
      if (matches(agent.triggers, text)) return agent;
    }
  }
  return null;
}
