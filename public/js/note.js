import { Schema} from 'prosemirror-model';
import { exitCode } from 'prosemirror-commands';
import { undo, redo } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
import { EditorState, Selection, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { exampleSetup } from 'prosemirror-example-setup';

import markdownit from 'markdown-it';
import { MarkdownParser, MarkdownSerializer } from 'prosemirror-markdown';

import CodeMirror from 'codemirror';
import './codeBlockMode';

const markdownItMark = require('markdown-it-mark');
const emoji = require('markdown-it-emoji');
const ins = require('markdown-it-ins');

// ::Schema Document schema for the data model used by CommonMark.
const schema = new Schema({
  nodes: {
    doc: {
      content: 'block+',
    },

    paragraph: {
      content: 'inline*',
      group: 'block',
      parseDOM: [{ tag: 'p' }],
      toDOM() { return ['p', 0]; },
    },

    blockquote: {
      content: 'block+',
      group: 'block',
      parseDOM: [{ tag: 'blockquote' }],
      toDOM() { return ['blockquote', 0]; },
    },

    horizontal_rule: {
      group: 'block',
      parseDOM: [{ tag: 'hr' }],
      toDOM() { return ['div', ['hr']]; },
    },

    heading: {
      attrs: { level: { default: 1 } },
      content: '(text | image | emoji)*',
      group: 'block',
      defining: true,
      parseDOM: [{ tag: 'h1', attrs: { level: 1 } },
        { tag: 'h2', attrs: { level: 2 } },
        { tag: 'h3', attrs: { level: 3 } },
        { tag: 'h4', attrs: { level: 4 } },
        { tag: 'h5', attrs: { level: 5 } },
        { tag: 'h6', attrs: { level: 6 } }],
      toDOM(node) { return [`h${node.attrs.level}`, 0]; },
    },

    code_block: {
      content: 'text*',
      group: 'block',
      code: true,
      defining: true,
      marks: '',
      isolating: true,
      attrs: { params: { default: '' } },
      parseDOM: [{
        tag: 'pre',
        preserveWhitespace: 'full',
        getAttrs: (node) => (
          { params: node.getAttribute('data-params') || '' }
        ),
      }],
      toDOM(node) { return ['pre', node.attrs.params ? { 'data-params': node.attrs.params } : {}, ['code', 0]]; },
    },

    ordered_list: {
      content: 'list_item+',
      group: 'block',
      attrs: { order: { default: 1 }, tight: { default: false } },
      parseDOM: [{
        tag: 'ol',
        getAttrs(dom) {
          return {
            order: dom.hasAttribute('start') ? +dom.getAttribute('start') : 1,
            tight: dom.hasAttribute('data-tight'),
          };
        },
      }],
      toDOM(node) {
        return ['ol', {
          start: node.attrs.order === 1 ? null : node.attrs.order,
          'data-tight': node.attrs.tight ? 'true' : null,
        }, 0];
      },
    },

    bullet_list: {
      content: 'list_item+',
      group: 'block',
      attrs: { tight: { default: false } },
      parseDOM: [{ tag: 'ul', getAttrs: (dom) => ({ tight: dom.hasAttribute('data-tight') }) }],
      toDOM(node) { return ['ul', { 'data-tight': node.attrs.tight ? 'true' : null }, 0]; },
    },

    list_item: {
      content: 'paragraph block*',
      defining: true,
      parseDOM: [{ tag: 'li' }],
      toDOM() { return ['li', 0]; },
    },

    text: {
      group: 'inline',
    },

    image: {
      inline: true,
      attrs: {
        src: {},
        alt: { default: null },
        title: { default: null },
      },
      group: 'inline',
      draggable: true,
      parseDOM: [{
        tag: 'img[src]',
        getAttrs(dom) {
          return {
            src: dom.getAttribute('src'),
            title: dom.getAttribute('title'),
            alt: dom.getAttribute('alt'),
          };
        },
      }],
      toDOM(node) { return ['img', node.attrs]; },
    },
    emoji: {
      inline: true,
      group: 'inline',
      draggable: true,
      attrs: {
        class: '',
      },
      toDOM(node) { return ['span', node.attrs]; },
    },

    hard_break: {
      inline: true,
      group: 'inline',
      selectable: false,
      parseDOM: [{ tag: 'br' }],
      toDOM() { return ['br']; },
    },
  },

  marks: {
    em: {
      parseDOM: [{ tag: 'i' }, { tag: 'em' },
        { style: 'font-style', getAttrs: (value) => value === 'italic' && null }],
      toDOM() { return ['em']; },
    },

    strong: {
      parseDOM: [{ tag: 'b' }, { tag: 'strong' },
        { style: 'font-weight', getAttrs: (value) => /^(bold(er)?|[5-9]\d{2,})$/.test(value) && null }],
      toDOM() { return ['strong']; },
    },

    strikethrough: {
      parseDOM: [{ tag: 's' },
        { style: 'text-decoration', getAttrs: (value) => value === 'line-through' && null }],
      toDOM() { return ['s']; },
    },

    link: {
      attrs: {
        href: {},
        title: { default: null },
      },
      inclusive: false,
      parseDOM: [{
        tag: 'a[href]',
        getAttrs(dom) {
          return { href: dom.getAttribute('href'), title: dom.getAttribute('title') };
        },
      }],
      toDOM(node) { return ['a', node.attrs]; },
    },

    code: {
      parseDOM: [{ tag: 'code' }],
      toDOM() { return ['code']; },
    },

    mark: {
      parseDOM: [{ tag: 'mark' }, { tag: 'm' }],
      toDOM() { return ['mark']; },
    },

    ins: {
      parseDOM: [{ tag: 'ins' }],
      toDOM() { return ['ins']; },
    },
  },
});

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
    this.textarea.value = content;
  }

  get content() {
    return this.textarea.value;
  }

  focus() { this.textarea.focus(); }

  destroy() { this.textarea.remove(); }
}

const codeMirrorMarkdownParser = new MarkdownParser(schema, markdownit('default', { html: false, typographer: true, linkify: true }).use(markdownItMark).use(emoji).use(ins), {
  blockquote: { block: 'blockquote' },
  paragraph: { block: 'paragraph' },
  list_item: { block: 'list_item' },
  bullet_list: { block: 'bullet_list' },
  ordered_list: { block: 'ordered_list', getAttrs: (tok) => ({ order: +tok.attrGet('start') || 1 }) },
  heading: { block: 'heading', getAttrs: (tok) => ({ level: +tok.tag.slice(1) }) },
  code_block: { block: 'code_block' },
  fence: { block: 'code_block', getAttrs: (tok) => ({ params: tok.info || '' }) },
  hr: { node: 'horizontal_rule' },
  image: {
    node: 'image',
    getAttrs: (tok) => ({
      src: tok.attrGet('src'),
      title: tok.attrGet('title') || null,
      alt: tok.children[0] && tok.children[0].content || null,
    }),
  },
  emoji: {
    node: 'emoji',
    getAttrs: (tok) => ({
      class: `ec ec-${tok.markup}`,
    }),
  },
  hardbreak: { node: 'hard_break' },
  em: { mark: 'em' },
  strong: { mark: 'strong' },
  link: {
    mark: 'link',
    getAttrs: (tok) => ({
      href: tok.attrGet('href'),
      title: tok.attrGet('title') || null,
    }),
  },
  code_inline: { mark: 'code' },
  s: { mark: 'strikethrough' },
  mark: { mark: 'mark' },
  ins: { mark: 'ins' },
});

const codeMirrorMarkdownSerializer = new MarkdownSerializer({
  blockquote(state, node) {
    state.wrapBlock('> ', null, node, () => state.renderContent(node));
  },
  code_block(state, node) {
    state.write(`\`\`\`${node.attrs.params || ''}\n`);
    state.text(node.textContent, false);
    state.write('\n```');
    state.closeBlock(node);
  },
  heading(state, node) {
    state.write(`${state.repeat('#', node.attrs.level)} `);
    state.renderInline(node);
    state.closeBlock(node);
  },
  horizontal_rule(state, node) {
    state.write(node.attrs.markup || '---');
    state.closeBlock(node);
  },
  bullet_list(state, node) {
    state.renderList(node, '  ', () => `${node.attrs.bullet || '*'} `);
  },
  ordered_list(state, node) {
    const start = node.attrs.order || 1;
    const maxW = String(start + node.childCount - 1).length;
    const space = state.repeat(' ', maxW + 2);
    state.renderList(node, space, (i) => {
      const nStr = String(start + i);
      return `${state.repeat(' ', maxW - nStr.length) + nStr}. `;
    });
  },
  list_item(state, node) {
    state.renderContent(node);
  },
  paragraph(state, node) {
    state.renderInline(node);
    state.closeBlock(node);
  },
  emoji(state, node) {
    state.write(`:${state.esc(node.attrs.class.split('-')[1])}:`);
  },

  image(state, node) {
    state.write(`![${state.esc(node.attrs.alt || '')}](${state.esc(node.attrs.src)
    }${node.attrs.title ? ` ${state.quote(node.attrs.title)}` : ''})`);
  },
  hard_break(state, node, parent, index) {
    for (let i = index + 1; i < parent.childCount; i++) {
      if (parent.child(i).type !== node.type) {
        state.write('\\\n');
        return;
      }
    }
  },
  text(state, node) {
    state.text(node.text);
  },
}, {
  em: {
    open: '*', close: '*', mixable: true, expelEnclosingWhitespace: true,
  },
  strong: {
    open: '**', close: '**', mixable: true, expelEnclosingWhitespace: true,
  },
  strikethrough: {
    open: '~~', close: '~~', mixable: true, expelEnclosingWhitespace: true,
  },
  link: {
    open(_state, mark, parent, index) {
      return isPlainURL(mark, parent, index, 1) ? '<' : '[';
    },
    close(state, mark, parent, index) {
      return isPlainURL(mark, parent, index, -1) ? '>'
        : `](${state.esc(mark.attrs.href)}${mark.attrs.title ? ` ${state.quote(mark.attrs.title)}` : ''})`;
    },
  },
  code: {
    open(_state, _mark, parent, index) { return backticksFor(parent.child(index), -1); },
    close(_state, _mark, parent, index) { return backticksFor(parent.child(index - 1), 1); },
    escape: false,
  },
  mark: {
    open: '==', close: '==', mixable: true, expelEnclosingWhitespace: true,
  },
  ins: {
    open: '++', close: '++', mixable: true, expelEnclosingWhitespace: true,
  },
});

function backticksFor(node, side) {
  const ticks = /`+/g; let m; let
    len = 0;
  if (node.isText) while (ticks.exec(node.text)) {
    m = ticks.exec(node.text);
    len = Math.max(len, m[0].length);
  }
  let result = len > 0 && side > 0 ? ' `' : '`';
  for (let i = 0; i < len; i++) result += '`';
  if (len > 0 && side < 0) result += ' ';
  return result;
}

function isPlainURL(link, parent, index, side) {
  if (link.attrs.title || !/^\w+:/.test(link.attrs.href)) return false;
  const content = parent.child(index + (side < 0 ? -1 : 0));
  if (!content.isText || content.text !== link.attrs.href || content.marks[content.marks.length - 1] !== link) return false;
  if (index === (side < 0 ? 1 : parent.childCount - 1)) return true;
  const next = parent.child(index + (side < 0 ? -2 : 1));
  return !link.isInSet(next.marks);
}

class ProseMirrorView {
  constructor(target, content) {
    const pmView = new EditorView(target, {
      state: EditorState.create({
        doc: codeMirrorMarkdownParser.parse(content),
        plugins: exampleSetup({ schema, history: true }).concat(arrowHandlers),
      }),
      nodeViews: { code_block: (node, view, getPos) => new CodeBlockView(node, view, getPos) },
      dispatchTransaction(transaction) {
        console.log('Document size went from', transaction.before.content.size,
          'to', transaction.doc.content.size);
        const newState = pmView.state.apply(transaction);
        pmView.updateState(newState);
      },

    });
    this.view = pmView;
  }

  get content() {
    return codeMirrorMarkdownSerializer.serialize(this.view.state.doc);
  }

  focus() { this.view.focus(); }

  destroy() { this.view.destroy(); }
}

const place = document.querySelector('#editor');
let view = new MarkdownView(place, document.querySelector('#content').value);

document.querySelectorAll('input[type=radio]').forEach((button) => {
  button.addEventListener('change', () => {
    if (!button.checked) return;
    const View = button.value === 'markdown' ? MarkdownView : ProseMirrorView;
    if (view instanceof View) return;
    const { content } = view;
    view.destroy();
    view = new View(place, content);
    view.focus();
  });
});
