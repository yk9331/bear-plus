import * as SimpleMDE from 'simplemde';

const simplemde = new SimpleMDE({
  element: $('editor')[0],
  autoDownloadFontAwesome: true,
  autofocus: true,
  indentWithTabs: true,
  lineWrapping: true,
  spellChecker: false,
  toolbar: false,
  status: false,
});

simplemde.codemirror.on('change', () => {
  console.log(simplemde.value());
});
