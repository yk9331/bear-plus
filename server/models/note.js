'use strict';
const Sequelize = require('sequelize');

// permission types
var permissionTypes = ['freely', 'editable', 'limited', 'locked', 'protected', 'private'];

module.exports = (sequelize, DataTypes) => {
  const Note = sequelize.define('Note', {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: Sequelize.UUIDV4
    },
    shortid: {
      type: DataTypes.STRING,
      unique: true,
      allowNull: false,
      defaultValue: Sequelize.UUIDV4
    },
    alias: {
      type: DataTypes.STRING,
      unique: true
    },
    permission: {
      type: DataTypes.ENUM,
      values: permissionTypes
    },
    viewcount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    title: {
      type: DataTypes.TEXT,
      get: function () {
        return sequelize.processData(this.getDataValue('title'), '')
      },
      set: function (value) {
        this.setDataValue('title', sequelize.stripNullByte(value))
      }
    },
    content: {
      type: DataTypes.TEXT('long'),
      get: function () {
        return sequelize.processData(this.getDataValue('content'), '')
      },
      set: function (value) {
        this.setDataValue('content', sequelize.stripNullByte(value))
      }
    },
    authorship: {
      type: DataTypes.TEXT('long'),
      get: function () {
        return sequelize.processData(this.getDataValue('authorship'), [], JSON.parse)
      },
      set: function (value) {
        this.setDataValue('authorship', JSON.stringify(value))
      }
    },
    lastchangeAt: {
      type: DataTypes.DATE
    },
    savedAt: {
      type: DataTypes.DATE
    }
  });

  Note.associate = function (models) {
    Note.belongsTo(models.User, {
      foreignKey: 'ownerId',
      as: 'owner',
      constraints: false,
      onDelete: 'CASCADE',
      hooks: true
    });
    Note.belongsTo(models.User, {
      foreignKey: 'lastchangeuserId',
      as: 'lastchangeuser',
      constraints: false
    });
    Note.hasMany(models.Revision, {
      foreignKey: 'noteId',
      constraints: false
    });
    Note.hasMany(models.Author, {
      foreignKey: 'noteId',
      as: 'authors',
      constraints: false
    });
  };
  return Note;
};