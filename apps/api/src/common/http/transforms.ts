/** class-transformer helpers for request DTOs (typed so lint sees no `any`). */
type In = { value: unknown };

export const trim = ({ value }: In): unknown => (typeof value === 'string' ? value.trim() : value);

/** "" → null so optional text fields can be cleared. */
export const emptyToNull = ({ value }: In): unknown =>
  typeof value === 'string' ? value.trim() || null : value;

/** Query string booleans. */
export const toBool = ({ value }: In): unknown =>
  value === 'true' ? true : value === 'false' ? false : value;

/** Codes: trimmed upper case; "" → undefined. */
export const upperCode = ({ value }: In): unknown =>
  typeof value === 'string' ? value.trim().toUpperCase() || undefined : value;
