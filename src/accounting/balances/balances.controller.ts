import { Controller, Get, Param } from '@nestjs/common';
import { BalancesService } from './balances.service';

@Controller('schools/:schoolId/families/:familyAccountId/balance')
export class BalancesController {
  constructor(private readonly balances: BalancesService) {}

  @Get()
  getFamilyBalance(
    @Param('schoolId') schoolId: string,
    @Param('familyAccountId') familyAccountId: string,
  ) {
    return this.balances.getFamilyBalance(schoolId, familyAccountId);
  }
}
