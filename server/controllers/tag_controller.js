const _ = require('lodash');
const { Note, User, Tag } = require('../models');

const getTags = async (req, res) => {
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
  res.json({ tagList });
};

const updateNoteTags = async (id, tags) => {
  const note = await Note.findOne({ where: { id } });
  const newList = [];
  for (let t of tags) {
    const [tag] = await Tag.findOrCreate({ where: { tag: t } });
    newList.push(tag);
  }
  const oldList = await note.getTags();
  const del = _.differenceBy(oldList, newList, 'id');
  const add = _.differenceBy(newList, oldList, 'id');
  if (del != []) await note.removeTags(del);
  if (add != []) await note.addTags(add);
  return newList;
};

module.exports = {
  getTags,
  updateNoteTags
};