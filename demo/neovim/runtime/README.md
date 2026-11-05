# Svelte syntax runtime

`syntax/svelte.vim`, `syntax/svelte-html.vim`, and `autoload/svelte.vim` are unmodified files from
[leafOfTree/vim-svelte-plugin](https://github.com/leafOfTree/vim-svelte-plugin),
commit `4740f38b3acedb4f549d99ad56f4d7838f935130`.

License: Unlicense (included). Only syntax and its helper are vendored; no
installer, plugin startup scripts, mappings, or user configuration are loaded.
The bridge enables embedded TypeScript using the runtime's configuration option.

Keep the upstream whitespace: Vim joins continuation lines without inserting a separator.
