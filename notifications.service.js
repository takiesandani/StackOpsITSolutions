/**
 * NOTIFICATIONS SERVICE
 * ---------------------
 * Triggered by system events (DB updates)
 * 
 * This is a placeholder for future notification functionality.
 * Store this for reference when implementing notifications.
 */

export function sendNotification(clientId, message) {
  // Save notification to DB
  // Optionally push to websocket
  console.log(`Notify ${clientId}: ${message}`);
}

/** EXAMPLE USAGE:

sendNotification(
  clientId,
  "🔔 Invoice INV-1023 has been marked as Paid."
);

**/
