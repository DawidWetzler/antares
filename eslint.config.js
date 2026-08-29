const tsPlugin = require('@typescript-eslint/eslint-plugin');
const tsParser = require('@typescript-eslint/parser');
// ESM-only: require() yields the plugin itself because eslint-plugin-n exports a
// 'module.exports' named export (Node >= 22.12). No .default needed.
const nPlugin = require('eslint-plugin-n');
const promisePlugin = require('eslint-plugin-promise');
const simpleImportSort = require('eslint-plugin-simple-import-sort');
const vuePlugin = require('eslint-plugin-vue');
const vueParser = require('vue-eslint-parser');

// Declaring the extensions here is also what makes `eslint .` walk .ts and .vue.
const files = ['**/*.{js,cjs,mjs,ts,vue}'];

// eslint-config-standard 16.0.3 inlined: it is unmaintained and peers eslint ^7.
// Its node/* keys are renamed to n/*, its import/* keys dropped with eslint-plugin-import.
const standardRules = {
   'no-var': 'warn',
   'accessor-pairs': [
      'error',
      {
         setWithoutGet: true,
         enforceForClassMembers: true
      }
   ],
   'array-bracket-spacing': [
      'error',
      'never'
   ],
   'array-callback-return': [
      'error',
      {
         allowImplicit: false,
         checkForEach: false
      }
   ],
   'arrow-spacing': [
      'error',
      {
         before: true,
         after: true
      }
   ],
   'block-spacing': [
      'error',
      'always'
   ],
   'brace-style': [
      'error',
      '1tbs',
      {
         allowSingleLine: true
      }
   ],
   camelcase: [
      'error',
      {
         allow: [
            '^UNSAFE_'
         ],
         properties: 'never',
         ignoreGlobals: true
      }
   ],
   'comma-dangle': [
      'error',
      {
         arrays: 'never',
         objects: 'never',
         imports: 'never',
         exports: 'never',
         functions: 'never'
      }
   ],
   'comma-spacing': [
      'error',
      {
         before: false,
         after: true
      }
   ],
   'comma-style': [
      'error',
      'last'
   ],
   'computed-property-spacing': [
      'error',
      'never',
      {
         enforceForClassMembers: true
      }
   ],
   'constructor-super': 'error',
   curly: [
      'error',
      'multi-line'
   ],
   'default-case-last': 'error',
   'dot-location': [
      'error',
      'property'
   ],
   'dot-notation': [
      'error',
      {
         allowKeywords: true
      }
   ],
   'eol-last': 'error',
   eqeqeq: [
      'error',
      'always',
      {
         null: 'ignore'
      }
   ],
   'func-call-spacing': [
      'error',
      'never'
   ],
   'generator-star-spacing': [
      'error',
      {
         before: true,
         after: true
      }
   ],
   indent: [
      'error',
      2,
      {
         SwitchCase: 1,
         VariableDeclarator: 1,
         outerIIFEBody: 1,
         MemberExpression: 1,
         FunctionDeclaration: {
            parameters: 1,
            body: 1
         },
         FunctionExpression: {
            parameters: 1,
            body: 1
         },
         CallExpression: {
            arguments: 1
         },
         ArrayExpression: 1,
         ObjectExpression: 1,
         ImportDeclaration: 1,
         flatTernaryExpressions: false,
         ignoreComments: false,
         ignoredNodes: [
            'TemplateLiteral *',
            'JSXElement',
            'JSXElement > *',
            'JSXAttribute',
            'JSXIdentifier',
            'JSXNamespacedName',
            'JSXMemberExpression',
            'JSXSpreadAttribute',
            'JSXExpressionContainer',
            'JSXOpeningElement',
            'JSXClosingElement',
            'JSXFragment',
            'JSXOpeningFragment',
            'JSXClosingFragment',
            'JSXText',
            'JSXEmptyExpression',
            'JSXSpreadChild'
         ],
         offsetTernaryExpressions: true
      }
   ],
   'key-spacing': [
      'error',
      {
         beforeColon: false,
         afterColon: true
      }
   ],
   'keyword-spacing': [
      'error',
      {
         before: true,
         after: true
      }
   ],
   'lines-between-class-members': [
      'error',
      'always',
      {
         exceptAfterSingleLine: true
      }
   ],
   'multiline-ternary': [
      'error',
      'always-multiline'
   ],
   'new-cap': [
      'error',
      {
         newIsCap: true,
         capIsNew: false,
         properties: true
      }
   ],
   'new-parens': 'error',
   'no-array-constructor': 'error',
   'no-async-promise-executor': 'error',
   'no-caller': 'error',
   'no-case-declarations': 'error',
   'no-class-assign': 'error',
   'no-compare-neg-zero': 'error',
   'no-cond-assign': 'error',
   'no-const-assign': 'error',
   'no-constant-condition': [
      'error',
      {
         checkLoops: false
      }
   ],
   'no-control-regex': 'error',
   'no-debugger': 'error',
   'no-delete-var': 'error',
   'no-dupe-args': 'error',
   'no-dupe-class-members': 'error',
   'no-dupe-keys': 'error',
   'no-duplicate-case': 'error',
   'no-useless-backreference': 'error',
   'no-empty': [
      'error',
      {
         allowEmptyCatch: true
      }
   ],
   'no-empty-character-class': 'error',
   'no-empty-pattern': 'error',
   'no-eval': 'error',
   'no-ex-assign': 'error',
   'no-extend-native': 'error',
   'no-extra-bind': 'error',
   'no-extra-boolean-cast': 'error',
   'no-extra-parens': [
      'error',
      'functions'
   ],
   'no-fallthrough': 'error',
   'no-floating-decimal': 'error',
   'no-func-assign': 'error',
   'no-global-assign': 'error',
   'no-implied-eval': 'error',
   'no-import-assign': 'error',
   'no-invalid-regexp': 'error',
   'no-irregular-whitespace': 'error',
   'no-iterator': 'error',
   'no-labels': [
      'error',
      {
         allowLoop: false,
         allowSwitch: false
      }
   ],
   'no-lone-blocks': 'error',
   'no-loss-of-precision': 'error',
   'no-misleading-character-class': 'error',
   'no-prototype-builtins': 'error',
   'no-useless-catch': 'error',
   'no-mixed-operators': [
      'error',
      {
         groups: [
            [
               '==',
               '!=',
               '===',
               '!==',
               '>',
               '>=',
               '<',
               '<='
            ],
            [
               '&&',
               '||'
            ],
            [
               'in',
               'instanceof'
            ]
         ],
         allowSamePrecedence: true
      }
   ],
   'no-mixed-spaces-and-tabs': 'error',
   'no-multi-spaces': 'error',
   'no-multi-str': 'error',
   'no-multiple-empty-lines': [
      'error',
      {
         max: 1,
         maxEOF: 0
      }
   ],
   'no-new': 'error',
   'no-new-func': 'error',
   'no-new-object': 'error',
   'no-new-symbol': 'error',
   'no-new-wrappers': 'error',
   'no-obj-calls': 'error',
   'no-octal': 'error',
   'no-octal-escape': 'error',
   'no-proto': 'error',
   'no-redeclare': [
      'error',
      {
         builtinGlobals: false
      }
   ],
   'no-regex-spaces': 'error',
   'no-return-assign': [
      'error',
      'except-parens'
   ],
   'no-self-assign': [
      'error',
      {
         props: true
      }
   ],
   'no-self-compare': 'error',
   'no-sequences': 'error',
   'no-shadow-restricted-names': 'error',
   'no-sparse-arrays': 'error',
   'no-tabs': 'error',
   'no-template-curly-in-string': 'error',
   'no-this-before-super': 'error',
   'no-throw-literal': 'error',
   'no-trailing-spaces': 'error',
   'no-undef': 'error',
   'no-undef-init': 'error',
   'no-unexpected-multiline': 'error',
   'no-unmodified-loop-condition': 'error',
   'no-unneeded-ternary': [
      'error',
      {
         defaultAssignment: false
      }
   ],
   'no-unreachable': 'error',
   'no-unreachable-loop': 'error',
   'no-unsafe-finally': 'error',
   'no-unsafe-negation': 'error',
   'no-unused-expressions': [
      'error',
      {
         allowShortCircuit: true,
         allowTernary: true,
         allowTaggedTemplates: true
      }
   ],
   'no-unused-vars': [
      'error',
      {
         args: 'none',
         caughtErrors: 'none',
         ignoreRestSiblings: true,
         vars: 'all'
      }
   ],
   'no-use-before-define': [
      'error',
      {
         functions: false,
         classes: false,
         variables: false
      }
   ],
   'no-useless-call': 'error',
   'no-useless-computed-key': 'error',
   'no-useless-constructor': 'error',
   'no-useless-escape': 'error',
   'no-useless-rename': 'error',
   'no-useless-return': 'error',
   'no-void': 'error',
   'no-whitespace-before-property': 'error',
   'no-with': 'error',
   'object-curly-newline': [
      'error',
      {
         multiline: true,
         consistent: true
      }
   ],
   'object-curly-spacing': [
      'error',
      'always'
   ],
   'object-property-newline': [
      'error',
      {
         allowMultiplePropertiesPerLine: true
      }
   ],
   'one-var': [
      'error',
      {
         initialized: 'never'
      }
   ],
   'operator-linebreak': [
      'error',
      'after',
      {
         overrides: {
            '?': 'before',
            ':': 'before',
            '|>': 'before'
         }
      }
   ],
   'padded-blocks': [
      'error',
      {
         blocks: 'never',
         switches: 'never',
         classes: 'never'
      }
   ],
   'prefer-const': [
      'error',
      {
         destructuring: 'all'
      }
   ],
   'prefer-promise-reject-errors': 'error',
   'prefer-regex-literals': [
      'error',
      {
         disallowRedundantWrapping: true
      }
   ],
   'quote-props': [
      'error',
      'as-needed'
   ],
   quotes: [
      'error',
      'single',
      {
         avoidEscape: true,
         allowTemplateLiterals: false
      }
   ],
   'rest-spread-spacing': [
      'error',
      'never'
   ],
   semi: [
      'error',
      'never'
   ],
   'semi-spacing': [
      'error',
      {
         before: false,
         after: true
      }
   ],
   'space-before-blocks': [
      'error',
      'always'
   ],
   'space-before-function-paren': [
      'error',
      'always'
   ],
   'space-in-parens': [
      'error',
      'never'
   ],
   'space-infix-ops': 'error',
   'space-unary-ops': [
      'error',
      {
         words: true,
         nonwords: false
      }
   ],
   'spaced-comment': [
      'error',
      'always',
      {
         line: {
            markers: [
               '*package',
               '!',
               '/',
               ',',
               '='
            ]
         },
         block: {
            balanced: true,
            markers: [
               '*package',
               '!',
               ',',
               ':',
               '::',
               'flow-include'
            ],
            exceptions: [
               '*'
            ]
         }
      }
   ],
   'symbol-description': 'error',
   'template-curly-spacing': [
      'error',
      'never'
   ],
   'template-tag-spacing': [
      'error',
      'never'
   ],
   'unicode-bom': [
      'error',
      'never'
   ],
   'use-isnan': [
      'error',
      {
         enforceForSwitchCase: true,
         enforceForIndexOf: true
      }
   ],
   'valid-typeof': [
      'error',
      {
         requireStringLiterals: true
      }
   ],
   'wrap-iife': [
      'error',
      'any',
      {
         functionPrototypeMethods: true
      }
   ],
   'yield-star-spacing': [
      'error',
      'both'
   ],
   yoda: [
      'error',
      'never'
   ],
   'n/handle-callback-err': [
      'error',
      '^(err|error)$'
   ],
   'n/no-callback-literal': 'error',
   'n/no-deprecated-api': 'error',
   'n/no-exports-assign': 'error',
   'n/no-new-require': 'error',
   'n/no-path-concat': 'error',
   'n/process-exit-as-throw': 'error',
   'promise/param-names': 'error'
};

module.exports = [
   {
      // Root only, unlike the old .eslintignore: src/main/libs/misc gets linted.
      ignores: ['assets/', 'out/', 'dist/', 'build/', 'misc/']
   },
   {
      files,
      plugins: {
         n: nPlugin,
         promise: promisePlugin
      },
      rules: standardRules
   },
   ...tsPlugin.configs['flat/recommended'],
   ...vuePlugin.configs['flat/recommended'],
   {
      files,
      plugins: {
         'simple-import-sort': simpleImportSort
      },
      languageOptions: {
         ecmaVersion: 2018,
         sourceType: 'module',
         parser: vueParser,
         parserOptions: {
            parser: tsParser
         }
      },
      rules: {
         'space-infix-ops': 'off',
         'object-curly-newline': 'off',
         indent: [
            'error',
            3,
            {
               SwitchCase: 1
            }
         ],
         'linebreak-style': [
            'error',
            'unix'
         ],
         'brace-style': [
            'error',
            'stroustrup'
         ],
         quotes: [
            'error',
            'single'
         ],
         semi: [
            'error',
            'always'
         ],
         curly: [
            'error',
            'multi-or-nest'
         ],
         'no-console': 'off',
         'no-undef': 'off',
         'vue/no-side-effects-in-computed-properties': 'off',
         'vue/multi-word-component-names': 'off',
         'vue/require-default-prop': 'off',
         'vue/comment-directive': 'off',
         'vue/no-v-html': 'off',
         'vue/html-indent': [
            'error',
            3,
            {
               attribute: 1,
               baseIndent: 1,
               closeBracket: 0,
               ignores: []
            }
         ],
         'vue/max-attributes-per-line': [
            'error',
            {
               singleline: {
                  max: 2
               },
               multiline: {
                  max: 1
               }
            }
         ],
         '@typescript-eslint/no-var-requires': 'off',
         // Deprecated no-var-requires was replaced by no-require-imports, which
         // recommended enables: without this the repo's require() sites all error.
         '@typescript-eslint/no-require-imports': 'off',
         // v8's recommended replaces the core rule and drops standard's options with it.
         '@typescript-eslint/no-unused-expressions': [
            'error',
            {
               allowShortCircuit: true,
               allowTernary: true,
               allowTaggedTemplates: true
            }
         ],
         // typescript-eslint v8 flipped caughtErrors from 'none' to 'all'.
         '@typescript-eslint/no-unused-vars': [
            'error',
            {
               caughtErrors: 'none'
            }
         ],
         'simple-import-sort/imports': 'error',
         'simple-import-sort/exports': 'error'
      }
   }
];
