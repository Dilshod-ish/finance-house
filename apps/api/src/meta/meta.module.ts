import { Module } from '@nestjs/common';
import { HealthController } from './health.controller.js';
import { MetaController } from './meta.controller.js';

@Module({
  controllers: [MetaController, HealthController],
})
export class MetaModule {}
