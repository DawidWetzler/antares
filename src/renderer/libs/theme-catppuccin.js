/*
   Catppuccin themes for the ace editor.

   Palette: catppuccin/palette v1.8.0 (https://github.com/catppuccin/palette), MIT.
   Role mapping follows the Catppuccin style guide and the Catppuccin port for SQL Server
   Management Studio (https://github.com/catppuccin/sql-server-management-studio), so SQL
   reads the same here as it does there.

   Registered through the `ace` global that `ace-builds` installs, the same way
   `ext-language_tools.js` is, which is why every importer must import 'ace-builds' first.
*/

const cssText = (cssClass, palette) => `
.${cssClass} {
   background-color: ${palette.base};
   color: ${palette.text};
}

.${cssClass} .ace_gutter {
   background: ${palette.mantle};
   color: ${palette.overlay1};
}

.${cssClass} .ace_gutter-active-line {
   background-color: ${palette.surface0};
   color: ${palette.text};
}

.${cssClass} .ace_print-margin {
   width: 1px;
   background: ${palette.surface0};
}

.${cssClass} .ace_cursor {
   color: ${palette.rosewater};
}

.${cssClass} .ace_marker-layer .ace_selection {
   background: ${palette.surface2};
}

.${cssClass}.ace_multiselect .ace_selection.ace_start {
   box-shadow: 0 0 3px 0 ${palette.base};
}

.${cssClass} .ace_marker-layer .ace_active-line {
   background: ${palette.surface0};
}

.${cssClass} .ace_marker-layer .ace_selected-word {
   border: 1px solid ${palette.overlay0};
}

.${cssClass} .ace_marker-layer .ace_bracket {
   margin: -1px 0 0 -1px;
   border: 1px solid ${palette.overlay0};
}

.${cssClass} .ace_marker-layer .ace_step {
   background: ${palette.surface1};
}

.${cssClass} .ace_fold {
   background-color: ${palette.blue};
   border-color: ${palette.base};
}

.${cssClass} .ace_invisible {
   color: ${palette.surface2};
}

.${cssClass} .ace_indent-guide {
   box-shadow: inset -1px 0 0 0 ${palette.surface1};
}

.${cssClass} .ace_indent-guide-active {
   box-shadow: inset -1px 0 0 0 ${palette.overlay0};
}

.${cssClass} .ace_identifier {
   color: ${palette.text};
}

.${cssClass} .ace_keyword,
.${cssClass} .ace_meta {
   color: ${palette.mauve};
}

.${cssClass} .ace_keyword.ace_operator {
   color: ${palette.sky};
}

.${cssClass} .ace_paren {
   color: ${palette.overlay2};
}

.${cssClass} .ace_string {
   color: ${palette.green};
}

.${cssClass} .ace_string.ace_regexp {
   color: ${palette.teal};
}

.${cssClass} .ace_constant,
.${cssClass} .ace_constant.ace_character,
.${cssClass} .ace_constant.ace_character.ace_escape,
.${cssClass} .ace_constant.ace_numeric,
.${cssClass} .ace_constant.ace_other,
.${cssClass} .ace_heading,
.${cssClass} .ace_markup.ace_heading,
.${cssClass} .ace_support.ace_constant {
   color: ${palette.peach};
}

.${cssClass} .ace_list,
.${cssClass} .ace_markup.ace_list,
.${cssClass} .ace_storage {
   color: ${palette.yellow};
}

.${cssClass} .ace_support {
   color: ${palette.teal};
}

.${cssClass} .ace_support.ace_function,
.${cssClass} .ace_entity.ace_name.ace_function,
.${cssClass} .ace_meta.ace_tag {
   color: ${palette.blue};
}

.${cssClass} .ace_variable {
   color: ${palette.maroon};
}

.${cssClass} .ace_comment {
   font-style: italic;
   color: ${palette.overlay2};
}

.${cssClass} .ace_xml-pe {
   color: ${palette.overlay1};
}

.${cssClass} .ace_invalid.ace_illegal {
   color: ${palette.base};
   background-color: ${palette.red};
}

.${cssClass} .ace_invalid.ace_deprecated {
   text-decoration: underline;
   font-style: italic;
   color: ${palette.maroon};
}
`;

const defineFlavour = (flavour, isDark, palette) => {
   ace.define(`ace/theme/catppuccin_${flavour}`, ['require', 'exports', 'module', 'ace/lib/dom'], function (require, exports) {
      exports.isDark = isDark;
      exports.cssClass = `ace-catppuccin-${flavour}`;
      exports.cssText = cssText(exports.cssClass, palette);

      require('../lib/dom').importCssString(exports.cssText, exports.cssClass, false);
   });
};

defineFlavour('latte', false, {
   rosewater: '#dc8a78',
   maroon: '#e64553',
   peach: '#fe640b',
   yellow: '#df8e1d',
   green: '#40a02b',
   teal: '#179299',
   sky: '#04a5e5',
   blue: '#1e66f5',
   mauve: '#8839ef',
   red: '#d20f39',
   text: '#4c4f69',
   overlay2: '#7c7f93',
   overlay1: '#8c8fa1',
   overlay0: '#9ca0b0',
   surface2: '#acb0be',
   surface1: '#bcc0cc',
   surface0: '#ccd0da',
   base: '#eff1f5',
   mantle: '#e6e9ef'
});

defineFlavour('frappe', true, {
   rosewater: '#f2d5cf',
   maroon: '#ea999c',
   peach: '#ef9f76',
   yellow: '#e5c890',
   green: '#a6d189',
   teal: '#81c8be',
   sky: '#99d1db',
   blue: '#8caaee',
   mauve: '#ca9ee6',
   red: '#e78284',
   text: '#c6d0f5',
   overlay2: '#949cbb',
   overlay1: '#838ba7',
   overlay0: '#737994',
   surface2: '#626880',
   surface1: '#51576d',
   surface0: '#414559',
   base: '#303446',
   mantle: '#292c3c'
});

defineFlavour('macchiato', true, {
   rosewater: '#f4dbd6',
   maroon: '#ee99a0',
   peach: '#f5a97f',
   yellow: '#eed49f',
   green: '#a6da95',
   teal: '#8bd5ca',
   sky: '#91d7e3',
   blue: '#8aadf4',
   mauve: '#c6a0f6',
   red: '#ed8796',
   text: '#cad3f5',
   overlay2: '#939ab7',
   overlay1: '#8087a2',
   overlay0: '#6e738d',
   surface2: '#5b6078',
   surface1: '#494d64',
   surface0: '#363a4f',
   base: '#24273a',
   mantle: '#1e2030'
});

defineFlavour('mocha', true, {
   rosewater: '#f5e0dc',
   maroon: '#eba0ac',
   peach: '#fab387',
   yellow: '#f9e2af',
   green: '#a6e3a1',
   teal: '#94e2d5',
   sky: '#89dceb',
   blue: '#89b4fa',
   mauve: '#cba6f7',
   red: '#f38ba8',
   text: '#cdd6f4',
   overlay2: '#9399b2',
   overlay1: '#7f849c',
   overlay0: '#6c7086',
   surface2: '#585b70',
   surface1: '#45475a',
   surface0: '#313244',
   base: '#1e1e2e',
   mantle: '#181825'
});
