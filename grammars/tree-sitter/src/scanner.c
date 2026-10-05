#include <tree_sitter/parser.h>
#include <string.h>
#include <wctype.h>

enum TokenType {
  AUTOMATIC_SEMICOLON,
  TEMPLATE_CHARS,
  TERNARY_QMARK,
  JSX_TEXT,
  SCRIPT_CONTENT,
  STYLE_CONTENT,
};

void *tree_sitter_tsrx_external_scanner_create() { return NULL; }
void tree_sitter_tsrx_external_scanner_destroy(void *p) {}
void tree_sitter_tsrx_external_scanner_reset(void *p) {}
unsigned tree_sitter_tsrx_external_scanner_serialize(void *p, char *buffer) { return 0; }
void tree_sitter_tsrx_external_scanner_deserialize(void *p, const char *b, unsigned n) {}

static void advance(TSLexer *lexer) { lexer->advance(lexer, false); }
static void skip(TSLexer *lexer) { lexer->advance(lexer, true); }

// Reads whitespace and comments. `skip_chars` skips them, for the start of a
// token; a lookahead in the middle of a token passes false, because a skip
// there moves the token's start past what it has read.
static bool read_whitespace_and_comments(TSLexer *lexer, bool skip_chars) {
  for (;;) {
    while (iswspace(lexer->lookahead)) {
      lexer->advance(lexer, skip_chars);
    }

    if (lexer->lookahead == '/') {
      lexer->advance(lexer, skip_chars);

      if (lexer->lookahead == '/') {
        lexer->advance(lexer, skip_chars);
        while (lexer->lookahead != 0 && lexer->lookahead != '\n') {
          lexer->advance(lexer, skip_chars);
        }
      } else if (lexer->lookahead == '*') {
        lexer->advance(lexer, skip_chars);
        while (true) {
          if (lexer->lookahead == 0) return false;
          if (lexer->lookahead == '*') {
            lexer->advance(lexer, skip_chars);
            if (lexer->lookahead == '/') {
              lexer->advance(lexer, skip_chars);
              break;
            }
          } else {
            lexer->advance(lexer, skip_chars);
          }
        }
      } else {
        return false;
      }
    } else {
      return true;
    }
  }
}

static bool scan_whitespace_and_comments(TSLexer *lexer) {
  return read_whitespace_and_comments(lexer, true);
}

static bool advance_whitespace_and_comments(TSLexer *lexer) {
  return read_whitespace_and_comments(lexer, false);
}

static bool scan_automatic_semicolon(TSLexer *lexer) {
  lexer->result_symbol = AUTOMATIC_SEMICOLON;
  lexer->mark_end(lexer);

  for (;;) {
    if (lexer->lookahead == 0) return true;
    if (lexer->lookahead == '}') return true;
    if (lexer->is_at_included_range_start(lexer)) return true;
    if (lexer->lookahead == '\n') break;
    if (!iswspace(lexer->lookahead)) return false;
    skip(lexer);
  }

  skip(lexer);

  if (!scan_whitespace_and_comments(lexer)) return false;

  if (lexer->lookahead == ',') return false;
  if (lexer->lookahead == '.') return false;
  if (lexer->lookahead == ':') return false;
  if (lexer->lookahead == ';') return false;
  if (lexer->lookahead == '*') return false;
  if (lexer->lookahead == '%') return false;
  if (lexer->lookahead == '^') return false;
  if (lexer->lookahead == '+') return false;
  if (lexer->lookahead == '-') return false;
  if (lexer->lookahead == '/') return false;
  if (lexer->lookahead == '<') return false;
  if (lexer->lookahead == '=') return false;
  if (lexer->lookahead == '>') return false;
  if (lexer->lookahead == '|') return false;
  if (lexer->lookahead == '&') return false;
  if (lexer->lookahead == '?') return false;
  if (lexer->lookahead == '[') return false;
  if (lexer->lookahead == '(') return false;

  return true;
}

static bool scan_template_chars(TSLexer *lexer) {
  lexer->result_symbol = TEMPLATE_CHARS;
  for (bool has_content = false;; has_content = true) {
    lexer->mark_end(lexer);
    switch (lexer->lookahead) {
      case '`':
        return has_content;
      case '$':
        advance(lexer);
        if (lexer->lookahead == '{') {
          return has_content;
        }
        break;
      case '\\':
        return has_content;
      case 0:
        return false;
      default:
        advance(lexer);
    }
  }
}

static bool scan_ternary_qmark(TSLexer *lexer) {
  for (;;) {
    if (!iswspace(lexer->lookahead)) break;
    skip(lexer);
  }

  if (lexer->lookahead == '?') {
    advance(lexer);

    if (lexer->lookahead != '?') {
      lexer->mark_end(lexer);
      lexer->result_symbol = TERNARY_QMARK;

      if (lexer->lookahead == '.') return false;

      return true;
    }
  }

  return false;
}

static bool is_identifier_start(int32_t c) {
  return c == '_' || c == '$' || iswalpha(c);
}

static bool is_identifier_continue(int32_t c) {
  return is_identifier_start(c) || iswdigit(c);
}

static void scan_identifier_word(TSLexer *lexer, char *word, size_t word_size) {
  unsigned length = 0;

  while (is_identifier_continue(lexer->lookahead)) {
    if (length < word_size - 1) {
      word[length++] = (char)lexer->lookahead;
    }
    advance(lexer);
  }

  word[length] = '\0';
}

static bool check_boundary_lookahead(TSLexer *lexer, const char *word) {
  advance_whitespace_and_comments(lexer);
  if (strcmp(word, "case") == 0) {
    return lexer->lookahead == '\'' || lexer->lookahead == '"' ||
           lexer->lookahead == '`' || lexer->lookahead == '(' ||
           iswdigit(lexer->lookahead) || lexer->lookahead == '-' ||
           is_identifier_start(lexer->lookahead);
  }
  if (strcmp(word, "default") == 0) {
    return lexer->lookahead == ':';
  }
  if (strcmp(word, "else") == 0) {
    return lexer->lookahead == '{' || lexer->lookahead == 'i';
  }
  if (strcmp(word, "catch") == 0) {
    return lexer->lookahead == '(' || lexer->lookahead == '{';
  }
  return lexer->lookahead == '{';
}

// Whether a `<` in text starts a tag, as the compiler's `can_start_tag_after_lt`
// decides: the character after it is `/`, `>`, `{`, `@`, `$`, `_` or an ASCII
// letter. Otherwise the `<` is text (`1 < 2`). Reads past the `<`; the caller
// has marked the end of the text before it.
static bool lt_starts_tag(TSLexer *lexer) {
  advance(lexer);
  int32_t c = lexer->lookahead;
  return c == '/' || c == '>' || c == '{' || c == '@' || c == '$' || c == '_' ||
         (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z');
}

// Whether an `@` in text starts a code block or directive, which ends the text,
// as the compiler's `#isCodeBlockStart` and `#isJSXControlFlowDirectiveAt`
// decide: `@{`, `@if (`, `@switch (`, `@for (`, `@for await (` or `@try {`, with
// whitespace or comments allowed before the `(` or `{`. When `continuation` is
// set (the text so far is only whitespace, as between a directive's body and
// its next clause), `@else`, `@empty`, `@pending` and `@catch` followed by what
// they take end it too. Any other `@` is text: `@tsrx/react`, `@if</code>`, a
// lone `@`. Reads past the `@`; the caller has marked the end of the text.
static bool at_ends_text(TSLexer *lexer, bool continuation) {
  advance(lexer);
  if (lexer->lookahead == '{') return true;
  if (!is_identifier_start(lexer->lookahead)) return false;

  char word[16];
  scan_identifier_word(lexer, word, sizeof(word));
  advance_whitespace_and_comments(lexer);
  int32_t next = lexer->lookahead;

  if (strcmp(word, "if") == 0 || strcmp(word, "switch") == 0) return next == '(';
  if (strcmp(word, "try") == 0) return next == '{';
  if (strcmp(word, "for") == 0) {
    if (next == '(') return true;
    if (next != 'a') return false;
    scan_identifier_word(lexer, word, sizeof(word));
    if (strcmp(word, "await") != 0) return false;
    advance_whitespace_and_comments(lexer);
    return lexer->lookahead == '(';
  }

  if (!continuation) return false;
  if (strcmp(word, "else") == 0) {
    // A braced or braceless body, or `else if`.
    if (next == '{' || next == '@') return true;
    if (next == '<') {
      advance(lexer);
      return lexer->lookahead != '/';
    }
    if (next != 'i') return false;
    scan_identifier_word(lexer, word, sizeof(word));
    return strcmp(word, "if") == 0;
  }
  if (strcmp(word, "empty") == 0 || strcmp(word, "pending") == 0) return next == '{';
  if (strcmp(word, "catch") == 0) return next == '(' || next == '{';
  return false;
}

static bool scan_jsx_text(TSLexer *lexer) {
  lexer->result_symbol = JSX_TEXT;
  bool has_content = false;
  bool has_non_whitespace_content = false;
  // True while only whitespace has been consumed since the nearest comment
  // boundary: the token start (right after a sibling element, expression
  // container, or code block) or the start of the current line. A `//` seen
  // while this holds starts a line comment; after real text it is literal, so
  // inline text like `https://…` stays text. `/*` is a comment anywhere.
  bool ws_only_since_boundary = true;

  while (iswspace(lexer->lookahead)) {
    skip(lexer);
    has_content = true;
  }

  if (has_content && lexer->lookahead == '@') {
    // Whitespace before a code block or directive is not a text token. Any
    // other `@` starts the text, after the skipped whitespace.
    if (at_ends_text(lexer, true)) {
      return false;
    }
    has_non_whitespace_content = true;
    ws_only_since_boundary = false;
  }

  for (;;) {
    lexer->mark_end(lexer);
    switch (lexer->lookahead) {
      case '{':
      case '}':
      case 0:
        return has_content;
      case '<':
        if (lt_starts_tag(lexer)) {
          return has_content;
        }
        has_content = true;
        has_non_whitespace_content = true;
        ws_only_since_boundary = false;
        break;
      case '@': {
        if (at_ends_text(lexer, !has_non_whitespace_content)) {
          return has_content;
        }
        has_content = true;
        has_non_whitespace_content = true;
        ws_only_since_boundary = false;
        break;
      }
      case '/': {
        advance(lexer);
        if (lexer->lookahead == '*') {
          return has_content;
        }
        if (lexer->lookahead == '/' && ws_only_since_boundary) {
          return has_content;
        }
        has_content = true;
        has_non_whitespace_content = true;
        ws_only_since_boundary = false;
        break;
      }
      default:
        if (is_identifier_start(lexer->lookahead)) {
          if (!has_non_whitespace_content) {
            char word[16];
            scan_identifier_word(lexer, word, sizeof(word));
            if (strcmp(word, "finally") == 0 && check_boundary_lookahead(lexer, word)) {
              return false;
            }
            has_content = true;
            has_non_whitespace_content = true;
            ws_only_since_boundary = false;
            break;
          }
          while (is_identifier_continue(lexer->lookahead)) {
            advance(lexer);
          }
          has_content = true;
          has_non_whitespace_content = true;
          ws_only_since_boundary = false;
          break;
        }

        if (lexer->lookahead == '\n' || lexer->lookahead == '\r') {
          ws_only_since_boundary = true;
        } else if (!iswspace(lexer->lookahead)) {
          has_non_whitespace_content = true;
          ws_only_since_boundary = false;
        }
        advance(lexer);
        has_content = true;
    }
  }
}

// Raw `<script>` or `<style>` body: consume everything verbatim (including `<`,
// `{`, quotes and comments) up to, but not including, the literal closing tag
// (`</script>` or `</style>`). Mirrors how tree-sitter-html scans raw text, so
// JS/TS and CSS bodies never parse as template markup. Returns false for an
// empty body (the grammar's `optional` handles that) or an unterminated element.
static bool scan_raw_text(TSLexer *lexer, enum TokenType symbol, const char *end_tag) {
  lexer->result_symbol = symbol;
  bool has_content = false;

  for (;;) {
    lexer->mark_end(lexer);
    if (lexer->lookahead == 0) {
      return false;
    }
    if (lexer->lookahead == '<') {
      unsigned matched = 0;
      while (end_tag[matched] != '\0' && lexer->lookahead == end_tag[matched]) {
        advance(lexer);
        matched++;
      }
      if (end_tag[matched] == '\0') {
        // Full closing tag seen; mark_end above already excluded it.
        return has_content;
      }
      has_content = true;
    } else {
      advance(lexer);
      has_content = true;
    }
  }
}

bool tree_sitter_tsrx_external_scanner_scan(void *payload, TSLexer *lexer,
                                                const bool *valid_symbols) {
  // Error recovery enables every external token. Template chunks are never
  // valid alongside automatic semicolons in a real parse state. In recovery,
  // scanning them could swallow arbitrary code up to an unrelated `${` or
  // backtick; leave recovery to the internal lexer instead.
  if (valid_symbols[TEMPLATE_CHARS] && valid_symbols[AUTOMATIC_SEMICOLON]) {
    return false;
  }

  if (valid_symbols[SCRIPT_CONTENT]) {
    return scan_raw_text(lexer, SCRIPT_CONTENT, "</script>");
  }

  if (valid_symbols[STYLE_CONTENT]) {
    return scan_raw_text(lexer, STYLE_CONTENT, "</style>");
  }

  if (valid_symbols[TEMPLATE_CHARS]) {
    return scan_template_chars(lexer);
  }

  if (valid_symbols[AUTOMATIC_SEMICOLON]) {
    bool ret = scan_automatic_semicolon(lexer);
    // A `?` here can never be an automatic semicolon; when TERNARY_QMARK is
    // also valid, fall through to it instead of returning early (otherwise
    // ternaries never lex whenever ASI is possible at the same position).
    if (!ret && valid_symbols[TERNARY_QMARK] && lexer->lookahead == '?') {
      return scan_ternary_qmark(lexer);
    }
    return ret;
  }

  if (valid_symbols[TERNARY_QMARK]) {
    return scan_ternary_qmark(lexer);
  }

  if (valid_symbols[JSX_TEXT]) {
    return scan_jsx_text(lexer);
  }

  return false;
}
