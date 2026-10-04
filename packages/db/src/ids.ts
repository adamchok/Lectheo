import { v7 } from 'uuid'

/** UUIDv7 generated in the app (Postgres 17 has no built-in v7). */
export const uuidv7 = (): string => v7()
