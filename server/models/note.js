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
    note_url: {
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
    text_content: {
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
    lastchange_at: {
      type: DataTypes.DATE
    },
    saved_at: {
      type: DataTypes.DATE
    },
    state: {
      type: DataTypes.ENUM,
      values: stateTypes,
      defaultValue: 'normal'
    },
    pin: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    }
  }, {
    indexes: [
      {
        unique: true,
        fields: ['owner_id', 'note_url']
      }
      ],
      updatedAt: 'updated_at',
      createdAt: 'created_at',
  });

  Note.associate = function (models) {
    Note.belongsTo(models.User, {
      foreignKey: 'owner_id',
      as: 'owner',
      constraints: false,
      onDelete: 'CASCADE',
      hooks: true
    });
    Note.belongsTo(models.User, {
      foreignKey: 'lastchange_user_id',
      as: 'lastchange_user',
      constraints: false
    });
    Note.hasMany(models.Author, {
      foreignKey: 'note_id',
      as: 'authors',
      constraints: false
    });
    Note.belongsToMany(models.Tag, {
      through: 'Note_Tag',
    });
  };
  return Note;
};