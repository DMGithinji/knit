import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { InvoicesService } from './invoices.service';

@ApiTags('Invoices')
@Controller('schools/:schoolId/families/:familyAccountId/invoices')
export class InvoicesController {
  constructor(private readonly invoices: InvoicesService) {}

  @Post()
  @ApiOperation({ summary: 'Create a family invoice with line items' })
  create(
    @Param('schoolId') schoolId: string,
    @Param('familyAccountId') familyAccountId: string,
    @Body() input: CreateInvoiceDto,
  ) {
    return this.invoices.create(schoolId, familyAccountId, input);
  }

  @Get(':invoiceId')
  @ApiOperation({ summary: 'Get an invoice and its line-item breakdown' })
  findById(
    @Param('schoolId') schoolId: string,
    @Param('familyAccountId') familyAccountId: string,
    @Param('invoiceId') invoiceId: string,
  ) {
    return this.invoices.findById(schoolId, familyAccountId, invoiceId);
  }
}
