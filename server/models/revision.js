'use strict';
var Sequelize = require('sequelize');

module.exports = function (sequelize, DataTypes) {
  var Revision = sequelize.define('Revision', {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: Sequelize.UUIDV4
    },
    patch: {
      type: DataTypes.TEXT('long'),
      // get: function () {
      //   return sequelize.processData(this.getDataValue('patch'), '')
      // },
      // set: function (value) {
      //   this.setDataValue('patch', sequelize.stripNullByte(value))
      // }
    },
    lastContent: {
      type: DataTypes.TEXT('long'),
      // get: function () {
      //   return sequelize.processData(this.getDataValue('lastContent'), '')
      // },
      // set: function (value) {
      //   this.setDataValue('lastContent', sequelize.stripNullByte(value))
      // }
    },
    content: {
      type: DataTypes.TEXT('long'),
      // get: function () {
      //   return sequelize.processData(this.getDataValue('content'), '')
      // },
      // set: function (value) {
      //   this.setDataValue('content', sequelize.stripNullByte(value))
      // }
    },
    length: {
      type: DataTypes.INTEGER
    },
    authorship: {
      type: DataTypes.TEXT('long'),
      // get: function () {
      //   return sequelize.processData(this.getDataValue('authorship'), [], JSON.parse)
      // },
      // set: function (value) {
      //   this.setDataValue('authorship', value ? JSON.stringify(value) : value)
      // }
    }
  });
  Revision.associate = function (models) {
    Revision.belongsTo(models.Note, {
      foreignKey: 'noteId',
      as: 'note',
      constraints: false,
      onDelete: 'CASCADE',
      hooks: true
    });
  };
  return Revision;
};