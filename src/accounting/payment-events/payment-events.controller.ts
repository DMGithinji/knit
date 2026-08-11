import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import {
  ManualPaymentEventResolutionDto,
  PaymentEventDto,
  SearchPaymentEventsDto,
} from './dto/payment-event.dto';
import {
  PaymentCaptureService,
  PaymentQueryService,
  PaymentReconciliationService,
  PaymentReviewService,
} from './services';

@Controller('schools/:schoolId/payment-events')
export class PaymentEventsController {
  constructor(
    private readonly paymentCapture: PaymentCaptureService,
    private readonly paymentQueries: PaymentQueryService,
    private readonly paymentReconciliation: PaymentReconciliationService,
    private readonly paymentReviews: PaymentReviewService,
  ) {}

  @Post('callback')
  @HttpCode(HttpStatus.OK)
  capture(@Param('schoolId') schoolId: string, @Body() payload: PaymentEventDto) {
    return this.paymentCapture.capture(schoolId, payload);
  }

  @Get()
  search(@Param('schoolId') schoolId: string, @Query() query: SearchPaymentEventsDto) {
    return this.paymentQueries.search(schoolId, query);
  }

  @Get(':eventId')
  findById(@Param('schoolId') schoolId: string, @Param('eventId') eventId: string) {
    return this.paymentQueries.findById(schoolId, eventId);
  }

  @Post(':eventId/reconcile')
  reconcile(@Param('schoolId') schoolId: string, @Param('eventId') eventId: string) {
    return this.paymentReconciliation.reconcile(schoolId, eventId);
  }

  @Post('reconcile-pending')
  reconcilePending(@Param('schoolId') schoolId: string) {
    return this.paymentReconciliation.reconcilePending(schoolId);
  }

  @Post(':eventId/resolve')
  resolveManually(
    @Param('schoolId') schoolId: string,
    @Param('eventId') eventId: string,
    @Body() input: ManualPaymentEventResolutionDto,
  ) {
    return this.paymentReviews.recordDecision(schoolId, eventId, input);
  }
}
