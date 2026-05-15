export const up = async (queryInterface, Sequelize) => {
  await queryInterface.addColumn("feedbacks", "tags", {
    type: Sequelize.JSONB,
    allowNull: true,
    defaultValue: [],
  });
};

export const down = async (queryInterface) => {
  await queryInterface.removeColumn("feedbacks", "tags");
};
