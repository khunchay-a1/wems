import { Module } from '@nestjs/common';
import { ClientsModule } from '../clients/clients.module';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';

/** M03 projects and teams (docs/modules/M03-projects.md). */
@Module({
  imports: [ClientsModule],
  controllers: [ProjectsController],
  providers: [ProjectsService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
