import { SetMetadata } from '@nestjs/common';
import type { Feature } from '@legalflow/domain';

export const FEATURE_KEY = 'requiresFeature';

/** Exige que el plan del despacho incluya `feature`. Se evalúa en EntitlementsGuard (lee tenant.plan). */
export const RequiresFeature = (feature: Feature) => SetMetadata(FEATURE_KEY, feature);
