// Genera el valor de AUTH_PASSWORD_HASH (PBKDF2-SHA256 con sal).
// Uso:  node scripts/hash-password.mjs
// Pide la contraseña por teclado (no queda en el historial del shell) e imprime
// la linea que hay que poner en Vercel / .env.local.
import { pbkdf2Sync, randomBytes } from "node:crypto";
import { createInterface } from "node:readline";

const ITERATIONS = 600_000;

const rl = createInterface({ input: process.stdin, output: process.stderr, terminal: true });
rl._writeToOutput = (s) => {
  // no mostrar lo que se teclea
  if (s.includes("Contraseña")) process.stderr.write(s);
};
rl.question("Contraseña (minimo 16 caracteres): ", (password) => {
  rl.close();
  process.stderr.write("\n");
  if (password.length < 16) {
    console.error("Demasiado corta: usa al menos 16 caracteres (mejor una frase de 5+ palabras).");
    process.exit(1);
  }
  const salt = randomBytes(16);
  const hash = pbkdf2Sync(password, salt, ITERATIONS, 32, "sha256");
  console.log(`AUTH_PASSWORD_HASH=pbkdf2:${ITERATIONS}:${salt.toString("hex")}:${hash.toString("hex")}`);
});
