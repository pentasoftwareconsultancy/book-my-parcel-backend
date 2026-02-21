import sequelize from "../config/database.config";

export async function generatePrefixedId(sequenceName, prefix) {
  const result = await sequelize.query(
    `SELECT nextval('${sequenceName}') as seq`,
    { type: sequelize.QueryTypes.SELECT }
  );

  return prefix + result[0].seq;
}
