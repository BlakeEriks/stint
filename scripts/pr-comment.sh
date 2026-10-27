#!/usr/bin/env bash
# Usage: pr-comment.sh <pr> <marker> <body-file>
# Updates the bot's comment on <pr> whose body starts with <marker>, or
# creates one. Run by workflows, with GH_TOKEN and GITHUB_REPOSITORY set.
#
# By its marker, and only the bot's: `gh pr comment --edit-last` would take
# whichever comment the bot wrote last, such as another workflow's, and
# anyone can type the marker.
set -euo pipefail
pr=$1 marker=$2 body=$3

id=$(gh api "repos/$GITHUB_REPOSITORY/issues/$pr/comments" --paginate \
  -q ".[] | select(.user.login == \"github-actions[bot]\" and (.body | startswith(\"$marker\"))) | .id" \
  | tail -n 1)
if [ -n "$id" ]; then
  gh api -X PATCH "repos/$GITHUB_REPOSITORY/issues/comments/$id" -F "body=@$body" > /dev/null
else
  gh pr comment "$pr" --repo "$GITHUB_REPOSITORY" --body-file "$body"
fi
