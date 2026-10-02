import { type ErrorCode, statusOf } from './error-codes';

export interface FieldError {
  field: string;
  code: string;
  message?: string;
  /** Row number for imports (IMPORT_INVALID_ROWS) */
  row?: number;
  column?: string;
}

export interface ProblemOptions {
  /** Business rule id, e.g. "BR-DOC-030" */
  rule?: string;
  errors?: FieldError[];
  /** Overrides the catalog detail (already-localized text is not expected here; prefer codes) */
  detail?: string;
  /** Extra members merged into the problem body, e.g. { current } for 409 conflicts */
  extra?: Record<string, unknown>;
  /** Extra response headers, e.g. Retry-After */
  headers?: Record<string, string>;
}

/**
 * The single exception type for expected API errors (CLAUDE.md rule 8).
 * Rendered as RFC 9457 problem+json by ProblemFilter with localized title/detail.
 */
export class Problem extends Error {
  readonly status: number;

  constructor(
    readonly code: ErrorCode,
    readonly options: ProblemOptions = {},
  ) {
    super(code);
    this.name = 'Problem';
    this.status = statusOf(code);
  }
}

export const NotFoundProblem = (): Problem => new Problem('NOT_FOUND');
export const ForbiddenProblem = (rule?: string): Problem => new Problem('FORBIDDEN', { rule });
export const ConflictProblem = (
  code: Extract<ErrorCode, 'CONFLICT_STALE_VERSION' | 'INVALID_STATE_TRANSITION' | 'DUPLICATE'>,
  extra?: Record<string, unknown>,
): Problem => new Problem(code, { extra });

export function validationProblem(errors: FieldError[]): Problem {
  return new Problem('VALIDATION_FAILED', { errors });
}
