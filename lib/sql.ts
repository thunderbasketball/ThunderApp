import type { Pool, PoolClient, QueryResultRow } from "pg";

export interface Queryable {
  query<R extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[],
  ): Promise<{ rows: R[]; rowCount: number | null }>;
}

// Runs fn in one transaction. A thrown error rolls back; a normal return commits.
export async function withTx<T>(pool: Pool, fn: (q: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }
}
