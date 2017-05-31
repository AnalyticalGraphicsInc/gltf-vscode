# Publish Steps

* Update `CHANGELOG.md` with new version number and all changes.
* Update `package.json`, specifically the `version` field.
* Run `vsce publish` to actually publish to the marketplace.
* Add a git tag for the release.  For example: `git tag -a 2.0.1 -m "Release version 2.0.1"`
* Push the branch & tag. `git push --tags`
