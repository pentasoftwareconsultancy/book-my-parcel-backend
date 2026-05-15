export const up = async (queryInterface) => {
  await queryInterface.addIndex("wallets", ["user_id"], {
    name: "uniq_wallets_user_id",
    unique: true,
    ifNotExists: true,
  });
};

export const down = async (queryInterface) => {
  await queryInterface.removeIndex("wallets", "uniq_wallets_user_id");
};
