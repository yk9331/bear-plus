'use strict';
// external modules
var Sequelize = require('sequelize');

module.exports = function (sequelize, DataTypes) {
  var Author = sequelize.define('Author', {
    id: {
      type: Sequelize.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    color: {
      type: DataTypes.STRING
    }
  }, {
    indexes: [
      {
        unique: true,
        fields: ['note_id', 'user_id']
      }
    ],
    updatedAt: 'updated_at',
    createdAt: 'created_at',
  });

  Author.associate = function (models) {
    Author.belongsTo(models.Note, {
      foreignKey: 'note_id',
      as: 'note',
      constraints: false,
      onDelete: 'CASCADE',
      hooks: true
    });
    Author.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user',
      constraints: false,
      onDelete: 'CASCADE',
      hooks: true
    });
  };

  return Author;
};
