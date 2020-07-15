import { schema } from './noteSchema';
import { defaultMarkdownParser, defaultMarkdownSerializer } from './markdownParser';
import { exitCode,baseKeymap } from 'prosemirror-commands';
import { undo, redo, history } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
import { EditorState, Selection, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { imageUploader } from 'prosemirror-image-uploader';

import { dropCursor } from 'prosemirror-dropcursor';
import { gapCursor } from 'prosemirror-gapcursor';
import { buildInputRules } from './inputrules';
import { buildKeymap } from './keymap';

import markdownit from 'markdown-it';
import CodeMirror from 'codemirror';
import './codeBlockMode';

const mark = require('markdown-it-mark');
const emoji = require('markdown-it-emoji');
const ins = require('markdown-it-ins');
const hashtag = require('./markdownItHashtag');

const place = document.querySelector('#editor');
const content = document.querySelector('#content').value;
const btn = document.querySelector('#view-source-btn');

const noteId = document.location.search.split('=')[1];

function computeChange(oldVal, newVal) {
  if (oldVal === newVal) return null;
  let start = 0; let oldEnd = oldVal.length; let newEnd = newVal.length;
  while (start < oldEnd && oldVal.charCodeAt(start) === newVal.charCodeAt(start)) {
    ++start;
  }
  while (oldEnd > start && newEnd > start
    && oldVal.charCodeAt(oldEnd - 1) === newVal.charCodeAt(newEnd - 1)) {
    oldEnd--;
    newEnd--;
  }
  return { from: start, to: oldEnd, text: newVal.slice(start, newEnd) };
}

class CodeBlockView {
  constructor(node, view, getPos) {
    // Store for later
    this.node = node;
    this.view = view;
    this.getPos = getPos;
    this.incomingChanges = false;

    // Create a CodeMirror instance
    this.cm = new CodeMirror(null, {
      value: this.node.textContent,
      mode: node.attrs.params,
      lineNumbers: false,
      extraKeys: this.codeMirrorKeymap(),
      scrollbarStyle: null,
      lineWrapping: true,
    });

    // The editor's outer node is our DOM representation
    this.dom = this.cm.getWrapperElement();
    // CodeMirror needs to be in the DOM to properly initialize, so
    // schedule it to update itself
    setTimeout(() => this.cm.refresh(), 20);

    // This flag is used to avoid an update loop between the outer and
    // inner editor
    this.updating = false;
    // Track whether changes are have been made but not yet propagated
    this.cm.on('beforeChange', () => { this.incomingChanges = true; });
    // Propagate updates from the code editor to ProseMirror
    this.cm.on('cursorActivity', () => {
      if (!this.updating && !this.incomingChanges) this.forwardSelection();
    });
    this.cm.on('changes', () => {
      if (!this.updating) {
        this.valueChanged();
        this.forwardSelection();
      }
      this.incomingChanges = false;
    });
    this.cm.on('focus', () => this.forwardSelection());
  }

  forwardSelection() {
    if (!this.cm.hasFocus()) return;
    const { state } = this.view;
    const selection = this.asProseMirrorSelection(state.doc);
    if (!selection.eq(state.selection)) {
      this.view.dispatch(state.tr.setSelection(selection));
    }
  }

  asProseMirrorSelection(doc) {
    const offset = this.getPos() + 1;
    const anchor = this.cm.indexFromPos(this.cm.getCursor('anchor')) + offset;
    const head = this.cm.indexFromPos(this.cm.getCursor('head')) + offset;
    return TextSelection.create(doc, anchor, head);
  }

  setSelection(anchor, head) {
    this.cm.focus();
    this.updating = true;
    this.cm.setSelection(this.cm.posFromIndex(anchor),
      this.cm.posFromIndex(head));
    this.updating = false;
  }

  valueChanged() {
    const change = computeChange(this.node.textContent, this.cm.getValue());
    if (change) {
      const start = this.getPos() + 1;
      const tr = this.view.state.tr.replaceWith(
        start + change.from, start + change.to,
        change.text ? schema.text(change.text) : null,
      );
      this.view.dispatch(tr);
    }
  }

  codeMirrorKeymap() {
    const { view } = this;
    const mod = /Mac/.test(navigator.platform) ? 'Cmd' : 'Ctrl';
    return CodeMirror.normalizeKeyMap({
      Up: () => this.maybeEscape('line', -1),
      Left: () => this.maybeEscape('char', -1),
      Down: () => this.maybeEscape('line', 1),
      Right: () => this.maybeEscape('char', 1),
      [`${mod}-Z`]: () => undo(view.state, view.dispatch),
      [`Shift-${mod}-Z`]: () => redo(view.state, view.dispatch),
      [`${mod}-Y`]: () => redo(view.state, view.dispatch),
      'Ctrl-Enter': () => {
        if (exitCode(view.state, view.dispatch)) view.focus();
      },
    });
  }

  maybeEscape(unit, dir) {
    const pos = this.cm.getCursor();
    if (this.cm.somethingSelected()
          || pos.line !== (dir < 0 ? this.cm.firstLine() : this.cm.lastLine())
          || (unit === 'char'
           && pos.ch !== (dir < 0 ? 0 : this.cm.getLine(pos.line).length))) return CodeMirror.Pass;
    this.view.focus();
    const targetPos = this.getPos() + (dir < 0 ? 0 : this.node.nodeSize);
    const selection = Selection.near(this.view.state.doc.resolve(targetPos), dir);
    this.view.dispatch(this.view.state.tr.setSelection(selection).scrollIntoView());
    this.view.focus();
  }

  update(node) {
    if (node.type !== this.node.type) return false;
    this.node = node;
    const change = computeChange(this.cm.getValue(), node.textContent);
    if (change) {
      this.updating = true;
      this.cm.replaceRange(change.text, this.cm.posFromIndex(change.from),
        this.cm.posFromIndex(change.to));
      this.updating = false;
    }
    return true;
  }

  selectNode() { this.cm.focus(); }

  stopEvent() { return true; }
}

function arrowHandler(dir) {
  return (state, dispatch, view) => {
    if (state.selection.empty && view.endOfTextblock(dir)) {
      const side = dir === 'left' || dir === 'up' ? -1 : 1;
      const { $head } = state.selection;
      const nextPos = Selection.near(state.doc.resolve(side > 0 ? $head.after() : $head.before()), side);
      if (nextPos.$head && nextPos.$head.parent.type.name === 'code_block') {
        dispatch(state.tr.setSelection(nextPos));
        return true;
      }
    }
    return false;
  };
}

const arrowHandlers = keymap({
  ArrowLeft: arrowHandler('left'),
  ArrowRight: arrowHandler('right'),
  ArrowUp: arrowHandler('up'),
  ArrowDown: arrowHandler('down'),
});

class MarkdownView {
  constructor(target, content) {
    this.textarea = target.appendChild(document.createElement('textarea'));
    this.cm = CodeMirror.fromTextArea(this.textarea, {
      mode: 'markdown',
      lineNumbers: true,
      scrollbarStyle: null,
      lineWrapping: true,
    });
    this.cm.getDoc().setValue(content);
    this.textarea.value = content;
  }

  get content() {
    this.cm.toTextArea();
    return this.textarea.value;
  }

  focus() { this.textarea.focus(); }

  destroy() {
    this.textarea.remove();
  }
}

class Span {
  constructor(from, to, commit) {
    this.from = from; this.to = to; this.commit = commit;
  }
}

class Commit {
  constructor(message, time, steps, maps, hidden) {
    this.message = message;
    this.time = time;
    this.steps = steps;
    this.maps = maps;
    this.hidden = hidden;
  }
}

class TrackState {
  constructor(blameMap, commits, uncommittedSteps, uncommittedMaps) {
    // The blame map is a data structure that lists a sequence of
    // document ranges, along with the commit that inserted them. This
    // can be used to, for example, highlight the part of the document
    // that was inserted by a commit.
    this.blameMap = blameMap;
    // The commit history, as an array of objects.
    this.commits = commits;
    // Inverted steps and their maps corresponding to the changes that
    // have been made since the last commit.
    this.uncommittedSteps = uncommittedSteps;
    this.uncommittedMaps = uncommittedMaps;
  }

  // Apply a transform to this state
  applyTransform(transform) {
    // Invert the steps in the transaction, to be able to save them in
    // the next commit
    let inverted =
      transform.steps.map((step, i) => step.invert(transform.docs[i]));
    let newBlame = updateBlameMap(this.blameMap, transform, this.commits.length);
    // Create a new state—since these are part of the editor state, a
    // persistent data structure, they must not be mutated.
    return new TrackState(newBlame, this.commits,
                          this.uncommittedSteps.concat(inverted),
                          this.uncommittedMaps.concat(transform.mapping.maps));
  }

  // When a transaction is marked as a commit, this is used to put any
  // uncommitted steps into a new commit.
  applyCommit(message, time) {
    if (this.uncommittedSteps.length == 0) return this;
    let commit = new Commit(message, time, this.uncommittedSteps,
                            this.uncommittedMaps);
    return new TrackState(this.blameMap, this.commits.concat(commit), [], []);
  }
}

function updateBlameMap(map, transform, id) {
  let result = [], mapping = transform.mapping;
  for (let i = 0; i < map.length; i++) {
    let span = map[i];
    let from = mapping.map(span.from, 1), to = mapping.map(span.to, -1);
    if (from < to) result.push(new Span(from, to, span.commit));
  }

  for (let i = 0; i < mapping.maps.length; i++) {
    let map = mapping.maps[i], after = mapping.slice(i + 1);
    map.forEach((_s, _e, start, end) => {
      insertIntoBlameMap(result, after.map(start, 1), after.map(end, -1), id);
    });
  }

  return result;
}

function insertIntoBlameMap(map, from, to, commit) {
  if (from >= to) return;
  let pos = 0, next;
  for (; pos < map.length; pos++) {
    next = map[pos];
    if (next.commit == commit) {
      if (next.to >= from) break;
    } else if (next.to > from) { // Different commit, not before
      if (next.from < from) { // Sticks out to the left (loop below will handle right side)
        let left = new Span(next.from, from, next.commit);
        if (next.to > to) map.splice(pos++, 0, left);
        else map[pos++] = left;
      }
      break;
    }
  }

  while (next == map[pos]) {
    if (next.commit == commit) {
      if (next.from > to) break;
      from = Math.min(from, next.from);
      to = Math.max(to, next.to);
      map.splice(pos, 1);
    } else {
      if (next.from >= to) break;
      if (next.to > to) {
        map[pos] = new Span(to, next.to, next.commit);
        break;
      } else {
        map.splice(pos, 1);
      }
    }
  }

  map.splice(pos, 0, new Span(from, to, commit));
}

const { Plugin } = require('prosemirror-state');
const { Decoration, DecorationSet } = require('prosemirror-view');

const trackPlugin = new Plugin({
  state: {
    init(_, instance) {
      return new TrackState([new Span(0, instance.doc.content.size, null)], [], [], []);
    },
    apply(tr, tracked) {
      if (tr.docChanged) tracked = tracked.applyTransform(tr);
      let commitMessage = tr.getMeta(this);
      if (commitMessage) tracked = tracked.applyCommit(commitMessage, new Date(tr.time));
      return tracked;
    }
  }
});

function elt(name, attrs, ...children) {
  let dom = document.createElement(name);
  if (attrs) for (let attr in attrs) dom.setAttribute(attr, attrs[attr]);
  for (let i = 0; i < children.length; i++) {
    let child = children[i];
    dom.appendChild(typeof child == 'string' ? document.createTextNode(child) : child);
  }
  return dom;
}

const highlightPlugin = new Plugin({
  state: {
    init() { return {deco: DecorationSet.empty, commit: null}; },
    apply(tr, prev, oldState, state) {
      let highlight = tr.getMeta(this);
      if (highlight && highlight.add != null && prev.commit != highlight.add) {
        let tState = trackPlugin.getState(oldState);
        let decos = tState.blameMap
            .filter(span => tState.commits[span.commit] == highlight.add)
            .map(span => Decoration.inline(span.from, span.to, {class: 'blame-marker'}));
        return {deco: DecorationSet.create(state.doc, decos), commit: highlight.add};
      } else if (highlight && highlight.clear != null && prev.commit == highlight.clear) {
        return {deco: DecorationSet.empty, commit: null};
      } else if (tr.docChanged && prev.commit) {
        return {deco: prev.deco.map(tr.mapping, tr.doc), commit: prev.commit};
      } else {
        return prev;
      }
    }
  },
  props: {
    decorations(state) { return this.getState(state).deco; }
  }
});

let state = EditorState.create({
    doc: defaultMarkdownParser.parse(content),
    plugins: [
      buildInputRules(schema),
      keymap(baseKeymap),
      keymap(buildKeymap(schema, {})),
      dropCursor(),
      gapCursor(),
      history(),
      arrowHandlers,
      imageUploader({
        async upload(fileOrUrl, view) {
          if (typeof fileOrUrl === 'string') {
            return fileOrUrl;
          } else {
            const formData = new FormData();
            formData.append('image', fileOrUrl);
            const url = fetch('http://localhost:5000/api/1.0/editor/image', {
              method: 'POST',
              body: formData
            })
              .then(res => res.json())
              .then(body => {
                return (body.url);
              });
            console.log(url);
            return url;
          }
        }
      }),
      trackPlugin,
      highlightPlugin
      // new Plugin({
      //   props: {
      //     attributes: {class: 'ProseMirror-example-setup-style'}
      //   }
      // })
    ],
  });

let view;
class ProseMirrorView {
  constructor(target, content) {
    console.log(markdownit('default', { html: false, typographer: true, linkify: true })
    .use(mark).use(emoji).use(ins).use(hashtag).parse(content));
    const pmView = new EditorView(target, {
      state,
      nodeViews: { code_block: (node, view, getPos) => new CodeBlockView(node, view, getPos) },
      dispatchTransaction: dispatch
      // dispatchTransaction(transaction) {
      //   console.log('Document size went from', transaction.before.content.size,
      //     'to', transaction.doc.content.size);
      //   const newState = pmView.state.apply(transaction);
      //   pmView.updateState(newState);
      // },

    });
    this.view = pmView;
  }

  get content() {
    return defaultMarkdownSerializer.serialize(this.view.state.doc);
  }

  focus() { this.view.focus(); }

  destroy() { this.view.destroy(); }
}

document.getElementById('editor-container').addEventListener('click', (e) => {
  if (e.target.tagName === 'HASHTAG') {
    console.log(e.target.tagName);
  }
});

let lastRendered = null;

function dispatch(tr) {
  state = state.apply(tr);
  view.view.updateState(state);
  setDisabled(state);
  renderCommits(state, dispatch);
}

console.log(noteId);
if (noteId !== '' && noteId !== undefined ) {
  view = new ProseMirrorView(place, content);
  btn.addEventListener('click', (e) => {
    if (btn.textContent === 'View Source') {
      btn.textContent = 'View Style';
      const View = MarkdownView;
      const { content } = view;
      view.destroy();
      view = new View(place, content);
      view.focus();
    } else {
      btn.textContent = 'View Source';
      const View = ProseMirrorView;
      const { content } = view;
      view.destroy();
      view = new View(place, content);
      view.focus();
    }
  });
}


// dispatch(state.tr.insertText('Type something, and then commit it.'));
// dispatch(state.tr.setMeta(trackPlugin, 'Initial commit'));

function setDisabled(state) {
  let input = document.querySelector('#message');
  let button = document.querySelector('#commitbutton');
  input.disabled = button.disabled = trackPlugin.getState(state).uncommittedSteps.length == 0;
}

function doCommit(message) {
  dispatch(state.tr.setMeta(trackPlugin, message));
}

function renderCommits(state, dispatch) {
  let curState = trackPlugin.getState(state);
  if (lastRendered == curState) return;
  lastRendered = curState;

  let out = document.querySelector('#commits');
  out.textContent = '';
  let commits = curState.commits;
  commits.forEach(commit => {
    let node = elt('div', {class: 'commit'},
                   elt('span', {class: 'commit-time'},
                       commit.time.getHours() + ':' + (commit.time.getMinutes() < 10 ? '0' : '')
                       + commit.time.getMinutes()),
                   '\u00a0 ' + commit.message + '\u00a0 ',
                   elt('button', {class: 'commit-revert'}, 'revert'));
    node.lastChild.addEventListener('click', () => revertCommit(commit));
    node.addEventListener('mouseover', e => {
      if (!node.contains(e.relatedTarget))
        dispatch(state.tr.setMeta(highlightPlugin, {add: commit}));
    });
    node.addEventListener('mouseout', e => {
      if (!node.contains(e.relatedTarget))
        dispatch(state.tr.setMeta(highlightPlugin, {clear: commit}));
    });
    out.appendChild(node);
  });
}

const {Mapping} = require('prosemirror-transform');

function revertCommit(commit) {
  let trackState = trackPlugin.getState(state);
  let index = trackState.commits.indexOf(commit);
  // If this commit is not in the history, we can't revert it
  if (index == -1) return;

  // Reverting is only possible if there are no uncommitted changes
  if (trackState.uncommittedSteps.length)
    return alert('Commit your changes first!');

  // This is the mapping from the document as it was at the start of
  // the commit to the current document.
  let remap = new Mapping(trackState.commits.slice(index)
                          .reduce((maps, c) => maps.concat(c.maps), []));
  let tr = state.tr;
  // Build up a transaction that includes all (inverted) steps in this
  // commit, rebased to the current document. They have to be applied
  // in reverse order.
  for (let i = commit.steps.length - 1; i >= 0; i--) {
    // The mapping is sliced to not include maps for this step and the
    // ones before it.
    let remapped = commit.steps[i].map(remap.slice(i + 1));
    if (!remapped) continue;
    let result = tr.maybeStep(remapped);
    // If the step can be applied, add its map to our mapping
    // pipeline, so that subsequent steps are mapped over it.
    if (result.doc) remap.appendMap(remapped.getMap(), i);
  }
  // Add a commit message and dispatch.
  if (tr.docChanged)
    dispatch(tr.setMeta(trackPlugin, `Revert '${commit.message}'`));
}

document.querySelector('#commit').addEventListener('submit', e => {
  e.preventDefault();
  doCommit(e.target.elements.message.value || 'Unnamed');
  e.target.elements.message.value = '';
  view.focus();
});

// function findInBlameMap(pos, state) {
//   let map = trackPlugin.getState(state).blameMap;
//   for (let i = 0; i < map.length; i++)
//     if (map[i].to >= pos && map[i].commit != null)
//       return map[i].commit;
// }

// document.querySelector('#blame').addEventListener('mousedown', e => {
//   e.preventDefault();
//   let pos = e.target.getBoundingClientRect();
//   let commitID = findInBlameMap(state.selection.head, state);
//   let commit = commitID != null && trackPlugin.getState(state).commits[commitID];
//   let node = elt('div', {class: 'blame-info'},
//                  commitID != null ? elt('span', null, 'It was: ', elt('strong', null, commit ? commit.message : 'Uncommitted'))
//                  : 'No commit found');
//   node.style.right = (document.body.clientWidth - pos.right) + 'px';
//   node.style.top = (pos.bottom + 2) + 'px';
//   document.body.appendChild(node);
//   setTimeout(() => document.body.removeChild(node), 2000);
// });
