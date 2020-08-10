/* global app, $:true */
// Connect to Socket
import 'bootstrap';
var io = require('socket.io-client');
app.socket = io();
app.view = null;

function pinNote(e) {
  updateNoteStatus(e, 'pin');
}
function unpinNote(e) {
  updateNoteStatus(e, 'unpin');
}
function restoreNote(e) {
  updateNoteStatus(e, 'restore');
}
function archiveNote(e) {
  updateNoteStatus(e, 'archive');
}
function trashNote(e) {
  updateNoteStatus(e, 'trash');
}
function deleteNote(e) {
  updateNoteStatus(e, 'delete');
}

function updateNoteStatus(e, action) {
  const noteId = $(e.target).parent().attr('noteid');
  const data = {
    noteId: noteId,
  };
  fetch(`/api/1.0/note/${action}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
    headers: {
      'content-type': 'application/json'
    },
  })
    .then(res => {
      if (res.status == 204) {
        app.fetchNotes(app.currentType, app.currentPermission, app.currentTag, $('#search-input').val());
        app.fetchTags();
      } else {
        const body = res.json();
        alert(body.error);
      }
    });
}

// Create New Note
$('#new-note').click(() => {
  const data = {
    currentPermission: app.currentPermission,
    currentTag: app.currentTag
  };
  fetch('/api/1.0/note', {
      method: 'POST',
      body: JSON.stringify(data),
      headers:{
        'content-type': 'application/json'
      },
    })
    .then(res => res.json())
    .then(({ error, note }) => {
      if (error) return alert(error);
      if (app.view !== null) {
        app.view.destroy();
        app.view = null;
      }
      app.currentNote = note.id;
      app.fetchNotes(app.currentType, app.currentPermission, app.currentTag, $('#search-input').val());
      app.fetchTags();
    });
});

// Open Note
$('#notes').click((e) => {
  if ($(e.target).is('span')) return;
  let tab;
  if ($(e.target).attr('class') == 'note-tab' || $(e.target).attr('class') == 'note-tab current') {
    tab = $(e.target);
  } else if ($(e.target).attr('class') == 'info') {
    tab = $(e.target).parent();
  } else {
    tab = $(e.target).parent().parent();
  }
  const noteId = tab.attr('noteId');
  if (noteId == app.currentNote) return;
  $('.note-tab.current').removeClass('current');
  tab.addClass('current');
  if (app.view !== null) app.view.destroy();
  if (app.currentNote !== null) {
    app.socket.emit('close note', { noteId: app.currentNote });
  }
  app.currentNote = noteId;
  if (app.profileId == app.userId || (app.userId !== '' && $('.note-tab.current').attr('write_permission') == 'public')) {
    app.newEditor(noteId, true);
  } else {
    app.newEditor(noteId, false);
  }
});

function createNotes(noteList, type) {
  $('#notes').empty();
  let inList = false;
  switch (type) {
    case 'normal': {
      for (let i = 0; i < noteList.length; i++){
        let noteTab;
        if (app.profileUrl == app.userUrl) {
          const pinBtn = noteList[i].pin ?
            $('<span>').text('push_pin').addClass('pinned material-icons-outlined').click(unpinNote) :
            $('<span>').text('push_pin').addClass('pin material-icons-outlined').click(pinNote);
          const deleteBtn = $('<span>').text('delete_outline').addClass('delete material-icons').click(trashNote);
          const archiveBtn = $('<span>').text('archive').addClass('archive material-icons-outlined').click(archiveNote);
          const info = $('<div>').addClass('info');
          const title = $('<div>').addClass('title').attr('disabled', 'true');
          const brief = $('<div>').addClass('brief').attr('disabled', 'true');
          if (noteList[i].title !== null) {
            title.text(noteList[i].title).removeClass('empty');
          }
          if (noteList[i].brief !== null) {
            brief.text(noteList[i].brief);
          }
          if (noteList[i].title == null && noteList[i].brief == null) {
            title.text('A wonderful new note').addClass('empty');
            brief.text('Keep calm and write something');
          }
          info.append(title).append(brief);
          noteTab = $('<div>').addClass('note-tab').attr('noteId', noteList[i].id).attr('write_permission', noteList[i].write_permission).append(pinBtn).append(info).append(deleteBtn).append(archiveBtn);
        } else {
          const pinBtn = noteList[i].pin ?
            $('<span>').text('push_pin').addClass('pinned material-icons-outlined').css('cursor', 'pointer') : null;
          const info = $('<div>').addClass('info');
          const title = $('<div>').addClass('title').attr('disabled', 'true');
          const brief = $('<div>').addClass('brief').attr('disabled', 'true');
          if (noteList[i].title !== null) {
            title.text(noteList[i].title).removeClass('empty');
          }
          if (noteList[i].brief !== null) {
            brief.text(noteList[i].brief);
          }
          if (noteList[i].title == null && noteList[i].brief == null) {
            title.text('A wonderful new note').addClass('empty');
            brief.text('Keep calm and write something');
          }
          info.append(title).append(brief);
          noteTab = $('<div>').addClass('note-tab').attr('noteId', noteList[i].id).attr('write_permission', noteList[i].write_permission).append(info).append(pinBtn);
        }
        $('#notes').append(noteTab);
        // Set current note
        if (app.currentNote == noteList[i].id) {
          inList = true;
          noteTab.addClass('current');
        }
      }
      break;
    }
    case 'archive': {
      for (let i = 0; i < noteList.length; i++){
        const pinBtn = noteList[i].pinned ?
            $('<span>').text('push_pin').addClass('pinned material-icons-outlined').click(unpinNote) :
            $('<span>').text('push_pin').addClass('pin material-icons-outlined').click(pinNote);
        const deleteBtn = $('<span>').text('delete_outline').addClass('delete material-icons').click(trashNote);
        const archiveBtn = $('<span>').text('unarchive').addClass('archive material-icons-outlined').click(restoreNote);
        const info = $('<div>').addClass('info');
        const title = $('<div>').addClass('title').attr('disabled', 'true');
        const brief = $('<div>').addClass('brief').attr('disabled', 'true');
        if (noteList[i].title !== null) {
          title.text(noteList[i].title).removeClass('empty');
        }
        if (noteList[i].brief !== null) {
          brief.text(noteList[i].brief);
        }
        if (noteList[i].title == null && noteList[i].brief == null) {
          title.text('A wonderful new note').addClass('empty');
          brief.text('Keep calm and write something');
        }
        info.append(title).append(brief);
        const noteTab = $('<div>').addClass('note-tab').attr('noteId', noteList[i].id).attr('write_permission', noteList[i].write_permission).append(pinBtn).append(info).append(deleteBtn).append(archiveBtn);
        $('#notes').append(noteTab);
        // Set current note
        if (app.currentNote == noteList[i].id) {
          inList = true;
          noteTab.addClass('current');
        }
      }
      break;
    }
    case 'trash': {
      for (let i = 0; i < noteList.length; i++){
        const pinBtn = noteList[i].pinned ?
            $('<span>').text('push_pin').addClass('pinned material-icons-outlined').click(unpinNote) :
            $('<span>').text('push_pin').addClass('pin material-icons-outlined').click(pinNote);
        const deleteBtn = $('<span>').text('delete_forever').addClass('delete material-icons-outlined').click(deleteNote);
        const restoreBtn = $('<span>').text('restore_from_trash').addClass('archive material-icons-outlined').click(restoreNote);
        const info = $('<div>').addClass('info');
        const title = $('<div>').addClass('title').attr('disabled', 'true');
        const brief = $('<div>').addClass('brief').attr('disabled', 'true');
        if (noteList[i].title !== null) {
          title.text(noteList[i].title);
        }
        if (noteList[i].brief !== null) {
          brief.text(noteList[i].brief);
        }
        if (noteList[i].title == null && noteList[i].brief == null) {
          title.text('A wonderful new note').addClass('empty');
          brief.text('Keep calm and write something');
        }
        info.append(title).append(brief);
        const noteTab = $('<div>').addClass('note-tab').attr('noteId', noteList[i].id).attr('write_permission', noteList[i].write_permission).append(pinBtn).append(info).append(deleteBtn).append(restoreBtn);
        $('#notes').append(noteTab);
        // Set current note
        if (app.currentNote == noteList[i].id) {
          inList = true;
          noteTab.addClass('current');
        }
      }
      break;
    }
  }
  if (!inList && app.view != null) {
    app.currentNote = null;
    $('#button-container').css('display', 'none');
    $('#editor').css('background-image', 'url(\'/img/note-background.png\')');
    app.view.destroy();
  } else if (inList && app.view == null) {
    if (app.profileId == app.userId || (app.userId && $('.note-tab.current').attr('write_permission') == 'public')) {
      app.newEditor($('.note-tab.current').attr('noteId'), true);
    } else {
      app.newEditor($('.note-tab.current').attr('noteId'), false);
    }
  }
}

app.fetchNotes = (type, permission = '', tag = '', search='') => {
  app.currentType = type;
  app.currentPermission = permission;
  app.currentTag = tag;
  // type = tag == '' ? type : 'normal';
  $('.type.current').removeClass('current');
  $('.sub-type.current').removeClass('current');
  $('.tag.current').removeClass('current');
  if (tag != '') {
    $(`#${tag}`).addClass('current');
  }
  if (permission != '') {
    $(`#${permission}`).addClass('current');
  } else {
    $(`#${type}`).addClass('current');
  }
  fetch(`/api/1.0/notes?profileUrl=${app.profileUrl}&&type=${type}&&permission=${permission}&&tag=${tag}&&keyword=${search}`)
    .then(res => res.json())
    .then(({ error, noteList }) => {
      if (error) return alert(error);
      if (!noteList) return;
      createNotes(noteList, type);
    });
};

$('#normal').click((e) => {
  $('#search-input').val('');
  if (app.profileId !== app.userId) {
    app.fetchNotes('normal');
  } else {
    if (app.currentType == 'normal' && app.currentPermission == '') return;
    $('#new-note').attr('disabled', false);
    app.fetchNotes('normal', '', app.currentTag);
  }
});

$('#archive').click((e) => {
  if (app.currentType == 'archive') return;
  $('#search-input').val('');
  $('#new-note').attr('disabled', true);
  app.fetchNotes('archive', '', app.currentTag);
});

$('#trash').click((e) => {
  if (app.currentType == 'trash') return;
  $('#search-input').val('');
  $('#new-note').attr('disabled', true);
  app.fetchNotes('trash', '', app.currentTag);
});

$('#normal-dropdown').click(() => {
  if ($('#normal-dropdown').text() == 'chevron_right') {
    $('.normal-sub').css('display', 'flex');
    $('#normal-dropdown').text('expand_more');
  } else {
    $('.normal-sub').css('display', 'none');
    $('#normal-dropdown').text('chevron_right');
  }
});

$('#public').click(() => {
  if (app.currentType == 'normal' && app.currentPermission == 'public') return;
  $('#search-input').val('');
  $('#new-note').attr('disabled', false);
  app.fetchNotes('normal', 'public', app.currentTag);
});

$('#private').click(() => {
  if (app.currentType == 'normal' && app.currentPermission == 'private') return;
  $('#search-input').val('');
  $('#new-note').attr('disabled', false);
  app.fetchNotes('normal', 'private', app.currentTag);
});

$('#search-input').on('input', (e) => {
  if ($('#search-input').val() != '') {
    $('#clear-btn').css('display', 'block');
  } else {
    $('#clear-btn').css('display', 'none');
  }
});

$('#clear-btn').click(() => {
  $('#search-input').val('');
  $('#clear-btn').css('display', 'none');
  app.fetchNotes(app.currentType, app.currentPermission, app.currentTag);
});

$('#search-form').on('submit', (e) => {
  e.preventDefault();
  app.fetchNotes(app.currentType, app.currentPermission, app.currentTag, $('#search-input').val());
});

function createTags(tagList) {
  $('#tags').empty();
  for (let i = 0; i < tagList.length; i++) {
    const icon = $('<div>').addClass('tag-icon material-icons-outlined').text('local_offer');
    const text = $('<div>').addClass('tag-text').text(tagList[i].tag);
    const tag = $('<div>').addClass('tag').attr('id', tagList[i].id).append(icon).append(text);
    if (app.currentTag == tagList[i].id) tag.addClass('current');
    tag.click((e) => {
      const id = $(e.target).attr('id') || $(e.target).parent().attr('id');
      if (id == app.currentTag) {
        app.fetchNotes(app.currentType, app.currentPermission);
      } else {
        app.fetchNotes(app.currentType, app.currentPermission, tagList[i].id);
      }
    });
    $('#tags').append(tag);
  }
}

app.fetchTags = () => {
  fetch(`/api/1.0/tags?profileUrl=${app.profileUrl}`)
    .then(res => res.json())
    .then(({ error, tagList }) => {
      if (error) return alert(error);
      if (!tagList) return;
      createTags(tagList);
    });
};

$(document).ready(() => {
  app.fetchNotes('normal');
  app.fetchTags();
});
