'use strict';
const Sequelize = require('sequelize');
const shortId = require('shortid');

// permission types
var permissionTypes = ['public', 'share', 'private'];
var stateTypes = ['normal', 'archive', 'trash'];

module.exports = (sequelize, DataTypes) => {
  const Note = sequelize.define('Note', {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: Sequelize.UUIDV4
    },
    shortid: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: shortId.generate
    },
    view_permission: {
      type: DataTypes.ENUM,
      values: permissionTypes,
      defaultValue: 'private'
    },
    write_permission: {
      type: DataTypes.ENUM,
      values: permissionTypes,
      defaultValue: 'private'
    },
    viewcount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    title: {
      type: DataTypes.TEXT,
    },
    brief: {
      type: DataTypes.TEXT,
    },
    textcontent: {
      type: DataTypes.TEXT,
    },
    doc: {
      type: DataTypes.TEXT('long'),
    },
    comment: {
      type: DataTypes.TEXT('long'),
    },
    authorship: {
      type: DataTypes.TEXT('long'),
    },
    lastchangeAt: {
      type: DataTypes.DATE
    },
    savedAt: {
      type: DataTypes.DATE
    },
    state: {
      type: DataTypes.ENUM,
      values: stateTypes,
      defaultValue: 'normal'
    },
    pinned: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    }
  }, {
    indexes: [
      {
          unique: true,
          fields: ['ownerId', 'shortid']
      }
  ]
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
    Note.belongsToMany(models.Tag, {
      through: 'NoteTags',
    });
  };
  return Note;
};