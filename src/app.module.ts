import { Module } from '@nestjs/common';
import { AccountingModule } from '@/accounting/accounting.module';
import { DatabaseModule } from '@/database/database.module';
import { SchoolsModule } from '@/schools/schools.module';

@Module({
  imports: [AccountingModule, DatabaseModule, SchoolsModule],
})
export class AppModule {}
