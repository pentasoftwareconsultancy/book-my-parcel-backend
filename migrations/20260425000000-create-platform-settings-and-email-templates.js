import { QueryTypes } from "sequelize";

export async function up(queryInterface, Sequelize) {
  // ── 1. platform_settings ─────────────────────────────────────────────────
  const tables = await queryInterface.showAllTables();

  if (!tables.includes("platform_settings")) {
    await queryInterface.createTable("platform_settings", {
      id:         { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      key:        { type: Sequelize.STRING(100), allowNull: false, unique: true },
      value:      { type: Sequelize.TEXT, allowNull: false },
      category:   { type: Sequelize.STRING(50), allowNull: false },
      data_type:  { type: Sequelize.STRING(10), allowNull: false, defaultValue: "string" },
      updated_at: { type: Sequelize.DATE, defaultValue: Sequelize.literal("NOW()") },
    });
    console.log("✅ Created platform_settings table");
  }

  // Seed with ON CONFLICT DO NOTHING — safe to run even if rows exist
  await queryInterface.sequelize.query(`
    INSERT INTO platform_settings (key, value, category, data_type, updated_at) VALUES
    ('platform_name',               'Book My Parcel',          'GENERAL',       'string',  NOW()),
    ('support_email',               'support@bookmyparcel.com','GENERAL',       'string',  NOW()),
    ('support_phone',               '+91 98765 43210',         'GENERAL',       'string',  NOW()),
    ('max_booking_distance',        '2000',                    'GENERAL',       'number',  NOW()),
    ('min_booking_amount',          '100',                     'GENERAL',       'number',  NOW()),
    ('auto_approve_users',          'false',                   'GENERAL',       'boolean', NOW()),
    ('auto_assign_partners',        'false',                   'GENERAL',       'boolean', NOW()),
    ('platform_fee_percent',        '10',                      'PAYMENTS',      'number',  NOW()),
    ('partner_commission_percent',  '90',                      'PAYMENTS',      'number',  NOW()),
    ('min_withdrawal_amount',       '1000',                    'PAYMENTS',      'number',  NOW()),
    ('max_withdrawal_amount',       '50000',                   'PAYMENTS',      'number',  NOW()),
    ('payment_method',              'UPI Payments',            'PAYMENTS',      'string',  NOW()),
    ('email_notifications_enabled', 'true',                    'NOTIFICATIONS', 'boolean', NOW()),
    ('sms_notifications_enabled',   'true',                    'NOTIFICATIONS', 'boolean', NOW()),
    ('push_notifications_enabled',  'true',                    'NOTIFICATIONS', 'boolean', NOW()),
    ('admin_alerts_enabled',        'true',                    'NOTIFICATIONS', 'boolean', NOW()),
    ('two_factor_auth',             'false',                   'SECURITY',      'boolean', NOW()),
    ('session_timeout_mins',        '30',                      'SECURITY',      'number',  NOW()),
    ('password_expiry_days',        '90',                      'SECURITY',      'number',  NOW()),
    ('max_login_attempts',          '5',                       'SECURITY',      'number',  NOW())
    ON CONFLICT (key) DO NOTHING
  `, { type: QueryTypes.INSERT });

  console.log("✅ Seeded platform_settings (skipped existing rows)");

  // ── 2. email_templates ───────────────────────────────────────────────────
  if (!tables.includes("email_templates")) {
    await queryInterface.createTable("email_templates", {
      id:         { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      slug:       { type: Sequelize.STRING(100), allowNull: false, unique: true },
      name:       { type: Sequelize.STRING(150), allowNull: false },
      subject:    { type: Sequelize.STRING(255), allowNull: false },
      body_html:  { type: Sequelize.TEXT, allowNull: false },
      updated_at: { type: Sequelize.DATE, defaultValue: Sequelize.literal("NOW()") },
    });
    console.log("✅ Created email_templates table");
  }

  await queryInterface.sequelize.query(`
    INSERT INTO email_templates (slug, name, subject, body_html, updated_at) VALUES
    ('welcome-email',        'Welcome Email',        'Welcome to Book My Parcel!',        '<h1>Welcome!</h1><p>We are glad to have you on board.</p>',                     NOW()),
    ('booking-confirmation', 'Booking Confirmation', 'Your Booking is Confirmed',         '<h1>Booking Confirmed</h1><p>Your parcel booking has been confirmed.</p>',      NOW()),
    ('partner-verification', 'Partner Verification', 'Your Partner Account is Verified',  '<h1>Verified!</h1><p>Your partner account has been verified successfully.</p>', NOW()),
    ('dispute-created',      'Dispute Created',      'A New Dispute Has Been Raised',     '<h1>Dispute Raised</h1><p>A dispute has been raised for your booking.</p>',     NOW()),
    ('password-reset',       'Password Reset',       'Reset Your Password',               '<h1>Password Reset</h1><p>Click the link below to reset your password.</p>',   NOW())
    ON CONFLICT (slug) DO NOTHING
  `, { type: QueryTypes.INSERT });

  console.log("✅ Seeded email_templates (skipped existing rows)");
}

export async function down(queryInterface) {
  await queryInterface.dropTable("email_templates").catch(() => {});
  await queryInterface.dropTable("platform_settings").catch(() => {});
}
