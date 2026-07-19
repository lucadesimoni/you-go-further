import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Tiny durable JSON document. Reads the whole document into memory and writes it
 * back atomically (temp file + rename) on each change. Node-only — used by the
 * file-backed stores; never imported by the browser bundle.
 */
export class JsonFile<T> {
  constructor(
    private readonly path: string,
    private readonly fallback: T,
  ) {}

  read(): T {
    try {
      if (!existsSync(this.path)) return structuredClone(this.fallback);
      return JSON.parse(readFileSync(this.path, "utf8")) as T;
    } catch {
      return structuredClone(this.fallback);
    }
  }

  write(value: T): void {
    mkdirSync(dirname(this.path), { recursive: true });
    const tmp = `${this.path}.tmp`;
    writeFileSync(tmp, JSON.stringify(value));
    renameSync(tmp, this.path);
  }
}
