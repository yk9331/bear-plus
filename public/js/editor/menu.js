import {
  wrapItem, blockTypeItem, Dropdown, DropdownSubmenu, joinUpItem, liftItem,
  selectParentNodeItem, icons, MenuItem
} from 'prosemirror-menu';
import { NodeSelection } from 'prosemirror-state';
import { joinUp, selectParentNode, toggleMark, } from 'prosemirror-commands';
import { undo, redo } from 'prosemirror-history';
import { wrapInList, sinkListItem, liftListItem} from 'prosemirror-schema-list';
import { TextField, openPrompt } from './prompt';
import { addAnnotation } from './comment';

// Helper function to create menu icons
function icon(text, className='material-icons-outlined') {
  return function (view) {
    let span = document.createElement('span');
    span.className = className;
    span.textContent = text;
    return span;
  };
}


// Helpers to create specific types of items
function canInsert(state, nodeType) {
  let $from = state.selection.$from;
  for (let d = $from.depth; d >= 0; d--) {
    let index = $from.index(d);
    if ($from.node(d).canReplaceWith(index, index, nodeType)) return true;
  }
  return false;
}

function insertImageItem(nodeType) {
  return new MenuItem({
    title: 'Insert image',
    render: icon('image'),
    enable(state) { return canInsert(state, nodeType); },
    run(state, _, view) {
      let {from, to} = state.selection, attrs = null;
      if (state.selection instanceof NodeSelection && state.selection.node.type == nodeType)
        attrs = state.selection.node.attrs;
      openPrompt({
        title: 'Insert image',
        fields: {
          src: new TextField({label: 'Location', required: true, value: attrs && attrs.src}),
          title: new TextField({label: 'Title', value: attrs && attrs.title}),
          alt: new TextField({label: 'Description',
                              value: attrs ? attrs.alt : state.doc.textBetween(from, to, ' ')})
        },
        callback(attrs) {
          view.dispatch(view.state.tr.replaceSelectionWith(nodeType.createAndFill(attrs)));
          view.focus();
        }
      });
    }
  });
}

function cmdItem(cmd, options) {
  let passedOptions = {
    label: options.title,
    run: cmd
  };
  for (let prop in options) passedOptions[prop] = options[prop];
  if ((!options.enable || options.enable === true) && !options.select)
    passedOptions[options.enable ? 'enable' : 'select'] = state => cmd(state);

  return new MenuItem(passedOptions);
}

function markActive(state, type) {
  let {from, $from, to, empty} = state.selection;
  if (empty) return type.isInSet(state.storedMarks || $from.marks());
  else return state.doc.rangeHasMark(from, to, type);
}

function markItem(markType, options) {
  let passedOptions = {
    active(state) { return markActive(state, markType); },
    enable: true
  };
  for (let prop in options) passedOptions[prop] = options[prop];
  return cmdItem(toggleMark(markType), passedOptions);
}

function linkItem(markType) {
  return new MenuItem({
    title: 'Add or remove link',
    render: icon('link'),
    active(state) { return markActive(state, markType); },
    enable(state) { return !state.selection.empty; },
    run(state, dispatch, view) {
      if (markActive(state, markType)) {
        toggleMark(markType)(state, dispatch);
        return true;
      }
      openPrompt({
        title: 'Create a link',
        fields: {
          href: new TextField({
            label: 'Link target',
            required: true
          }),
          title: new TextField({label: 'Title'})
        },
        callback(attrs) {
          toggleMark(markType, attrs)(view.state, view.dispatch);
          view.focus();
        }
      });
    }
  });
}

function wrapListItem(nodeType, options) {
  return cmdItem(wrapInList(nodeType, options.attrs), options);
}

function sinkListMenuItem(nodeType, options) {
  return cmdItem(sinkListItem(nodeType), options);
}

function liftListMenuItem(nodeType, options) {
  return cmdItem(liftListItem(nodeType), options);
}


export function buildMenuItems(schema) {
  let r = {};
  r.toggleStrong = markItem(schema.marks.strong, {
    title: 'Bold', render: icon('format_bold')
  });

  r.toggleEm = markItem(schema.marks.em, {
    title: 'Italic',
    render: icon('format_italic')
  });

  r.toggleUnderline = markItem(schema.marks.ins, {
    title: 'Underline',
    render: icon('format_underline')
  });

  r.toggleStrike = markItem(schema.marks.strikethrough, {
    title: 'Strikethrough',
    render: icon('format_strikethrough')
  });

  r.toggleCode = markItem(schema.marks.code, {
    title: 'Code',
    render: icon('code'),
  });

  r.toggleMark = markItem(schema.marks.mark, {
    title: 'Mark',
    render: icon('colorize'),
  });

  r.toggleLink = linkItem(schema.marks.link);

  r.annotation = new MenuItem({
    title: 'Add an annotation',
    run: addAnnotation,
    enable: state => addAnnotation(state),
    render: icon('insert_comment')
  });

  r.insertImage = insertImageItem(schema.nodes.image);

  r.wrapBulletList = wrapListItem(schema.nodes.bullet_list, {
    title: 'Wrap in bullet list',
    render: icon('format_list_bulleted')
  });

  r.wrapOrderedList = wrapListItem(schema.nodes.ordered_list, {
    title: 'Wrap in ordered list',
    render: icon('format_list_numbered')
  });

  r.wrapBlockQuote = wrapItem(schema.nodes.blockquote, {
    title: 'Wrap in block quote',
    render: icon('format_quote','material-icons')
  });

  r.makeParagraph = blockTypeItem(schema.nodes.paragraph, {
    title: 'Change to paragraph',
    label: 'P'
  });

  r.makeCodeBlock = blockTypeItem(schema.nodes.code_block, {
    title: 'Change to code block',
    render: icon('settings_ethernet')
  });

  for (let i = 1; i <= 10; i++)
    r['makeHead' + i] = blockTypeItem(schema.nodes.heading, {
      title: 'Change to heading ' + i,
      label: 'H' + i,
      attrs: {level: i}
    });

  let hr = schema.nodes.horizontal_rule;
  r.insertHorizontalRule = new MenuItem({
    title: 'Insert horizontal rule',
    render: icon('horizontal_rule'),
    enable(state) { return canInsert(state, hr); },
    run(state, dispatch) { dispatch(state.tr.replaceSelectionWith(hr.create())); }
  });

  r.joinUp = new MenuItem({
    title: 'Join with above block',
    run: joinUp,
    select: state => joinUp(state),
    icon: icons.join
  });

  r.sink = sinkListMenuItem(schema.nodes.list_item, {
    title: 'Indent the list item',
    render: icon('format_indent_increase')
  });

  r.lift = liftListMenuItem(schema.nodes.list_item, {
    title: 'Lift the list item',
    render: icon('format_indent_decrease')
  });

  r.selectParentNode = new MenuItem({
    title: 'Select parent node',
    run: selectParentNode,
    enable: state => selectParentNode(state),
    render:icon('select_all')
  });

  r.undo = new MenuItem({
    title: 'Undo',
    run: undo,
    enable: state => undo(state),
    icon: icons.undo
  });

  r.redo = new MenuItem({
    title: 'Redo',
    run: redo,
    enable: state => redo(state),
    icon: icons.redo
  });

  let cut = arr => arr.filter(x => x);
  r.insertMenu = new Dropdown(cut([r.insertImage, r.insertHorizontalRule]), {label: 'Insert'});
  r.typeMenu = new Dropdown(cut([r.makeParagraph, r.makeCodeBlock, r.makeHead1 && new DropdownSubmenu(cut([
    r.makeHead1, r.makeHead2, r.makeHead3, r.makeHead4, r.makeHead5, r.makeHead6
  ]), {label: 'Heading'})]), {label: 'Type...'});

  r.inlineMenu = [cut([r.toggleStrong, r.toggleEm, r.toggleCode, r.toggleUnderline, r.toggleLink])];
  r.blockMenu = [cut([r.wrapBulletList, r.wrapOrderedList, r.wrapBlockQuote, joinUpItem,
                      liftItem, selectParentNodeItem])];
  r.fullMenu = [
    [r.makeHead1, r.makeHead2, r.makeHead3, r.makeParagraph, r.makeCodeBlock, r.insertHorizontalRule],
    [r.toggleStrong, r.toggleEm, r.toggleUnderline, r.toggleStrike, r.toggleMark, r.toggleCode, r.toggleLink, r.annotation],
    [r.wrapBulletList, r.wrapOrderedList, r.wrapBlockQuote, r.sink, r.lift],
    [r.selectParentNode, r.undo, r.redo]];
  return r;
}
