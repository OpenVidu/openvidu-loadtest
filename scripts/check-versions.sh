#!/usr/bin/env bash
# Verifies that every place the project version is duplicated agrees with the
# canonical VERSION file. Run ./scripts/bump-version.sh to fix any mismatch.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

CANONICAL="$(tr -d '[:space:]' < VERSION)"
if [[ ! "$CANONICAL" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
	echo "VERSION file does not contain a valid X.Y.Z version: '$CANONICAL'" >&2
	exit 1
fi

errors=()

check() {
	local label="$1" expected="$2" actual="$3"
	if [[ "$actual" != "$expected" ]]; then
		errors+=("$label: expected '$expected' but found '${actual:-<not found>}'")
	fi
}

# 1. browser-emulator/package.json — top-level "version" field.
PKG_VERSION="$(grep -m1 -oP '^\t"version": "\K[0-9]+\.[0-9]+\.[0-9]+' browser-emulator/package.json || true)"
check "browser-emulator/package.json" "$CANONICAL" "$PKG_VERSION"

# 2. browser-emulator/docs/openapi.yaml — info.version, scoped to the info: block
#    so an unrelated schema property named "version" elsewhere can't match.
OPENAPI_VERSION="$(awk '/^info:/{f=1} f && /^  version:/{print $2; exit}' browser-emulator/docs/openapi.yaml)"
check "browser-emulator/docs/openapi.yaml (info.version)" "$CANONICAL" "$OPENAPI_VERSION"

# 3. browser-emulator/docs/index.html — generated from openapi.yaml. Only checked
#    when browser-emulator's deps are installed (CI always has them; local runs
#    without node_modules skip this rather than failing on a missing toolchain).
if [[ -d browser-emulator/node_modules ]] && command -v pnpm >/dev/null 2>&1; then
	TMP_HTML="$(mktemp)"
	(cd browser-emulator && pnpm exec redocly build-docs docs/openapi.yaml -o "$TMP_HTML" >/dev/null 2>&1) || true
	if [[ -s "$TMP_HTML" ]] && ! diff -q "$TMP_HTML" browser-emulator/docs/index.html >/dev/null 2>&1; then
		errors+=("browser-emulator/docs/index.html is stale — run 'pnpm run docs' in browser-emulator/ and commit the result")
	fi
	rm -f "$TMP_HTML"
else
	echo "note: skipping docs/index.html staleness check (browser-emulator deps not installed)" >&2
fi

# 4. loadtest-controller/pom.xml — the project's own <version>, NOT the
#    <parent><version> (spring-boot-starter-parent BOM, unrelated third-party pin).
#    Skip everything between <parent> and </parent> before reading the first <version>.
POM_VERSION="$(awk '
	/<parent>/  {inparent=1}
	/<\/parent>/{inparent=0; next}
	inparent { next }
	match($0, /<version>[0-9]+\.[0-9]+\.[0-9]+<\/version>/) {
		s = substr($0, RSTART, RLENGTH)
		gsub(/<\/?version>/, "", s)
		gsub(/\r/, "", s)
		print s
		exit
	}
' loadtest-controller/pom.xml)"
check "loadtest-controller/pom.xml (project version)" "$CANONICAL" "$POM_VERSION"

# 5. README.md — the AWS AMI-creation example, anchored to "--git-ref v" so
#    unrelated version-shaped strings elsewhere in the README can't match.
README_REF="$(grep -m1 -oP -- '--git-ref \Kv[0-9]+\.[0-9]+\.[0-9]+' README.md || true)"
check "README.md (--git-ref example)" "v$CANONICAL" "$README_REF"

# 6. aws-setup/setup-aws-workers.sh — default GIT_REF, its --help text, and its
#    example invocation, each anchored to its own specific surrounding text.
GIT_REF_DEFAULT="$(grep -m1 -oP '^GIT_REF="\Kv[0-9]+\.[0-9]+\.[0-9]+' aws-setup/setup-aws-workers.sh || true)"
check "aws-setup/setup-aws-workers.sh (GIT_REF default)" "v$CANONICAL" "$GIT_REF_DEFAULT"

HELP_DEFAULT="$(grep -m1 -oP '\(default: \Kv[0-9]+\.[0-9]+\.[0-9]+(?=\))' aws-setup/setup-aws-workers.sh || true)"
check "aws-setup/setup-aws-workers.sh (--help default text)" "v$CANONICAL" "$HELP_DEFAULT"

EXAMPLE_REF="$(grep -m1 -oP -- '--git-ref \Kv[0-9]+\.[0-9]+\.[0-9]+' aws-setup/setup-aws-workers.sh || true)"
check "aws-setup/setup-aws-workers.sh (example invocation)" "v$CANONICAL" "$EXAMPLE_REF"

# 7. aws-setup/ec2-browser-emulator.yml — the GitRef parameter's Default and
#    Description, scoped to the GitRef: block only (between "GitRef:" and the
#    next top-level parameter key) so other parameters' Default/Description
#    fields can't accidentally match.
CFN_BLOCK="$(awk '/^    GitRef:/{f=1; print; next} f && /^    [A-Za-z]+:/{exit} f{print}' aws-setup/ec2-browser-emulator.yml)"
CFN_DEFAULT="$(grep -m1 -oP "Default: '\Kv[0-9]+\.[0-9]+\.[0-9]+" <<<"$CFN_BLOCK" || true)"
check "aws-setup/ec2-browser-emulator.yml (GitRef Default)" "v$CANONICAL" "$CFN_DEFAULT"

CFN_DESC="$(grep -m1 -oP "e\.g\., '\Kv[0-9]+\.[0-9]+\.[0-9]+" <<<"$CFN_BLOCK" || true)"
check "aws-setup/ec2-browser-emulator.yml (GitRef Description example)" "v$CANONICAL" "$CFN_DESC"

if [[ ${#errors[@]} -gt 0 ]]; then
	echo "Version mismatch detected. Canonical version (VERSION file): $CANONICAL"
	echo
	printf '  - %s\n' "${errors[@]}"
	echo
	echo "Run './scripts/bump-version.sh $CANONICAL' to sync all locations to the canonical"
	echo "version, or edit VERSION first if $CANONICAL is not actually what you intend."
	exit 1
fi

echo "All version references match VERSION ($CANONICAL). OK."
