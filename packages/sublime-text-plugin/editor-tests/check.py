# Runs inside Sublime Text as `Packages/User/tsrx_editor_test.py`, copied there by
# `run.mjs`. It does nothing unless `tsrx_editor_test.json` is next to it: then it
# opens the file that names, waits for the TSRX syntax and the TSRX language
# server, writes what it saw to the result file, and quits Sublime Text.
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
        _finish(config, view, result)
    else:
        sublime.set_timeout(lambda: _wait(config, view, result, waited + STEP_MS), STEP_MS)


def _finish(config, view, result):
    with open(config['out'], 'w') as file:
        json.dump(result, file)
    view.set_scratch(True)
    sublime.set_timeout(lambda: sublime.run_command('exit'), 500)
