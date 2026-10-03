import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SignatureService } from './signature.service';

@Module({
  controllers: [AuthController],
  providers: [AuthService, SignatureService],
  exports: [AuthService, SignatureService],
})
export class AuthModule {}
