'use strict';

/**
 * Sequelize model — `jockey_assignment_promotions` table.
 * Embedded `promotion{}` — backup promoted to primary.
 */

module.exports = (sequelize, DataTypes) => {
    const JockeyAssignmentPromotion = sequelize.define(
        'jockey_assignment_promotions',
        {
            id: {
                type: DataTypes.UUID,
                primaryKey: true,
                defaultValue: sequelize.literal('gen_random_uuid()')
            },
            assignment_id: { type: DataTypes.UUID, allowNull: false, unique: true },
            promoted_at: { type: DataTypes.DATE },
            promoted_by: { type: DataTypes.UUID },
            reason: { type: DataTypes.TEXT },
            previous_primary_assignment_id: { type: DataTypes.UUID }
        },
        { tableName: 'jockey_assignment_promotions' }
    );

    JockeyAssignmentPromotion.associate = (models) => {
        JockeyAssignmentPromotion.belongsTo(models.JockeyAssignment, { foreignKey: 'assignment_id', as: 'assignment' });
        JockeyAssignmentPromotion.belongsTo(models.User, { foreignKey: 'promoted_by', as: 'promoter' });
        JockeyAssignmentPromotion.belongsTo(models.JockeyAssignment, { foreignKey: 'previous_primary_assignment_id', as: 'previous_primary' });
    };

    return JockeyAssignmentPromotion;
};