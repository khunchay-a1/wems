import { applyDecorators } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';

/**
 * OpenAPI operation with operationId `<Tag>_<verb><Noun>` (docs/04-api-conventions.md §1).
 * The id becomes the method name in generated web/mobile clients.
 */
export function Op(tag: string, verbNoun: string, summary: string): MethodDecorator {
  if (!/^[a-z][A-Za-z0-9]+$/.test(verbNoun)) {
    throw new Error(`operationId part "${verbNoun}" must be camelCase verbNoun`);
  }
  return applyDecorators(ApiOperation({ operationId: `${tag}_${verbNoun}`, summary }));
}
