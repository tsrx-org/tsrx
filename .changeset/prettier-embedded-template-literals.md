---
'@tsrx/prettier-plugin': patch
---

Code embedded in template literals now formats like Prettier when
`embeddedLanguageFormatting` is `"auto"` (the default).

- CSS in styled-components templates (`styled.button`, `styled(Link)`,
  `styled.a.attrs(…)`, `css`), styled-jsx (``<style jsx>{`…`}</style>``,
  `css.global`, `css.resolve`), a JSX ``css={`…`}`` prop, and Angular component
  `styles` is formatted with Prettier's SCSS printer, with every `${…}` kept in
  place. That includes a `css` template in a TSRX template attribute or `@{ }`
  code block, which now indents like the equivalent TSX.
- GraphQL in `gql`, `graphql`, and `/* GraphQL */` templates, HTML in `html`
  and `/* HTML */` templates and Angular component `template`s, and Markdown in
  `markdown` and `md` templates are formatted with Prettier's parsers for them,
  which `prettier/standalone` users must load to get this formatting.
- Like Prettier, a template whose code doesn't parse, one kept by
  `prettier-ignore`, and every template with `embeddedLanguageFormatting: "off"`
  stay as written, and a lone embedded template argument or arrow body stays on
  the line of the call or arrow.
