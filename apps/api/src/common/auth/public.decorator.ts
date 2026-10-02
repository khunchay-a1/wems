import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'wems:isPublic';

/** Marks a route as not requiring authentication. */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC, true);
