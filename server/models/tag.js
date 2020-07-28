'use strict';
const Sequelize = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  const Tag = sequelize.define('Tag', {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: Sequelize.UUIDV4
    },
    tag: {
      type: DataTypes.TEXT,
    },
  });

  Tag.associate = function (models) {
    Tag.belongsToMany(models.Note, {
      through: 'NoteTags',
    });
  };
  return Tag;
};