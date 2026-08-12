import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { BalancesService } from './balances.service';

@ApiTags('Balances')
@Controller('schools/:schoolId/families/:familyAccountId/balance')
export class BalancesController {
  constructor(private readonly balances: BalancesService) {}

  @Get()
  @ApiOperation({ summary: 'Explain a family balance and any credit' })
  getFamilyBalance(
    @Param('schoolId') schoolId: string,
    @Param('familyAccountId') familyAccountId: string,
  ) {
    return this.balances.getFamilyBalance(schoolId, familyAccountId);
  }
}
