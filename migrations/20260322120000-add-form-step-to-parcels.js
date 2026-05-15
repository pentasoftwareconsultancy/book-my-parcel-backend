export const up = async (queryInterface, Sequelize) => {
  await queryInterface.addColumn('parcel', 'form_step', {
    type: Sequelize.INTEGER,
    allowNull: false,
    defaultValue: 1,
    comment: 'Current step in form: 1=details, 2=select traveller, 3=payment'
  });

  await queryInterface.addColumn('parcel', 'selected_acceptance_id', {
    type: Sequelize.UUID,
    allowNull: true,
    references: {
      model: 'parcel_acceptances',
      key: 'id'
    },
    onUpdate: 'CASCADE',
    onDelete: 'SET NULL',
    comment: 'Acceptance selected by user in step 2 (before booking creation)'
  });

  // Update existing parcels based on their status
  // If they have a booking, they completed all steps
  await queryInterface.sequelize.query(`
    UPDATE parcel 
    SET form_step = 3 
    WHERE id IN (SELECT parcel_id FROM booking)
  `);
};

export const down = async (queryInterface, Sequelize) => {
  await queryInterface.removeColumn('parcel', 'selected_acceptance_id');
  await queryInterface.removeColumn('parcel', 'form_step');
};
