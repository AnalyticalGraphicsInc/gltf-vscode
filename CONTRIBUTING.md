# Contributing to gltf-vscode

Thanks for contributing to gltf-vscode!  By opening a Pull Request with your contribution to this
code repository, you grant to the maintainers and to recipients of this software a perpetual, worldwide,
non-exclusive, no-charge, royalty-free, irrevocable copyright license to reproduce, prepare
derivative works of, publicly display, publicly perform, sublicense, and distribute your
contributions and such derivative works.

## Code of Conduct

To ensure an inclusive community, contributors and users should follow the [code of conduct](./CODE_OF_CONDUCT.md).

## Developer Environment

[VSCode](https://code.visualstudio.com/) itself is used for developing and debugging its own extensions.

Please install the [ESLint extension by Dirk Baeumer](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) into VSCode.

You will also need [NodeJS](https://nodejs.org/en/) installed, for npm package management.

1. Use `git` to clone this repository to a local disk.
2. Open a shell and run `npm install` in the root folder of the cloned repository, to install npm packages.
3. Launch VSCode and click "Open Folder" on the root of the cloned repository.
4. Press <kbd>CTRL</kbd> - <kbd>P</kbd> to open the task bar, and type `task watch` to launch the watch task.

NOTE: It is important to launch the watch task every time you close and re-open VSCode.  The extension has two parts now,
a main part called the "client" and a separate process called the "glTF Language Server."  If you don't
manually start the build watcher, the client might be built without the server, and you will see an error.  When the `watch`
task is running, you will see a tiny icon in the bottom status bar with the number `2` next to a wrench-and-screwdriver
icon.  There are 2 watchers, one for the client and one for the server.  If you only see `1` here, one of the watchers
is not running.

To launch the debugger, press <kbd>F5</kbd>.  This will open a second copy of VSCode, with a built-from-source version of
the extension installed.  If you already have the glTF extension from the marketplace installed, there will be an info message
letting you know that the built version has overwritten it for just the debugger session.

## CHANGELOG.md

Please add bullet point(s) for changes or new features to the top of `CHANGELOG.md`.  The publish date can be left as `UNRELEASED` since
the release is not on any set schedule, and likely will not happen on the same day that the pull request is created.

## Debugging the Webview (glTF preview window) in VSCode

This is tricky, because HTML is previewed inside a sandboxed iframe which is itself inside an embedded webview inside
VSCode's Electron-based user interface.  Here are the steps:

1. Open the glTF preview window.

2. Press <kbd>F1</kbd> to open the command bar at the top of VSCode.

3. Type in and run the following command: `Developer: Open Webview Developer Tools`

4. In the top of the Console tab of DevTools, click the pull-down and change `top` to `active-frame (index.html)`.

Now you can debug the HTML preview in the sandboxed iframe.

