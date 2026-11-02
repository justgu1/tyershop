/**
 * Cache em memória das consultas que as páginas fazem ao backend a cada visita. Cada visita à home custava cerca de
 * 260 ms de CPU do backend (uma cascata de chamadas iguais para todo mundo); com isso, só a primeira dentro da janela paga.
 * Só entra aqui dado igual para qualquer visitante (nunca o que depende da conta). Falhas não são guardadas.
 */
type Entry = { at: number; value: unknown };

const store = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();
const MAX_ENTRIES = 200;

export async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>, keep: (v: T) => boolean = () => true): Promise<T> {
  const hit = store.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as T;

  // Várias visitas ao mesmo tempo esperam a mesma consulta em vez de repeti-la.
  const pending = inflight.get(key);
  if (pending) return pending as Promise<T>;

  const run = (async () => {
    try {
      const value = await load();
      if (keep(value)) {
        if (store.size >= MAX_ENTRIES) store.delete(store.keys().next().value as string);
        store.set(key, { at: Date.now(), value });
      }
      return value;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, run);
  return run;
}
