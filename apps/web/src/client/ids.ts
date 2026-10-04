import { v7 as uuidv7 } from 'uuid'

/** Client-generated UUIDv7 for creating requests; the server dedupes with ON CONFLICT (API Spec §1). */
export function newId(): string {
  return uuidv7()
}
