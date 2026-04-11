export const up = async (queryInterface, Sequelize) => {
  await queryInterface.addColumn("booking", "user_id", {
    type: Sequelize.UUID,
    allowNull: true,
    comment: "Parcel owner (from parcel.user_id)",
  });

  await queryInterface.addColumn("booking", "amount", {
    type: Sequelize.DECIMAL(10, 2),
    allowNull: true,
    comment: "Booking amount",
  });

  // Add foreign key constraint for user_id if not already present
  try {
    await queryInterface.addConstraint("booking", {
      fields: ["user_id"],
      type: "foreign key",
      name: "booking_user_id_fk",
      references: {
        table: "user",
        field: "id",
      },
      onDelete: "SET NULL",
      onUpdate: "CASCADE",
    });
  } catch (err) {
    // Foreign key might already exist
    console.log("Foreign key constraint might already exist:", err.message);
  }
};

export const down = async (queryInterface) => {
  try {
    await queryInterface.removeConstraint("booking", "booking_user_id_fk");
  } catch (err) {
    console.log("Constraint might not exist:", err.message);
  }

  await queryInterface.removeColumn("booking", "user_id");
  await queryInterface.removeColumn("booking", "amount");
};
