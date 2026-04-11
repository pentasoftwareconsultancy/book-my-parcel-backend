export async function up(queryInterface, Sequelize) {
  await queryInterface.addColumn("feedbacks", "tags", {
    type: Sequelize.JSONB,
    allowNull: true,
    defaultValue: [],
  });
}

export async function down(queryInterface) {
  await queryInterface.removeColumn("feedbacks", "tags");
}
