import { schema } from './noteSchema';
import markdownit from 'markdown-it';
import { Mark } from 'prosemirror-model';
import { MarkdownSerializer } from 'prosemirror-markdown';

const markdownItMark = require('markdown-it-mark');
const emoji = require('markdown-it-emoji');
const ins = require('markdown-it-ins');
const hashtag = require('./markdownItHashtag');

function maybeMerge(a, b) {
  if (a.isText && b.isText && Mark.sameSet(a.marks, b.marks))
    return a.withText(a.text + b.text);
}

// Object used to track the context of a running parse.
class MarkdownParseState {
  constructor(schema, tokenHandlers) {
    this.schema = schema;
    this.stack = [{type: schema.topNodeType, content: []}];
    this.marks = Mark.none;
    this.tokenHandlers = tokenHandlers;
  }

  top() {
    return this.stack[this.stack.length - 1];
  }

  push(elt) {
    if (this.stack.length) this.top().content.push(elt);
  }

  // : (string)
  // Adds the given text to the current position in the document,
  // using the current marks as styling.
  addText(text) {
    if (!text) return;
    let nodes = this.top().content, last = nodes[nodes.length - 1];
    let node = this.schema.text(text, this.marks), merged;
    if (last && (merged = maybeMerge(last, node))) nodes[nodes.length - 1] = merged;
    else nodes.push(node);
  }

  // : (Mark)
  // Adds the given mark to the set of active marks.
  openMark(mark) {
    this.marks = mark.addToSet(this.marks);
  }

  // : (Mark)
  // Removes the given mark from the set of active marks.
  closeMark(mark) {
    this.marks = mark.removeFromSet(this.marks);
  }

  parseTokens(toks) {
    for (let i = 0; i < toks.length; i++) {
      let tok = toks[i];
      let handler = this.tokenHandlers[tok.type];
      if (!handler)
        throw new Error('Token type `' + tok.type + '` not supported by Markdown parser');
      handler(this, tok);
    }
  }

  // : (NodeType, ?Object, ?[Node]) → ?Node
  // Add a node at the current position.
  addNode(type, attrs, content) {
    let node = type.createAndFill(attrs, content, this.marks);
    if (!node) return null;
    this.push(node);
    return node;
  }

  // : (NodeType, ?Object)
  // Wrap subsequent content in a node of the given type.
  openNode(type, attrs) {
    this.stack.push({type: type, attrs: attrs, content: []});
  }

  // : () → ?Node
  // Close and return the node that is currently on top of the stack.
  closeNode() {
    if (this.marks.length) this.marks = Mark.none;
    let info = this.stack.pop();
    return this.addNode(info.type, info.attrs, info.content);
  }
}

function attrs(spec, token) {
  if (spec.getAttrs) return spec.getAttrs(token);
  // For backwards compatibility when `attrs` is a Function
  else if (spec.attrs instanceof Function) return spec.attrs(token);
  else return spec.attrs;
}

// Code content is represented as a single token with a `content`
// property in Markdown-it.
function noOpenClose(type) {
  return type == 'code_inline' || type == 'code_block' || type == 'fence';
}

function withoutTrailingNewline(str) {
  return str[str.length - 1] == '\n' ? str.slice(0, str.length - 1) : str;
}

function noOp() {}

function tokenHandlers(schema, tokens) {
  let handlers = Object.create(null);
  for (let type in tokens) {
    let spec = tokens[type];
    if (spec.block) {
      let nodeType = schema.nodeType(spec.block);
      if (noOpenClose(type)) {
        handlers[type] = (state, tok) => {
          state.openNode(nodeType, attrs(spec, tok));
          state.addText(withoutTrailingNewline(tok.content));
          state.closeNode();
        };
      } else {
        handlers[type + '_open'] = (state, tok) => state.openNode(nodeType, attrs(spec, tok));
        handlers[type + '_close'] = state => state.closeNode();
      }
    } else if (spec.node) {
      let nodeType = schema.nodeType(spec.node);
      handlers[type] = (state, tok) => state.addNode(nodeType, attrs(spec, tok));
    } else if (spec.mark) {
      let markType = schema.marks[spec.mark];
      if (noOpenClose(type)) {
        handlers[type] = (state, tok) => {
          state.openMark(markType.create(attrs(spec, tok)));
          state.addText(withoutTrailingNewline(tok.content));
          state.closeMark(markType);
        };
      } else {
        handlers[type + '_open'] = (state, tok) => state.openMark(markType.create(attrs(spec, tok)));
        handlers[type + '_close'] = state => state.closeMark(markType);
      }
    } else if (spec.ignore) {
      if (noOpenClose(type)) {
        handlers[type] = noOp;
      } else {
        handlers[type + '_open'] = noOp;
        handlers[type + '_close'] = noOp;
      }
    } else {
      throw new RangeError('Unrecognized parsing spec ' + JSON.stringify(spec));
    }
  }

  handlers.text = (state, tok) => state.addText(tok.content);
  handlers.inline = (state, tok) => state.parseTokens(tok.children);
  handlers.softbreak = handlers.softbreak || (state => state.addText('\n'));

  return handlers;
}

// ::- A configuration of a Markdown parser. Such a parser uses
// [markdown-it](https://github.com/markdown-it/markdown-it) to
// tokenize a file, and then runs the custom rules it is given over
// the tokens to create a ProseMirror document tree.
export class MarkdownParser {
  // :: (Schema, MarkdownIt, Object)
  // Create a parser with the given configuration. You can configure
  // the markdown-it parser to parse the dialect you want, and provide
  // a description of the ProseMirror entities those tokens map to in
  // the `tokens` object, which maps token names to descriptions of
  // what to do with them. Such a description is an object, and may
  // have the following properties:
  //
  // **`node`**`: ?string`
  //   : This token maps to a single node, whose type can be looked up
  //     in the schema under the given name. Exactly one of `node`,
  //     `block`, or `mark` must be set.
  //
  // **`block`**`: ?string`
  //   : This token comes in `_open` and `_close` variants (which are
  //     appended to the base token name provides a the object
  //     property), and wraps a block of content. The block should be
  //     wrapped in a node of the type named to by the property's
  //     value.
  //
  // **`mark`**`: ?string`
  //   : This token also comes in `_open` and `_close` variants, but
  //     should add a mark (named by the value) to its content, rather
  //     than wrapping it in a node.
  //
  // **`attrs`**`: ?Object`
  //   : Attributes for the node or mark. When `getAttrs` is provided,
  //     it takes precedence.
  //
  // **`getAttrs`**`: ?(MarkdownToken) → Object`
  //   : A function used to compute the attributes for the node or mark
  //     that takes a [markdown-it
  //     token](https://markdown-it.github.io/markdown-it/#Token) and
  //     returns an attribute object.
  //
  // **`ignore`**`: ?bool`
  //   : When true, ignore content for the matched token.
  constructor(schema, tokenizer, tokens) {
    // :: Object The value of the `tokens` object used to construct
    // this parser. Can be useful to copy and modify to base other
    // parsers on.
    this.tokens = tokens;
    this.schema = schema;
    this.tokenizer = tokenizer;
    this.tokenHandlers = tokenHandlers(schema, tokens);
  }

  // :: (string) → Node
  // Parse a string as [CommonMark](http://commonmark.org/) markup,
  // and create a ProseMirror document as prescribed by this parser's
  // rules.
  parse(text) {
    let state = new MarkdownParseState(this.schema, this.tokenHandlers), doc;
    state.parseTokens(this.tokenizer.parse(text, {}));
    do { doc = state.closeNode(); } while (state.stack.length);
    return doc;
  }
}

export const defaultMarkdownParser = new MarkdownParser(schema,
  markdownit('default', { html: false, typographer: true, linkify: true })
    .use(markdownItMark).use(emoji).use(ins).use(hashtag), {
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
  hashtag: {
    mark: 'hashtag', getAttrs: (tok) => ({
      href: tok.content,
      title: tok.content || null,
      class: 'hashtag'
    })
  },
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

export const defaultMarkdownSerializer = new MarkdownSerializer({
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
  hashtag: {
    open: '#', close: '',  mixable: false, expelEnclosingWhitespace: true,
  }
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