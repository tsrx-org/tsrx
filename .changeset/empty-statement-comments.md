---
'@tsrx/core': patch
'@tsrx/prettier-plugin': patch
---

The parser no longer attaches comments to a `;` empty statement in a statement
list, as in Prettier. The statement before or after it takes the comment, and
when a list has only empty statements, its block or file does. Before, the
formatter printed such a comment on a line of its own with a stray leading
space, and the next pass moved it again. `a; ; // note` now formats as
`a; // note`. In a `switch` case the comment was deleted. An empty statement
that is a clause's body, as in `if (ready) ; // note`, keeps its comments.

The formatter also keeps the comments of a file that has nothing else. Before,
it printed an empty file.
