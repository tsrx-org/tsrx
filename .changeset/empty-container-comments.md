---
'@tsrx/core': patch
---

Keep the comments inside an empty block, function or class body, interface,
namespace, type literal or array when a comment comes right before it
(`class A /* e */ { // c }`). The parser now attaches the inner comments to their
container instead of letting the preceding comment take them (#741).
