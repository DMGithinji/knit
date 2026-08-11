import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { InvoicesService } from './invoices.service';

@Controller('schools/:schoolId/families/:familyAccountId/invoices')
export class InvoicesController {
  constructor(private readonly invoices: InvoicesService) {}

  @Post()
  create(
    @Param('schoolId') schoolId: string,
    @Param('familyAccountId') familyAccountId: string,
    @Body() input: CreateInvoiceDto,
  ) {
    return this.invoices.create(schoolId, familyAccountId, input);
  }

  @Get(':invoiceId')
  findById(
    @Param('schoolId') schoolId: string,
    @Param('familyAccountId') familyAccountId: string,
    @Param('invoiceId') invoiceId: string,
  ) {
    return this.invoices.findById(schoolId, familyAccountId, invoiceId);
  }
}
