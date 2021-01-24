# Publish Steps

* Update `CHANGELOG.md` with new version number, publish date, and all changes.
* Update `package.json`, specifically the `version` field.
* Copy the new `version` number to `server/package.json`.
* Run `npm install`, `npm update` to get the latest versions of dependencies.
* In PowerShell, run `vsce publish` to actually publish to the marketplace.
* Add a git tag for the release.  For example: `git tag -a 2.3.0 -m "Release version 2.3.0"`
* Push the branch & tag. `git push --tags`

**NOTE:** It is best to run `vsce` in PowerShell, not Git Bash, due to TTY differences.

## Credentials

1. Login to [username].visualstudio.com
2. From user account pull-down menu, select "Security" -> Personal Access Tokens
3. Click button to add a new token.
4. Modify the "accounts" drop-down of the proposed new token to change your username to "All accessible accounts."  NOTE that this setting cannot be viewed or edited after a token is created, it is only available during creation.
5. In PowerShell, if you haven't already installed `vsce`, install it with `npm install -g vsce`.
6. Run `vsce login cesium`
7. Paste the key created in step 4.
8. Now you are ready to run the publish steps above.
