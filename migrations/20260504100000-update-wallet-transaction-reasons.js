/**
 * Migration: Update existing wallet transaction reasons to show platform fee breakdown
 * 
 * This migration updates wallet transaction reasons for delivery payments to include
 * platform fee information, making it clear what amount was deducted.
 */

export const up = async (queryInterface, Sequelize) => {
  try {
    console.log('🔄 Updating wallet transaction reasons to include platform fee info...');

    // Get platform fee percentage (default 10%)
    const [settings] = await queryInterface.sequelize.query(
      `SELECT value FROM platform_settings WHERE key = 'platform_fee_percent'`,
      { type: Sequelize.QueryTypes.SELECT }
    );
    const platformFeePercent = parseFloat(settings?.value || 10);

    // Get all CREDIT transactions for delivery payments
    const transactions = await queryInterface.sequelize.query(
      `SELECT id, amount, reason FROM wallet_transactions 
       WHERE type = 'CREDIT' 
       AND (reason LIKE '%Delivery payment%' OR reason LIKE '%delivery%')
       AND reason NOT LIKE '%Platform fee%'`,
      { type: Sequelize.QueryTypes.SELECT }
    );

    console.log(`📊 Found ${transactions.length} transactions to update`);

    for (const tx of transactions) {
      // Calculate what the original amount would have been (reverse calculation)
      // If credited amount is X and fee is 10%, then original = X / 0.9
      const creditedAmount = parseFloat(tx.amount);
      const originalAmount = Math.round(creditedAmount / (1 - platformFeePercent / 100));
      const platformFee = originalAmount - creditedAmount;

      // Update reason to include platform fee info
      const bookingRef = tx.reason.match(/booking ([A-Z0-9-]+)/)?.[1] || 'unknown';
      const newReason = `Delivery payment for booking ${bookingRef} (Amount: ₹${originalAmount}, Platform fee: ₹${platformFee})`;

      await queryInterface.sequelize.query(
        `UPDATE wallet_transactions SET reason = :newReason WHERE id = :id`,
        {
          replacements: { newReason, id: tx.id },
          type: Sequelize.QueryTypes.UPDATE
        }
      );
    }

    console.log('✅ Wallet transaction reasons updated successfully');
  } catch (error) {
    console.error('❌ Error updating wallet transaction reasons:', error.message);
    throw error;
  }
};

export const down = async (queryInterface, Sequelize) => {
  try {
    console.log('🔄 Reverting wallet transaction reason updates...');

    // Remove platform fee info from reasons
    await queryInterface.sequelize.query(
      `UPDATE wallet_transactions 
       SET reason = REGEXP_REPLACE(reason, ' \\(Amount: ₹[0-9]+, Platform fee: ₹[0-9]+\\)', '')
       WHERE reason LIKE '%Platform fee%'`,
      { type: Sequelize.QueryTypes.UPDATE }
    );

    console.log('✅ Wallet transaction reasons reverted');
  } catch (error) {
    console.error('❌ Error reverting wallet transaction reasons:', error.message);
    throw error;
  }
};
