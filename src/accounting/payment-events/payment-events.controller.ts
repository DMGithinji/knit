import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { PaymentEventDto } from './dto/payment-event.dto';
import { PaymentEventsService } from './payment-events.service';

@Controller('schools/:schoolId/payment-events')
export class PaymentEventsController {
  constructor(private readonly paymentEvents: PaymentEventsService) {}

  @Post('callback')
  ingest(@Param('schoolId') schoolId: string, @Body() payload: PaymentEventDto) {
    return this.paymentEvents.ingest(schoolId, payload);
  }

  @Get(':eventId')
  findById(@Param('schoolId') schoolId: string, @Param('eventId') eventId: string) {
    return this.paymentEvents.findById(schoolId, eventId);
  }

  @Post(':eventId/reconcile')
  reconcile(@Param('schoolId') schoolId: string, @Param('eventId') eventId: string) {
    return this.paymentEvents.reconcile(schoolId, eventId);
  }
}
