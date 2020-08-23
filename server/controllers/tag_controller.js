const _ = require('lodash');
const { Note, User, Tag } = require('../models');

const getTags = async (req, res) => {
  try {
    const profileUrl = req.query.profileUrl.replace('@', '');
    const userUrl = req.user ? req.user.user_url : null;
    let tagList = null;
    if (profileUrl == userUrl) {
      tagList = await Tag.findAll({
        include: [{
          model: Note,
          where: {
            owner_id: req.user.id,
            state: 'normal'
          }
        }],
        order: [
          ['tag', 'ASC']
        ]
      });
    } else {
      const profileUser = await User.findOne({ where: { user_url: profileUrl } });
      tagList = await Tag.findAll({
        include: [{
          model: Note,
          where: {
            owner_id: profileUser.id,
            view_permission: 'public',
            state: 'normal'
          }
        }],
        order: [
          ['tag', 'ASC']
        ]
      });
    }
    res.status(200).json({ tagList });
  } catch (err) {
    console.log('get user tags error', err);
    res.status(500).json({ error: 'System Error: failed to load user tags.' });
  }
};

const updateNoteTags = async (id, tags) => {
  try {
    const note = await Note.findOne({ where: { id } });
    const oldList = await note.getTags();
    const newList = [];
    for (const t of tags) {
      const [tag] = await Tag.findOrCreate({ where: { tag: t } });
      newList.push(tag);
    }
    const del = _.differenceBy(oldList, newList, 'id');
    const add = _.differenceBy(newList, oldList, 'id');
    if (del != []) await note.removeTags(del);
    if (add != []) await note.addTags(add);
    return newList;
  } catch (err) {
    console.log('update tags error', err);
    throw new Error('failed to update tags');
  }
};

module.exports = {
  getTags,
  updateNoteTags
};