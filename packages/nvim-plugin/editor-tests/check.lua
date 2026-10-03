-- Runs inside headless Neovim, started by `run.js` in a test project's `app/` folder:
-- sets up this repository's plugin, opens the `.tsrx` file, waits for the TSRX language
-- server, and writes what it saw to the file named by TSRX_NVIM_OUT.

local result = { warnings_sent = {}, notifications = {} }

-- What Neovim shows the user: the LSP client reports `window/showMessage` through
-- `vim.notify`.
vim.notify = function(message, level)
	table.insert(result.notifications, { message = message, level = level })
end

-- What the server sent, before Neovim's own handler shows it.
local show_message = vim.lsp.handlers["window/showMessage"]
vim.lsp.handlers["window/showMessage"] = function(err, params, ctx, config)
	table.insert(result.warnings_sent, params)
	return show_message(err, params, ctx, config)
end

vim.opt.rtp:append(os.getenv("TSRX_NVIM_PLUGIN"))
-- Neovim turns filetype detection on after the init file; this file opens the `.tsrx`
-- file itself, so it turns it on first, or the file gets no filetype and no server.
vim.cmd("filetype on")
vim.filetype.add({ extension = { tsrx = "tsrx" } })
require("tsrx.lsp").setup()
vim.cmd.edit(vim.fn.fnameescape(os.getenv("TSRX_NVIM_FILE")))

local client
vim.wait(30000, function()
	client = vim.lsp.get_clients({ name = "tsrx", bufnr = 0 })[1]
	return client ~= nil and client.initialized
end, 100)

result.attached = client ~= nil and client.initialized == true
if result.attached then
	-- The warning follows `initialized`.
	vim.wait(2000, function()
		return false
	end, 100)
	result.typescript_features = client.server_capabilities.signatureHelpProvider ~= nil
	local response = client:request_sync(
		"textDocument/documentSymbol",
		{ textDocument = vim.lsp.util.make_text_document_params(0) },
		10000,
		0
	)
	result.symbols = response and response.result and #response.result or 0

	-- Closing tags (#1004), on Neovim 0.12 or newer: type `<p>` on a new line above the
	-- `<h2>` as a user does, and stay in Insert mode while the server answers on-type
	-- formatting for `>`. With `x!`, the keys run and Insert mode stays on until the
	-- timer records the line and leaves it.
	result.on_type_formatting = vim.lsp.on_type_formatting ~= nil
	if result.on_type_formatting then
		vim.defer_fn(function()
			result.closing_tag = {
				line = vim.api.nvim_get_current_line(),
				column = vim.fn.col("."),
				mode = vim.api.nvim_get_mode().mode,
			}
			vim.api.nvim_feedkeys(vim.keycode("<Esc>"), "n", false)
		end, 3000)
		vim.api.nvim_feedkeys(vim.keycode("/<lt>h2<CR>O<lt>p>"), "tx!", false)
	end
end

local file = assert(io.open(os.getenv("TSRX_NVIM_OUT"), "w"))
file:write(vim.json.encode(result))
file:close()
vim.cmd("qa!")
