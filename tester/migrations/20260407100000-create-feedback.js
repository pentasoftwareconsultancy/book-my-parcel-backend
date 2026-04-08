// MIGRATION FILE
// Migrations are version-controlled DB schema changes.
// Sequelize runs them in order by filename timestamp.
// "up" = apply the change, "down" = revert it.

export const up = async (queryInterface, Sequelize) => {
  // createTable creates a new table in PostgreSQL
  await queryInterface.createTable('feedbacks', {

    id: {
      type: Sequelize.UUID,           // UUID = universally unique identifier (better than auto-increment for distributed systems)
      primaryKey: true,               // marks this as the unique row identifier
      defaultValue: Sequelize.literal('gen_random_uuid()'), // PostgreSQL generates UUID automatically
    },

    booking_id: {
      type: Sequelize.UUID,
      allowNull: false,               // every feedback MUST belong to a booking
      unique: true,                   // ONE feedback per booking — prevents duplicate submissions
      references: { model: 'booking', key: 'id' }, // FK constraint — booking must exist
      onDelete: 'CASCADE',            // if booking is deleted, feedback is also deleted
    },

    parcel_id: {
      type: Sequelize.UUID,
      allowNull: false,               // stored for quick lookups without joining booking
    },

    user_id: {
      type: Sequelize.UUID,
      allowNull: false,               // the user (parcel sender) who submitted the feedback
    },

    traveller_id: {
      type: Sequelize.UUID,
      allowNull: false,               // the traveller being rated — used to calculate avg rating
    },

    rating: {
      type: Sequelize.INTEGER,        // INTEGER not DECIMAL — stars are whole numbers (1-5)
      allowNull: false,
    },

    tags: {
      type: Sequelize.JSONB,          // JSONB = binary JSON in PostgreSQL, faster to query than plain JSON
      allowNull: true,                // optional — user may not select any tags
    },

    comment: {
      type: Sequelize.TEXT,           // TEXT = unlimited length string (vs VARCHAR which has a limit)
      allowNull: true,                // optional written review
    },

    createdAt: {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal('NOW()'),
    },

    updatedAt: {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal('NOW()'),
    },
  });

  // Index on traveller_id — speeds up queries like "get all feedback for this traveller"
  // Without an index, PostgreSQL does a full table scan (slow at scale)
  await queryInterface.addIndex('feedbacks', ['traveller_id']);
};

export const down = async (queryInterface) => {
  // Reverts the migration — drops the table entirely
  await queryInterface.dropTable('feedbacks');
};
