import { Queue } from "bullmq";
import { createBullMQConnection } from "../redis/bullmq.connection.js";

const ASYNC_TASK_QUEUE_NAME = "async-task-queue";

// Fresh isolated connection — never shares the main redis instance
const queueConnection = createBullMQConnection();

const asyncTaskQueue = queueConnection
  ? new Queue(ASYNC_TASK_QUEUE_NAME, {
      connection: queueConnection,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 2000,
        },
        removeOnComplete: 100,
        removeOnFail: 100,
      },
    })
  : null;

if (!asyncTaskQueue) {
  console.warn("⚠️ [AsyncTaskQueue] Redis not available — queue producer disabled");
}

async function runTaskInline(taskName, payload) {
  switch (taskName) {
    case "process_referral_signup": {
      const { processReferralOnSignup } = await import("../services/referral.service.js");
      await processReferralOnSignup(payload.userId, payload.referralCode);
      break;
    }
    case "credit_referral_first_delivery": {
      const { creditReferralOnFirstDelivery } = await import("../services/referral.service.js");
      await creditReferralOnFirstDelivery(payload.userId);
      break;
    }
    case "refund_payment_for_parcel": {
      const { refundPaymentForParcel } = await import("../modules/payment/payment.service.js");
      await refundPaymentForParcel(payload.parcelId, payload.reason);
      break;
    }
    case "match_parcel_with_travellers": {
      const { matchParcelWithTravellers } = await import("../services/matchingEngine.service.js");
      const { sendToTraveller } = await import("../services/notification.service.js");
      const matchResult = await matchParcelWithTravellers(payload.parcelId);

      if (matchResult?.requests?.length) {
        for (const request of matchResult.requests) {
          await sendToTraveller(
            request.traveller_id,
            "New Parcel Available",
            `A new parcel is available for delivery from ${payload.pickupCity} to ${payload.deliveryCity}`,
            { parcel_id: payload.parcelId, type: "new_parcel_request" }
          );
        }
      }
      break;
    }
    case "match_route_with_existing_parcels": {
      const { matchRouteWithExistingParcels } = await import("../services/matchingEngine.service.js");
      await matchRouteWithExistingParcels(payload.routeId);
      break;
    }
    default:
      throw new Error(`Unsupported inline task: ${taskName}`);
  }
}

export async function enqueueAsyncTask(taskName, payload, options = {}) {
  if (!asyncTaskQueue) {
    return runTaskInline(taskName, payload);
  }

  await asyncTaskQueue.add(taskName, payload, options);
}

export { asyncTaskQueue };
export { ASYNC_TASK_QUEUE_NAME };
