# Publish Steps

* Update `CHANGELOG.md` with new version number and all changes.
* Update `package.json`, specifically the `version` field.
* Run `vsce publish` to actually publish to the marketplace.
* Add a git tag for the release.  For example: `git tag -a 1.0.3 -m "Release version 1.0.3"`
* Push the branch & tag. `git push --tags`
