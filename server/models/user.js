'use strict';
const Sequelize = require('sequelize');
const bcrypt = require('bcrypt');
const saltRounds = parseInt(process.env.SALT_ROUND);
const shortId = require('shortid');

module.exports = (sequelize, DataTypes) => {
  const User = sequelize.define('User', {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: Sequelize.UUIDV4
    },
    userid: {
      type: DataTypes.STRING,
      unique: true,
      allowNull: false,
      defaultValue: shortId.generate
    },
    profileid: {
      type: DataTypes.STRING,
      unique: true
    },
    profile: {
      type: DataTypes.TEXT
    },
    history: {
      type: DataTypes.TEXT
    },
    accessToken: {
      type: DataTypes.TEXT
    },
    refreshToken: {
      type: DataTypes.TEXT
    },
    deleteToken: {
      type: DataTypes.UUID,
      defaultValue: Sequelize.UUIDV4
    },
    email: {
      type: Sequelize.TEXT,
      validate: {
        isEmail: true
      }
    },
    password: {
      type: Sequelize.TEXT
    }
  });

  User.hashPassword = async function (plain) {
    return await bcrypt.hashSync(plain, saltRounds);
  };

  User.prototype.verifyPassword = async function (attempt) {
    return await bcrypt.compareSync(attempt, this.password);
  };

  User.addHook('beforeCreate', async function (user) {
    // only do hash when password is presented
    if (user.password) {
      user.password = await User.hashPassword(user.password);
    }
  });

  User.addHook('beforeUpdate', async function (user) {
    if (user.changed('password')) {
      user.password = await User.hashPassword(user.password);
    }
  });

  User.associate = function (models) {
    User.hasMany(models.Note, {
      foreignKey: 'ownerId',
      constraints: false
    });
    User.hasMany(models.Note, {
      foreignKey: 'lastchangeuserId',
      constraints: false
    });
  };

  User.getProfile = function (user) {
    if (!user) {
      return null;
    }
    return user.profileid ? User.parseProfile(user.profile) : User.parseProfileByEmail(user);
  };

  User.parseProfile = function (profile) {
    try {
      profile = JSON.parse(profile);
    } catch (err) {
      profile = null;
    }
    if (profile) {
      profile = {
        name: profile.displayName || profile.username,
        photo: User.parsePhotoByProfile(profile),
        biggerphoto: User.parsePhotoByProfile(profile, true)
      };
    }
    return profile;
  };

  User.parsePhotoByProfile = function (profile, bigger) {
    var photo = null;
    switch (profile.provider) {
      case 'facebook':
        photo = 'https://graph.facebook.com/' + profile.id + '/picture';
        if (bigger) photo += '?width=400';
        else photo += '?width=96';
        break;
      case 'google':
        photo = profile.photos[0].value;
        if (bigger) photo = photo.replace(/(\?sz=)\d*$/i, '$1400');
        else photo = photo.replace(/(\?sz=)\d*$/i, '$196');
        break;
    }
    return photo;
  };

  User.parseProfileByEmail = function (user) {
    const profile = JSON.parse(user.profile);
    return {
      name: profile.username,
      photo: profile.photo || '/img/default-user-avatar.png', //generateAvatarURL('', email, false),
      biggerphoto: profile.photo || '/img/default-user-avatar.png', //generateAvatarURL('', email, true)
    };
  };
  return User;
};