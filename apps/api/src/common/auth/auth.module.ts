import { Global, Module } from '@nestjs/common';
import { ProjectAccessService } from './project-access.service';
import { TokenService } from './token.service';

@Global()
@Module({
  providers: [TokenService, ProjectAccessService],
  exports: [TokenService, ProjectAccessService],
})
export class AuthCoreModule {}
