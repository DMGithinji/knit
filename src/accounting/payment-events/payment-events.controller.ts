import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
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

@ApiTags('Payment events')
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
  @ApiOperation({ summary: 'Capture a payment provider callback' })
  capture(@Param('schoolId') schoolId: string, @Body() payload: PaymentEventDto) {
    return this.paymentCapture.capture(schoolId, payload);
  }

  @Get()
  @ApiOperation({ summary: 'Search payment events for a school' })
  search(@Param('schoolId') schoolId: string, @Query() query: SearchPaymentEventsDto) {
    return this.paymentQueries.search(schoolId, query);
  }

  @Get(':eventId')
  @ApiOperation({ summary: 'Get a payment event and its processing outcome' })
  findById(@Param('schoolId') schoolId: string, @Param('eventId') eventId: string) {
    return this.paymentQueries.findById(schoolId, eventId);
  }

  @Post(':eventId/reconcile')
  @ApiOperation({ summary: 'Retry one payment event' })
  reconcile(@Param('schoolId') schoolId: string, @Param('eventId') eventId: string) {
    return this.paymentReconciliation.reconcile(schoolId, eventId);
  }

  @Post('reconcile-pending')
  @ApiOperation({ summary: 'Retry recoverable payment events for a school' })
  reconcilePending(@Param('schoolId') schoolId: string) {
    return this.paymentReconciliation.reconcilePending(schoolId);
  }

  @Post(':eventId/resolve')
  @ApiOperation({ summary: 'Record an audited human resolution' })
  resolveManually(
    @Param('schoolId') schoolId: string,
    @Param('eventId') eventId: string,
    @Body() input: ManualPaymentEventResolutionDto,
  ) {
    return this.paymentReviews.recordDecision(schoolId, eventId, input);
  }
}
