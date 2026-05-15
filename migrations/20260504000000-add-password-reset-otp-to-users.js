/** @type {import('sequelize').QueryInterface} */
export async function up(queryInterface, Sequelize) {
  const tableDesc = await queryInterface.describeTable("users");

  if (!tableDesc.password_reset_otp) {
    await queryInterface.addColumn("users", "password_reset_otp", {
      type: Sequelize.STRING,
      allowNull: true,
      defaultValue: null,
    });
    console.log("✅ Added users.password_reset_otp");
  } else {
    console.log("[Migration] users.password_reset_otp already exists — skipping");
  }

  if (!tableDesc.password_reset_otp_expires) {
    await queryInterface.addColumn("users", "password_reset_otp_expires", {
      type: Sequelize.DATE,
      allowNull: true,
      defaultValue: null,
    });
    console.log("✅ Added users.password_reset_otp_expires");
  } else {
    console.log("[Migration] users.password_reset_otp_expires already exists — skipping");
  }
}

export async function down(queryInterface) {
  await queryInterface.removeColumn("users", "password_reset_otp");
  await queryInterface.removeColumn("users", "password_reset_otp_expires");
}
