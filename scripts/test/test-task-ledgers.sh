#!/usr/bin/env sh
# Invariant test for the two task ledgers (starter T-015): the project's tasks/
# and, when present, the upstream starter's own history in .starter/.
#
# Safe in adopter repos: a repo created from the template that deleted .starter/
# gets only check 1 (the seeds are still there); every other check runs only
# when .starter/ exists. Stack-neutral (POSIX sh + awk + find, no git), so it
# also runs on an exported tree. Deterministic (LC_ALL=C, sorted find output).
#
# Checks on a tree:
#   1. tasks/ holds the seeds (T-001, T-001.1..17, T-002), _TEMPLATE.md, README.md
#      and INDEX.md. Superset: the project's own tasks are fine.
#   2. .starter/ holds only *.md; .starter/tasks/INDEX.md lists exactly that
#      folder's task files; each file's frontmatter id equals its filename.
#   3. Every repo path to a task, ADR or review file mentioned in .starter/
#      resolves (a #fragment must name a heading). In the shipped docs, only paths
#      into .starter/ and stale pre-move paths (the file now lives under .starter/)
#      are checked: the project's own paths, e.g. a task not yet created, are not
#      this test's business. Fenced code blocks are skipped.
#   4. No gate file (.githooks/* but *.md, scripts/*.sh, CI files, .placeholder-allow) mentions
#      .starter/ — it is history, never configuration — and no .placeholder-allow
#      glob matches a path under .starter/.
#   5. Shipped files cite starter task IDs as "starter T-0NN" (IDs that also exist
#      in tasks/ are the project's own and are skipped).
#   6. No adopter-facing file links into .starter/ (deleting it leaves no dead link).
#   7. Check 1 still passes on a copy of the tree without .starter/.
#   8. The plan-approval gate (starter T-026) is still written down: every anchor
#      sentence in the table below is present (ignoring backticks, asterisks and
#      runs of spaces), plus a few structural checks. Runs only when .starter/
#      exists, so a fork that rewords its docs keeps a green CI.
# Each check also runs against a fixture tree broken in exactly that way.
#
# Run:  sh scripts/test/test-task-ledgers.sh
#       LEDGER_ROOT=<dir> sh scripts/test/test-task-ledgers.sh   (check another tree)
#       REQUIRE_STARTER=1 sh scripts/test/test-task-ledgers.sh   (a missing .starter/
#         fails instead of skipping; for local/red runs only, never in CI)
# Exit: 0 all pass, 1 any failure.

set -u
LC_ALL=C; export LC_ALL

test_dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
playbook_src=$(CDPATH='' cd -- "$test_dir/../.." && pwd)
root="${LEDGER_ROOT:-$playbook_src}"

tmp=$(mktemp -d 2>/dev/null || mktemp -d -t tl)
trap 'rm -rf "$tmp"' EXIT

pass=0
fail=0
ok()  { pass=$((pass + 1)); printf "  PASS: %s\n" "$1"; }
bad() { fail=$((fail + 1)); printf "  FAIL: %s\n" "$1" >&2; }

seeds="T-001 T-001.1 T-001.2 T-001.3 T-001.4 T-001.5 T-001.6 T-001.7 T-001.8 T-001.9
T-001.10 T-001.11 T-001.12 T-001.13 T-001.14 T-001.15 T-001.16 T-001.17 T-002"

# existing <root> <path...>: print each path (relative to root) that exists as a file.
existing() {
  r=$1; shift
  for p in "$@"; do [ -f "$r/$p" ] && printf '%s\n' "$p"; done
  return 0
}

# Files checks 3, 5 and 6 read. Globs expand against the tree being checked.
path_files() {  # where a dangling path would mislead a reader
  ( cd "$1" && existing . AGENTS.md README.md ADOPTING.md CLAUDE.md tasks/README.md \
      azure-pipelines.yml .github/CODEOWNERS .github/workflows-disabled/*.yml \
      .github/workflows/*.yml docs/*.md .claude/agents/*.md
    [ -d .starter ] && find .starter -type f -name '*.md' | sed 's#^\./##' | sort )
}
id_files() {  # shipped code and docs that may cite a starter task
  ( cd "$1" && existing . AGENTS.md README.md ADOPTING.md CLAUDE.md tasks/README.md \
      tasks/_TEMPLATE.md azure-pipelines.yml .github/CODEOWNERS .github/pull_request_template.md \
      .github/workflows-disabled/*.yml .github/workflows/*.yml .githooks/* scripts/*.sh scripts/test/*.sh \
      docs/*.md .claude/agents/*.md tasks/T-001*.md tasks/T-002.md )   # seeds ship to adopters
}
gate_files() {
  ( cd "$1" && for h in .githooks/*; do case "$h" in *.md) ;; *) existing . "$h" ;; esac; done
    existing . scripts/*.sh azure-pipelines.yml .github/workflows-disabled/*.yml \
      .github/workflows/*.yml .placeholder-allow )
}
adopter_files() {
  ( cd "$1" && existing . AGENTS.md README.md ADOPTING.md CLAUDE.md docs/*.md .claude/agents/*.md
    [ -d tasks ] && find tasks -type f -name '*.md' | sort
    [ -d docs ] && find docs -mindepth 2 -type f -name '*.md' | sort )
}

# repo_paths <file>: each repo path to a task/ADR/review file the file mentions,
# as written (with any #fragment), prefixed "L " when it is a markdown link target
# (resolved from the file's folder, as GitHub does) and "P " otherwise (a repo-root
# path in prose, a code span or frontmatter). Placeholders (T-NNN, <branch>, globs)
# and lines inside ``` or ~~~ fences (examples) don't match.
repo_paths() {
  awk '/^[ \t]*(```|~~~)/ { fence = !fence; next }
  fence { next }
  {
    line = $0
    while (match(line, /(\.\.\/)*(\.\/)?\/?(\.starter\/)?(tasks\/T-[0-9][0-9.]*\.md|docs\/decisions\/[0-9][0-9][0-9][0-9]-[A-Za-z0-9._-]+\.md|docs\/reviews\/[a-z0-9][a-z0-9-]*\/[A-Za-z0-9._-]+\.md)(#[A-Za-z0-9_-]+)?/)) {
      tok = substr(line, RSTART, RLENGTH)
      prev = (RSTART > 1) ? substr(line, RSTART - 1, 1) : ""
      prev2 = (RSTART > 2) ? substr(line, RSTART - 2, 2) : ""
      line = substr(line, RSTART + RLENGTH)
      if (prev ~ /[A-Za-z0-9_.\/-]/) continue   # tail of some longer path
      print ((prev2 == "](") ? "L " : "P ") tok
    }
  }' "$1"
}

# heading_slugs <file>: GitHub-style anchors (lowercase, punctuation dropped,
# spaces to '-', repeats get -1, -2 ...); lines inside ``` or ~~~ fences are not
# headings. Known gap: under LC_ALL=C non-ASCII
# letters are dropped, where GitHub keeps them, so an anchor to an accented
# heading can be reported missing. None exist today; fix if one ever does.
heading_slugs() {
  awk '/^[ \t]*(```|~~~)/ { fence = !fence; next }
  !fence && /^#+[ \t]/ {
    h = $0; sub(/^#+[ \t]+/, "", h); h = tolower(h)
    gsub(/[^a-z0-9 _-]/, "", h); gsub(/ /, "-", h)
    n = seen[h]++; print (n ? h "-" n : h)
  }' "$1"
}

# unqualified_ids <file> <ids>: each citation of one of <ids> not written "starter T-0NN"
# ("Starter T-0NN" at a sentence start counts).
unqualified_ids() {
  awk -v ids="$2" 'BEGIN { n = split(ids, I, " ") }
  { for (i = 1; i <= n; i++) {
      id = I[i]; rest = $0; seen_so_far = ""
      while ((p = index(rest, id)) > 0) {
        before = seen_so_far substr(rest, 1, p - 1)
        after = substr(rest, p + length(id))
        b = substr(before, length(before), 1); a1 = substr(after, 1, 1); a2 = substr(after, 2, 1)
        bounded = (b !~ /[A-Za-z0-9]/) && (a1 !~ /[0-9]/) && !(a1 == "." && a2 ~ /[0-9]/)
        if (bounded && tolower(substr(before, length(before) - 7)) != "starter ") print FILENAME ":" NR ": " id
        seen_so_far = before id; rest = after
      }
  } }' "$1"
}

# check_tree <root>: run checks 1-6 on one tree, printing one line per finding:
# "FAIL <n>: ..." or "SKIP <n>: ...". Prints nothing else.
check_tree() {
  t=$1
  # 1) seeds
  for s in $seeds _TEMPLATE README INDEX; do
    [ -f "$t/tasks/$s.md" ] || echo "FAIL 1: tasks/$s.md is missing — complete or cancel a seed task, don't delete it"
  done
  if [ ! -d "$t/.starter" ]; then
    if [ "${REQUIRE_STARTER:-0}" = 1 ]; then echo "FAIL 2: .starter/ is missing (REQUIRE_STARTER=1)"
    else echo "SKIP 2-6: no .starter/ (a template repo that deleted it)"; fi
    return 0
  fi
  # 2) .starter/ shape, INDEX exactness, id == filename
  # A path never goes into a sed or grep pattern (starter T-014: a filename is data).
  ( cd "$t" && find .starter -type f ! -name '*.md' ) | while IFS= read -r f; do printf 'FAIL 2: not markdown: %s\n' "$f"; done
  files=$(find "$t/.starter/tasks" -maxdepth 1 -type f -name 'T-*.md' 2>/dev/null | sed 's#.*/##; s/\.md$//' | sort)
  rows=$(sed -n 's/^| \[\(T-[0-9.]*\)\](\.\/\(T-[0-9.]*\)\.md).*/\1 \2/p' "$t/.starter/tasks/INDEX.md" 2>/dev/null)
  printf '%s\n' "$rows" | awk 'NF && $1 != $2 { print "FAIL 2: INDEX row " $1 " links ./" $2 ".md" }'
  ids=$(printf '%s\n' "$rows" | awk 'NF { print $1 }' | sort)
  for f in $files; do printf '%s\n' "$ids" | grep -qxF -- "$f" || echo "FAIL 2: .starter/tasks/$f.md is not in .starter/tasks/INDEX.md"; done
  for i in $ids; do printf '%s\n' "$files" | grep -qxF -- "$i" || echo "FAIL 2: .starter/tasks/INDEX.md lists $i, which has no file"; done
  for f in $files; do
    fid=$(sed -n 's/^id:[[:space:]]*//p' "$t/.starter/tasks/$f.md" | head -n 1)
    [ "$fid" = "$f" ] || echo "FAIL 2: .starter/tasks/$f.md has frontmatter id '$fid'"
  done
  # 3) every mentioned path resolves, and its #fragment names a heading
  path_files "$t" | while IFS= read -r src; do
    repo_paths "$t/$src" | while IFS= read -r kind_tok; do
      kind=${kind_tok%% *}; tok=${kind_tok#* }
      p=${tok%%#*}; frag=''; case "$tok" in *#*) frag=${tok#*#} ;; esac
      case "$kind:$p" in
        *:/*)  dst="$t$p" ;;                          # repo-absolute
        L:*)   dst="$(dirname "$t/$src")/$p" ;;       # link: from the file's folder
        *:../*) dst="$(dirname "$t/$src")/$p" ;;
        *:./*) dst="$t/${p#./}" ;;
        *)     dst="$t/$p" ;;
      esac
      bare=$p
      while :; do case "$bare" in ../*) bare=${bare#../} ;; ./*) bare=${bare#./} ;; /*) bare=${bare#/} ;; *) break ;; esac; done
      ours=0   # a starter record, or a path into one: this test's business
      case "$src" in .starter/*) ours=1 ;; esac
      case "$bare" in .starter/*) ours=1 ;; esac
      if [ ! -f "$dst" ]; then
        if [ -f "$t/.starter/$bare" ]; then
          hint=''; [ "$ours" = 1 ] || hint=" (update the path, or create $bare if it is your own)"
          echo "FAIL 3: $src mentions $tok, which moved to .starter/$bare$hint"
        elif [ "$ours" = 1 ]; then echo "FAIL 3: $src mentions $tok, which doesn't exist"
        fi   # else the project's own path (perhaps a task not yet created)
      elif [ "$ours" = 1 ] && [ -n "$frag" ] && ! heading_slugs "$dst" | grep -qxF -- "$frag"; then
        echo "FAIL 3: $src mentions $tok, but no heading has that anchor"
      fi
    done
  done
  # 4) no gate file mentions .starter/
  gate_files "$t" | while IFS= read -r g; do
    grep -q '\.starter' "$t/$g" && echo "FAIL 4: gate file $g mentions .starter/ (history is never configuration)"
  done
  if [ -f "$t/.placeholder-allow" ]; then   # a glob can match .starter/ without naming it
    samples=$( (cd "$t" && find .starter -type f)
      printf '%s\n' .starter/README.md .starter/tasks/T-999.md .starter/docs/decisions/0999-x.md .starter/docs/reviews/x/final.md )
    while IFS= read -r pat; do
      case "$pat" in ''|\#*) continue ;; esac
      printf '%s\n' "$samples" | while IFS= read -r sp; do
        # shellcheck disable=SC2254  # glob match intended, as in ci-checks.sh
        case "$sp" in $pat) printf "FAIL 4: .placeholder-allow entry '%s' matches %s (never allowlist .starter/)\n" "$pat" "$sp"; break ;; esac
      done
    done < "$t/.placeholder-allow"
  fi
  # 5) starter IDs cited as "starter T-0NN"
  sids=''
  for f in $files; do [ -f "$t/tasks/$f.md" ] || sids="$sids $f"; done
  if [ -n "$sids" ]; then
    id_files "$t" | while IFS= read -r src; do
      ( cd "$t" && unqualified_ids "$src" "$sids" ) | sed 's/^/FAIL 5: unqualified starter task ID (write "starter T-0NN", or create tasks\/T-0NN.md if it is your own task): /'
    done
  fi
  # 6) no link into .starter/ from adopter-facing files
  adopter_files "$t" | while IFS= read -r a; do
    grep -nE '\]\((\./|\.\./)*\.starter|^\[[^]]+\]:[[:space:]]*<?(\./|\.\./)*\.starter|href=["'"'"']?(\./|\.\./)*\.starter' "$t/$a" \
      | while IFS= read -r hit; do printf 'FAIL 6: %s links into .starter/ (use a code span): %s\n' "$a" "$hit"; done
  done
  return 0
}

# report <description> <check output>: PASS if no FAIL lines; show SKIPs.
report() {
  printf '%s\n' "$2" | grep '^SKIP' | sed 's/^/  /'
  if printf '%s\n' "$2" | grep -q '^FAIL'; then
    bad "$1"; printf '%s\n' "$2" | grep '^FAIL' | sed 's/^/    /' >&2
  else ok "$1"; fi
}
# expect_fail <description> <needle> <check output>: the broken fixture is caught.
expect_fail() {
  if printf '%s\n' "$3" | grep -q "^FAIL.*$2"; then ok "$1"
  else bad "$1 (wanted FAIL matching '$2'; got: $3)"; fi
}

echo "test-task-ledgers.sh"

# --- The real tree ------------------------------------------------------------
report "ledgers are consistent ($root)" "$(check_tree "$root")"

# 7) Deleting .starter/ (a template adopter) leaves a tree that still passes.
# Without .starter/ only check 1 runs, and it reads only tasks/, so copy just that.
mkdir -p "$tmp/nostarter"
[ -d "$root/tasks" ] && cp -R "$root/tasks" "$tmp/nostarter/tasks"
out=$(REQUIRE_STARTER=0 check_tree "$tmp/nostarter")
report "tree with .starter/ deleted still passes" "$out"
rm -rf "$tmp/nostarter"

# --- Fixtures: a good tree, then one broken copy per check ---------------------
# shellcheck disable=SC2016  # backticks below are markdown code spans in fixture text
# good_tree <dir>: minimal valid tree. Its starter task is T-903 (a fixture ID that
# can't collide with a real one).
good_tree() {
  d=$1; mkdir -p "$d/tasks" "$d/.starter/tasks" "$d/.starter/docs/decisions" "$d/.githooks" "$d/scripts" "$d/docs"
  for s in $seeds _TEMPLATE README INDEX; do printf -- '---\nid: %s\n---\n' "$s" > "$d/tasks/$s.md"; done
  printf -- '---\nid: T-903\n---\n# T-903\n## Review artifact\n## Notes\n## Notes\n## Review — artifact\n' > "$d/.starter/tasks/T-903.md"
  printf '# Index\n| [T-903](./T-903.md) | x |\n' > "$d/.starter/tasks/INDEX.md"
  printf '# ADR\n' > "$d/.starter/docs/decisions/0009-x.md"
  printf '# Starter\nSee `.starter/tasks/T-903.md#review-artifact`, `.starter/tasks/T-903.md#notes-1`,\n`.starter/tasks/T-903.md#review--artifact`, `.starter/docs/decisions/0009-x.md`.\n' > "$d/.starter/README.md"
  printf '# Agents\nIgnore `.starter/` (starter T-903; also starter T-903/starter T-903). Not ours: T-9030, T-903.1.\nTemplate: `tasks/T-NNN.md`, `docs/reviews/<branch>/final.md`.\n' > "$d/AGENTS.md"
  printf '#!/bin/sh\n# gate (starter T-903)\nexit 0\n' > "$d/.githooks/pre-commit"
  printf '#!/bin/sh\n# ci (starter T-903)\n' > "$d/scripts/ci-checks.sh"
  printf '# Docs\n' > "$d/docs/README.md"
  printf '# globs\nAGENTS.md\ntasks/T-001*.md\n.claude/agents/*.md\n' > "$d/.placeholder-allow"
}
fx() { rm -rf "$tmp/fx"; good_tree "$tmp/fx"; }

fx; report "fixture: a good tree passes" "$(check_tree "$tmp/fx")"
fx; rm "$tmp/fx/tasks/T-001.5.md";                 expect_fail "check 1: a deleted seed is caught" "complete or cancel" "$(check_tree "$tmp/fx")"
fx; printf 'x\n' > "$tmp/fx/.starter/tool.sh";    expect_fail "check 2: non-markdown in .starter/ is caught" "not markdown" "$(check_tree "$tmp/fx")"
fx; printf -- '---\nid: T-904\n---\n' > "$tmp/fx/.starter/tasks/T-904.md"
                                                   expect_fail "check 2: a task missing from INDEX is caught" "not in .starter/tasks/INDEX.md" "$(check_tree "$tmp/fx")"
fx; printf '| [T-905](./T-905.md) | x |\n' >> "$tmp/fx/.starter/tasks/INDEX.md"
                                                   expect_fail "check 2: an INDEX row with no file is caught" "has no file" "$(check_tree "$tmp/fx")"
fx; printf '# Index\n| [T-903](./T-904.md) | x |\n' > "$tmp/fx/.starter/tasks/INDEX.md"
                                                   expect_fail "check 2: an INDEX row linking the wrong file is caught" "links ./T-904.md" "$(check_tree "$tmp/fx")"
fx; printf -- '---\nid: T-930\n---\n' > "$tmp/fx/.starter/tasks/T-903.md"
                                                   expect_fail "check 2: frontmatter id != filename is caught" "frontmatter id" "$(check_tree "$tmp/fx")"
fx
# shellcheck disable=SC2016  # markdown code span
printf 'See `docs/decisions/0009-x.md`.\n' >> "$tmp/fx/.starter/README.md"
                                                   expect_fail "check 3: a stale pre-move path is caught" "moved to .starter/docs/decisions/0009-x.md" "$(check_tree "$tmp/fx")"
fx
# shellcheck disable=SC2016  # markdown code span
printf 'Our ADR: `docs/decisions/0009-x.md`.\n' >> "$tmp/fx/AGENTS.md"
                                                   expect_fail "check 3: ...also in a shipped doc" "AGENTS.md mentions docs/decisions/0009-x.md, which moved" "$(check_tree "$tmp/fx")"
fx
# shellcheck disable=SC2016  # markdown code spans
printf 'Next: `tasks/T-042.md`, [plan](docs/decisions/0042-plan.md#why).\n' > "$tmp/fx/docs/plan.md"
report "check 3: the project's own not-yet-created paths are not flagged" "$(check_tree "$tmp/fx")"
fx
# shellcheck disable=SC2016  # markdown code span
printf 'Our own next task: `tasks/T-903.md`.\n' > "$tmp/fx/docs/plan.md"
                                                   expect_fail "check 3: a moved-path hit in a shipped doc says how to claim the path" "or create tasks/T-903.md if it is your own" "$(check_tree "$tmp/fx")"
fx
# shellcheck disable=SC2016  # markdown code fence
printf '# X\n```\n.starter/tasks/T-999.md\n```\n' >> "$tmp/fx/.starter/README.md"
report "check 3: a path inside a code fence is an example, not a reference" "$(check_tree "$tmp/fx")"
# Path forms, from .starter/docs/decisions/0009-x.md (two folders down).
form() {  # form <description> <pass|fail> <text> [<needle>]
  fx; printf '%s\n' "$3" >> "$tmp/fx/.starter/docs/decisions/0009-x.md"
  if [ "$2" = pass ]; then report "check 3: $1" "$(check_tree "$tmp/fx")"
  else expect_fail "check 3: $1" "${4:-0009-x.md mentions}" "$(check_tree "$tmp/fx")"; fi
}
# shellcheck disable=SC2016  # markdown code spans
{
form "a ../ path resolves from the file's folder"       pass '`../../tasks/T-903.md`'
form "a ../ path that misses is caught"                 fail '`../tasks/T-903.md`' "moved to .starter/tasks/T-903.md"
form "a ./ path resolves from the repo root"            pass '`./.starter/tasks/T-903.md`'
form "a ./ path that misses is caught"                  fail '`./.starter/tasks/T-999.md`'
form "a path that never existed is caught"              fail '`tasks/T-001.99.md`' "tasks/T-001.99.md, which doesn't exist"
form "a /-rooted link resolves from the repo root"      pass '[t](/.starter/tasks/T-903.md)'
form "a /-rooted link that misses is caught"            fail '[t](/.starter/tasks/T-999.md)'
form "a ~~~ fence hides its paths too"                  pass "$(printf '~~~\n`.starter/tasks/T-999.md`\n~~~')"
}
fx; printf 'See .starter/tasks/T-903.md#nope.\n' >> "$tmp/fx/AGENTS.md"
                                                   expect_fail "check 3: a fragment with no heading is caught" "no heading" "$(check_tree "$tmp/fx")"
fx; printf 'See [it](.starter/tasks/T-903.md).\n' >> "$tmp/fx/.starter/README.md"
                                                   expect_fail "check 3: a link resolves from its own folder, as on GitHub" "doesn't exist" "$(check_tree "$tmp/fx")"
fx; printf 'See [it](tasks/T-903.md) and [adr](docs/decisions/0009-x.md).\n' >> "$tmp/fx/.starter/README.md"
report "check 3: a correct folder-relative link passes" "$(check_tree "$tmp/fx")"
fx
# shellcheck disable=SC2016  # markdown code fence
printf '# Y\n~~~\n# Q\n~~~\n```sh\n## Notes\n```\n## Notes\n' > "$tmp/fx/.starter/docs/decisions/0010-y.md"
printf 'See .starter/docs/decisions/0010-y.md#notes.\n' >> "$tmp/fx/AGENTS.md"
report "check 3: a # line inside a code fence is not a heading" "$(check_tree "$tmp/fx")"
printf 'See .starter/docs/decisions/0010-y.md#notes-1.\n' >> "$tmp/fx/AGENTS.md"
                                                   expect_fail "check 3: ...so it doesn't shift the -1 counter" "no heading" "$(check_tree "$tmp/fx")"
# A '#' in the root path (LEDGER_ROOT) or a filename is data. Run from $tmp: under
# GNU sed the old code ran "touch pwned" for this root.
rt="$tmp/r#;e touch pwned;#"; good_tree "$rt"; printf 'x\n' > "$rt/.starter/tool.sh"
                                                   expect_fail "check 2: a '#' in the root path is reported, never parsed as sed" "not markdown: .starter/tool.sh" "$(cd "$tmp" && check_tree "$rt")"
rm -rf "$rt"
fx; printf 'Read [this](.starter/README.md).\n' > "$tmp/fx/tasks/x#y.md"
                                                   expect_fail "check 6: a '#' in an adopter filename is reported, never parsed as sed" "tasks/x#y.md links into" "$(check_tree "$tmp/fx")"
if [ -e "$tmp/pwned" ]; then bad "a filename was executed as a sed command"; else ok "no filename was executed as a sed command"; fi
fx; printf '# reads .starter/tasks\n' >> "$tmp/fx/.githooks/pre-commit"
                                                   expect_fail "check 4: a gate file mentioning .starter/ is caught" "gate file" "$(check_tree "$tmp/fx")"
fx; printf '#!/bin/sh\n# reads .starter/tasks\n' > "$tmp/fx/.githooks/post-merge"
                                                   expect_fail "check 4: a hook added later is covered too" "gate file .githooks/post-merge" "$(check_tree "$tmp/fx")"
fx; printf 'The .starter/ folder is history.\n' > "$tmp/fx/.githooks/README.md"
report "check 4: the hooks README may mention .starter/" "$(check_tree "$tmp/fx")"
fx; printf '# reads .starter/\n' > "$tmp/fx/scripts/x.sh"
                                                   expect_fail "check 4: any scripts/*.sh is a gate file" "gate file scripts/x.sh" "$(check_tree "$tmp/fx")"
fx; printf 'steps: # .starter/\n' > "$tmp/fx/azure-pipelines.yml"
                                                   expect_fail "check 4: the CI file is a gate file" "gate file azure-pipelines.yml" "$(check_tree "$tmp/fx")"
fx; printf '.starter/README.md\n' >> "$tmp/fx/.placeholder-allow"
                                                   expect_fail "check 4: .placeholder-allow naming .starter/ is caught" "gate file .placeholder-allow" "$(check_tree "$tmp/fx")"
fx; printf '*/tasks/*.md\n' >> "$tmp/fx/.placeholder-allow"
                                                   expect_fail "check 4: an allowlist glob matching .starter/ without naming it is caught" "entry '\*/tasks/\*.md' matches .starter/tasks/" "$(check_tree "$tmp/fx")"
fx; printf '.*/docs/reviews/*/*.md\n' >> "$tmp/fx/.placeholder-allow"
                                                   expect_fail "check 4: a glob matching only a folder that is empty today is caught" "matches .starter/docs/reviews/x/final.md" "$(check_tree "$tmp/fx")"
fx; printf '*.md\n' >> "$tmp/fx/.placeholder-allow"
                                                   expect_fail "check 4: ...including a bare *.md" "entry '\*.md' matches" "$(check_tree "$tmp/fx")"
fx; printf '# see T-903\n' >> "$tmp/fx/scripts/ci-checks.sh"
                                                   expect_fail "check 5: an unqualified starter ID is caught" "unqualified" "$(check_tree "$tmp/fx")"
fx; printf 'Then T-903.\n' >> "$tmp/fx/tasks/T-002.md"
                                                   expect_fail "check 5: the seeds ship, so they are checked" "tasks/T-002.md:4: T-903" "$(check_tree "$tmp/fx")"
fx; mkdir -p "$tmp/fx/scripts/test"; printf '# T-903\n' > "$tmp/fx/scripts/test/x.sh"
                                                   expect_fail "check 5: test scripts ship, so they are checked" "scripts/test/x.sh:1: T-903" "$(check_tree "$tmp/fx")"
fx; printf 'Our plan cites T-903.\n' > "$tmp/fx/docs/plan.md"
                                                   expect_fail "check 5: the message tells an adopter how to claim the ID" "or create tasks/T-0NN.md if it is your own task" "$(check_tree "$tmp/fx")"
fx; printf 'XT-903 and a-T-903 are not citations? Only the first: XT-903.\n' > "$tmp/fx/docs/plan.md"
                                                   expect_fail "check 5: a non-letter before the ID still counts as a citation" "docs/plan.md:1: T-903" "$(check_tree "$tmp/fx")"
fx; printf 'XT-903 is a different token.\n' > "$tmp/fx/docs/plan.md"
report "check 5: a letter right before the ID makes it a different token" "$(check_tree "$tmp/fx")"
fx; printf 'Starter T-903 opens this sentence.\n' >> "$tmp/fx/AGENTS.md"
report "check 5: a sentence-initial \"Starter T-0NN\" is qualified" "$(check_tree "$tmp/fx")"
fx; printf '(starter T-903/T-903)\n' >> "$tmp/fx/AGENTS.md"
                                                   expect_fail "check 5: each ID in a list needs its own qualifier" "unqualified" "$(check_tree "$tmp/fx")"
fx; printf -- '---\nid: T-903\n---\n' > "$tmp/fx/tasks/T-903.md"; printf '# see T-903\n' >> "$tmp/fx/scripts/ci-checks.sh"
report "check 5: an ID the project also uses (synced fork) is not flagged" "$(check_tree "$tmp/fx")"
fx; printf 'Read [this](.starter/README.md).\n' >> "$tmp/fx/AGENTS.md"
                                                   expect_fail "check 6: an inline link into .starter/ is caught" "links into" "$(check_tree "$tmp/fx")"
fx; printf '[s]: ./.starter/README.md\n' >> "$tmp/fx/docs/README.md"
                                                   expect_fail "check 6: a reference-style link into .starter/ is caught" "links into" "$(check_tree "$tmp/fx")"
fx; mkdir -p "$tmp/fx/docs/sub"; printf 'See [s](../../.starter/README.md).\n' > "$tmp/fx/docs/sub/x.md"
                                                   expect_fail "check 6: a nested docs/ file is adopter-facing too" "docs/sub/x.md links into" "$(check_tree "$tmp/fx")"
fx; printf '<a href="../.starter/README.md">s</a>\n' >> "$tmp/fx/tasks/README.md"
                                                   expect_fail "check 6: an href into .starter/ is caught" "links into" "$(check_tree "$tmp/fx")"
fx; rm -rf "$tmp/fx/.starter"
out=$(REQUIRE_STARTER=0 check_tree "$tmp/fx")
if printf '%s\n' "$out" | grep -q '^SKIP' && ! printf '%s\n' "$out" | grep -q '^FAIL'; then ok "no .starter/: checks 2-6 skip, visibly"
else bad "no .starter/: checks 2-6 skip, visibly (got: $out)"; fi
expect_fail "REQUIRE_STARTER=1 turns a missing .starter/ into a failure" ".starter/ is missing" "$(REQUIRE_STARTER=1 check_tree "$tmp/fx")"

# --- 8) The plan-approval gate is written down (starter T-026) -------------------
# file|anchor. "file@section" scopes the anchor to that "## section" (fence-aware).
# Anchors are written without backticks or asterisks: both sides are normalized.
anchors() {
  cat <<'EOF'
AGENTS.md|4b. Human gate — the owner/DRI approves the reviewed plan; record who and when in the task's activity log.
AGENTS.md|The approver is the DRI for the area
AGENTS.md|An agent never approves a plan
AGENTS.md|Silence or a timeout is never a yes
AGENTS.md|plan approved by <name>: "<their exact words>"
AGENTS.md|tasks/README.md#plan-approval
AGENTS.md|No code without a reviewed plan that the owner/DRI has approved (§ 7 step 4b).
AGENTS.md|The record is written by the agent; the PR's human approver checks the quote or link.
AGENTS.md|then the owner/DRI approves the plan before any code
tasks/README.md|Approval counts only from
tasks/README.md|("yes, but change X") is not approval
tasks/README.md|Never ask for approval in the middle of the review
tasks/README.md|approve this plan?
tasks/README.md@Plan approval|A material change
tasks/README.md|already in-progress
tasks/README.md|approved by the owner/DRI; build happening
tasks/README.md|including waiting for the owner/DRI's approval
tasks/README.md|The approver is the DRI for the area
tasks/README.md|An agent never approves a plan
tasks/README.md|Silence or a timeout is never a yes
tasks/README.md|Not approved yet. Here's what changed
.claude/agents/review-coordinator.md|No task moves to in-progress without the owner/DRI's recorded plan approval
.claude/agents/review-coordinator.md|A subagent never records an approval relayed to it
.claude/agents/review-coordinator.md|tasks/README.md#plan-approval
.claude/agents/analyst.md|approved by the owner/DRI before code
tasks/_TEMPLATE.md|plan approved by <owner/DRI>: "<their exact words>"
README.md|and the owner approves it
README.md|No code without a reviewed plan that the owner/DRI has approved
.github/pull_request_template.md|Plan approved by:
ADOPTING.md|solo repos now get a human gate
EOF
}
# norm: drop backticks and asterisks, tabs to spaces, squeeze spaces.
norm() { tr -d '`*' | tr '\t' ' ' | tr -s ' '; }
# section <file> <title>: the lines of "## <title>" up to the next # or ## heading,
# reading fences so a heading inside one doesn't end the section.
section() {
  awk -v t="## $2" '/^[ \t]*(```|~~~)/ { fence = !fence }
    !fence && /^##? / { if (on) exit; if ($0 == t) on = 1 }
    on' "$1"
}
gate_task='starter T-026'   # the task that added this gate; its own log must show the approval
# first_line <text> <fixed string>: line number of its first occurrence, or nothing.
first_line() { printf '%s\n' "$1" | grep -nF -- "$2" | head -n 1 | cut -d: -f1; }
APPROVED_RE='- (YYYY-MM-DD|[0-9]{4}-[0-9]{2}-[0-9]{2}) — plan approved by [^:]+: "[^"]+" \('
# check_anchors <root>: print "FAIL 8: ..." / "SKIP 8: ..." lines; nothing else.
check_anchors() {
  t=$1
  if [ ! -d "$t/.starter" ]; then
    if [ "${REQUIRE_STARTER:-0}" = 1 ]; then echo "FAIL 8: .starter/ is missing (REQUIRE_STARTER=1)"
    else echo "SKIP 8: no .starter/ (anchors are the starter's own wording)"; fi
    echo "DONE 8"; return 0
  fi
  anchors | while IFS='|' read -r key a; do
    f=${key%%@*}; sec=''; case "$key" in *@*) sec=${key#*@} ;; esac
    if [ ! -f "$t/$f" ]; then echo "FAIL 8: $f is missing"; continue; fi
    if [ -n "$sec" ]; then body=$(section "$t/$f" "$sec" | norm); else body=$(norm < "$t/$f"); fi
    printf '%s\n' "$body" | grep -qF -- "$a" || printf 'FAIL 8: %s lacks "%s"\n' "$key" "$a"
  done
  # AGENTS § 7 step 4 no longer moves the task to in-progress (4b does).
  s4=$(awk '/^4\. Run the agent review on the/' "$t/AGENTS.md")
  if [ -z "$s4" ]; then echo "FAIL 8: AGENTS.md has no step 4 (agent plan review)"
  else case "$s4" in *in-progress*) echo "FAIL 8: AGENTS.md step 4 still moves the task to in-progress" ;; esac; fi
  heading_slugs "$t/tasks/README.md" | grep -qxF plan-approval || echo "FAIL 8: tasks/README.md has no '## Plan approval' heading"
  pa=$(section "$t/tasks/README.md" "Plan approval" | norm)
  for l in "Builds:" "Won't build:" "Added beyond your request:" "Main risk / tradeoff:" "Review settled:" "Your call:" "plan rejected by"; do
    printf '%s\n' "$pa" | grep -qF -- "$l" || printf 'FAIL 8: Plan approval section lacks "%s"\n' "$l"
  done
  printf '%s\n' "$pa" | grep -qE -- "$APPROVED_RE" || echo "FAIL 8: Plan approval section has no well-formed approved line"
  tpl=$(norm < "$t/tasks/_TEMPLATE.md")
  printf '%s\n' "$tpl" | grep -qE -- "$APPROVED_RE" || echo "FAIL 8: tasks/_TEMPLATE.md has no well-formed approved line"
  rc_=0; printf '%s\n' "$tpl" | grep -qF 'moved to in-review (plan signed off by' || rc_=$?
  case "$rc_" in 0) echo "FAIL 8: tasks/_TEMPLATE.md still has the old in-review line" ;; 1) ;; *) echo "FAIL 8: grep error ($rc_) reading tasks/_TEMPLATE.md" ;; esac
  ls_=$(first_line "$tpl" 'plan signed off by'); la_=$(first_line "$tpl" 'plan approved by'); lp_=$(first_line "$tpl" 'moved to in-progress')
  { [ -n "$ls_" ] && [ -n "$la_" ] && [ -n "$lp_" ] && [ "$ls_" -lt "$la_" ] && [ "$la_" -lt "$lp_" ]; } \
    || echo "FAIL 8: tasks/_TEMPLATE.md log must read signed off, then approved, then in-progress"
  t26="$t/.starter/tasks/${gate_task#starter }.md"
  if [ -f "$t26" ]; then
    log=$(section "$t26" "Activity log" | norm)
    la_=$(printf '%s\n' "$log" | grep -nE -- "$APPROVED_RE" | head -n 1 | cut -d: -f1)
    lp_=$(first_line "$log" 'moved to in-progress')
    if [ -z "$la_" ]; then echo "FAIL 8: $gate_task has no well-formed approved line in its activity log"
    elif [ -z "$lp_" ] || [ "$lp_" -lt "$la_" ]; then echo "FAIL 8: $gate_task moves to in-progress before the approval"; fi
  fi
  echo "DONE 8"
  return 0
}

# report8 <description> <output>: like report, but a run that stopped early (no DONE 8) fails.
report8() {
  if printf '%s\n' "$2" | grep -qx 'DONE 8'; then report "$1" "$2"
  else bad "$1 (check 8 stopped early: no DONE 8)"; fi
}
report8 "check 8: the plan-approval gate is written down ($root)" "$(check_anchors "$root")"

# Fixtures for check 8: a copy of just the files it reads.
ax() {
  rm -rf "$tmp/ax"; mkdir -p "$tmp/ax/.starter/tasks" "$tmp/ax/tasks" "$tmp/ax/.github" "$tmp/ax/.claude/agents"
  for f in AGENTS.md README.md ADOPTING.md tasks/README.md tasks/_TEMPLATE.md .github/pull_request_template.md \
           .claude/agents/analyst.md .claude/agents/review-coordinator.md ".starter/tasks/${gate_task#starter }.md"; do
    [ -f "$root/$f" ] && cp "$root/$f" "$tmp/ax/$f"
  done
  return 0
}
# swap <file> <old> <new>: replace every <old> with <new>, as data (awk index, no sed;
# starter T-014). The file is normalized first, so anchors match their written form.
swap() {
  norm < "$1" | awk -v o="$2" -v n="$3" '{ out = ""; l = $0
      while ((i = index(l, o)) > 0) { out = out substr(l, 1, i - 1) n; l = substr(l, i + length(o)) }
      print out l }' > "$1.x" && mv "$1.x" "$1"
}
ax; report8 "check 8: fixture copy passes" "$(check_anchors "$tmp/ax")"
ax; awk '{ i = index($0, "An agent never approves a plan"); if (i) $0 = substr($0, 1, i - 1) "**An agent** `never`  approves a plan" substr($0, i + 30); print }' \
      "$tmp/ax/AGENTS.md" > "$tmp/ax/x" && mv "$tmp/ax/x" "$tmp/ax/AGENTS.md"
report8 "check 8: added bold, backticks and spaces still pass" "$(check_anchors "$tmp/ax")"
# expect_fail_f: expect_fail with a fixed-string needle (anchors hold regex characters).
expect_fail_f() {
  if printf '%s\n' "$3" | grep '^FAIL' | grep -qF -- "$2"; then ok "$1"
  else bad "$1 (wanted FAIL containing '$2'; got: $3)"; fi
}
# Not a pipeline: ok/bad must update this shell's counters, not a subshell's.
anchors > "$tmp/anchors"
n_rm=0
while IFS='|' read -r key a; do
  ax; f=${key%%@*}; swap "$tmp/ax/$f" "$a" ""
  expect_fail_f "check 8: removing \"$a\" from $key is caught" "8: $key lacks \"$a\"" "$(check_anchors "$tmp/ax")"
  n_rm=$((n_rm + 1))
done < "$tmp/anchors"
n_anchors=$(wc -l < "$tmp/anchors" | tr -d ' ')
if [ "$n_rm" -eq "$n_anchors" ] && [ "$n_rm" -gt 0 ]; then ok "check 8: every anchor ($n_anchors) has a removal fixture that ran"
else bad "check 8: every anchor has a removal fixture that ran ($n_rm of $n_anchors)"; fi
# (swap normalizes the file, which drops backtick fences; section()'s fence handling
# is exercised by the real tree, whose Plan approval section holds fenced blocks.)
ax; swap "$tmp/ax/tasks/README.md" "A material change" ""; printf '\n## Other\nA material change\n' >> "$tmp/ax/tasks/README.md"
expect_fail_f "check 8: a section-scoped anchor outside its section is caught" "8: tasks/README.md@Plan approval lacks" "$(check_anchors "$tmp/ax")"
ax; awk '/plan approved by/ && !h { h = $0; next } { print } /moved to in-progress/ && h { print h; h = "" }' "$tmp/ax/tasks/_TEMPLATE.md" > "$tmp/ax/x" && mv "$tmp/ax/x" "$tmp/ax/tasks/_TEMPLATE.md"
expect_fail_f "check 8: a template approved line after in-progress is caught" "signed off, then approved" "$(check_anchors "$tmp/ax")"
ax; swap "$tmp/ax/AGENTS.md" "4. Run the agent review on the plan" "4. Run the agent review on the plan (then in-progress)"
expect_fail "check 8: step 4 moving the task to in-progress is caught" "step 4 still moves" "$(check_anchors "$tmp/ax")"
ax; swap "$tmp/ax/tasks/README.md" "## Plan approval" "## Plan approvals"
expect_fail "check 8: a renamed Plan approval heading is caught" "no '## Plan approval' heading" "$(check_anchors "$tmp/ax")"
ax; swap "$tmp/ax/tasks/README.md" "Review settled:" "Review notes:"
expect_fail "check 8: a missing template label is caught" 'lacks "Review settled:"' "$(check_anchors "$tmp/ax")"
ax; swap "$tmp/ax/tasks/_TEMPLATE.md" "plan signed off by" "moved to in-review (plan signed off by"
expect_fail "check 8: the old template in-review line is caught" "old in-review line" "$(check_anchors "$tmp/ax")"
ax; swap "$tmp/ax/tasks/_TEMPLATE.md" "moved to in-progress" "moved on"
expect_fail "check 8: a template log out of order is caught" "signed off, then approved" "$(check_anchors "$tmp/ax")"
ax; swap "$tmp/ax/tasks/_TEMPLATE.md" '"<their exact words>"' "<their words>"
expect_fail "check 8: a template approved line without a quote is caught" "_TEMPLATE.md has no well-formed" "$(check_anchors "$tmp/ax")"
gt="$tmp/ax/.starter/tasks/${gate_task#starter }.md"
if [ -f "$root/.starter/tasks/${gate_task#starter }.md" ]; then
  ax; swap "$gt" "plan approved by drewcurley" "plan OK by drewcurley"
  expect_fail "check 8: $gate_task without its approval line is caught" "$gate_task has no well-formed" "$(check_anchors "$tmp/ax")"
  ax; awk '/moved to in-progress/ { next } /plan approved by drewcurley/ { print "- 2026-11-12 — moved to in-progress on branch x" } { print }' "$gt" > "$tmp/ax/x" && mv "$tmp/ax/x" "$gt"
  expect_fail "check 8: $gate_task in progress before approval is caught" "before the approval" "$(check_anchors "$tmp/ax")"
fi
out=$(report8 "x" "FAIL-free but truncated" 2>&1); case "$out" in *"stopped early"*) ok "check 8: a run with no DONE 8 line fails" ;; *) bad "check 8: a run with no DONE 8 line fails (got: $out)" ;; esac
ax; rm -rf "$tmp/ax/.starter"
expect_fail "check 8: REQUIRE_STARTER=1 turns a missing .starter/ into a failure" "8: .starter/ is missing" "$(REQUIRE_STARTER=1 check_anchors "$tmp/ax")"
ax; rm -rf "$tmp/ax/.starter"; swap "$tmp/ax/README.md" "and the owner approves it" "and done"
out=$(check_anchors "$tmp/ax")
if printf '%s\n' "$out" | grep -q '^SKIP 8' && ! printf '%s\n' "$out" | grep -q '^FAIL'; then ok "no .starter/: check 8 skips, visibly, even with reworded docs"
else bad "no .starter/: check 8 skips, visibly, even with reworded docs (got: $out)"; fi

echo
echo "Results: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
