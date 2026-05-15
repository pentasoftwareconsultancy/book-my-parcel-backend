import { Worker } from "bullmq";
import redis from "../redis/redis.config.js";
import { createBullMQConnection } from "../redis/bullmq.connection.js";
import { ASYNC_TASK_QUEUE_NAME } from "./asyncTasks.queue.js";
import { processReferralOnSignup, creditReferralOnFirstDelivery } from "../services/referral.service.js";
import { refundPaymentForParcel } from "../modules/payment/payment.service.js";
import { matchParcelWithTravellers, matchRouteWithExistingParcels } from "../services/matchingEngine.service.js";
import { sendToTraveller } from "../services/notification.service.js";

if (!redis) {
  console.warn("⚠️ [AsyncTaskWorker] Redis not available — worker disabled");
}

// Fresh isolated connection — never shares the main redis instance
const workerConnection = createBullMQConnection();

const asyncTaskWorker = workerConnection
  ? new Worker(
      ASYNC_TASK_QUEUE_NAME,
      async (job) => {
        switch (job.name) {
          case "process_referral_signup":
            await processReferralOnSignup(job.data.userId, job.data.referralCode);
            break;
          case "credit_referral_first_delivery":
            await creditReferralOnFirstDelivery(job.data.userId);
            break;
          case "refund_payment_for_parcel":
            await refundPaymentForParcel(job.data.parcelId, job.data.reason);
            break;
          case "match_parcel_with_travellers": {
            const matchResult = await matchParcelWithTravellers(job.data.parcelId);
            if (matchResult?.requests?.length) {
              for (const request of matchResult.requests) {
                await sendToTraveller(
                  request.traveller_id,
                  "New Parcel Available",
                  `A new parcel is available for delivery from ${job.data.pickupCity} to ${job.data.deliveryCity}`,
                  { parcel_id: job.data.parcelId, type: "new_parcel_request" }
                );
              }
            }
            break;
          }
          case "match_route_with_existing_parcels":
            await matchRouteWithExistingParcels(job.data.routeId);
            break;
          default:
            throw new Error(`Unknown async task job: ${job.name}`);
        }
      },
      {
        connection: workerConnection,
        concurrency: 5,
      }
    )
  : null;

if (asyncTaskWorker) {
  asyncTaskWorker.on("completed", (job) => {
    console.log(`✅ [AsyncTaskWorker] Job completed: ${job.name} (${job.id})`);
  });

  asyncTaskWorker.on("failed", (job, err) => {
    console.error(`❌ [AsyncTaskWorker] Job failed: ${job?.name} (${job?.id})`, err.message);
  });
}

export default asyncTaskWorker;
