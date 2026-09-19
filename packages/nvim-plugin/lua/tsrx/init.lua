local M = {}

--- @class TsrxSetupOptions
--- @field typescript_backend? "classic"|"native" Which TypeScript backend the TSRX language
---   server runs beside. `classic` (default) hosts TypeScript 5 inside the server. `native`
---   leaves TypeScript features for `.tsrx` files to TypeScript 7's language server
---   (`tsc --lsp`, the `tsc` config of nvim-lspconfig) through `@tsrx/content-mapper`, and
---   registers `tsrx` with that server plus `runExternalCode` when the config exists.

--- @param plugin table The lazy.nvim plugin spec (used to locate the Tree-sitter grammar).
--- @param opts? TsrxSetupOptions
function M.setup(plugin, opts)
	vim.filetype.add {
		extension = {
			tsrx = "tsrx",
		},
	}

	require("tsrx.treesitter").setup(plugin)
	require("tsrx.lsp").setup(opts)
end

return M
