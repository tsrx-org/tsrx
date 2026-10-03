# Runs inside Sublime Text as `Packages/User/tsrx_editor_test.py`, copied there by
# `run.mjs`. It does nothing unless `tsrx_editor_test.json` is next to it: then it
# opens the file that names, waits for the TSRX syntax and the TSRX language
# server, reads the scope of a piece of text in a second file, types `<div>` in a
# third, writes what it saw to the result file, and quits Sublime Text.
import json
import os

import sublime

CONFIG = os.path.join(os.path.dirname(__file__), 'tsrx_editor_test.json')
TIMEOUT_MS = 60000
STEP_MS = 250


def plugin_loaded():
    if os.path.exists(CONFIG):
        sublime.set_timeout(_start, 2000)


def _start():
    with open(CONFIG) as file:
        config = json.load(file)
    result = {'sublime': sublime.version()}
    try:
        from LSP.plugin import __version__ as lsp_version

        result['lsp'] = '.'.join(map(str, lsp_version))
    except Exception as error:
        result['lsp'] = 'not loaded: %s' % error
    view = sublime.active_window().open_file(config['file'])
    _wait(config, view, result, 0)


def _wait(config, view, result, waited):
    syntax = view.syntax()
    result['syntax'] = {'name': syntax.name, 'scope': syntax.scope} if syntax else None
    # The LSP package marks a view once a language server serves it.
    result['attached'] = bool(view.settings().get('lsp_active'))
    result['waited_ms'] = waited
    if (not view.is_loading() and result['attached']) or waited >= TIMEOUT_MS:
        _check_scope(config, view, result)
    else:
        sublime.set_timeout(lambda: _wait(config, view, result, waited + STEP_MS), STEP_MS)


def _check_scope(config, view, result):
    # The scope Sublime Text gives the character `config['scope_offset']` characters into
    # the first `config['scope_at']` in `config['scope_file']`.
    other = view.window().open_file(config['scope_file'])

    def check(waited=0):
        if other.is_loading() and waited < TIMEOUT_MS:
            sublime.set_timeout(lambda: check(waited + STEP_MS), STEP_MS)
            return
        region = other.find(config['scope_at'], 0, sublime.LITERAL)
        point = region.a + config['scope_offset']
        result['scope'] = other.scope_name(point) if region.a >= 0 else None
        other.set_scratch(True)
        _check_closing_tag(config, view, result)

    check()


def _check_closing_tag(config, view, result):
    # Type `<div>` on the empty second line of `config['closing_file']`, one key at a
    # time as a user does, then `hi`, and record the line and the caret each time.
    closing = view.window().open_file(config['closing_file'])
    result['closing'] = {}

    def record(name):
        caret = closing.sel()[0].b
        row, col = closing.rowcol(caret)
        result['closing'][name] = {'line': closing.substr(closing.line(caret)), 'col': col}

    def type_keys(keys, then):
        if not keys:
            sublime.set_timeout(then, 3000)
            return
        closing.window().focus_view(closing)
        closing.run_command('insert', {'characters': keys[0]})
        sublime.set_timeout(lambda: type_keys(keys[1:], then), 120)

    def after_hi():
        record('after_hi')
        closing.set_scratch(True)
        _finish(config, view, result)

    def after_gt():
        record('after_gt')
        type_keys(list('hi'), after_hi)

    def start(waited=0):
        ready = not closing.is_loading() and closing.settings().get('lsp_active')
        if not ready and waited < TIMEOUT_MS:
            sublime.set_timeout(lambda: start(waited + STEP_MS), STEP_MS)
            return
        line_end = closing.line(closing.text_point(1, 0)).end()
        closing.sel().clear()
        closing.sel().add(line_end)
        type_keys(list('<div>'), after_gt)

    start()


def _finish(config, view, result):
    with open(config['out'], 'w') as file:
        json.dump(result, file)
    view.set_scratch(True)
    sublime.set_timeout(lambda: sublime.run_command('exit'), 500)
