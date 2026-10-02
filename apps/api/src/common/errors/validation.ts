import { ValidationPipe, type ValidationError } from '@nestjs/common';
import { type FieldError, validationProblem } from './problem';

function flatten(errors: ValidationError[], parent = ''): FieldError[] {
  const out: FieldError[] = [];
  for (const e of errors) {
    const field = parent ? `${parent}.${e.property}` : e.property;
    for (const [constraint, message] of Object.entries(e.constraints ?? {})) {
      out.push({ field, code: constraintCode(constraint), message });
    }
    if (e.children?.length) out.push(...flatten(e.children, field));
  }
  return out;
}

function constraintCode(constraint: string): string {
  if (constraint === 'whitelistValidation') return 'UNKNOWN_FIELD';
  if (constraint === 'isNotEmpty' || constraint === 'isDefined') return 'REQUIRED';
  return constraint.replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase();
}

/** Global DTO validation → 400 VALIDATION_FAILED with errors[] (docs/04-api-conventions.md §5). */
export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: false },
    exceptionFactory: (errors) => validationProblem(flatten(errors)),
  });
}
