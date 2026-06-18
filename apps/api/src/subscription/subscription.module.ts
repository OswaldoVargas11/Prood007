import { Module } from '@nestjs/common';
import { SubscriptionController } from './subscription.controller';
import { SubscriptionWebhookController } from './subscription-webhook.controller';
import { SubscriptionService } from './subscription.service';
import { StripeBillingService } from './stripe-billing.service';

@Module({
  controllers: [SubscriptionController, SubscriptionWebhookController],
  providers: [SubscriptionService, StripeBillingService],
  exports: [SubscriptionService],
})
export class SubscriptionModule {}
