#!/usr/bin/env bash
# Bumps the project version across every location it's duplicated in.
# Usage: ./scripts/bump-version.sh <new-version>   (e.g. 5.0.2, no leading "v")
#
# Only run this when cutting a release (see RELEASING.md) - it is never run
# automatically and never tied to a PR merge.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

NEW_VERSION="${1:-}"
if [[ ! "$NEW_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
	echo "Usage: $0 <new-version>   (e.g. 5.0.2, no leading 'v')" >&2
	exit 1
fi

OLD_VERSION="$(tr -d '[:space:]' < VERSION)"
echo "Bumping version: $OLD_VERSION -> $NEW_VERSION"

# 1. VERSION (canonical)
printf '%s\n' "$NEW_VERSION" > VERSION

# 2. browser-emulator/package.json
if command -v pnpm >/dev/null 2>&1; then
	(cd browser-emulator && pnpm pkg set version="$NEW_VERSION" >/dev/null)
else
	sed -i -E "0,/\"version\": \"[0-9]+\.[0-9]+\.[0-9]+\"/s//\"version\": \"${NEW_VERSION}\"/" browser-emulator/package.json
fi

# 3. browser-emulator/docs/openapi.yaml (info.version only)
TMP="$(mktemp)"
awk -v new="$NEW_VERSION" '
	/^info:/{f=1}
	f && /^  version:/ && !done {print "  version: " new; done=1; next}
	{print}
' browser-emulator/docs/openapi.yaml > "$TMP"
mv "$TMP" browser-emulator/docs/openapi.yaml

# 4. browser-emulator/docs/index.html - regenerate from the updated spec
if command -v pnpm >/dev/null 2>&1 && [[ -d browser-emulator/node_modules ]]; then
	(cd browser-emulator && pnpm run docs)
else
	echo "warning: browser-emulator deps not installed, skipping docs/index.html regeneration." >&2
	echo "         Run 'pnpm run docs' inside browser-emulator/ before committing." >&2
fi

# 5. loadtest-controller/pom.xml - only the project's own <version>, never the
#    <parent><version> (spring-boot-starter-parent BOM pin).
had_trailing_newline() { [[ "$(tail -c1 "$1")" == "" ]]; }

TMP="$(mktemp)"
POM_HAD_TRAILING_NL=false
had_trailing_newline loadtest-controller/pom.xml && POM_HAD_TRAILING_NL=true
awk -v new="$NEW_VERSION" '
	/<parent>/  {inparent=1; print; next}
	/<\/parent>/{inparent=0; print; next}
	inparent { print; next }
	!done && match($0, /<version>[0-9]+\.[0-9]+\.[0-9]+<\/version>/) {
		cr = (substr($0, length($0)) == "\r") ? "\r" : ""
		before = substr($0, 1, RSTART - 1)
		after = substr($0, RSTART + RLENGTH)
		gsub(/\r$/, "", after)
		print before "<version>" new "</version>" after cr
		done=1
		next
	}
	{print}
' loadtest-controller/pom.xml > "$TMP"
$POM_HAD_TRAILING_NL || truncate -s -1 "$TMP"
mv "$TMP" loadtest-controller/pom.xml

# 6. README.md - AWS AMI-creation example
sed -i -E \
	-e "s/(from )v[0-9]+\.[0-9]+\.[0-9]+( git branch or tag)/\1v${NEW_VERSION}\2/" \
	-e "s/(--git-ref )v[0-9]+\.[0-9]+\.[0-9]+/\1v${NEW_VERSION}/" \
	README.md

# 7. aws-setup/setup-aws-workers.sh - default GIT_REF, help text, example
sed -i -E \
	-e "s/^(GIT_REF=\")v[0-9]+\.[0-9]+\.[0-9]+(\")/\1v${NEW_VERSION}\2/" \
	-e "s/\(default: v[0-9]+\.[0-9]+\.[0-9]+\)/(default: v${NEW_VERSION})/" \
	-e "s/(--git-ref )v[0-9]+\.[0-9]+\.[0-9]+/\1v${NEW_VERSION}/g" \
	-e "s/(from )v[0-9]+\.[0-9]+\.[0-9]+( git branch or tag)/\1v${NEW_VERSION}\2/" \
	aws-setup/setup-aws-workers.sh

# 8. aws-setup/ec2-browser-emulator.yml - GitRef parameter Default + Description,
#    scoped to the GitRef: block only.
TMP="$(mktemp)"
CFN_HAD_TRAILING_NL=false
had_trailing_newline aws-setup/ec2-browser-emulator.yml && CFN_HAD_TRAILING_NL=true
awk -v new="$NEW_VERSION" '
	/^    GitRef:/{f=1}
	f && /^    [A-Za-z]+:/ && !/^    GitRef:/{f=0}
	f && /Default: .v[0-9]+\.[0-9]+\.[0-9]+./{
		sub(/v[0-9]+\.[0-9]+\.[0-9]+/, "v" new)
	}
	f && /e\.g\., .v[0-9]+\.[0-9]+\.[0-9]+./{
		sub(/v[0-9]+\.[0-9]+\.[0-9]+/, "v" new)
	}
	{print}
' aws-setup/ec2-browser-emulator.yml > "$TMP"
$CFN_HAD_TRAILING_NL || truncate -s -1 "$TMP"
mv "$TMP" aws-setup/ec2-browser-emulator.yml

echo
./scripts/check-versions.sh

echo
echo "Version bumped to $NEW_VERSION. Review the diff, then commit, e.g.:"
echo "  git diff --stat"
echo "  git add -A && git commit -m \"chore: bump version to $NEW_VERSION\""
