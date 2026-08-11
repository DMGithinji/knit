import { Module } from '@nestjs/common';
import { AccountingModule } from '@/accounting/accounting.module';
import { DatabaseModule } from '@/database/database.module';
import { SchoolsModule } from '@/schools/schools.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [AccountingModule, DatabaseModule, SchoolsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
