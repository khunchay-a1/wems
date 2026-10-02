import { Global, Module } from '@nestjs/common';
import { GotenbergClient } from './gotenberg.client';
import { PdfService } from './pdf.service';
import { StampService } from './stamp.service';

@Global()
@Module({
  providers: [GotenbergClient, PdfService, StampService],
  exports: [GotenbergClient, PdfService, StampService],
})
export class PdfModule {}
