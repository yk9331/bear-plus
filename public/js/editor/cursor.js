
import { Plugin } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';

function createCaret(view, color, pos) {
  const profile = JSON.parse(pos.profile);
  const caret = document.createElement('div');
  caret.textContent = ' ';
  caret.className = 'caret';
  caret.style.borderLeftColor = color;
  const userWrapper = document.createElement('div');
  userWrapper.className = 'caret-user';
  const userAvatar = document.createElement('img');
  userAvatar.className = 'caret-user-avatar';
  userAvatar.setAttribute('src', profile.photo);
  userAvatar.style.borderColor = color;
  userAvatar.style.backgroundColor = color;
  userWrapper.appendChild(userAvatar);
  caret.appendChild(userWrapper);
  return caret;
}
/**
 * Creates decorations for each user current position in the document.
 */
function getDecorations(doc, positions) {
  const decosInline = _.flatten(positions.map((pos) => {
    if (pos.head) {
      return Decoration.inline(
        pos.anchor,
        pos.head,
        {
          class: 'user-selection',
          style: `background-color: ${pos.color}`,
        },
      );
    }
  }));

  const decosWidget = positions.map((pos) => {
    if (pos.head) {
      return Decoration.widget(pos.head, (view) => {
        return createCaret(view, pos.color, pos);
      }, { ignoreSelection: true });
    }
  });
  return DecorationSet.create(doc, [...decosInline, ...decosWidget]);
}

class userSelectionState {
  constructor(view, clientId, clientColor) {
    this.clientId = clientId;
    this.clientColor = clientColor;
    console.log(this.clientColor, this.clientId);
    this.update(view, null);
  }

  update(view, prev) {
    let state = view.state;
    if (!this.clientId || (prev && prev.doc.eq(state.doc) &&
      prev.selection.eq(state.selection))) {
      return;
    }
    const pos = {
      userId: this.clientId,
      profile: app.userProfile,
      color: this.clientColor,
      head: state.selection.head,
      anchor: state.selection.anchor,
    };
    app.socket.emit('update cursor', { pos });
  }
}

export const cursorsPlugin = (clientId, clientColor) => {
  return new Plugin({
    state: {
      init() {
        return DecorationSet.empty;
      },
      apply(tr, prev) {
        if (tr.getMeta(cursorsPlugin)) {
          return getDecorations(tr.doc, tr.getMeta(cursorsPlugin));
        }
        return prev;
      },
    },
    props: {
      decorations(state) {
        return this.getState(state);
      },
    },
    view(view) { return new userSelectionState(view, clientId, clientColor ); }
  });
};