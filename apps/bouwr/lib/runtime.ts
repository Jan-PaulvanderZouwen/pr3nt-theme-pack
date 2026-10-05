import Database from "better-sqlite3";
import { mkdirSync, chmodSync } from "node:fs";
import { readFile, writeFile, unlink } from "node:fs/promises";
import path from "node:path";

export const dataDirectory = () =>
  path.resolve(process.env.DATA_DIR || "./data");
let sqlite: Database.Database | undefined;
export function getSqlite() {
  if (!sqlite) {
    mkdirSync(dataDirectory(), { recursive: true, mode: 0o700 });
    const filename = path.join(dataDirectory(), "bouwr.sqlite");
    sqlite = new Database(filename);
    chmodSync(filename, 0o600);
    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("foreign_keys = ON");
    sqlite.pragma("busy_timeout = 5000");
  }
  return sqlite;
}

type Value = string | number | bigint | Buffer | null;
class Statement {
  constructor(
    readonly sql: string,
    readonly values: Value[] = [],
  ) {}
  bind(...values: unknown[]) {
    return new Statement(
      this.sql,
      values.map((v) => (v === undefined ? null : v)) as Value[],
    );
  }
  async first<T = Record<string, unknown>>() {
    return (
      (getSqlite()
        .prepare(this.sql)
        .get(...this.values) as T | undefined) ?? null
    );
  }
  async all<T = Record<string, unknown>>() {
    return {
      results: getSqlite()
        .prepare(this.sql)
        .all(...this.values) as T[],
    };
  }
  execute() {
    const result = getSqlite()
      .prepare(this.sql)
      .run(...this.values);
    return {
      success: true,
      meta: {
        changes: result.changes,
        last_row_id: Number(result.lastInsertRowid),
      },
    };
  }
  async run() {
    return this.execute();
  }
}
const database = {
  prepare(sql: string) {
    return new Statement(sql);
  },
  async batch(statements: Statement[]) {
    return getSqlite().transaction(() =>
      statements.map((statement) => statement.execute()),
    )();
  },
};
function uploadPath(id: string) {
  if (!/^[a-f0-9-]{36}$/i.test(id)) throw new Error("Ongeldig bestandsnummer.");
  const directory = path.join(dataDirectory(), "uploads");
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  return path.join(directory, id);
}
const bucket = {
  async get(id: string) {
    try {
      return { body: new Uint8Array(await readFile(uploadPath(id))).buffer };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  },
  async put(id: string, bytes: ArrayBuffer, _options?: unknown) {
    await writeFile(uploadPath(id), Buffer.from(bytes), {
      mode: 0o600,
      flag: "wx",
    });
  },
  async delete(id: string) {
    try {
      await unlink(uploadPath(id));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  },
};
export const env = { DB: database, BUCKET: bucket };
